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

# ★ 裁判不可信的情形（2026-09 记录；改本文件前先读 crosscheck-scenario.py 的文件头）：
#   HiGHS 的 presolve 会把「无界」误判成「无可行解」，而默认就开着 presolve。
#   最小实例：min -3x1-5x2-3x3, s.t. -4x1-3x2+2x3 >= -12, 4x1+2x2-x3 >= -9, x>=0
#   —— 原点可行、射线 (t,0,3t) 对任意 t>0 可行且 z = -12t，数学上确定无界；
#   而 method='highs' 报 infeasible，presolve=False / highs-ds / interior-point 都报 unbounded。
#   所以本脚本一旦出现「状态不一致」，先关掉 presolve 复核，再判断是谁错。
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
# 两个判据都必须在【用户输入的空间】里算（2026-09 修正，修正前的版本会误报 56 条）：
#   JS 给出的 y 是「用户空间」的影子价格（内部算出 y_int 后乘过 flipSign 换算回来），
#   而内部右端项 b_int = flipSign · b_user。若拿 b_int 去点乘用户空间的 y，
#   凡是「右端项为负」的约束都会错位 —— 而且 min 问题内部按 max 求解，还要再翻一次符号。
#   在用户空间里这两个麻烦一起消失，不变式就是最朴素的那条：
#
#       Σ b_user,ᵢ · yᵢ = z_user      （max 与 min 都成立）
#
#   实测 400 题最大偏差 8.5e-14，即这条才是 y 的定义式。
s_ok = s_bad = c_ok = c_bad = 0
bad_detail = []
for t in bank:
    cons = normalize(t['constraints'])
    b_user = np.array([k['rhs'] for k in t['constraints']], dtype=float)   # 用户输入的 b
    y = np.array(t['dual'], dtype=float)
    x = np.array(t['sol'], dtype=float)
    z = t['obj']

    # 强对偶（用户空间）
    if abs(float(b_user @ y) - z) <= 1e-6 * max(1.0, abs(z)):
        s_ok += 1
    else:
        s_bad += 1
        bad_detail.append(('强对偶', t['id'], float(b_user @ y), z))

    # 互补松弛（用户空间：余量按用户原本的关系符算，y 也取用户空间的那一份）
    worst = 0.0
    for k, con in enumerate(t['constraints']):
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

print('判据一 强对偶  Σbᵢyᵢ = z*（用户空间）: 通过 %d / 失败 %d' % (s_ok, s_bad))
print('判据二 互补松弛 y·slack=0:             通过 %d / 失败 %d' % (c_ok, c_bad))
for d in bad_detail[:8]:
    print('   失败:', d)

# ---------- 判据三 中心差分扰动（抽样） ----------
# 两个必须注意的地方（2026-09 修正，修正前的版本会误报 7 条「不一致」）：
#   ① 必须在【用户输入的空间】扰动 b。JS 给出的 y 已经乘过 flipSign、换算回用户量纲
#      （内部 b = flipSign · 用户 b），若在标准化空间扰动再跟用户空间的 y 比，
#      凡是「右端项为负」的约束都会整体差一个负号。
#   ② 最优顶点恰好落在折点上时（扰动 b 会改变最优基），两侧单侧导数不相等，
#      中心差分（z⁺−z⁻)/2ε 是两个不同斜率的平均，本来就不等于任何一侧的影子价格。
#      所以先算左、右两个单侧斜率：两者相等 → 严格按两侧值判；不相等 → 只能要求 y
#      等于其中一侧（正确结论本就只能是单侧的），并单独统计这类「断点」有多少。
print('\n判据三 单侧/中心差分扰动抽样（在用户输入空间扰动）…')
EPS = 1e-4
sample = [t for t in bank if len(t['constraints']) >= 2][:40]
p_ok = p_bad = p_skip = p_break = 0
p_detail = []


def user_perturbed_solve(t, i, d):
    """把第 i 条约束的**用户右端项**挪 d，再按 JS 的规则规范化后交给 scipy 重解。"""
    cons_u = [{'coef': list(k['coef']), 'rel': k['rel'], 'rhs': k['rhs']} for k in t['constraints']]
    cons_u[i]['rhs'] += d
    return solve(t, normalize(cons_u))


for t in sample:
    cons = normalize(t['constraints'])
    z0 = solve(t, cons)
    if z0 is None:
        p_skip += 1
        continue
    for i in range(len(t['constraints'])):          # 下标按**用户输入**的约束顺序
        z_up = user_perturbed_solve(t, i, EPS)
        z_dn = user_perturbed_solve(t, i, -EPS)
        if z_up is None or z_dn is None:
            continue
        y_i = t['dual'][i]
        tol = 5e-3 * max(1.0, abs(y_i))
        left = (z0 - z_dn) / EPS                     # 只把 bᵢ 挪小
        right = (z_up - z0) / EPS                    # 只把 bᵢ 挪大
        if abs(left - right) <= tol:                 # 折点之外：两侧一致，严格判
            ok = abs((left + right) / 2 - y_i) <= tol
        else:                                        # 折点上：中心差分无定义，只要求等于一侧
            p_break += 1
            ok = (abs(left - y_i) <= tol) or (abs(right - y_i) <= tol)
        if ok:
            p_ok += 1
        else:
            p_bad += 1
            if len(p_detail) < 8:
                p_detail.append((t['id'], i, round(y_i, 6), round(left, 6), round(right, 6)))

print('  逐项一致 %d / 不一致 %d（该行右端项恰好落在折点上 %d 条，按单侧值判；跳过 %d 题求解失败）'
      % (p_ok, p_bad, p_break, p_skip))
for d in p_detail:
    print('   不一致 题id=%s 第%d个约束  JS=%s  左单侧=%s  右单侧=%s' % d)
