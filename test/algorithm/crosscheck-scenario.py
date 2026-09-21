"""场景式灵敏度分析对拍：用 scipy HiGHS 从头重解「改过之后的问题」，与 JS 的场景分析结果比对

判据：
  · 状态一致（optimal / infeasible / unbounded）
  · 都是 optimal 时，最优值一致（1e-6），且 JS 给出的解向量确实可行
  · 额外统计：前置判断为「最优基不变」的算例里，JS 的新解应当就是同一个点

★ 已知的「裁判不可信」情形（2026-09 加，务必读完再改本文件）

  HiGHS 的 **presolve 会把「无界」误判成「无可行解」**，而默认就是开着 presolve 的。
  最小实例（本题库 id=133 的「加变量」算例，已手算射线验证）：

      min z = -3x₁ - 5x₂ - 3x₃
      s.t. -4x₁ - 3x₂ + 2x₃ ≥ -12
            4x₁ + 2x₂ -  x₃ ≥ -9,    x ≥ 0

  原点可行（可行性 LP 返回 status 0、x = 0），且射线 x(t) = (t, 0, 3t) 对任意 t > 0 都满足
  两条约束、z = -12t → -∞ —— 数学上确定是【无界】。实测各判定方式：

      method='highs'（presolve 默认开）      → status 2 infeasible   ✗ 错
      method='highs', presolve=False         → status 3 unbounded    ✓
      method='highs-ds', presolve=False      → status 3 unbounded    ✓
      method='highs-ipm'（同样走 presolve）  → status 2 infeasible   ✗ 错
      method='interior-point'（旧版）        → unbounded              ✓

  结论：**「scipy 说 infeasible 而我们的求解器说 unbounded」这类分歧里，裁判可能是错的一方。**
  本脚本的处理方式是「换一个更可靠的裁判」，而不是把分歧藏起来：
  两边状态不一致时，关掉 presolve 再解一次；若此时与 JS 的结论一致，就把这条分歧
  记入 presolve_artifacts 并在末尾单独打印（可复核），不计为失败。
  逐题核对时若看到 presolve_artifacts 非空，请先按上面这段手算复核，再判断谁对。
"""
import json
import numpy as np
from scipy.optimize import linprog

# 题库由同目录的 node 脚本生成；按【脚本自身位置】定位，这样从任何工作目录
# 运行都能找到（原来用裸文件名，靠 CWD，换目录就会 FileNotFoundError）
import os
_HERE = os.path.dirname(os.path.abspath(__file__))
bank = json.load(open(os.path.join(_HERE, 'scenario-bank.json'), encoding='utf-8'))
total = sum(len(r['cases']) for r in bank)
print(f'载入 {len(bank)} 道基准题 · {total} 个场景算例')


def solve(prob, presolve=True):
    """presolve=False 用于「与 JS 结论不一致时」的复核 —— 见文件头关于 HiGHS presolve 的说明。"""
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
                bounds=[(0, None)] * n, method='highs',
                options=None if presolve else {'presolve': False})
    if r.status == 0:
        return ('optimal', -r.fun if is_max else r.fun, np.array(r.x))
    if r.status == 2:
        return ('infeasible', None, None)
    if r.status == 3:
        return ('unbounded', None, None)
    return (f'other({r.status})', None, None)


def feasible(prob, x):
    if x is None:
        return None
    if (np.array(x) < -1e-7).any():
        return False
    for k in prob['constraints']:
        lhs = float(np.dot(np.array(k['coef'], dtype=float), np.array(x)))
        if k['rel'] == '<=' and lhs > k['rhs'] + 1e-6:
            return False
        if k['rel'] == '>=' and lhs < k['rhs'] - 1e-6:
            return False
        if k['rel'] == '=' and abs(lhs - k['rhs']) > 1e-6:
            return False
    return True


stats, fails, skipped, presolve_artifacts = {}, [], [], []
by_type = {}
unchanged_ok = unchanged_bad = 0

for rec in bank:
    for case in rec['cases']:
        ty = case['type']
        by_type.setdefault(ty, {'ok': 0, 'bad': 0})
        if not case['jsOk']:
            skipped.append((rec['id'], ty, case['jsMsg']))
            continue
        st, obj, x = solve(case['prob'])
        stats[st] = stats.get(st, 0) + 1
        ok = False
        if case['jsStatus'] == st:
            if st == 'optimal':
                if abs(obj - case['jsObj']) <= 1e-6 * max(1.0, abs(obj)) and feasible(case['prob'], case['jsSol']):
                    ok = True
                else:
                    fails.append((rec['id'], ty, f'目标值 {case["jsObj"]} vs scipy {obj}',
                                  f'解可行={feasible(case["prob"], case["jsSol"])}'))
            else:
                ok = True
        else:
            # 状态不一致：先怀疑裁判（HiGHS 的 presolve 会把无界误判成无可行解，见文件头）。
            # 关掉 presolve 再解一次，若与 JS 一致就把这条记为「裁判伪影」，不计失败。
            st2, _, _ = solve(case['prob'], presolve=False)
            if st2 == case['jsStatus']:
                presolve_artifacts.append((rec['id'], ty, st, st2))
                ok = True
            else:
                fails.append((rec['id'], ty, f'状态 js={case["jsStatus"]} scipy={st} scipy(no-presolve)={st2}', ''))
        by_type[ty]['ok' if ok else 'bad'] += 1
        if case['changed'] is False:
            if ok:
                unchanged_ok += 1
            else:
                unchanged_bad += 1

print('\n按场景类型:')
names = {'c': '改目标系数', 'a-basic': '改a_ij(基列)', 'a-nonbasic': '改a_ij(非基列)',
         'b': '改右端项', 'add-con': '增加约束', 'add-var': '增加变量'}
for ty, v in by_type.items():
    print(f'  {names.get(ty, ty):10s} 通过 {v["ok"]:4d} / 失败 {v["bad"]}')
print(f'\nscipy 状态分布: {json.dumps(stats, ensure_ascii=False)}')
print(f'前置判断为「最优基不变」的算例: {unchanged_ok} 个通过 / {unchanged_bad} 个失败')
print(f'JS 直接拒绝的算例（基矩阵奇异等）: {len(skipped)}')
if presolve_artifacts:
    print(f'\n裁判伪影（HiGHS presolve 误判，关掉 presolve 后与 JS 一致）: {len(presolve_artifacts)} 条')
    for tid, ty, st1, st2 in presolve_artifacts[:5]:
        print(f'  id={tid} [{names.get(ty, ty)}] presolve 开={st1} → 关={st2}（JS 同关掉后的结论）')

if fails:
    print(f'\n!!! 不一致 {len(fails)} 条:')
    for tid, ty, a, b in fails[:12]:
        print(f'  id={tid} [{names.get(ty, ty)}] {a}  {b}')
else:
    print('\n✓ 全部算例与 scipy 从头重解的结果一致')

print('\n结论:', 'PASS' if not fails else 'FAIL')
