# -*- coding: utf-8 -*-
"""
================================================================================
 inventory.py 的独立对拍验证
================================================================================

 验证思路：**绝不用模型自己的公式去验证模型自己**。
 每个模型的闭式解都与一个"独立数值方法"对拍：

   模型 1 EOQ        一维数值极小化（Brent）+ 费用结构（订货费=存贮费）
   模型 2 EPQ        一维数值极小化 + 数值积分验证"平均存贮量 = S*/2"
   模型 3 允许缺货   (Q,S) 二维无约束数值极小化（Nelder-Mead，多个起点）
   模型 4 报童离散   对 Q 穷举（只在需求取值点上比较），期望成本按定义求和
   模型 4 报童正态   期望成本用自适应数值积分（quad，±∞），再对 Q 极小化
   模型 5 批量折扣   逐档密集扫描精确分段费用（不用"凸性⇒端点"这个前提）
   模型 6 多产品     scipy SLSQP 带约束求解 + KKT 残差 + 影子价格有限差分

 另加一组"跨模型退化一致性"检查（EPQ→EOQ、缺货→EOQ、折扣→EOQ、约束松弛→EOQ），
 以及 23 个异常输入必须被拦截的参数校验检查。

 用法：  python verify_inventory.py
 退出码：0 = 全部通过；1 = 有失败项（失败明细会打印出来）
================================================================================
"""

import math
import random
import sys
import time
import warnings

warnings.filterwarnings("ignore", message=".*does not converge.*")

from inventory import (InventoryError, eoq_basic, epq_production, eoq_shortage,
                       newsvendor, quantity_discount, multiproduct_constrained,
                       dynamic_lot_sizing, norm_cdf, norm_pdf, norm_ppf)

try:
    from scipy.optimize import minimize as sp_min, minimize_scalar as sp_min_scalar
    from scipy.integrate import quad as sp_quad
    HAS_SCIPY = True
except Exception:
    HAS_SCIPY = False

FAILS = []
CHECKS = [0]
T0 = time.time()

_rng = random.Random(20260915)


def ck(tag, got, want, tol=1e-6, rel=True):
    """比较 got 与 want；rel=True 用相对误差。"""
    CHECKS[0] += 1
    if want == 0:
        err, errs = abs(got - want), f"abs={abs(got - want):.3e}"
    else:
        err = abs(got - want) / abs(want)
        errs = f"rel={err:.3e}"
    if err > tol:
        FAILS.append(f"{tag}: got={got!r} want={want!r} ({errs}, tol={tol:g})")


def ck_true(tag, cond, info=""):
    CHECKS[0] += 1
    if not cond:
        FAILS.append(f"{tag}: 断言失败 {info}")


def refine_1d(f, xa, xb, n=2001):
    """粗网格定位 + 三点抛物线精修。返回 (x*, f*)。"""
    step = (xb - xa) / (n - 1)
    bi, bv = 0, float("inf")
    for i in range(n):
        v = f(xa + i * step)
        if v < bv:
            bi, bv = i, v
    i = min(max(bi, 1), n - 2)
    x0, x1, x2 = xa + (i - 1) * step, xa + i * step, xa + (i + 1) * step
    f0, f1, f2 = f(x0), f(x1), f(x2)
    den = (x0 - x1) * (x0 - x2) * (x1 - x2)
    if abs(den) > 1e-300:
        A = (x2 * (f1 - f0) + x1 * (f0 - f2) + x0 * (f2 - f1)) / den
        B = (x2 * x2 * (f0 - f1) + x1 * x1 * (f2 - f0) + x0 * x0 * (f1 - f2)) / den
        if A > 0:
            xb2 = -B / (2 * A)
            if xa <= xb2 <= xb and f(xb2) <= bv:
                return xb2, f(xb2)
    return xa + bi * step, bv


def min_1d(f, lo, hi):
    """独立一维极小化：Brent 有界法（scipy）；无 scipy 时退化为网格+抛物线。"""
    if HAS_SCIPY:
        r = sp_min_scalar(f, bounds=(lo, hi), method="bounded",
                          options={"xatol": 1e-13, "maxiter": 1000})
        return r.x, r.fun
    return refine_1d(f, lo, hi)


def hdr(t):
    print("\n" + "=" * 78)
    print("  " + t)
    print("=" * 78)


print("=" * 78)
print("  inventory.py 独立对拍验证")
print(f"  scipy 可用：{HAS_SCIPY}")
print("=" * 78)


# ==============================================================================
hdr("0. 正态分布函数自检（Φ、φ、Φ⁻¹）")
# ==============================================================================

ck("Φ(0) = 0.5", norm_cdf(0.0), 0.5, 1e-15)
ck("Φ(1.96)", norm_cdf(1.96), 0.9750021048517795, 1e-12)
ck("Φ(-1.0)", norm_cdf(-1.0), 0.15865525393145707, 1e-12)
ck("φ(0)", norm_pdf(0.0), 1.0 / math.sqrt(2 * math.pi), 1e-15)

# Φ⁻¹ 与"二分法反解 Φ(x)=p"对照 —— 完全独立的求解途径
_ppf_max_err = 0.0
for _ in range(3000):
    p = _rng.uniform(1e-9, 1 - 1e-9)
    x = norm_ppf(p)
    lo_, hi_ = -40.0, 40.0
    for _ in range(160):
        mid = 0.5 * (lo_ + hi_)
        if norm_cdf(mid) < p:
            lo_ = mid
        else:
            hi_ = mid
    _ppf_max_err = max(_ppf_max_err, abs(x - 0.5 * (lo_ + hi_)))
ck_true("Φ⁻¹ 与二分法反解一致（最大偏差 < 1e-9）", _ppf_max_err < 1e-9,
        f"max_err={_ppf_max_err:.3e}")
ck("Φ⁻¹ 往返：Φ(Φ⁻¹(0.714286))", norm_cdf(norm_ppf(0.714286)), 0.714286, 1e-13)
print(f"  Φ⁻¹ 与二分法反解最大偏差 = {_ppf_max_err:.3e}")


# ==============================================================================
hdr("1. 模型 1  EOQ  —— 随机 300 例 独立极小化对拍")
# ==============================================================================

N1 = 300
e_q = e_c = e_split = 0.0
for _ in range(N1):
    D = 10 ** _rng.uniform(2, 6)
    c1 = 10 ** _rng.uniform(-1, 2)
    c3 = 10 ** _rng.uniform(1, 4)
    r = eoq_basic(D=D, c1=c1, c3=c3, verbose=False)

    # 独立目标函数：一个周期 T=Q/D 内「订一次货 + 存一个三角形库存」
    def cost(Q, D=D, c1=c1, c3=c3):
        T = Q / D
        area = Q * Q / (2.0 * D)              # 三角形面积 = ½·时间底·库存高
        return (c3 + c1 * area) / T

    qn, cn = min_1d(cost, 1e-9 * r["Q_star"], 30.0 * r["Q_star"])
    e_q = max(e_q, abs(qn - r["Q_star"]) / r["Q_star"])
    e_c = max(e_c, abs(cn - r["C_star"]) / r["C_star"])
    e_split = max(e_split, abs(r["cost_ordering"] - r["cost_holding"]) / r["C_star"])

ck_true(f"EOQ {N1} 例：Q* 与数值最优批量一致", e_q < 1e-6, f"max_rel={e_q:.2e}")
ck_true(f"EOQ {N1} 例：C* 与数值最小费用一致", e_c < 1e-9, f"max_rel={e_c:.2e}")
ck_true(f"EOQ {N1} 例：最优处订货费 = 存贮费（各占一半）", e_split < 1e-12,
        f"max_rel={e_split:.2e}")
