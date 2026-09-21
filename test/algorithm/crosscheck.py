"""用 scipy HiGHS 独立求解同一批随机题，与 JS 单纯形法对拍

# ★ 裁判不可信的情形（2026-09 记录；改本文件前先读 crosscheck-scenario.py 的文件头）：
#   HiGHS 的 presolve 会把「无界」误判成「无可行解」，而默认就开着 presolve。
#   最小实例：min -3x1-5x2-3x3, s.t. -4x1-3x2+2x3 >= -12, 4x1+2x2-x3 >= -9, x>=0
#   —— 原点可行、射线 (t,0,3t) 对任意 t>0 可行且 z = -12t，数学上确定无界；
#   而 method='highs' 报 infeasible，presolve=False / highs-ds / interior-point 都报 unbounded。
#   所以本脚本一旦出现「状态不一致」，先关掉 presolve 复核，再判断是谁错。
"""
import json, sys
import numpy as np
from scipy.optimize import linprog

# 题库由同目录的 node 脚本生成；按【脚本自身位置】定位，这样从任何工作目录
# 运行都能找到（原来用裸文件名，靠 CWD，换目录就会 FileNotFoundError）
import os
_HERE = os.path.dirname(os.path.abspath(__file__))
bank = json.load(open(os.path.join(_HERE, 'random-bank.json'), encoding='utf-8'))
print(f'载入题目: {len(bank)}')

ok = 0
mismatch = []
presolve_artifacts = []      # 见文件头：HiGHS presolve 误判导致的「假分歧」
status_count = {}

def solve(t, presolve=True):
    """scipy 独立求解。presolve=False 专用于复核状态分歧（见文件头关于 HiGHS presolve 的说明）。"""
    n = len(t['c'])
    c_orig = np.array(t['c'], dtype=float)
    is_max = (t['direction'] == 'max')
    c = -c_orig if is_max else c_orig.copy()
    A_ub, b_ub, A_eq, b_eq = [], [], [], []
    for k in t['constraints']:
        coef = np.array(k['coef'], dtype=float)
        if k['rel'] == '<=':
            A_ub.append(coef); b_ub.append(k['rhs'])
        elif k['rel'] == '>=':
            A_ub.append(-coef); b_ub.append(-k['rhs'])
        else:
            A_eq.append(coef); b_eq.append(k['rhs'])

    return linprog(c,
                   A_ub=np.array(A_ub) if A_ub else None,
                   b_ub=np.array(b_ub) if b_ub else None,
                   A_eq=np.array(A_eq) if A_eq else None,
                   b_eq=np.array(b_eq) if b_eq else None,
                   bounds=[(0, None)] * n,
                   method='highs',
                   options=None if presolve else {'presolve': False})


for t in bank:
    n = len(t['c'])
    c_orig = np.array(t['c'], dtype=float)
    is_max = (t['direction'] == 'max')
    res = solve(t)

    # scipy 状态 -> 我们的命名
    if res.status == 0:
        cg = 'optimal'
    elif res.status == 2:
        cg = 'infeasible'
    elif res.status == 3:
        cg = 'unbounded'
    else:
        cg = f'other({res.status})'

    status_count[cg] = status_count.get(cg, 0) + 1
    js = t['js_status']

    if js == 'optimal' and cg == 'optimal':
        ref = -res.fun if is_max else res.fun
        # 三层校验：① 目标值与 scipy 一致 ② 解向量满足全部约束 ③ 解向量算出的目标值自洽
        x = np.array(t['js_sol'], dtype=float)
        feas = True
        for k in t['constraints']:
            lhs = float(np.dot(np.array(k['coef'], dtype=float), x))
            if k['rel'] == '<=' and lhs > k['rhs'] + 1e-6: feas = False
            if k['rel'] == '>=' and lhs < k['rhs'] - 1e-6: feas = False
            if k['rel'] == '=' and abs(lhs - k['rhs']) > 1e-6: feas = False
        if (x < -1e-9).any(): feas = False
        obj_ok = abs(float(np.dot(c_orig, x)) - ref) < 1e-6
        if feas and obj_ok and abs(ref - t['js_obj']) < 1e-6:
            ok += 1
        else:
            mismatch.append((t['id'], f'feas={feas} objok={obj_ok}', js, cg,
                             t['js_obj'], ref, t['c'], t['constraints']))
    elif js == cg:
        ok += 1
    else:
        # 状态不一致：先怀疑裁判（HiGHS 的 presolve 会把无界误判成无可行解）。
        # 关掉 presolve 复核；若与 JS 一致就记为裁判伪影，不计失败 —— 分歧被解释而不是被忽略。
        res2 = solve(t, presolve=False)
        cg2 = ('optimal' if res2.status == 0 else 'infeasible' if res2.status == 2
               else 'unbounded' if res2.status == 3 else f'other({res2.status})')
        if cg2 == js:
            presolve_artifacts.append((t['id'], cg, cg2))
        else:
            mismatch.append((t['id'], 'status', js, cg, t['js_obj'], res.fun, t['c'], t['constraints']))

print(f'\n一致: {ok}/{len(bank)}')
print('scipy 状态分布:', json.dumps(status_count, ensure_ascii=False))
if presolve_artifacts:
    print(f'\n裁判伪影（HiGHS presolve 误判，关掉后与 JS 一致）: {len(presolve_artifacts)} 条')
    for tid, a, b in presolve_artifacts[:5]:
        print(f'  id={tid} presolve 开={a} → 关={b}（JS 与后者一致）')
print(f'\n不一致: {len(mismatch)} 条')
for mm in mismatch[:12]:
    tid, kind, js, cg, jo, ref, c, cons = mm
    print(f'--- id={tid} [{kind}] js={js} scipy={cg}')
    print(f'    c={c}  {t["direction"] if False else ""}')
    for k in cons:
        print(f'    {k["coef"]} {k["rel"]} {k["rhs"]}')
    print(f'    js_obj={jo} scipy_obj={ref}')
