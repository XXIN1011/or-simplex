"""灵敏度分析对拍：用 scipy HiGHS 独立复算，验证 JS 给出的变化区间不多不少

判据：
  · 区间内样本（tag=in）—— 最优基应当不变，因此 z 必须等于线性预测值
      c 基变量 : z = z₀ + Δcⱼ·xⱼ
      c 非基变量: z = z₀
      b        : z = z₀ + Δbᵢ·yᵢ
    若区间内预测不成立（或变成无界/无可行），说明区间给宽了 → 失败。
  · 越界样本（tag=out）—— 最优基应当已经改变，预测一般不再成立。
    若预测仍然成立，说明区间可能给窄了；考虑到多重最优解/退化时会合法出现，
    这类只统计、不直接判失败，但会单独列出来看。
"""
import json
import numpy as np
from scipy.optimize import linprog

# 题库由同目录的 node 脚本生成；按【脚本自身位置】定位，这样从任何工作目录
# 运行都能找到（原来用裸文件名，靠 CWD，换目录就会 FileNotFoundError）
import os

# ★ 裁判不可信的情形（2026-09 记录；改本文件前先读 crosscheck-scenario.py 的文件头）：
#   HiGHS 的 presolve 会把「无界」误判成「无可行解」，而默认就开着 presolve。
#   最小实例：min -3x1-5x2-3x3, s.t. -4x1-3x2+2x3 >= -12, 4x1+2x2-x3 >= -9, x>=0
#   —— 原点可行、射线 (t,0,3t) 对任意 t>0 可行且 z = -12t，数学上确定无界；
#   而 method='highs' 报 infeasible，presolve=False / highs-ds / interior-point 都报 unbounded。
#   所以本脚本一旦出现「状态不一致」，先关掉 presolve 复核，再判断是谁错。
_HERE = os.path.dirname(os.path.abspath(__file__))
bank = json.load(open(os.path.join(_HERE, 'sens-bank.json'), encoding='utf-8'))
n_prob = len(bank)
n_in = sum(1 for t in bank for s in t['samples'] if s['tag'] == 'in')
n_out = sum(1 for t in bank for s in t['samples'] if s['tag'] == 'out')
print(f'载入 {n_prob} 道题 · 区间内样本 {n_in} · 越界样本 {n_out}')


def solve(prob):
    """返回用户口径的最优值；无法求解返回状态字符串"""
    n = len(prob['c'])
    c_orig = np.array(prob['c'], dtype=float)
    is_max = prob['direction'] == 'max'
    c = -c_orig if is_max else c_orig.copy()
    A_ub, b_ub, A_eq, b_eq = [], [], [], []
    for k in prob['constraints']:
        coef = np.array(k['coef'], dtype=float)
        if k['rel'] == '<=':
            A_ub.append(coef); b_ub.append(k['rhs'])
        elif k['rel'] == '>=':
            A_ub.append(-coef); b_ub.append(-k['rhs'])
        else:
            A_eq.append(coef); b_eq.append(k['rhs'])
    r = linprog(c,
                A_ub=np.array(A_ub) if A_ub else None,
                b_ub=np.array(b_ub) if b_ub else None,
                A_eq=np.array(A_eq) if A_eq else None,
                b_eq=np.array(b_eq) if b_eq else None,
                bounds=[(0, None)] * n,
                method='highs')
    if r.status == 0:
        return (-r.fun if is_max else r.fun)
    if r.status == 2:
        return 'infeasible'
    if r.status == 3:
        return 'unbounded'
    return f'other({r.status})'


def perturb(prob, s):
    """把样本点写进题目"""
    p = {'direction': prob['direction'], 'c': list(prob['c']),
         'constraints': [dict(k) for k in prob['constraints']]}
    if s['kind'] == 'c':
        p['c'][s['idx']] = s['value']
    else:
        p['constraints'][s['idx']]['rhs'] = s['value']
    return p


TOL = 1e-6
fail_in, fail_out_still_holds = [], []
ok_in = ok_out = 0

for t in bank:
    for s in t['samples']:
        got = solve(perturb(t, s))
        exp = s['predicted']
        if s['tag'] == 'in':
            if isinstance(got, str):
                fail_in.append((t['id'], s['label'], s['value'], f'变成{got}', exp, s))
            elif abs(got - exp) <= TOL * max(1.0, abs(exp)):
                ok_in += 1
            else:
                fail_in.append((t['id'], s['label'], s['value'], got, exp, s))
        else:
            if isinstance(got, str):
                ok_out += 1                      # 无界/无可行 ⇒ 基必然已改变
            elif abs(got - exp) > TOL * max(1.0, abs(exp)):
                ok_out += 1
            else:
                fail_out_still_holds.append((t['id'], s['label'], s['value'], got, exp, s))

print(f'\n区间内样本: {ok_in} 成立 / {len(fail_in)} 不成立')
print(f'越界样本  : {ok_out} 预测已失效 / {len(fail_out_still_holds)} 预测仍成立')

if fail_in:
    print('\n!!! 区间给宽了（区间内预测不成立）:')
    for tid, label, val, got, exp, s in fail_in[:10]:
        print(f'  id={tid} {label} {s["kind"]}#{s["idx"]} 取值={val:.6g} 预测z={exp:.6g} 实际={got}')
else:
    print('\n✓ 所有区间内样本的预测都成立 —— 区间没有给宽')

if fail_out_still_holds:
    print(f'\n越界但预测仍成立（{len(fail_out_still_holds)} 例，可能是多重最优解/退化导致，需抽查）:')
    for tid, label, val, got, exp, s in fail_out_still_holds[:10]:
        print(f'  id={tid} {label} {s["kind"]}#{s["idx"]} 取值={val:.6g} 预测z={exp:.6g} 实际={got}')
else:
    print('✓ 所有越界样本的预测都已失效 —— 区间没有给窄')

print('\n结论:', 'PASS' if not fail_in else 'FAIL')