_ = eoq_basic(10000, 4, 200, verbose=False)
ck("EOQ 手算例 Q*", _["Q_star"], math.sqrt(2 * 10000 * 200 / 4.0), 1e-15)
ck("EOQ 手算例 C*", _["C_star"], 4000.0, 1e-15)
ck("EOQ 手算例 T*", _["T_star"], 0.1, 1e-15)
ck("EOQ 手算例 年订货次数", _["order_times_per_year"], 10.0, 1e-15)
print(f"  Q* 偏差 {e_q:.2e}｜C* 偏差 {e_c:.2e}｜订货费/存贮费差额 {e_split:.2e}")


# ==============================================================================
hdr("2. 模型 2  EPQ  —— 随机 250 例 独立极小化 + 数值积分验证平均存贮量")
# ==============================================================================

N2 = 250
e_q = e_c = e_area = 0.0
for _ in range(N2):
    # ★ D 与 d 必须同一时间口径。之前的版本把 D、d 各自独立随机，
    #   结果模型的 C* = sqrt(2·D·c1·c3·(1-ρ)) 与测试的"周期成本/周期长度"
    #   不再是同一个优化问题（相差 sqrt(D/d) 倍），于是报出 127% 的偏差。
    #   这里统一取 D = d（都以"件/年"计），物理定义与模型公式才等价。
    d = 10 ** _rng.uniform(2, 6)
    D = d
    p = d * _rng.uniform(1.05, 8.0)
    c1 = 10 ** _rng.uniform(-1, 2)
    c3 = 10 ** _rng.uniform(1, 4)
    r = epq_production(D=D, d=d, p=p, c1=c1, c3=c3, verbose=False)

    def cost(Q, D=D, d=d, p=p, c1=c1, c3=c3):
        T = Q / d
        area = (1.0 - d / p) * Q * Q / (2.0 * d)
        return (c3 + c1 * area) / T

    qn, cn = min_1d(cost, 1e-9 * r["Q_star"], 30.0 * r["Q_star"])
    e_q = max(e_q, abs(qn - r["Q_star"]) / r["Q_star"])
    e_c = max(e_c, abs(cn - r["C_star"]) / r["C_star"])

    # 数值积分一个周期的锯齿库存，验证"平均存贮量 = S*/2"这个几何结论
    T, tp, S = r["T_star"], r["t_produce"], r["S_star"]

    def inv(t):
        if t < tp:
            return (p - d) * t
        return max(S - d * (t - tp), 0.0)

    n = 1001
    h = T / n
    acc = 0.5 * (inv(0.0) + inv(T))
    for i in range(1, n):
        acc += inv(i * h)
    e_area = max(e_area, abs(acc * h / T - S / 2.0) / (S / 2.0))

ck_true(f"EPQ {N2} 例：Q* 与数值最优批量一致", e_q < 1e-6, f"max_rel={e_q:.2e}")
ck_true(f"EPQ {N2} 例：C* 与数值最小费用一致", e_c < 1e-9, f"max_rel={e_c:.2e}")
ck_true(f"EPQ {N2} 例：数值积分平均存贮量 = S*/2", e_area < 1e-3, f"max_rel={e_area:.2e}")
_r = epq_production(D=10000, d=40, p=100, c1=4, c3=200, verbose=False)
ck("EPQ 手算例 Q*", _r["Q_star"], math.sqrt(2 * 10000 * 200 / (0.6 * 4)), 1e-15)
ck("EPQ 手算例 S*", _r["S_star"], 0.6 * _r["Q_star"], 1e-15)
ck("EPQ 手算例 C*", _r["C_star"], math.sqrt(2 * 10000 * 4 * 200 * 0.6), 1e-15)
# 单位口径：D = 250·d 且显式给出 periods_per_year=250 时应与 D=d 情形的 Q* 差 sqrt(250)
_a = epq_production(D=40, d=40, p=100, c1=4, c3=200, verbose=False)
_b = epq_production(D=40 * 250, d=40, p=100, c1=4, c3=200, periods_per_year=250,
                    verbose=False)
ck("EPQ 单位口径：D 放大 250 倍时 Q* 放大 sqrt(250) 倍",
   _b["Q_star"] / _a["Q_star"], math.sqrt(250), 1e-12)
ck("EPQ 单位口径：D = d × n 校验通过", _b["time_units_per_year"], 250.0, 1e-15)
print(f"  Q* 偏差 {e_q:.2e}｜C* 偏差 {e_c:.2e}｜平均存贮量积分偏差 {e_area:.2e}")


# ==============================================================================
hdr("3. 模型 3  允许缺货  —— 随机 250 例 (Q,S) 二维独立极小化")
# ==============================================================================

N3 = 250
e_q = e_s = e_c = 0.0
_used_nm = False
for _ in range(N3):
    D = 10 ** _rng.uniform(2, 6)
    c1 = 10 ** _rng.uniform(-1, 2)
    c2 = 10 ** _rng.uniform(-1, 2)
    c3 = 10 ** _rng.uniform(1, 4)
    r = eoq_shortage(D=D, c1=c1, c2=c2, c3=c3, verbose=False)

    # 独立二维目标：直接按「周期成本 / 周期长度」定义
    def f2(xs, D=D, c1=c1, c2=c2, c3=c3):
        Q, S = xs
        if Q <= 0 or S < 0 or S > Q:
            return 1e30
        T = Q / D
        return (c3 + c1 * S * S / (2.0 * D) + c2 * (Q - S) ** 2 / (2.0 * D)) / T

    if HAS_SCIPY:
        _used_nm = True
        # 多个起点，避免落进局部极小
        best = (None, float("inf"))
        for x0 in [(r["Q_star"], r["S_star"]),
                   (2.0 * r["Q_star"], 0.5 * r["S_star"]),
                   (0.5 * r["Q_star"], 0.9 * r["Q_star"]),
                   (1.5 * r["Q_star"], 0.1 * r["Q_star"])]:
            s = sp_min(f2, x0, method="Nelder-Mead",
                       options={"xatol": 1e-13, "fatol": 1e-13, "maxiter": 20000})
            if s.fun < best[1]:
                best = (s.x, s.fun)
        qn, sn, cn = best[0][0], best[0][1], best[1]
    else:
        Qmax = 20.0 * r["Q_star"]
        n, best = 400, (None, None, float("inf"))
        for i in range(1, n + 1):
            Q = Qmax * i / n
            for j in range(n + 1):
                S = Q * j / n
                v = f2((Q, S))
                if v < best[2]:
                    best = (Q, S, v)
        qn, sn, cn = best

    e_q = max(e_q, abs(qn - r["Q_star"]) / r["Q_star"])
    e_s = max(e_s, abs(sn - r["S_star"]) / r["S_star"])
    e_c = max(e_c, abs(cn - r["C_star"]) / r["C_star"])
    ck_true("缺货例：B* + S* = Q*", abs(r["B_star"] + r["S_star"] - r["Q_star"]) < 1e-9)

tol3 = 1e-6 if _used_nm else 1e-2
ck_true(f"缺货 {N3} 例：Q* 与二维数值最优一致", e_q < tol3, f"max_rel={e_q:.2e}")
ck_true(f"缺货 {N3} 例：S* 与二维数值最优一致", e_s < tol3, f"max_rel={e_s:.2e}")
ck_true(f"缺货 {N3} 例：C* 与二维数值最小一致", e_c < max(tol3, 1e-8),
        f"max_rel={e_c:.2e}")
