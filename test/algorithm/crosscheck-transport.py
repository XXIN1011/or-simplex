"""独立按原题构造平衡运输 LP，比较可行性和最优目标，不比较矩阵身份。"""
import json
import os
import sys
from fractions import Fraction
import numpy as np
from scipy.optimize import linprog

root = os.environ.get('OR_TEST_BANK_DIR') or os.path.dirname(os.path.abspath(__file__))
filename = os.path.join(root, 'transport-bank.json')
if not os.path.exists(filename):
    sys.exit('题库不存在，请先运行 node test/algorithm/transport-test.js')
with open(filename, encoding='utf-8') as f:
    bank = json.load(f)
if not bank:
    sys.exit('题库为空，不能判定通过')

def number(v):
    return float(Fraction(v)) if isinstance(v, str) else float(v)

def fee(p, key, count):
    v = p.get(key, 0)
    return [number(a) for a in v] if isinstance(v, list) else [number(v)] * count

bad = []
for k, case in enumerate(bank):
    p = case['problem']
    s, d = list(map(number, p['supply'])), list(map(number, p['demand']))
    # 禁运标记以 M 为准（大 M），X / × / 禁运 作为旧标记继续兼容
    allowed = [[not (isinstance(v, str) and v.strip().lower() in ('m','x','×','禁运')) for v in row] for row in p['cost']]
    c = [[number(v) if allowed[i][j] else 0 for j,v in enumerate(row)] for i,row in enumerate(p['cost'])]
    sign = -1 if p['direction'] == 'max' else 1
    diff = sum(s) - sum(d)
    scale = max(sum(s), sum(d))
    if diff and abs(diff) <= scale * 1e-12:
        d[d.index(max(d))] += diff
    elif diff > 0:
        d.append(diff)
        for i, (row, v) in enumerate(zip(c, fee(p, 'surplusCost', len(s)))):
            row.append(sign * v)
            allowed[i].append(True)
    elif diff < 0:
        s.append(-diff)
        c.append([sign * v for v in fee(p, 'shortageCost', len(d))])
        allowed.append([True] * len(d))
    m, n = len(s), len(d)
    c = np.array(c)
    constraints = []
    for i in range(m):
        a = np.zeros((m, n)); a[i, :] = 1; constraints.append(a.ravel())
    for j in range(n):
        a = np.zeros((m, n)); a[:, j] = 1; constraints.append(a.ravel())
    bounds = [(0,None) if a else (0,0) for row in allowed for a in row]
    answer = linprog((sign*c).ravel(), A_eq=constraints, b_eq=s+d, bounds=bounds, method='highs')
    if case['status'] == 'infeasible':
        if answer.status != 2 or case['objective'] is not None or case['allocation'] is not None:
            bad.append((k, answer.message, case['objective'], None, False))
        continue
    x = np.array(case['allocation'])
    feasible = x.shape == (m,n) and np.all(x >= -1e-9) and np.all(x[np.logical_not(allowed)] == 0) and np.allclose(x.sum(axis=1),s,rtol=1e-8,atol=1e-8) and np.allclose(x.sum(axis=0),d,rtol=1e-8,atol=1e-8)
    actual = float(np.sum(x*c)) if x.shape == (m,n) else float('nan')
    optimum = sign*answer.fun if answer.success else None
    if case['status'] != 'optimal' or not answer.success or not feasible or not np.isclose(actual,case['objective'],rtol=1e-8,atol=1e-8) or not np.isclose(actual,optimum,rtol=1e-8,atol=1e-8):
        bad.append((k, answer.message, case['objective'], optimum, feasible))
print(f'运输 linprog 独立对拍：{len(bank)-len(bad)}/{len(bank)} 通过；失败 {len(bad)}')
for row in bad[:20]:
    print(row)
sys.exit(1 if bad else 0)
