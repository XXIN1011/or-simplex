"""用 scipy HiGHS 独立求解同一批随机题，与 JS 单纯形法对拍"""
import json, sys
import numpy as np
from scipy.optimize import linprog

bank = json.load(open('random-bank.json', encoding='utf-8'))
print(f'载入题目: {len(bank)}')

ok = 0
mismatch = []
status_count = {}

for t in bank:
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

    res = linprog(c,
                  A_ub=np.array(A_ub) if A_ub else None,
                  b_ub=np.array(b_ub) if b_ub else None,
                  A_eq=np.array(A_eq) if A_eq else None,
                  b_eq=np.array(b_eq) if b_eq else None,
                  bounds=[(0, None)] * n,
                  method='highs')

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
        mismatch.append((t['id'], 'status', js, cg, t['js_obj'], res.fun, t['c'], t['constraints']))

print(f'\n一致: {ok}/{len(bank)}')
print('scipy 状态分布:', json.dumps(status_count, ensure_ascii=False))
print(f'\n不一致: {len(mismatch)} 条')
for mm in mismatch[:12]:
    tid, kind, js, cg, jo, ref, c, cons = mm
    print(f'--- id={tid} [{kind}] js={js} scipy={cg}')
    print(f'    c={c}  {t["direction"] if False else ""}')
    for k in cons:
        print(f'    {k["coef"]} {k["rel"]} {k["rhs"]}')
    print(f'    js_obj={jo} scipy_obj={ref}')