_r = eoq_shortage(D=10000, c1=4, c2=2, c3=200, verbose=False)
ck("缺货手算例 Q*", _r["Q_star"], math.sqrt(2 * 10000 * 200 * 6 / 8.0), 1e-15)
ck("缺货手算例 B*/Q* = c1/(c1+c2)", _r["B_star"] / _r["Q_star"], 4.0 / 6.0, 1e-15)
ck("缺货手算例 C*", _r["C_star"], math.sqrt(2 * 10000 * 4 * 2 * 200 / 6.0), 1e-15)
print(f"  Q* 偏差 {e_q:.2e}｜S* 偏差 {e_s:.2e}｜C* 偏差 {e_c:.2e}")


# ==============================================================================
hdr("4. 模型 4  报童  —— 离散穷举 250 例 + 正态积分 250 例")
# ==============================================================================

# ---- 4a 离散 ----
N4 = 250
bad = 0
e_c = 0.0
for _ in range(N4):
    m = _rng.randint(2, 12)
    vals = sorted(_rng.sample(range(1, 400), m))
    ws = [_rng.random() + 1e-9 for _ in range(m)]
    tot = sum(ws)
    pr = [w / tot for w in ws]
    k = 10 ** _rng.uniform(-0.5, 1.0)
    h = 10 ** _rng.uniform(-0.5, 1.0)
    r = newsvendor(k=k, h=h, kind="discrete", values=vals, probs=pr, verbose=False)

    def Ecost(Q, k=k, h=h, vals=vals, pr=pr):
        return (k * sum((v - Q) * p for v, p in zip(vals, pr) if v > Q)
                + h * sum((Q - v) * p for v, p in zip(vals, pr) if v < Q))

    best_v = min(Ecost(q) for q in vals)     # 只需在需求取值点上比较
    e_c = max(e_c, abs(best_v - r["expected_cost"]) / abs(best_v))
    if r["expected_cost"] > best_v * (1 + 1e-12):
        bad += 1
    idx = r["values"].index(r["Q_star"])
    ck_true("报童离散：F(Q*) ≥ 临界比", r["F_at_Q"] >= r["critical_ratio"] - 1e-12)
    if idx > 0:
        ck_true("报童离散：F(Q*) 的前一点 < 临界比",
                r["cdf"][idx - 1] < r["critical_ratio"] + 1e-12)
    ck_true("报童离散：超储+售罄+缺货概率 = 1",
            abs(r["overstock_prob"] + r["prob_equal"] + r["stockout_prob"] - 1.0) < 1e-12)

ck_true(f"报童离散 {N4} 例：期望成本不超过穷举最优", bad == 0, f"bad={bad}")
ck_true(f"报童离散 {N4} 例：期望成本与穷举最优一致", e_c < 1e-12, f"max_rel={e_c:.2e}")

# ---- 4b 正态：期望成本用自适应数值积分（±∞） ----
N4b = 250
e_cb = e_qb = 0.0
for _ in range(N4b):
    mu = _rng.uniform(50, 2000)
    sigma = mu * _rng.uniform(0.05, 0.6)
    k = 10 ** _rng.uniform(-0.5, 1.0)
    h = 10 ** _rng.uniform(-0.5, 1.0)
    r = newsvendor(k=k, h=h, kind="normal", mu=mu, sigma=sigma, verbose=False)

    def dens(x, mu=mu, sigma=sigma):
        return norm_pdf((x - mu) / sigma) / sigma

    def Ecost(Q, k=k, h=h, mu=mu, sigma=sigma):
        if HAS_SCIPY:
            short = sp_quad(lambda x: (x - Q) * dens(x), Q, math.inf,
                            limit=200, epsabs=1e-13, epsrel=1e-10)[0]
            over = sp_quad(lambda x: (Q - x) * dens(x), -math.inf, Q,
                           limit=200, epsabs=1e-13, epsrel=1e-10)[0]
        else:
            raise RuntimeError("需要 scipy")
        return k * short + h * over

    qn, cn = min_1d(Ecost, mu - 8 * sigma, mu + 8 * sigma)
    e_cb = max(e_cb, abs(cn - r["expected_cost"]) / r["expected_cost"])
    e_qb = max(e_qb, abs(qn - r["Q_star"]) / r["Q_star"])

ck_true(f"报童正态 {N4b} 例：期望成本与数值积分一致", e_cb < 1e-8, f"max_rel={e_cb:.2e}")
ck_true(f"报童正态 {N4b} 例：Q* 与数值最优一致", e_qb < 1e-5, f"max_rel={e_qb:.2e}")
print(f"  离散 {N4} 例：全部通过（期望成本最大偏差 {e_c:.2e}）")
print(f"  正态 {N4b} 例：C* 偏差 {e_cb:.2e}，Q* 偏差 {e_qb:.2e}")

_r = newsvendor(k=5, h=2, kind="discrete", values=[100, 200, 300, 400, 500],
                probs=[0.1, 0.2, 0.3, 0.2, 0.2], verbose=False)
ck("报童手算例 Q*", _r["Q_star"], 400, 1e-15)
ck("报童手算例 C*", _r["expected_cost"], 300, 1e-15)
ck("报童手算例 缺货概率", _r["stockout_prob"], 0.2, 1e-15)
ck("报童手算例 超储概率", _r["overstock_prob"], 0.6, 1e-15)
# 期望值不写死常数（上一版就是写死了一个自己口算的近似值，反而成了假失败），
# 改用独立的二分法现场反解 Φ(z) = k/(k+h)。
_p = 5.0 / 7.0
_lo, _hi = -10.0, 10.0
for _ in range(200):
    _mid = 0.5 * (_lo + _hi)
    if norm_cdf(_mid) < _p:
        _lo = _mid
    else:
        _hi = _mid
_ = newsvendor(k=5, h=2, kind="normal", mu=300, sigma=50, verbose=False)
ck("报童正态手算例 Q*（对照二分法反解）", _["Q_star"],
   300 + 50 * 0.5 * (_lo + _hi), 1e-12)
# 离散需求按"概率和=1"的严格校验：人为构造临界比恰好等于累积概率的边界情形
_t = newsvendor(k=1, h=1, kind="discrete", values=[1, 2], probs=[0.5, 0.5], verbose=False)
ck("报童边界：F(Q*)=临界比(0.5) 时取较小 Q", _t["Q_star"], 1, 1e-15)
ck_true("报童边界：标记为并列最优", _t["exact_tie"] is True)


# ==============================================================================
hdr("5. 模型 5  批量折扣  —— 随机 200 例 逐档密集扫描精确分段费用")
# ==============================================================================

N5 = 200
e_cost = 0.0
arg_bad = 0
for _ in range(N5):
    D = 10 ** _rng.uniform(2.5, 5.5)
    c3 = 10 ** _rng.uniform(1, 3.5)
    ntier = _rng.randint(1, 5)
    lo = 0.0
    tiers = []
    K = 10 ** _rng.uniform(0.5, 1.5)
    for i in range(ntier):
        if i > 0:
            lo = lo + 10 ** _rng.uniform(1.5, 3.5)
        tiers.append((lo, K))
        K = K * _rng.uniform(0.6, 0.98)
    rate = _rng.uniform(0.05, 0.4)
    r = quantity_discount(D=D, c3=c3, breaks=tiers, holding_rate=rate, verbose=False)

    def price_at(q, tiers=tiers):
        Kx = tiers[0][1]
        for lo_, k_ in tiers:
            if q >= lo_ - 1e-9:
                Kx = k_
        return Kx

    def cost(q, D=D, c3=c3, rate=rate, tiers=tiers):
        Kx = price_at(q, tiers)
        return 0.5 * q * rate * Kx + (D / q) * c3 + D * Kx

    # 逐档密集扫描：不使用"凸性 ⇒ 端点"这一前提，纯暴力
    best_q, best_v = None, float("inf")
    for i, (lo_, K_) in enumerate(tiers):
        hi_ = tiers[i + 1][0] if i + 1 < len(tiers) else None
        hi_s = (max(lo_ * 8.0, 8.0 * r["eoq_no_discount"], 1.0)
                if hi_ is None else hi_)
        n = 8001
        for j in range(n + 1):
            q = lo_ + (hi_s - lo_) * j / n
            if q <= 0:
                continue
            v = cost(q)
            if v < best_v:
                best_q, best_v = q, v
    e_cost = max(e_cost, abs(best_v - r["cost_star"]) / r["cost_star"])
    # 值判定：返回的 Q* 的花费不得劣于暴力最优
    if cost(r["Q_star"]) > best_v * (1 + 1e-9):
        arg_bad += 1

