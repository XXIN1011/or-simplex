"""用 scipy.optimize.linear_sum_assignment 独立求解同一批指派问题，与 JS 匈牙利法对拍

题库由同目录的 node 脚本生成：先 `node test/algorithm/assignment-test.js`，
再跑本脚本（克隆后题库不存在，是这个顺序的原因；反了会 FileNotFoundError）。

★ 两边的「问题口径」必须说清楚，否则对拍出来的分歧全是假的：
  · 方阵化口径：人数 m 与工作数 n 不等时，小的一方补**虚拟行列**（费用 0），
    于是问题 = 「在 N = max(m, n) 阶的格子上求费用最小的完备匹配」。
    scipy 的 linear_sum_assignment 处理矩形矩阵时只保证覆盖较小的一边，
    若直接喂 m×n 会和我们的口径**以及** 禁止指派的行列判定错开；
    所以这里显式补成 N×N（虚拟格 0、允许指派）再交给 scipy，两边口径才是同一个。
  · 禁止指派 = np.inf。scipy 在「连不成完备匹配」时抛 ValueError('cost matrix is infeasible')，
    对应我们的 status = 'infeasible'。
  · 最大化：整个矩阵取负交给 scipy（min Σ(−c) = max Σc），目标值再取回来。
    ★ 比对目标值时必须用**原矩阵**的系数重算一遍（见下方 recompute），
      拿取负后的矩阵去比会让每一道最大化题都报不一致。

裁判自身的可疑情形：本脚本用的 linear_sum_assignment 没有 presolve 这类会「换一种
说法的错判」的机制（对照 crosscheck.py 文件头里 HiGHS presolve 把「无界」报成
「无可行解」的那一例）；真出现分歧，先按「① 手算一个小实例 ② 换口径复核 ③ 再怀疑引擎」
的顺序查，不要直接改引擎。
"""
import json
import os
import sys

import numpy as np
from scipy.optimize import linear_sum_assignment

_HERE = os.path.dirname(os.path.abspath(__file__))
bank_path = os.path.join(_HERE, 'assignment-bank.json')
if not os.path.exists(bank_path):
    sys.exit('题库不存在：' + bank_path + '\n请先运行 node test/algorithm/assignment-test.js')
bank = json.load(open(bank_path, encoding='utf-8'))
print(f'载入题目: {len(bank)}')

n_opt = n_inf = 0
bad = []
status_count = {}


def scipy_solve(case):
    """按上面说的口径解一遍，返回 (status, objective)"""
    cost = case['cost']
    m = len(cost)
    n = len(cost[0]) if m else 0
    if m == 0 or n == 0:
        return 'optimal', 0.0
    N = max(m, n)
    # 补虚拟行列（费用 0、允许指派）
    padded = [[0.0] * N for _ in range(N)]
    for i in range(m):
        for j in range(n):
            padded[i][j] = cost[i][j]
    sign = -1.0 if case['direction'] == 'max' else 1.0
    C = np.empty((N, N), dtype=float)
    for i in range(N):
        for j in range(N):
            C[i, j] = np.inf if padded[i][j] is None else sign * padded[i][j]
    try:
        r, c = linear_sum_assignment(C)
    except ValueError:
        return 'infeasible', None
    # 完备性：N 个格子必须互不同行同列（scipy 对 N×N 保证如此，这里仍核一遍）
    if len(r) != N or len(set(r.tolist())) != N or len(set(c.tolist())) != N:
        return 'oracle-shape-error', None
    # ★ 用原矩阵重算目标值（不拿取负过的 C 去比）
    value = 0.0
    for i, j in zip(r.tolist(), c.tolist()):
        if padded[i][j] is None:
            return 'infeasible', None            # 用到了禁止指派的格子 ⇒ 实际不可行
        value += padded[i][j]
    return 'optimal', value


for case in bank:
    st, obj = scipy_solve(case)
    status_count[st] = status_count.get(st, 0) + 1
    js = case['js_status']
    if st == 'optimal':
        n_opt += 1
    elif st == 'infeasible':
        n_inf += 1

    if st != js:
        bad.append(f"#{case['id']} status: js={js} scipy={st}")
        continue
    if js == 'infeasible':
        continue
    if abs(obj - case['js_objective']) > 1e-6:
        bad.append(f"#{case['id']} objective: js={case['js_objective']} scipy={obj}")
        continue
    # 第二层：用原矩阵独立重算 JS 那条指派的总费用，与它自报的目标值对一遍
    # （JS 侧只报了目标值，指派本身的合法性由 assignment-test.js 验证）

print(f"scipy 判定分布: {status_count}")
print(f"两边状态一致: {'是' if not bad else '否'}")
print(f"最优 {n_opt} 题、无可行解 {n_inf} 题，目标值全部在 1e-6 内一致: "
      f"{'是' if not bad else '否'}")

if bad:
    print(f"\n!!! 不一致 {len(bad)} 条（最多列 20 条）:")
    for line in bad[:20]:
        print('  ' + line)
    print('\n结论: FAIL')
    sys.exit(1)

print(f"\n结论: PASS（{len(bank)} 题，两层比对：状态 + 目标值）")
