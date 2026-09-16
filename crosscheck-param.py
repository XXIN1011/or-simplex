"""参数线性规划（教材 2.6）对拍：把每个抽样 λ 代进去得到的普通线性规划，
   交给 scipy HiGHS 从头解，与 JS 给出的「该 λ 处的最优值」比对。

判据：JS 声称「这一段的基在 λ 处仍可行且仍最优」，那么
  · scipy 必须也判定该问题有最优解（不能是无可行/无界）；
  · 最优值必须与 JS 的 λ 仿射表达式算出来的值一致。
"""
import json
import numpy as np
from scipy.optimize import linprog

bank = json.load(open('param-bank.json', encoding='utf-8'))
print(f'载入 {len(bank)} 个抽样点（每个点都是某个 λ 区间内部的一个 λ）')


def solve(prob):
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
                bounds=[(0, None)] * n, method='highs')
    if r.status == 0:
        return ('optimal', -r.fun if is_max else r.fun)
    if r.status == 2:
        return ('infeasible', None)
    if r.status == 3:
        return ('unbounded', None)
    return (f'other({r.status})', None)


bad = []
by_kind = {}

for rec in bank:
    kind = rec['kind']
    by_kind.setdefault(kind, {'ok': 0, 'bad': 0})
    st, obj = solve(rec['prob'])
    ok = False
    if st == 'optimal':
        if abs(obj - rec['jsObj']) <= 1e-6 * max(1.0, abs(obj)) and \
           abs(obj - rec['jsZ']) <= 1e-6 * max(1.0, abs(obj)):
            ok = True
        else:
            bad.append((rec['id'], kind, rec['lam'],
                        f'JS 该基 z={rec["jsObj"]:.6f} / λ 表达式 z={rec["jsZ"]:.6f} / scipy z={obj:.6f}'))
    else:
        bad.append((rec['id'], kind, rec['lam'],
                    f'JS 声称这里最优，scipy 却判定 {st}'))
    by_kind[kind]['ok' if ok else 'bad'] += 1

names = {'c': '2.6.1 变量系数', 'b': '2.6.2 右边系数'}
print('\n按类型:')
for k, v in by_kind.items():
    print(f'  {names.get(k, k)}  通过 {v["ok"]:5d} / 失败 {v["bad"]}')

if bad:
    print(f'\n!!! 不一致 {len(bad)} 条:')
    for tid, k, lam, msg in bad[:12]:
        print(f'  id={tid} [{k}] λ={lam}: {msg}')
else:
    print('\n✓ 全部抽样点与 scipy 从头重解的最优值一致')

print('\n结论:', 'PASS' if not bad else 'FAIL')