ck_true(f"折扣 {N5} 例：最小费用与暴力扫描一致", e_cost < 1e-6, f"max_rel={e_cost:.2e}")
ck_true(f"折扣 {N5} 例：返回的 Q* 不劣于暴力最优", arg_bad == 0, f"bad={arg_bad}")
_r5 = quantity_discount(D=5000, c3=100,
                        breaks=[(0, 10.0), (500, 9.5), (1000, 9.0), (2000, 8.5)],
                        holding_rate=0.2, verbose=False)
ck("折扣手算例 Q*", _r5["Q_star"], 2000, 1e-15)
ck("折扣手算例 C*", _r5["cost_star"], 44450.0, 1e-15)
ck_true("折扣手算例：全局最优落在第 4 档", _r5["best_bracket"] == 4,
        f"got={_r5['best_bracket']}")
# 各档候选的可行性标记必须自洽
for _row in _r5["brackets"]:
    if _row["candidate"] is not None and abs(_row["candidate"] - _row["eoq"]) < 1e-9:
        ck_true("折扣：候选=EOQ 时必标记为可行", "可行" in _row["status"])
    elif _row["candidate"] is not None and _row["candidate"] == _row["lo"]:
        ck_true("折扣：候选=左端点时 EOQ 必小于下限", _row["eoq"] < _row["lo"] + 1e-9)
print(f"  最小费用最大相对偏差 {e_cost:.2e}；Q* 非最优的例数 = {arg_bad}")


# ==============================================================================
hdr("6. 模型 6  多产品约束  —— SLSQP 对拍 + KKT 残差 + 影子价格有限差分")
# ==============================================================================

if not HAS_SCIPY:
    print("  ⚠ 未安装 scipy，跳过模型 6 的数值对拍（手算例仍会检查）")
else:
    N6 = 150
    e_q = e_cost = e_kkt = e_shadow = e_q_ok = 0.0
    bind_ok = True
    nm_fail = 0          # SLSQP 自身未收敛的例数（其数值问题，非本模型的错）
    worse = 0            # 本模型费用反而劣于 SLSQP 的例数（这才是真错）
    perturb_bad = 0      # 在解附近随机扰动竟能找到更省的可行点（真错）
    for _ in range(N6):
        n = _rng.randint(2, 4)
        kind = _rng.choice(["capital", "volume"])
        avg = _rng.choice([False, True])
        items = [{"name": f"P{j+1}",
                  "D": 10 ** _rng.uniform(2.5, 5.5),
                  "c1": 10 ** _rng.uniform(-0.5, 1.5),
                  "c3": 10 ** _rng.uniform(1, 3.5),
                  "K": 10 ** _rng.uniform(0.5, 1.5),
                  "v": 10 ** _rng.uniform(-1.5, 0.5)} for j in range(n)]
        gk = "K" if kind == "capital" else "v"
        uncon = sum((it[gk] / 2.0 if avg else it[gk])
                    * math.sqrt(2 * it["c3"] * it["D"] / it["c1"]) for it in items)
        limit = uncon * _rng.uniform(0.5, 0.95)

        r = multiproduct_constrained(items, constraint=kind, limit=limit,
                                     average_basis=avg, verbose=False)
        a = [it["c3"] * it["D"] for it in items]
        b = [it["c1"] / 2.0 for it in items]
        g = [(it[gk] / 2.0 if avg else it[gk]) for it in items]

        def obj(q, a=a, b=b):
            return sum(ai / qi + bi * qi for ai, bi, qi in zip(a, b, q))

        sol = sp_min(obj, [math.sqrt(ai / bi) for ai, bi in zip(a, b)], method="SLSQP",
                     constraints=[{"type": "ineq",
                                   "fun": lambda q, g=g: limit - sum(gi * qi
                                                                     for gi, qi in zip(g, q))}],
                     bounds=[(1e-12, None)] * n,
                     options={"ftol": 1e-14, "maxiter": 3000})
        # 随机题的量级跨度很大，SLSQP 偶尔会停在"方向导数为正"而报未收敛，
        # 这是 SLSQP 自身的数值现象。因此判据以**目标值**为准：
        # 本模型的费用不得劣于 SLSQP 的解（两个都达到最优时二者相等）。
        if not sol.success:
            nm_fail += 1
        else:
            for i in range(n):
                e_q_ok = max(e_q_ok,
                             abs(sol.x[i] - r["items"][i]["Q"]) / r["items"][i]["Q"])
        for i in range(n):
            e_q = max(e_q, abs(sol.x[i] - r["items"][i]["Q"]) / r["items"][i]["Q"])
        _gap = r["total_cost"] - obj(sol.x)
        e_cost = max(e_cost, abs(_gap) / r["total_cost"])
        if _gap > 1e-9 * r["total_cost"]:
            worse += 1

        # 独立的最优性证据：在本模型的解附近随机扰动，不应找到更省的可行点。
        # （目标函数在最优点附近很平坦，所以 x 可以相差 1e-4 而费用只差 1e-8，
        #   光比 x 不足以判定对错；KKT 残差 + 本项扰动检查才是实质证据。）
        q0 = [row["Q"] for row in r["items"]]
        best_slack_gain = 0.0
        for _t in range(120):
            qq = [max(qi * (1.0 + _rng.uniform(-0.06, 0.06)), 1e-12) for qi in q0]
            if sum(gi * qi for gi, qi in zip(g, qq)) > limit * (1 + 1e-9):
                continue                      # 不可行，跳过
            best_slack_gain = min(best_slack_gain, obj(qq) - r["total_cost"])
        if best_slack_gain < -1e-9 * r["total_cost"]:
            perturb_bad += 1
        ck_true("约束满足（资源占用 ≤ 上限）",
                sum(gi * qi for gi, qi in zip(g, sol.x)) <= limit * (1 + 1e-7))

        lam = r["lambda_star"]
        for i in range(n):
            # KKT 定常性： -a/Q² + b + λg = 0
            resid = abs(-a[i] / r["items"][i]["Q"] ** 2 + b[i] + lam * g[i])
            e_kkt = max(e_kkt, resid / max(b[i], 1e-12))
        if abs(r["resource_used"] - limit) / limit > 1e-6:
            bind_ok = False

        # 影子价格：中心差分（二阶精度），应等于 λ
        h = max(limit * 1e-4, 1e-9)
        rp = multiproduct_constrained(items, constraint=kind, limit=limit + h,
                                      average_basis=avg, verbose=False)
        rm = multiproduct_constrained(items, constraint=kind, limit=limit - h,
                                      average_basis=avg, verbose=False)
        num = (rp["total_cost"] - rm["total_cost"]) / (2.0 * h)
        e_shadow = max(e_shadow, abs(num + lam) / max(abs(lam), 1e-12))

    # 关于 x 的容差：目标函数 Σ(a/Q + bQ) 在最优点附近很平坦，SLSQP 的停止准则是
    # 目标值变化（ftol=1e-14）而非 x 变化，所以它给出的 x 可以相差 1e-4 量级
    # 而费用相同。因此 x 比到 1e-2，费用比到 1e-7，最优性由 KKT 残差（机器精度）
    # 和下面的扰动检查共同证明。
    ck_true(f"多产品 {N6} 例：Qᵢ* 与 SLSQP 在费用等价意义下一致", e_q_ok < 1e-2,
            f"max_rel={e_q_ok:.2e}")
    ck_true(f"多产品 {N6} 例：本模型费用不劣于 SLSQP（SLSQP 不可能做到更省）",
            worse == 0, f"worse={worse}")
    ck_true(f"多产品 {N6} 例：随机扰动找不到更省的可行点", perturb_bad == 0,
            f"bad={perturb_bad}")
    ck_true(f"多产品 {N6} 例：总费用与 SLSQP 一致", e_cost < 1e-7, f"max_rel={e_cost:.2e}")
    ck_true(f"多产品 {N6} 例：KKT 定常性条件成立", e_kkt < 1e-9, f"max_resid={e_kkt:.2e}")
    ck_true(f"多产品 {N6} 例：λ*>0 时约束取等号", bind_ok)
    ck_true(f"多产品 {N6} 例：λ* 等于影子价格（中心差分）", e_shadow < 1e-5,
            f"max_rel={e_shadow:.2e}")
    print(f"  收敛例 Qᵢ 偏差 {e_q_ok:.2e}｜总费用偏差 {e_cost:.2e}"
          f"｜KKT 残差 {e_kkt:.2e}｜影子价格偏差 {e_shadow:.2e}")
    print(f"  SLSQP 自身未收敛 {nm_fail}/{N6} 例（其数值现象；这些例以费用不劣于 SLSQP 判定）")
    print(f"  扰动检查：{N6}×120 次随机可行扰动均未找到更省的解")

