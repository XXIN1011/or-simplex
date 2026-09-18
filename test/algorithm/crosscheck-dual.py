"""对偶解验证（不依赖"对偶解唯一"这一错误前提）

判据一 强对偶   : bᵀy = z*
判据二 互补松弛 : y_i · slack_i = 0
判据三 扰动法   : (z*(b+εe_i) − z*(b−εe_i)) / 2ε = y_i   （抽样，中心差分）

注：原问题退化时对偶最优解并不唯一，因此不能拿 scipy 的 marginals 逐项相等当判据，
    只要满足上面三条即为合法的影子价格。
"""
import json
import numpy as np
from scipy.optimize import linprog

# 题库由同目录的 node 脚本生成；按【脚本自身位置】定位，这样从任何工作目录
# 运行都能找到（原来用裸文件名，靠 CWD，换目录就会 FileNotFoundError）
import os
_HERE = os.path.dirname(os.path.abspath(__file__))
bank = json.load(open(os.path.join(_HERE, 'dual-bank.json'), encoding='utf-8'))
print(f'对偶题库: {len(bank)} 题\n')


def normalize(cons):
    """与 JS 算法保持一致的规范化：右端项一律化成非负"""
    out = []
    for k in cons:
        coef, rel, rhs = list(k['coef']), k['rel'], k['rhs']
        if rhs < 0:
            coef = [-v for v in coef]
            rhs = -rhs
            rel = {'<=': '>=', '>=': '<=', '=': '='}[rel]
        out.append({'coef': coef, 'rel': rel, 'rhs': rhs})
    return out


def solve(t, cons=None):
    cons = cons if cons is not None else normalize(t['constraints'])
    c = np.array(t['c'], dtype=float)
    is_max = (t['direction'] == 'max')
    if is_max:
        c = -c
    A_ub, b_ub, A_eq, b_eq = [], [], [], []
    for k in cons:
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
                bounds=[(0, None)] * len(t['c']), method='highs')
    if r.status != 0:
        return None
    return (-r.fun if is_max else r.fun)


# ---------- 判据一 & 二 ----------
s_ok = s_bad = c_ok = c_bad = 0
bad_detail = []
for t in bank:
    cons = normalize(t['constraints'])
    b = np.array([k['rhs'] for k in cons], dtype=float)
    y = np.array(t['dual'], dtype=float)
    x = np.array(t['sol'], dtype=float)
    z = t['obj']

    # 强对偶
    if abs(float(b @ y) - z) <= 1e-6 * max(1.0, abs(z)):
        s_ok += 1
    else:
        s_bad += 1
        bad_detail.append(('强对偶', t['id'], float(b @ y), z))

    # 互补松弛
    worst = 0.0
    for k, con in enumerate(cons):
        lhs = float(np.dot(np.array(con['coef'], dtype=float), x))
        if con['rel'] == '<=':
            slack = con['rhs'] - lhs
        elif con['rel'] == '>=':
            slack = lhs - con['rhs']
        else:
            slack = 0.0
        worst = max(worst, abs(y[k] * slack))
    if worst <= 1e-6 * max(1.0, abs(z)):
        c_ok += 1
    else:
        c_bad += 1
        bad_detail.append(('互补松弛', t['id'], worst, z))

print('判据一 强对偶  bᵀy = z*  : 通过 %d / 失败 %d' % (s_ok, s_bad))
print('判据二 互补松弛 y·slack=0: 通过 %d / 失败 %d' % (c_ok, c_bad))
for d in bad_detail[:8]:
    print('   失败:', d)

# ---------- 判据三 中心差分扰动（抽样） ----------
print('\n判据三 中心差分扰动抽样 …')
EPS = 1e-4
sample = [t for t in bank if len(t['constraints']) >= 2][:40]
p_ok = p_bad = p_skip = 0
p_detail = []
for t in sample:
    cons = normalize(t['constraints'])
    z0 = solve(t, cons)
    if z0 is None:
        p_skip += 1
        continue
    for i in range(len(cons)):
        up = [dict(k) for k in cons]
        dn = [dict(k) for k in cons]
        up[i]['rhs'] += EPS
        dn[i]['rhs'] -= EPS
        z_up, z_dn = solve(t, up), solve(t, dn)
        if z_up is None or z_dn is None:
            continue
        empirical = (z_up - z_dn) / (2 * EPS)
        y_i = t['dual'][i]
        if abs(empirical - y_i) <= 5e-3 * max(1.0, abs(y_i)):
            p_ok += 1
        else:
            p_bad += 1
            if len(p_detail) < 8:
                p_detail.append((t['id'], i, round(y_i, 6), round(empirical, 6)))

print('  逐项一致 %d / 不一致 %d（跳过 %d 题求解失败）' % (p_ok, p_bad, p_skip))
for d in p_detail:
    print('   不一致 题id=%s 第%d个约束  JS=%s  实测差分=%s' % d)