_r6 = multiproduct_constrained(
    items=[{"name": "A", "D": 10000, "c1": 4, "c3": 200, "K": 10},
           {"name": "B", "D": 5000, "c1": 3, "c3": 150, "K": 15}],
    constraint="capital", limit=15000, verbose=False)
ck("多产品手算例 λ*", _r6["lambda_star"], 0.12199254, 1e-6)
ck("多产品手算例 资源占用 = 上限", _r6["resource_used"], 15000.0, 1e-9)
ck_true("多产品手算例：约束起作用", _r6["binding"] is True)
print(f"  手算例：λ* = {_r6['lambda_star']:.8f}，资源占用 = {_r6['resource_used']:.6f}，"
      f"总费用 = {_r6['total_cost']:.4f}")


# ==============================================================================
hdr("7. 模型 7  动态需求  —— 全划分穷举 + 库存状态 DP 双路对拍")
# ==============================================================================


def brute_partition(net, ks, c1, T):
    """
    穷举【所有连续区段划分】（2^(T-1) 种），对区段形式不作任何先验假设，纯暴力。
    这是对「Wagner-Whitin 只需枚举区段」这一论断的最直接检验：
    如果 DP 真的最优，它的值必须等于穷举所有划分的最小值。
    """
    best = float("inf")
    for mask in range(1 << (T - 1)):
        blocks, start = [], 1
        for i in range(T - 1):
            if (mask >> i) & 1:
                blocks.append((start, i + 1))
                start = i + 2
        blocks.append((start, T))
        c = 0.0
        for (j, t2) in blocks:
            if sum(net[j - 1:t2]) <= 1e-12:
                continue          # 该区段净需求全为 0 -> 不需要订货，费用 0
            c += ks[j - 1] + c1 * sum((i - j) * net[i - 1]
                                      for i in range(j + 1, t2 + 1))
        best = min(best, c)
    return best


def dp_inventory_state(net, ks, c1, T):
    """
    与 Wagner-Whitin **完全不同的第二种建模**：
        状态 = 每期期初的库存水平 I（整数格点），决策 = 任意订货量 q ≥ 0。
        不依赖零库存订货性质，因此能独立检验 WW 递推是否真的最优
        （它能搜到所有非区段式方案，比如某期需求被两次订货拆分覆盖）。
    递推：g_t(I) = min_q { [q>0]·c3 + c1·(I+q−d_t) + g_{t+1}(I+q−d_t) }
          边界 g_{T+1}(I) = 0 若 I=0，否则 ∞（期末不许留存货）。
    返回 g_1(0)。要求需求为整数。
    """
    tot = int(round(sum(net)))
    INF = float("inf")
    g_next = [0.0 if I == 0 else INF for I in range(tot + 1)]
    for t in range(T, 0, -1):
        dt = int(round(net[t - 1]))
        g = [INF] * (tot + 1)
        for I in range(tot + 1):
            best = INF
            for q in range(0, tot - I + 1):
                if I + q < dt:
                    continue
                Iend = I + q - dt
                cand = (ks[t - 1] if q > 0 else 0.0) + c1 * Iend + g_next[Iend]
                if cand < best:
                    best = cand
            g[I] = best
        g_next = g
    return g_next[0]


def rand_dyn(T_lo=2, T_hi=10, d_hi=40, need_pos=True):
    T = _rng.randint(T_lo, T_hi)
    ds = [float(_rng.randint(0, d_hi)) for _ in range(T)]
    if need_pos and sum(ds) <= 0:
        ds[_rng.randrange(T)] = float(_rng.randint(1, d_hi))
    return ds, 10 ** _rng.uniform(-0.5, 1.0), 10 ** _rng.uniform(1, 3)


# ---- 7-a 全划分穷举（2^(T-1) 种划分，纯暴力）----
N7a = 150
e_part = 0.0
for _ in range(N7a):
    ds, c1, c3 = rand_dyn(2, 9, 40)
    T = len(ds)
    r = dynamic_lot_sizing(demands=ds, c1=c1, c3=c3, verbose=False)
    bf = brute_partition(r["net_demands"], [c3] * T, c1, T)
    e_part = max(e_part, abs(r["optimal_cost"] - bf) / max(abs(bf), 1e-12))
ck_true(f"动态需求 {N7a} 例：DP 最优值与全划分穷举一致", e_part < 1e-9,
        f"max_rel={e_part:.2e}")

# ---- 7-a2 零需求专项（就是这个情形暴露了 DP 的一个真缺陷）----
_r0 = dynamic_lot_sizing(demands=[0, 0, 0], c1=1, c3=50, verbose=False)
ck("动态需求：全部需求为 0 时总费用为 0", _r0["optimal_cost"], 0.0, 1e-12)
ck_true("动态需求：全部需求为 0 时不产生任何订货",
        _r0["dp"]["plan"]["orders"] == [], f"orders={_r0['dp']['plan']['orders']}")
# demands=[0,5,0,5], c1=1, c3=50：最优是在第 2 期一次订 10 件覆盖 2..4 期，
# 费用 = c3 + c1·(5 + 5) = 50 + 10 = 60（而非每处订货各 50 共 100）
ck("动态需求：首/中间期净需求为 0 时不产生多余订货费（解析值 60）",
   dynamic_lot_sizing(demands=[0, 5, 0, 5], c1=1, c3=50,
                      verbose=False)["optimal_cost"], 60.0, 1e-12)
ck_true("动态需求：上例最优订货期应为 [2]",
        dynamic_lot_sizing(demands=[0, 5, 0, 5], c1=1, c3=50,
                           verbose=False)["dp"]["plan"]["orders"] == [2],
        "见 Z[2][4] = 50 + 1·(1×0 + 2×5) = 60")

# ---- 7-b 库存状态 DP（另一种建模，不依赖零库存性质）----
N7b = 80
e_ist = 0.0
for _ in range(N7b):
    ds, c1, c3 = rand_dyn(2, 6, 15)
    T = len(ds)
    r = dynamic_lot_sizing(demands=ds, c1=c1, c3=c3, verbose=False)
    v = dp_inventory_state(r["net_demands"], [c3] * T, c1, T)
    e_ist = max(e_ist, abs(r["optimal_cost"] - v) / max(abs(v), 1e-12))
ck_true(f"动态需求 {N7b} 例：DP 最优值与「库存状态 DP」（允许非区段方案）一致",
        e_ist < 1e-9, f"max_rel={e_ist:.2e}")
print(f"  全划分穷举偏差 {e_part:.2e}｜库存状态 DP 偏差 {e_ist:.2e}")

# ---- 7-c 两种启发式都不可能优于最优（并统计其劣化分布）----
N7c = 400
bad_h = 0
gaps = {"silver_meal": [], "ppb": []}
for _ in range(N7c):
    ds, c1, c3 = rand_dyn(2, 14, 60)
    r = dynamic_lot_sizing(demands=ds, c1=c1, c3=c3, verbose=False)
    opt = r["optimal_cost"]
    for key in ("silver_meal", "ppb"):
        g = r[key]["cost"] - opt
        if g < -1e-9:
            bad_h += 1                      # 启发式优于最优 -> DP 一定错了
        gaps[key].append((g / opt) if opt > 0 else 0.0)
ck_true(f"动态需求 {N7c} 例：两种启发式的费用都不低于最优解", bad_h == 0,
        f"bad={bad_h}")
for key, nm in (("silver_meal", "Silver-Meal"), ("ppb", "部分期间平衡 PPB")):
    gl = sorted(gaps[key])
    n_opt = sum(1 for x in gl if x < 1e-12)
    mean_g = sum(gl) / len(gl)
    print(f"  {nm}：取到最优 {n_opt}/{N7c}（{n_opt / N7c * 100:.1f}%）｜"
          f"平均劣化 {mean_g * 100:.2f}%｜中位 {gl[len(gl) // 2] * 100:.2f}%｜"
          f"最差 {gl[-1] * 100:.2f}%")

# ---- 7-c2 已知失效模式必须复现（用于固定启发式实现的正确性）----
# Silver-Meal 的经典弱点：末期需求很大时，(c3+累计存贮费)/覆盖期数 这个"平均"
# 判据被末期大需求抬高，于是 SM 提前一期收手、白白多付一次订货费。
_w = dynamic_lot_sizing(demands=[30, 32, 13, 17, 2, 60], c1=0.4009, c3=513.61,
                        verbose=False)
ck_true("动态需求：SM 失效模式复现（末期需求大 -> 少覆盖一期、多一次订货费）",
        _w["dp"]["blocks"] == [(1, 6)]
        and _w["silver_meal"]["blocks"] == [(1, 5), (6, 6)]
        and _w["silver_meal"]["cost"] > _w["optimal_cost"] + 1e-9,
        f"dp={_w['dp']['blocks']} sm={_w['silver_meal']['blocks']}")
ck("动态需求：该例 DP 一次订足的费用（解析式）",
   _w["optimal_cost"],
   513.61 + 0.4009 * (1 * 32 + 2 * 13 + 3 * 17 + 4 * 2 + 5 * 60), 1e-9)

# ---- 7-d 解析特例必须逐一精确成立 ----
for (d, c1x, c3x) in [(50, 1, 50), (7, 3, 20), (100, 0.5, 200)]:
    got = dynamic_lot_sizing(demands=[d, d], c1=c1x, c3=c3x,
                             verbose=False)["optimal_cost"]
    ck(f"T=2 等需求解析解 min(c3+c1·d, 2c3)［d={d},c1={c1x},c3={c3x}］",
       got, min(c3x + c1x * d, 2 * c3x), 1e-12)
_free = dynamic_lot_sizing(demands=[30, 50, 20, 40], c1=1e-9, c3=100, verbose=False)
ck("存贮费→0 时：一次订足全部，费用 = c3", _free["optimal_cost"], 100.0, 1e-6)
ck_true("存贮费→0 时：只在第 1 期订货", _free["dp"]["plan"]["orders"] == [1],
        f"orders={_free['dp']['plan']['orders']}")
_pricey = dynamic_lot_sizing(demands=[30, 50, 20, 40], c1=1e9, c3=100, verbose=False)
ck("存贮费极大时：每期都订，费用 = T·c3", _pricey["optimal_cost"], 400.0, 1e-9)
ck_true("存贮费极大时：订货期为 [1,2,3,4]",
        _pricey["dp"]["plan"]["orders"] == [1, 2, 3, 4],
        f"orders={_pricey['dp']['plan']['orders']}")

# ---- 7-e 结构性质：数量守恒、期末库存为 0、零库存性质 ----
ok_cons = ok_end = ok_zio = True
for _ in range(200):
    ds, c1, c3 = rand_dyn(2, 12, 50)
    r = dynamic_lot_sizing(demands=ds, c1=c1, c3=c3, verbose=False)
    pl = r["dp"]["plan"]
    if abs(sum(pl["Q"]) - sum(r["net_demands"])) > 1e-9:
        ok_cons = False
    if abs(pl["I"][r["T"]]) > 1e-9:
        ok_end = False
    for (j, _t) in r["dp"]["blocks"]:
        if j > 1 and pl["I"][j - 1] > 1e-9:
            ok_zio = False
ck_true("动态需求：总订货量 = 总净需求（数量守恒）", ok_cons)
ck_true("动态需求：计划期末库存为 0（期末不留存）", ok_end)
ck_true("动态需求：零库存订货性质在 DP 解中成立", ok_zio)

# ---- 7-f 期初库存净需求等价性 ----
ok_net = True
for _ in range(120):
    ds, c1, c3 = rand_dyn(2, 10, 40)
    i0 = float(_rng.randint(0, 80))
    r1 = dynamic_lot_sizing(demands=ds, c1=c1, c3=c3, initial_inventory=i0,
                            verbose=False)
    net, rest = [], i0
    for d in ds:
        use = min(rest, d)
        rest -= use
        net.append(d - use)
    r2 = dynamic_lot_sizing(demands=net, c1=c1, c3=c3, verbose=False)
    if abs(r1["optimal_cost"] - r2["optimal_cost"]) > 1e-9 * max(1.0, r2["optimal_cost"]):
        ok_net = False
    if any(abs(a - b) > 1e-12 for a, b in zip(r1["net_demands"], net)):
        ok_net = False
ck_true("动态需求：期初库存的净需求抵扣与直接用净需求求解等价", ok_net)

# ---- 7-g 手算例复核（例 7）----
_r7 = dynamic_lot_sizing(demands=[20, 40, 10, 50, 30, 20], c1=1, c3=50, verbose=False)
for _i, _exp in enumerate([50.0, 90.0, 110.0, 160.0, 190.0, 230.0], start=1):
    ck(f"动态需求手算例：f({_i})", _r7["dp"]["f"][_i], _exp, 1e-12)
ck("动态需求手算例：最优总费用", _r7["optimal_cost"], 230.0, 1e-12)
ck_true("动态需求手算例：最优订货期 = [1, 4]",
        _r7["dp"]["plan"]["orders"] == [1, 4],
        f"orders={_r7['dp']['plan']['orders']}")
ck("动态需求手算例：订单量 Q1 = 70", _r7["dp"]["plan"]["Q"][1], 70.0, 1e-12)
ck("动态需求手算例：订单量 Q4 = 100", _r7["dp"]["plan"]["Q"][4], 100.0, 1e-12)
ck("动态需求手算例：订货费 = 100", _r7["dp"]["plan"]["cost_setup"], 100.0, 1e-12)
ck("动态需求手算例：存贮费 = 130", _r7["dp"]["plan"]["cost_holding"], 130.0, 1e-12)
ck("动态需求手算例：Silver-Meal 费用", _r7["silver_meal"]["cost"], 240.0, 1e-12)
ck("动态需求手算例：PPB 费用", _r7["ppb"]["cost"], 260.0, 1e-12)
ck_true("动态需求手算例：两种启发式都劣于 DP（教学作用）",
        _r7["silver_meal"]["cost"] > _r7["optimal_cost"]
        and _r7["ppb"]["cost"] > _r7["optimal_cost"])


# ==============================================================================
hdr("8. 跨模型退化一致性检查（抓「公式抄错系数」类错误）")
# ==============================================================================

# 7.1 EPQ 当 p → ∞ 应还原为 EOQ
ok = True
for _ in range(60):
    D = 10 ** _rng.uniform(2.5, 5.5)
    c1 = 10 ** _rng.uniform(-0.5, 1.5)
    c3 = 10 ** _rng.uniform(1, 3.5)
    e = eoq_basic(D=D, c1=c1, c3=c3, verbose=False)
    q = epq_production(D=D, d=1.0, p=1e9, c1=c1, c3=c3, verbose=False)
    if abs(q["Q_star"] - e["Q_star"]) / e["Q_star"] > 1e-6 or \
       abs(q["C_star"] - e["C_star"]) / e["C_star"] > 1e-6:
        ok = False
ck_true("EPQ 在 p→∞ 时还原为 EOQ（Q* 与 C* 均一致）", ok)

# 7.2 允许缺货当 c2 → ∞ 应还原为 EOQ
ok = True
for _ in range(60):
    D = 10 ** _rng.uniform(2.5, 5.5)
    c1 = 10 ** _rng.uniform(-0.5, 1.5)
    c3 = 10 ** _rng.uniform(1, 3.5)
    e = eoq_basic(D=D, c1=c1, c3=c3, verbose=False)
    s = eoq_shortage(D=D, c1=c1, c2=1e12, c3=c3, verbose=False)
    if abs(s["Q_star"] - e["Q_star"]) / e["Q_star"] > 1e-5 or \
       abs(s["C_star"] - e["C_star"]) / e["C_star"] > 1e-5:
        ok = False
ck_true("允许缺货在 c2→∞ 时还原为 EOQ（Q* 与 C* 均一致）", ok)

# 7.3 缺货模型随 c2 的变化方向（★这一条的初版断言写反了，被本套件抓出来）
#     C* = sqrt(2·D·c1·c2·c3/(c1+c2)) 是 c2 的【递增】函数，上限为 EOQ 费用；
#     Q* = sqrt(2·D·c3·(c1+c2)/(c1·c2)) 是 c2 的【递减】函数。
_base = eoq_basic(D=10000, c1=4, c3=200, verbose=False)
prevC, prevQ, mono, leq = -1.0, float("inf"), True, True
for c2 in [1e-3, 1e-2, 1e-1, 1, 2, 5, 10, 100, 1e3, 1e4, 1e6]:
    r = eoq_shortage(D=10000, c1=4, c2=c2, c3=200, verbose=False)
    if r["C_star"] < prevC - 1e-9:
        mono = False
    if r["Q_star"] > prevQ + 1e-9:
        mono = False
    prevC, prevQ = r["C_star"], r["Q_star"]
    if r["C_star"] > _base["C_star"] * (1 + 1e-12):
        leq = False
ck_true("缺货模型：C* 随 c2 单调递增、Q* 随之单调递减", mono)
ck_true("缺货模型：C* 始终不超过 EOQ 费用（允许缺货只会省钱）", leq)
ck("缺货模型：c2→∞ 时 C* 收敛到 EOQ 费用",
   eoq_shortage(D=10000, c1=4, c2=1e14, c3=200, verbose=False)["C_star"],
   _base["C_star"], 1e-12)
ck("缺货模型：c2→∞ 时 Q* 收敛到 EOQ 批量",
   eoq_shortage(D=10000, c1=4, c2=1e14, c3=200, verbose=False)["Q_star"],
   _base["Q_star"], 1e-12)

# 7.4 单档折扣（无折扣）应还原为 EOQ（含采购成本）
ok = True
for _ in range(60):
    D = 10 ** _rng.uniform(2.5, 5.5)
    c1 = 10 ** _rng.uniform(-0.5, 1.5)
    c3 = 10 ** _rng.uniform(1, 3.5)
    K = 10 ** _rng.uniform(0.5, 1.5)
    e = eoq_basic(D=D, c1=c1, c3=c3, K=K, verbose=False)
    d = quantity_discount(D=D, c3=c3, breaks=[(0, K)], c1=c1, verbose=False)
    if abs(d["Q_star"] - e["Q_star"]) / e["Q_star"] > 1e-9 or \
       abs(d["cost_star"] - e["cost_total"]) / e["cost_total"] > 1e-9:
        ok = False
ck_true("单档折扣（无折扣）还原为 EOQ（含采购成本）", ok)

# 7.5 折扣模型 c1 与单价无关时，各档 Qᵢ* 相同
ok = True
for _ in range(60):
    D = 10 ** _rng.uniform(2.5, 5.5)
    c1 = 10 ** _rng.uniform(-0.5, 1.5)
    c3 = 10 ** _rng.uniform(1, 3.5)
    d = quantity_discount(D=D, c3=c3, breaks=[(0, 9.0), (100, 8.0), (300, 7.0)],
                          c1=c1, verbose=False)
    if abs(d["eoq_no_discount"] - math.sqrt(2 * D * c3 / c1)) / d["eoq_no_discount"] > 1e-12:
        ok = False
ck_true("折扣模型：c1 与单价无关时各档 Qᵢ* 相同（= EOQ）", ok)

# 7.6 多产品：约束极松时应退化为各产品独立 EOQ
ok = True
for _ in range(60):
    items = [{"name": "A", "D": 10 ** _rng.uniform(2.5, 5),
              "c1": 10 ** _rng.uniform(0, 1), "c3": 10 ** _rng.uniform(1, 3),
              "K": 10 ** _rng.uniform(0.5, 1.5)},
             {"name": "B", "D": 10 ** _rng.uniform(2.5, 5),
              "c1": 10 ** _rng.uniform(0, 1), "c3": 10 ** _rng.uniform(1, 3),
              "K": 10 ** _rng.uniform(0.5, 1.5)}]
    un = sum(math.sqrt(2 * it["c3"] * it["D"] / it["c1"]) * it["K"] for it in items)
    r = multiproduct_constrained(items, constraint="capital", limit=un * 100,
                                 verbose=False)
    if r["binding"] or abs(r["lambda_star"]) > 1e-15:
        ok = False
    for it, row in zip(items, r["items"]):
        e = eoq_basic(D=it["D"], c1=it["c1"], c3=it["c3"], verbose=False)
        if abs(row["Q"] - e["Q_star"]) / e["Q_star"] > 1e-12:
            ok = False
ck_true("多产品：约束极松时 λ*=0 且各产品取独立 EOQ", ok)

# 7.7 报童：k = h 时临界比 0.5、Q* = μ
_r = newsvendor(k=3, h=3, kind="normal", mu=100, sigma=20, verbose=False)
ck("报童 k=h 时临界比 = 0.5", _r["critical_ratio"], 0.5, 1e-15)
ck("报童 k=h 时 Q* = μ", _r["Q_star"], 100.0, 1e-12)

# 7.8 缺货模型 B*/S* = c1/c2
ok = True
for _ in range(40):
    c1 = 10 ** _rng.uniform(-0.5, 1.5)
    c2 = 10 ** _rng.uniform(-0.5, 1.5)
    r = eoq_shortage(D=10000, c1=c1, c2=c2, c3=200, verbose=False)
    if abs(r["B_star"] / r["S_star"] - c1 / c2) / (c1 / c2) > 1e-12:
        ok = False
ck_true("缺货模型：B*/S* = c1/c2", ok)


# ==============================================================================
hdr("9. 参数校验（异常输入必须被拦下，且报错信息可读）")
# ==============================================================================

bad_cases = [
    ("EOQ 负需求", lambda: eoq_basic(D=-100, c1=4, c3=200)),
    ("EOQ 零存贮费", lambda: eoq_basic(D=10000, c1=0, c3=200)),
    ("EOQ 负订货费", lambda: eoq_basic(D=10000, c1=4, c3=-200)),
    ("EOQ 缺参数", lambda: eoq_basic(D=None, c1=4, c3=200)),
    ("EOQ 非数值", lambda: eoq_basic(D="一万", c1=4, c3=200)),
    ("EOQ 无限大", lambda: eoq_basic(D=float("inf"), c1=4, c3=200)),
    ("EPQ p = d", lambda: epq_production(D=10000, d=40, p=40, c1=4, c3=200)),
    ("EPQ p < d", lambda: epq_production(D=10000, d=40, p=10, c1=4, c3=200)),
    ("EPQ 单位口径不一致（D≠d×n）", lambda: epq_production(
        D=10000, d=40, p=100, c1=4, c3=200, periods_per_year=365, verbose=False)),
    ("EPQ D/d < 1（口径必然串了）", lambda: epq_production(
        D=10, d=40, p=100, c1=4, c3=200, verbose=False)),
    ("缺货 c2 = 0", lambda: eoq_shortage(D=10000, c1=4, c2=0, c3=200)),
    ("报童 k = 0", lambda: newsvendor(k=0, h=2, kind="discrete",
                                      values=[1], probs=[1.0])),
    ("报童 概率和≠1", lambda: newsvendor(k=5, h=2, kind="discrete",
                                          values=[1, 2], probs=[0.3, 0.3])),
    ("报童 概率含 0", lambda: newsvendor(k=5, h=2, kind="discrete",
                                          values=[1, 2], probs=[0.0, 1.0])),
    ("报童 取值重复", lambda: newsvendor(k=5, h=2, kind="discrete",
                                          values=[1, 1], probs=[0.5, 0.5])),
    ("报童 取值与概率长度不等", lambda: newsvendor(k=5, h=2, kind="discrete",
                                                     values=[1, 2, 3], probs=[0.5, 0.5])),
    ("报童 kind 非法", lambda: newsvendor(k=5, h=2, kind="uniform",
                                          values=[1], probs=[1.0])),
    ("报童 正态 σ=0", lambda: newsvendor(k=5, h=2, kind="normal", mu=100, sigma=0)),
    ("报童 正态 μ 负", lambda: newsvendor(k=5, h=2, kind="normal", mu=-1, sigma=1)),
    ("折扣 首档下限≠0", lambda: quantity_discount(
        D=5000, c3=100, breaks=[(100, 10.0)], holding_rate=0.2)),
    ("折扣 分界点非递增", lambda: quantity_discount(
        D=5000, c3=100, breaks=[(0, 10.0), (500, 9.5), (400, 9.0)], holding_rate=0.2)),
    ("折扣 单价递增（非折扣）", lambda: quantity_discount(
        D=5000, c3=100, breaks=[(0, 10.0), (500, 12.0)], holding_rate=0.2)),
    ("折扣 c1 与 holding_rate 同时给", lambda: quantity_discount(
        D=5000, c3=100, breaks=[(0, 10.0)], c1=2, holding_rate=0.2)),
    ("折扣 c1 与 holding_rate 都没给", lambda: quantity_discount(
        D=5000, c3=100, breaks=[(0, 10.0)])),
    ("折扣 breaks 为空", lambda: quantity_discount(
        D=5000, c3=100, breaks=[], holding_rate=0.2)),
    ("折扣 breaks 元素长度错", lambda: quantity_discount(
        D=5000, c3=100, breaks=[(0, 10.0, 1)], holding_rate=0.2)),
    ("多产品 约束不可行", lambda: multiproduct_constrained(
        items=[{"name": "A", "D": 10000, "c1": 4, "c3": 200, "K": 10},
               {"name": "B", "D": 5000, "c1": 3, "c3": 150, "K": 15}],
        constraint="capital", limit=5000, min_order=[500, 400])),
    ("多产品 上限为 0", lambda: multiproduct_constrained(
        items=[{"name": "A", "D": 10000, "c1": 4, "c3": 200, "K": 10}],
        constraint="capital", limit=0)),
    ("多产品 约束类型非法", lambda: multiproduct_constrained(
        items=[{"name": "A", "D": 10000, "c1": 4, "c3": 200, "K": 10}],
        constraint="time", limit=100)),
    ("多产品 库容约束缺 v", lambda: multiproduct_constrained(
        items=[{"name": "A", "D": 10000, "c1": 4, "c3": 200, "K": 10}],
        constraint="volume", limit=100)),
    ("多产品 items 为空", lambda: multiproduct_constrained(
        items=[], constraint="capital", limit=100)),
    ("多产品 min_order 长度不符", lambda: multiproduct_constrained(
        items=[{"name": "A", "D": 10000, "c1": 4, "c3": 200, "K": 10}],
        constraint="capital", limit=10000, min_order=[1, 2])),
    ("动态需求 需求序列为空", lambda: dynamic_lot_sizing(
        demands=[], c1=1, c3=50)),
    ("动态需求 只有 1 期", lambda: dynamic_lot_sizing(
        demands=[10], c1=1, c3=50)),
    ("动态需求 含负需求", lambda: dynamic_lot_sizing(
        demands=[10, -5, 20], c1=1, c3=50)),
    ("动态需求 c3 序列长度不符", lambda: dynamic_lot_sizing(
        demands=[10, 20, 30], c1=1, c3=[50, 50])),
    ("动态需求 method 非法", lambda: dynamic_lot_sizing(
        demands=[10, 20], c1=1, c3=50, method="eoq")),
    ("动态需求 期数超限", lambda: dynamic_lot_sizing(
        demands=[1] * 600, c1=1, c3=50)),
    ("动态需求 零存贮费", lambda: dynamic_lot_sizing(
        demands=[10, 20], c1=0, c3=50)),
    ("动态需求 负期初库存", lambda: dynamic_lot_sizing(
        demands=[10, 20], c1=1, c3=50, initial_inventory=-5)),
]
caught = 0
for desc, fn in bad_cases:
    try:
        fn()
        FAILS.append(f"参数校验未拦截：{desc}")
    except InventoryError as e:
        caught += 1
        if not str(e).strip():
            FAILS.append(f"参数校验报错信息为空：{desc}")
    except Exception as e:
        FAILS.append(f"抛出非 InventoryError 异常：{desc} -> {type(e).__name__}: {e}")
CHECKS[0] += len(bad_cases)
ck_true(f"全部 {len(bad_cases)} 个异常输入都被拦截且信息非空", caught == len(bad_cases),
        f"caught={caught}")
print(f"  已拦截 {caught}/{len(bad_cases)} 个异常输入")


# ==============================================================================
hdr("结果汇总")
# ==============================================================================

_el = time.time() - T0
print(f"\n  总检查项：{CHECKS[0]}")
print(f"  失败项  ：{len(FAILS)}")
print(f"  耗时    ：{_el:.1f} 秒")
if FAILS:
    print("\n  ✗ 失败明细：")
    for f in FAILS[:60]:
        print("    - " + f)
    sys.exit(1)
else:
    print("\n  ✓ 全部通过：7 个模型的闭式解与独立数值方法/穷举/带约束优化一致。")
    sys.exit(0)
