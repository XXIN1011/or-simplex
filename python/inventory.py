# -*- coding: utf-8 -*-
"""
================================================================================
 运筹学 · 库存论计算工具（教材第 9 章）
================================================================================

 覆盖 6 类核心库存模型，每个模型独立封装为一个函数：

     模型 1  基本经济订货批量模型（EOQ）        -> eoq_basic()
     模型 2  经济生产批量模型（EPQ，陆续到货）   -> epq_production()
     模型 3  允许缺货的经济订货批量模型          -> eoq_shortage()
     模型 4  单周期随机存贮模型（报童模型）      -> newsvendor()
     模型 5  批量折扣模型（多价格区间 EOQ）      -> quantity_discount()
     模型 6  约束条件下的多产品库存模型          -> multiproduct_constrained()
     模型 7  动态需求模型（时变需求/动态批量）   -> dynamic_lot_sizing()

 ---------------------------------------------------------------------------
 ★与教材章节的对应（徐玖平、胡知能《运筹学（第四版）》，科学出版社 2018，
   ISBN 978-7-03-058397-0。章节号与页码取自科学出版社官方样章 PDF 的印刷版目录，
   已逐条核对）
 ---------------------------------------------------------------------------
   第 9 章  库存论（p.285）—— 注意教材用的是「库存论」，不是「存贮论」
     9.1   问题描述               p.285   （基本概念：需求、补充、费用）
     9.2   基本模型               p.287   -> 模型 1（EOQ）
     9.3   缺货模型               p.290   -> 模型 3（允许缺货）
     9.4   供货有限模型           p.294   -> 模型 2（陆续到货；"供货有限"即
                                              到货速率 p 有限，不是瞬时到货）
     9.5*  批量折扣模型           p.298   -> 模型 5（带 * 为选讲）
     9.6*  约束条件模型           p.300   -> 模型 6（带 * 为选讲）
     9.7*  动态需求模型           p.301   -> 模型 7
                                              9.7.1 动态规划法 p.303 -> method='dp'
                                                （Wagner-Whitin 精确最优递推）
                                              9.7.2 启发式算法 p.305 -> method=
                                                'silver_meal' / 'ppb'
     思考题                       p.307

   ⚠ 两点必须说清楚（避免把别处的模型当成教材第 9 章的）：
   (1) 教材第 9 章 9.1~9.7 全部是【确定性】模型，**没有单周期随机模型（报童）**。
       模型 4 是按通行教材（如清华版《运筹学》随机型存贮模型）的写法实现的，
       符号沿用你给的 r、P(r)、F(r)、k、h 与临界公式 F(Q*) = k/(k+h)。
       若你的课程把报童放在第 7 章「决策分析」的风险决策里，请按那边的口径核对。
   (2) 9.7「动态需求模型」已实现（模型 7）。需求改成逐期给定的时变序列后，
       EOQ 那类单点闭式公式不再适用，「何时订、每次订多少」必须逐期决策；
       本工具给出三种通用解法并相互对照：Wagner-Whitin 动态规划（精确最优）、
       Silver-Meal 最小平均费用法、部分期间平衡法（后两者是启发式）。
       注意：教材 9.7 正文未能获取，教材具体采用哪种启发式、停则如何写【未核实】，
       三者的停则都写在函数注释里，便于与教材逐条对照。

 ---------------------------------------------------------------------------
 设计约定
 ---------------------------------------------------------------------------
 1. 符号即参数名：D 年需求量、d 单位时间需求率、p 单位时间生产率、Q 订货批量、
    T 订货周期、c1 单位存贮费、c2 单位缺货费、c3 每次订货费、K 采购单价、
    W 资金上限、V 库容上限。函数参数名与符号一一对应，不需要做变量名映射。

    ⚠ 这套符号取自本工具的输入规格（通行教材约定），**尚未与教材正文核对**。
      已核实的证据是：该书全局「常用符号」表（印刷页 xiii–xiv）只收通用数学符号
      （向量、集合、‖·‖、∃/∀、E[x]、Var(x) 等），**不含任何费用/需求/库存类符号**，
      说明 c1/c2/c3、Q、T、D、d、p、K、W、V 只定义在第 9 章正文内；而第 9 章正文
      （印刷页 285–307）受 DRM 保护、未能获取。因此"教材用哪套符号"属于【未核实】。
      用之前请对照你手上教材第 9 章的符号说明：若教材把 c2 用作订货费、
      或对 Q/T/K/W/V 另有定义，请按教材口径调整参数含义（函数签名不必改，
      只需换用正确的实参）。
 2. 每个函数：接收结构化参数 -> 返回 dict 结果 -> 可选打印格式化计算报告。
    所有函数都有 verbose 开关（默认 True，直接运行即出报告）。
 3. 时间单位约定：默认以【年】为基础时间单位。若你的数据是"日/月"，
    只要保证 D 与 c1 的时间口径一致即可；模型 2、3 会在报告里回显
    "按 d、p 的时间单位折算"，方便你核对单位有没有串。
 4. 零第三方依赖：只用标准库 math，方便拷到任何环境（含手机、在线判题）运行。
 5. 每个模型都配一道经典算例，见文件末尾 run_examples()。

 作者备注：数值结果全部经独立方法交叉验证（见 verify_inventory.py），
          不是"公式代进去就完事"——每个闭式解都与数值优化/穷举对拍过。
================================================================================
"""

from __future__ import annotations

import math

__all__ = [
    "InventoryError",
    "eoq_basic",
    "epq_production",
    "eoq_shortage",
    "newsvendor",
    "quantity_discount",
    "multiproduct_constrained",
    "dynamic_lot_sizing",
    "run_examples",
]


# ==============================================================================
# 第 0 节  公共基础设施：异常、参数校验、正态分布函数、打印工具
# ==============================================================================

class InventoryError(ValueError):
    """存贮论模型的输入参数不合法时抛出（含负需求、负费用、约束不可行等）。"""


def _chk(cond: bool, msg: str) -> None:
    """断言式校验：不满足条件就抛出带友好中文提示的异常。"""
    if not cond:
        raise InventoryError(msg)


def _pos(name: str, value, symbol: str = "", unit: str = "") -> float:
    """
    校验"必须为正数"的参数（需求、费用、单价等）。

    参数
    ----
    name   : 中文名（用于报错信息），如 "年需求量"
    value  : 待校验的值
    symbol : 教材符号，如 "D"
    unit   : 单位，如 "件/年"

    返回
    ----
    float(value)
    """
    tag = f"{name}({symbol})" if symbol else name
    _chk(value is not None, f"缺少参数：{tag}，必须给出{unit}的数值。")
    try:
        v = float(value)
    except (TypeError, ValueError):
        raise InventoryError(f"参数 {tag} 必须是数值，当前收到 {value!r}。")
    _chk(math.isfinite(v), f"参数 {tag} 必须是有限数值，当前为 {value!r}。")
    _chk(v > 0, f"参数 {tag} 必须为正数（{unit}），当前为 {v:g}。"
                f"{'需求量为 0 意味着无需订货，请直接判断为不订。' if name.find('需求') >= 0 else ''}")
    return v


def _nonneg(name: str, value, symbol: str = "", unit: str = "") -> float:
    """校验"必须为非负数"的参数（如期末库存、最小订货量）。"""
    tag = f"{name}({symbol})" if symbol else name
    _chk(value is not None, f"缺少参数：{tag}。")
    try:
        v = float(value)
    except (TypeError, ValueError):
        raise InventoryError(f"参数 {tag} 必须是数值，当前收到 {value!r}。")
    _chk(math.isfinite(v), f"参数 {tag} 必须是有限数值。")
    _chk(v >= 0, f"参数 {tag} 必须 ≥ 0（{unit}），当前为 {v:g}。")
    return v


# ---- 标准正态分布：CDF / PDF / 分位函数（反函数）------------------------------
# 存贮论里的单周期随机模型（模型 4）需求正态分布时要用到 Φ 与 Φ⁻¹。
# 这里自己实现，不依赖 scipy，保证零依赖；精度见 verify_inventory.py 的对拍。

_SQRT2 = math.sqrt(2.0)
_SQRT2PI = math.sqrt(2.0 * math.pi)


def norm_cdf(x: float) -> float:
    """标准正态分布累积函数 Φ(x) = P(Z ≤ x)，用 math.erf 精确计算。"""
    return 0.5 * (1.0 + math.erf(x / _SQRT2))


def norm_pdf(x: float) -> float:
    """标准正态分布密度函数 φ(x)。"""
    return math.exp(-0.5 * x * x) / _SQRT2PI


# Acklam 有理逼近系数（误差 < 1.15e-9），再用一步 Halley 迭代压到机器精度
_PPF_A = (-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
          1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00)
_PPF_B = (-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
          6.680131188771972e+01, -1.328068155288572e+01)
_PPF_C = (-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
          -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00)
_PPF_D = (7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
          3.754408661907416e+00)
_PPF_PLOW = 0.02425


def norm_ppf(p: float) -> float:
    """
    标准正态分布分位函数 Φ⁻¹(p)，0 < p < 1。

    用于模型 4（正态需求）求最优订货量：Q* = μ + σ·Φ⁻¹(k/(k+h))。
    """
    _chk(0.0 < p < 1.0, f"正态分布分位函数要求 0 < p < 1，当前收到 p = {p!r}。"
                        f"（本题中 p = k/(k+h)，请检查赢利 k 与损失 h 是否都为正。）")
    # --- 初值：Acklam 逼近 ---
    if p < _PPF_PLOW:
        q = math.sqrt(-2.0 * math.log(p))
        x = (((((_PPF_C[0] * q + _PPF_C[1]) * q + _PPF_C[2]) * q + _PPF_C[3]) * q
              + _PPF_C[4]) * q + _PPF_C[5]) / ((((_PPF_D[0] * q + _PPF_D[1]) * q
              + _PPF_D[2]) * q + _PPF_D[3]) * q + 1.0)
    elif p > 1.0 - _PPF_PLOW:
        q = math.sqrt(-2.0 * math.log(1.0 - p))
        x = -(((((_PPF_C[0] * q + _PPF_C[1]) * q + _PPF_C[2]) * q + _PPF_C[3]) * q
               + _PPF_C[4]) * q + _PPF_C[5]) / ((((_PPF_D[0] * q + _PPF_D[1]) * q
               + _PPF_D[2]) * q + _PPF_D[3]) * q + 1.0)
    else:
        q = p - 0.5
        r = q * q
        x = (((((_PPF_A[0] * r + _PPF_A[1]) * r + _PPF_A[2]) * r + _PPF_A[3]) * r
              + _PPF_A[4]) * r + _PPF_A[5]) * q / (((((_PPF_B[0] * r + _PPF_B[1]) * r
              + _PPF_B[2]) * r + _PPF_B[3]) * r + _PPF_B[4]) * r + 1.0)
    # --- 一步 Halley 迭代：把误差压到 ~1e-15 ---
    e = norm_cdf(x) - p
    u = e * _SQRT2PI * math.exp(0.5 * x * x)
    return x - u / (1.0 + 0.5 * x * u)


# ---- 打印工具 ----------------------------------------------------------------

_W = 74  # 报告宽度


def _title(text: str) -> None:
    print("\n" + "═" * _W)
    print("  " + text)
    print("═" * _W)


def _sec(text: str) -> None:
    print("\n" + "─" * _W)
    print("  " + text)
    print("─" * _W)


def _kv(label: str, value, unit: str = "", note: str = "") -> None:
    """打印一行「指标 = 值 单位（备注）」。"""
    tail = f"   {note}" if note else ""
    s = f"{value}" if isinstance(value, str) else f"{value}"
    print(f"  {label:<26}= {s:>14}  {unit}{tail}")


def _num(x: float, nd: int = 4) -> str:
    """数值格式化：保留 nd 位小数并去掉多余的 0，大数用千分位。"""
    if x is None:
        return "—"
    if isinstance(x, str):
        return x
    if not math.isfinite(x):
        return "∞" if x > 0 else "-∞"
    if abs(x) >= 1e6 or (x != 0 and abs(x) < 1e-4):
        return f"{x:.{nd}e}"
    s = f"{x:.{nd}f}".rstrip("0").rstrip(".")
    if abs(x) >= 1000:
        head, _, tail = s.partition(".")
        sign = "-" if head.startswith("-") else ""
        head = head.lstrip("-")
        s = sign + f"{int(head):,}" + (("." + tail) if tail else "")
    return s or "0"


def _pct(x: float, nd: int = 2) -> str:
    return f"{x * 100:.{nd}f}%"


# ==============================================================================
# 模型 1  基本经济订货批量模型（EOQ）
# ==============================================================================

def eoq_basic(D, c1, c3, K=None, verbose: bool = True) -> dict:
    """
    【模型 1】基本经济订货批量模型（Economic Order Quantity, EOQ）
    教材对应：徐玖平《运筹学（第四版）》9.2 基本模型（p.287）

    ---------------- 模型假设 ----------------
    (1) 需求连续均匀，需求率为常数 D（不允许缺货：存贮降到 0 时立即补足）；
    (2) 瞬时到货：订货提前期为零，一次订货全部同时入库；
    (3) 单位存贮费 c1 与每次订货费 c3 固定，采购单价 K 固定（不随批量变化）；
    (4) 计划期无限长，按单位时间（年）总费用最小为决策目标。

    ---------------- 参数 ----------------
    D  : float  年总需求量（件/年）
    c1 : float  单位物品单位时间存贮费（元/件·年）
    c3 : float  每次订货的固定订货费（元/次）
    K  : float  采购单价（元/件），可选。只计入采购成本，不影响 Q* 与 T*。

    ---------------- 核心公式 ----------------
    单位时间总费用： C(Q) = (D/Q)·c3 + (Q/2)·c1
        —— 前项为订货费（一年订 D/Q 次，每次 c3），后项为存贮费
           （周期内库存线性从 Q 降到 0，平均存贮量 Q/2）。

    令 dC/dQ = -D·c3/Q² + c1/2 = 0，得
        最优订货批量 Q* = sqrt(2·D·c3 / c1)
        最优订货周期 T* = Q* / D
        单位时间最小总费用 C* = sqrt(2·D·c1·c3)
        （最优处两项费用相等：订货费 = 存贮费 = C*/2，这是 EOQ 的经典性质）

    ---------------- 返回 ----------------
    dict，含 Q_star、T_star、C_star、order_times_per_year、max_inventory、
    avg_inventory、cost_ordering、cost_holding、cost_purchase、cost_total 等。
    """
    # ---- 1. 参数校验 ----
    D = _pos("年总需求量", D, "D", "件/年")
    c1 = _pos("单位存贮费", c1, "c1", "元/件·年")
    c3 = _pos("每次订货费", c3, "c3", "元/次")
    K = None if K is None else _nonneg("采购单价", K, "K", "元/件")

    # ---- 2. 核心计算 ----
    Q_star = math.sqrt(2.0 * D * c3 / c1)
    T_star = Q_star / D
    C_star = math.sqrt(2.0 * D * c1 * c3)
    n_star = D / Q_star                    # = 1/T*，年订货次数
    max_inv = Q_star                       # 瞬时到货，刚入库时库存最高
    avg_inv = Q_star / 2.0                 # 三角形库存的平均高度
    cost_ord = D / Q_star * c3             # 年订货费
    cost_hol = Q_star / 2.0 * c1           # 年存贮费
    cost_pur = D * K if K is not None else None

    # ---- 3. 结果 ----
    res = {
        "model": "模型1 基本经济订货批量模型（EOQ）",
        "params": {"D": D, "c1": c1, "c3": c3, "K": K},
        "Q_star": Q_star,
        "T_star": T_star,
        "C_star": C_star,
        "order_times_per_year": n_star,
        "max_inventory": max_inv,
        "avg_inventory": avg_inv,
        "cost_ordering": cost_ord,
        "cost_holding": cost_hol,
        "cost_stock_ordering_total": C_star,
        "cost_purchase": cost_pur,
        "cost_total": C_star + cost_pur if cost_pur is not None else None,
        "cycle_days_365": T_star * 365.0,
    }

    # ---- 4. 打印报告 ----
    if verbose:
        _title("模型 1  基本经济订货批量模型（EOQ）")
        print("  假设：需求连续均匀 · 瞬时到货 · 不允许缺货 · 单价与订货费固定")
        _sec("已知参数")
        _kv("年总需求量 D", _num(D), "件/年")
        _kv("单位存贮费 c1", _num(c1), "元/件·年")
        _kv("每次订货费 c3", _num(c3), "元/次")
        if K is not None:
            _kv("采购单价 K", _num(K), "元/件")
        _sec("目标函数与求导")
        print(f"  C(Q) = (D/Q)·c3 + (Q/2)·c1")
        print(f"  dC/dQ = -D·c3/Q² + c1/2 = 0   =>   Q² = 2·D·c3/c1")
        _sec("计算结果")
        _kv("最优订货批量 Q*", _num(Q_star), "件")
        _kv("最优订货周期 T*", _num(T_star), "年", f"≈ {_num(T_star * 365)} 天")
        _kv("年订货次数 n* = D/Q*", _num(n_star), "次/年")
        _kv("单位时间最小总费用 C*", _num(C_star), "元/年")
        _kv("最高存贮量（瞬时到货）", _num(max_inv), "件")
        _kv("平均存贮量", _num(avg_inv), "件")
        _sec("费用构成（用于核对：最优处订货费 = 存贮费）")
        _kv("年订货费 (D/Q*)·c3", _num(cost_ord), "元/年")
        _kv("年存贮费 (Q*/2)·c1", _num(cost_hol), "元/年")
        if cost_pur is not None:
            _kv("年采购成本 D·K", _num(cost_pur), "元/年", "（与 Q 无关，不影响 Q*）")
            _kv("年总费用（含采购）", _num(res["cost_total"]), "元/年")
        print("\n  ▸ 解读：Q* 恰使「订货费」与「存贮费」相等，各占 C* 的一半。")
        print("            Q 偏小则订货过于频繁（订货费↑），Q 偏大则库存积压（存贮费↑）。")

    return res


# ==============================================================================
# 模型 2  经济生产批量模型（EPQ，陆续到货）
# ==============================================================================

def epq_production(D, d, p, c1, c3, K=None, periods_per_year=None,
                   verbose: bool = True) -> dict:
    """
    【模型 2】经济生产批量模型（EPQ，陆续到货 / 边产边耗）
    教材对应：徐玖平《运筹学（第四版）》9.4 供货有限模型（p.294）
              —— 教材叫「供货有限」，意思是到货速率 p 有限（非瞬时到货），
                 与「瞬时到货」的 9.2 相对；即通常所说的陆续到货/经济生产批量。

    ---------------- 模型假设 ----------------
    (1) 需求连续均匀，需求率 d；
    (2) 陆续匀速到货：补充不是瞬时完成，而是以生产率 p 连续入库，且 p > d
        （否则永远补不上，库存发散）；
    (3) 不允许缺货；
    (4) 单位存贮费 c1、每次订货（生产准备）费 c3 固定。

    ---------------- 参数 ----------------
    D  : float  年总需求量（件/年）—— 与 d 必须时间口径一致
    d  : float  单位时间需求率（件/单位时间）
    p  : float  单位时间生产率/到货率（件/单位时间），必须 p > d
    c1 : float  单位物品单位时间存贮费（元/件·年）
    c3 : float  每次订货（生产准备）费（元/次）
    K  : float  单位生产成本（元/件），可选
    periods_per_year : float  可选。D 与 d 的时间单位换算系数，即「一年包含多少个
                       与 d 同口径的时间单位」（d 按天计时取 250 或 365，按月取 12）。
                       给出后本函数会强制校验 D = d × periods_per_year。

    ---------------- ★单位一致性（本模型最容易算错的地方） ----------------
    本模型的 D、d、p 必须同一时间口径，自洽条件是 D = d × n（n 为每年时间单位数）。
    这是纯粹的"口径"要求，不是数学推导出来的：若把年需求 D 与日需求率 d 混用，
    Q* 会差 sqrt(n) 倍。因此：
      · 不给 periods_per_year 时，函数会打印推算值 n = D/d 供你核对；
      · n < 1 直接报错（单位时间需求率不可能超过全年需求量，口径必然串了）；
      · 给出 periods_per_year 时做严格校验，不等于 D/d 就报错。

    ---------------- 核心公式 ----------------
    生产期 t_p = Q/p，此间库存以 (p-d) 的速度上升，期末达到最高存贮量
        S = (p - d)·t_p = (1 - d/p)·Q
    纯消耗期库存以 d 速度下降，消耗期长 S/d。周期 T = Q/d。
    平均存贮量 = S/2 = (1 - d/p)·Q/2，故
        C(Q) = (D/Q)·c3 + (1 - d/p)·Q·c1/2

    令 dC/dQ = 0 得
        最优生产批量 Q* = sqrt( 2·D·c3 / ((1 - d/p)·c1) )
        最高存贮量   S* = (1 - d/p)·Q*
        最优生产周期 T* = Q*/d          （= 一次生产循环的时长）
        生产期时长   t_p = Q*/p
        单位时间最小总费用 C* = sqrt(2·D·c1·c3·(1 - d/p))

    ---------------- 返回值 ----------------
    dict，含 Q_star、S_star、T_star、t_produce、t_consume、C_star、
    rho = d/p、avg_inventory、max_inventory 等。
    """
    # ---- 1. 参数校验 ----
    D = _pos("年总需求量", D, "D", "件/年")
    d = _pos("单位时间需求率", d, "d", "件/单位时间")
    p = _pos("单位时间生产率", p, "p", "件/单位时间")
    c1 = _pos("单位存贮费", c1, "c1", "元/件·年")
    c3 = _pos("每次订货费", c3, "c3", "元/次")
    K = None if K is None else _nonneg("单位生产成本", K, "K", "元/件")
    _chk(p > d,
         f"生产率 p 必须大于需求率 d，否则库存永远补不上（当前 p = {p:g}，d = {d:g}）。"
         f"若 p ≤ d，说明该产品连自身消耗都供不上，应改报外部采购模型（模型 1）。")

    # ---- 单位一致性校验：D 与 d 必须满足 D = d × n ----
    ppy = D / d                                  # 推算出的"每年时间单位数"
    if periods_per_year is not None:
        ppy_given = _pos("每年时间单位数", periods_per_year, "n", "个/年")
        expect = d * ppy_given
        _chk(abs(D - expect) <= 1e-6 * max(D, expect),
             f"时间单位不一致：D = {D:g} 件/年、d = {d:g} 件/单位时间、"
             f"每年 {ppy_given:g} 个时间单位，三者应满足 D = d × n = {expect:g}，"
             f"当前 D 与它相差 {abs(D - expect) / expect * 100:.3f}%。"
             f"请统一口径：要么把 d 换算成与 D 同口径，要么修正 periods_per_year。")
        ppy = ppy_given
    _chk(ppy >= 1.0 - 1e-12,
         f"时间单位不一致：由 D/d 推算出每年只有 {ppy:g} 个时间单位（< 1），"
         f"意味着「单位时间需求率」大于「全年需求量」，这不可能成立。"
         f"最常见的原因是 D（年需求）与 d（日需求率）的时间口径串了："
         f"此时 D/d 应等于年工作日数（约 250）或自然日数（365）。")

    # ---- 2. 核心计算 ----
    rho = d / p
    one_minus_rho = 1.0 - rho
    Q_star = math.sqrt(2.0 * D * c3 / (one_minus_rho * c1))
    S_star = one_minus_rho * Q_star
    T_star = Q_star / d
    t_prod = Q_star / p
    t_cons = T_star - t_prod
    C_star = math.sqrt(2.0 * D * c1 * c3 * one_minus_rho)
    cost_ord = D / Q_star * c3
    cost_hol = S_star / 2.0 * c1
    cost_pur = D * K if K is not None else None

    res = {
        "model": "模型2 经济生产批量模型（EPQ，陆续到货）",
        "params": {"D": D, "d": d, "p": p, "c1": c1, "c3": c3, "K": K},
        "Q_star": Q_star,
        "S_star": S_star,
        "T_star": T_star,
        "t_produce": t_prod,
        "t_consume": t_cons,
        "C_star": C_star,
        "rho": rho,
        "max_inventory": S_star,
        "avg_inventory": S_star / 2.0,
        "cost_ordering": cost_ord,
        "cost_holding": cost_hol,
        "cost_purchase": cost_pur,
        "cost_total": C_star + cost_pur if cost_pur is not None else None,
        "produce_times_per_year": D / Q_star,
        "time_units_per_year": ppy,
    }

    if verbose:
        _title("模型 2  经济生产批量模型（EPQ，陆续到货）")
        print("  假设：需求连续均匀 · 陆续匀速到货（p > d）· 不允许缺货")
        _sec("已知参数")
        _kv("年总需求量 D", _num(D), "件/年")
        _kv("单位时间需求率 d", _num(d), "件/单位时间")
        _kv("单位时间生产率 p", _num(p), "件/单位时间")
        _kv("单位存贮费 c1", _num(c1), "元/件·年")
        _kv("每次订货/准备费 c3", _num(c3), "元/次")
        if K is not None:
            _kv("单位生产成本 K", _num(K), "元/件")
        print(f"\n  · 需求/生产比 ρ = d/p = {_num(rho)}，即到货速度是消耗速度的 "
              f"{_num(p / d, 3)} 倍")
        print(f"  · 单位口径：由 D/d 得出「每年 {_num(ppy, 4)} 个时间单位」"
              f"（= {_num(ppy, 4)} 个与 d、p 同口径的时间单位）")
        if periods_per_year is not None:
            print(f"    ✓ 与你给出的 periods_per_year = {_num(ppy, 4)} 一致，已校验通过。")
        elif ppy > 400:
            print("    ⚠ 该值明显偏大（常见应为年工作日数 ≈250 或自然日数 365、"
                  "按月则为 12）。")
            print("      请核对 D 与 d 是否同一时间口径——口径串了 Q* 会差 sqrt(n) 倍。")
        _sec("库存变化过程（一个周期内）")
        print(f"  ① 生产期  t_p = Q/p：库存以 (p-d) 上升，期末达最高 S = (1-d/p)·Q")
        print(f"  ② 消耗期  t_c = S/d：库存以 d 下降，降到 0 时下一批到货")
        _sec("计算结果")
        _kv("最优生产批量 Q*", _num(Q_star), "件")
        _kv("最高存贮量 S* = (1-d/p)Q*", _num(S_star), "件")
        _kv("平均存贮量 S*/2", _num(S_star / 2.0), "件")
        # 单位标注：T*、t_p 的量纲是 d、p 的时间单位（d 按天计则单位就是"天"）；
        # 而 C* = sqrt(2·D·c1·c3·(1-ρ)) 的量纲是 元/年（因 D 按年、c1 按年计）。
        # 这两者必须分开标注，否则学生容易把"周期"和"费用"的时间口径搞混。
        _tu = "个 d、p 的时间单位"
        _kv("最优生产周期 T* = Q*/d", _num(T_star), _tu, "（d 按天计即为天）")
        _kv("其中 生产期 t_p = Q*/p", _num(t_prod), _tu)
        _kv("其中 纯消耗期 t_c", _num(t_cons), _tu)
        _kv("单位时间最小总费用 C*", _num(C_star), "元/年", "（D 按年、c1 按年计）")
        _kv("生产次数 D/Q*", _num(D / Q_star), "次/年")
        _sec("费用构成")
        _kv("年订货(准备)费 (D/Q*)·c3", _num(cost_ord), "元/年")
        _kv("年存贮费 (S*/2)·c1", _num(cost_hol), "元/年")
        if cost_pur is not None:
            _kv("年生产成本 D·K", _num(cost_pur), "元/年")
            _kv("年总费用（含生产）", _num(res["cost_total"]), "元/年")
        print("\n  ▸ 解读：与模型 1 相比，同样的 c1、c3 下 Q* 更大。")
        print("            因为边产边耗，库存涨得慢，同样的批量占用更少仓容，")
        print("            所以可以「多订一点」来摊薄订货费。")
        print(f"            极端情形：若 p→∞（退化为瞬时到货），Q* 还原为 EOQ = "
              f"{_num(math.sqrt(2 * D * c3 / c1))}。")

    return res


# ==============================================================================
# 模型 3  允许缺货的经济订货批量模型
# ==============================================================================

def eoq_shortage(D, c1, c2, c3, K=None, verbose: bool = True) -> dict:
    """
    【模型 3】允许缺货的经济订货批量模型（缺货预约型）
    教材对应：徐玖平《运筹学（第四版）》9.3 缺货模型（p.290）

    ---------------- 模型假设 ----------------
    (1) 需求连续均匀，需求率 D；
    (2) 瞬时到货；
    (3) 允许缺货：库存降为 0 后仍可继续供货（缺货预约），等到货后一次性补足，
        单位时间单位缺货量造成缺货损失费 c2；
    (4) 单位存贮费 c1、每次订货费 c3 固定。

    ---------------- 参数 ----------------
    D  : float  年总需求量（件/年）
    c1 : float  单位物品单位时间存贮费（元/件·年）
    c2 : float  单位物品单位时间缺货损失费（元/件·年）
    c3 : float  每次订货费（元/次）
    K  : float  采购单价（元/件），可选

    ---------------- 核心公式 ----------------
    设一次订货量 Q，其中到货后先补足上一周期的欠货，最高存贮量为 S，
    最大缺货量 B = Q - S。一个周期 T = Q/D 分为存贮期 t1 = S/D 与缺货期 t2 = B/D。
        C(Q,S) = c3·D/Q + c1·S²/(2Q) + c2·B²/(2Q)

    先对 S 求偏导： ∂C/∂S = c1·S/Q - c2·(Q-S)/Q = 0
        => 最高存贮量 S* = c2/(c1+c2)·Q，最大缺货量 B* = c1/(c1+c2)·Q
    再对 Q 求导得
        最优订货批量 Q* = sqrt( 2·D·c3·(c1+c2) / (c1·c2) )
        单位时间最小总费用 C* = sqrt( 2·D·c1·c2·c3 / (c1+c2) )
        缺货期占比 = B*/Q* = c1/(c1+c2)

    性质（方向别记反）：
      · Q* 随 c2 单调【递减】，S* 随 c2 单调【递增】（缺货越贵越不敢缺，
        于是批量订小一点、库存备足一点）；
      · C* 随 c2 单调【递增】，且上限恰为模型 1 的 EOQ 费用 —— 这正说明
        「允许缺货只会省钱、不会费钱」，最坏情形（c2 = ∞）也不过回到 EOQ；
      · 当 c2 → ∞ 时 Q*、S*、C* 全部还原为模型 1 的 EOQ 结果。

    ---------------- 返回值 ----------------
    dict，含 Q_star、S_star、B_star、T_star、t_stock、t_short、C_star、
    shortage_ratio、avg_inventory、avg_shortage 等。
    """
    # ---- 1. 参数校验 ----
    D = _pos("年总需求量", D, "D", "件/年")
    c1 = _pos("单位存贮费", c1, "c1", "元/件·年")
    c2 = _pos("单位缺货损失费", c2, "c2", "元/件·年")
    c3 = _pos("每次订货费", c3, "c3", "元/次")
    K = None if K is None else _nonneg("采购单价", K, "K", "元/件")

    # ---- 2. 核心计算 ----
    Q_star = math.sqrt(2.0 * D * c3 * (c1 + c2) / (c1 * c2))
    S_star = c2 / (c1 + c2) * Q_star        # 最高存贮量
    B_star = c1 / (c1 + c2) * Q_star        # 最大缺货量
    T_star = Q_star / D
    t_stock = S_star / D                    # 有库存的时段
    t_short = B_star / D                    # 缺货的时段
    C_star = math.sqrt(2.0 * D * c1 * c2 * c3 / (c1 + c2))
    cost_ord = D / Q_star * c3
    cost_hol = S_star * S_star / (2.0 * Q_star) * c1
    cost_sht = B_star * B_star / (2.0 * Q_star) * c2
    eoq_ref = eoq_basic(D, c1, c3, verbose=False)
    cost_pur = D * K if K is not None else None

    res = {
        "model": "模型3 允许缺货的经济订货批量模型",
        "params": {"D": D, "c1": c1, "c2": c2, "c3": c3, "K": K},
        "Q_star": Q_star,
        "S_star": S_star,
        "B_star": B_star,
        "T_star": T_star,
        "t_stock": t_stock,
        "t_short": t_short,
        "C_star": C_star,
        "shortage_ratio": B_star / Q_star,
        "max_inventory": S_star,
        "max_shortage": B_star,
        "avg_inventory": S_star * S_star / (2.0 * Q_star),
        "avg_shortage": B_star * B_star / (2.0 * Q_star),
        "cost_ordering": cost_ord,
        "cost_holding": cost_hol,
        "cost_shortage": cost_sht,
        "cost_purchase": cost_pur,
        "cost_total": C_star + cost_pur if cost_pur is not None else None,
        "eoq_benchmark": {"Q": eoq_ref["Q_star"], "C": eoq_ref["C_star"]},
        "saving_vs_eoq": eoq_ref["C_star"] - C_star,
    }

    if verbose:
        _title("模型 3  允许缺货的经济订货批量模型（缺货预约）")
        print("  假设：需求连续均匀 · 瞬时到货 · 允许缺货且到货后补足")
        _sec("已知参数")
        _kv("年总需求量 D", _num(D), "件/年")
        _kv("单位存贮费 c1", _num(c1), "元/件·年")
        _kv("单位缺货损失费 c2", _num(c2), "元/件·年")
        _kv("每次订货费 c3", _num(c3), "元/次")
        if K is not None:
            _kv("采购单价 K", _num(K), "元/件")
        _sec("两个决策变量的求解顺序")
        print("  ① 先对最高存贮量 S 求偏导：∂C/∂S = c1·S/Q - c2·(Q-S)/Q = 0")
        print("     => S* = c2/(c1+c2)·Q ，B* = Q - S* = c1/(c1+c2)·Q")
        print("  ② 代回后对 Q 求导 => Q* = sqrt(2·D·c3·(c1+c2)/(c1·c2))")
        _sec("计算结果")
        _kv("最优订货批量 Q*", _num(Q_star), "件")
        _kv("最高存贮量 S*", _num(S_star), "件")
        _kv("最大缺货量 B*", _num(B_star), "件")
        _kv("最优订货周期 T* = Q*/D", _num(T_star), "年", f"≈ {_num(T_star * 365)} 天")
        _kv("其中 存贮期 t1 = S*/D", _num(t_stock), "年")
        _kv("其中 缺货期 t2 = B*/D", _num(t_short), "年")
        _kv("缺货期占比 = B*/Q*", _pct(B_star / Q_star), "")
        _kv("平均存贮量 S*²/(2Q*)", _num(res["avg_inventory"]), "件")
        _kv("平均缺货量 B*²/(2Q*)", _num(res["avg_shortage"]), "件")
        _kv("单位时间最小总费用 C*", _num(C_star), "元/年")
        _sec("费用构成")
        _kv("订货费 (D/Q*)·c3", _num(cost_ord), "元/年")
        _kv("存贮费", _num(cost_hol), "元/年")
        _kv("缺货损失费", _num(cost_sht), "元/年")
        if cost_pur is not None:
            _kv("年采购成本 D·K", _num(cost_pur), "元/年")
            _kv("年总费用（含采购）", _num(res["cost_total"]), "元/年")
        _sec("与模型 1 对照（为什么愿意缺货）")
        _kv("模型1 EOQ 的 Q*", _num(eoq_ref["Q_star"]), "件")
        _kv("模型1 的最小费用", _num(eoq_ref["C_star"]), "元/年")
        _kv("本模型的费用节约", _num(res["saving_vs_eoq"]), "元/年",
            f"（省 {_pct(res['saving_vs_eoq'] / eoq_ref['C_star'])}）")
        _kv("允许缺货后 Q* 的放大倍数", _num(Q_star / eoq_ref["Q_star"], 4), "倍")
        print("\n  ▸ 解读：缺货损失 c2 越小（顾客越愿意等），越值得把订货批量加大、")
        print("            库存压低，用「缺货」替代「存货」。c2 → ∞ 时还原为 EOQ。")
        print(f"            注意方向：c2 越大 → Q* 越小、S* 越大、C* 越大；")
        print(f"            C* 的上限就是模型 1 的 EOQ 费用 {_num(eoq_ref['C_star'])} 元/年，")
        print(f"            即「允许缺货只会省钱，最坏也不过回到 EOQ」。")

    return res


# ==============================================================================
# 模型 4  单周期随机存贮模型（报童模型）
# ==============================================================================

def newsvendor(k, h, kind: str = "discrete", values=None, probs=None,
               mu=None, sigma=None, verbose: bool = True) -> dict:
    """
    【模型 4】单周期随机存贮模型（报童模型）
    ⚠ 教材对应：徐玖平《运筹学（第四版）》第 9 章「库存论」9.1~9.7 全部是
      确定性模型，**不含本模型**。本模型按通行教材（清华版《运筹学》随机型
      存贮模型）的单周期模型写法实现，符号与临界公式沿用题面给出的
      r、P(r)、F(r)、k、h 与 F(Q*) = k/(k+h)。
      若你的课程把报童归入第 7 章「决策分析」的风险决策，请按那边的口径核对。

    ---------------- 模型假设 ----------------
    (1) 只考虑一个周期，期末剩余不能留到下期使用（或残值低于订货成本）；
    (2) 需求量 r 是随机变量，已知其分布（离散分布 / 正态分布）；
    (3) 订货量 Q 在需求实现之前一次性确定，周期内不再补货；
    (4) 售出单位获利 k，滞销单位损失 h。

    ---------------- 参数 ----------------
    k       : float  单位物品售出赢利（缺货机会成本，元/件）
    h       : float  单位物品滞销损失（超储成本，元/件）
    kind    : str    'discrete'（离散分布）或 'normal'（正态分布）
    ---- kind='discrete' 时 ----
    values  : list   需求量取值 r，如 [100, 200, 300, 400, 500]
    probs   : list   对应概率 P(r)，必须 > 0 且和为 1
    ---- kind='normal' 时 ----
    mu      : float  需求均值
    sigma   : float  需求标准差（必须 > 0）

    ---------------- 核心公式 ----------------
    目标：使期望总成本最小
        C(Q) = k·E[(r - Q)⁺] + h·E[(Q - r)⁺]
    其中 (x)⁺ = max(x, 0)。第一项是缺货的机会损失，第二项是超储的滞销损失。

    边际分析：订货量从 Q 增加到 Q+1，这一单位在 r ≥ Q+1 时卖出、获利 k，
    在 r ≤ Q 时卖不出、损失 h。只要
        k·P(r ≥ Q+1) > h·P(r ≤ Q)
    就值得增加订货，即 F(Q) < k/(k+h)，其中 F 为需求累积分布函数。故临界条件
        F(Q*) = k / (k + h)        ← 教材核心临界公式
    离散情形：Q* = min{ Q : F(Q) ≥ k/(k+h) }（取首次达到临界比的最小 Q）
    连续正态：Q* = μ + σ·Φ⁻¹( k/(k+h) )

    临界比 k/(k+h) 又称【临界服务水平】：它等于订货量恰好被需求覆盖的概率。

    ---------------- 返回值 ----------------
    dict，含 Q_star、critical_ratio、expected_cost、stockout_prob、
    overstock_prob、service_level、expected_shortage、expected_leftover、
    expected_sales 等。
    """
    # ---- 1. 参数校验 ----
    k = _pos("单位售出赢利", k, "k", "元/件")
    h = _pos("单位滞销损失", h, "h", "元/件")
    ratio = k / (k + h)
    res = {"model": "模型4 单周期随机存贮模型（报童模型）",
           "params": {"k": k, "h": h, "kind": kind},
           "critical_ratio": ratio}

    # ---- 2. 离散分布 ----
    if kind == "discrete":
        _chk(values is not None and probs is not None,
             "离散型需求必须同时给出需求量取值 values 与对应概率 probs。")
        _chk(len(values) == len(probs),
             f"values 与 probs 长度必须相同（当前 {len(values)} vs {len(probs)}）。")
        _chk(len(values) > 0, "需求量取值不能为空。")
        rs = [float(v) for v in values]
        ps = [float(p) for p in probs]
        order = sorted(range(len(rs)), key=lambda i: rs[i])
        rs = [rs[i] for i in order]
        ps = [ps[i] for i in order]
        _chk(all(p > 0 for p in ps),
             "概率必须严格大于 0。"
             f"（若某取值不可能发生，请直接从取值表中删掉；当前含 {min(ps):g}）")
        _chk(all(rs[i] < rs[i + 1] for i in range(len(rs) - 1)),
             "需求量取值必须互不相同。")
        total = sum(ps)
        _chk(abs(total - 1.0) < 1e-9,
             f"概率之和必须等于 1，当前为 {total:.10f}（差 {total - 1.0:+.2e}）。")

        # 累积分布与首次达到临界比的 Q
        cum, acc = [], 0.0
        for p in ps:
            acc += p
            cum.append(acc)
        Q_star = None
        for i, f in enumerate(cum):
            if f >= ratio - 1e-12:      # 容忍浮点误差，避免 0.6000000001 被跳过
                Q_star = rs[i]
                break
        if Q_star is None:               # 理论上不会发生（cum[-1] = 1 ≥ ratio）
            Q_star = rs[-1]

        def e_cost(q):
            short = sum((r - q) * p for r, p in zip(rs, ps) if r > q)
            over = sum((q - r) * p for r, p in zip(rs, ps) if r < q)
            return k * short, h * over

        es, eo = e_cost(Q_star)
        C_star = es + eo
        idx = rs.index(Q_star)
        F_star = cum[idx]
        # P(r < Q*)：严格小于，按分布表定义（离散情形超储概率）
        p_lt = cum[idx - 1] if idx > 0 else 0.0
        res.update({
            "values": rs, "probs": ps, "cdf": cum,
            "Q_star": Q_star, "expected_cost": C_star,
            "expected_shortage_cost": es, "expected_overstock_cost": eo,
            "F_at_Q": F_star, "service_level": F_star,
            "stockout_prob": 1.0 - F_star,
            "overstock_prob": p_lt,
            "prob_equal": ps[idx],
            "expected_shortage": sum((r - Q_star) * p for r, p in zip(rs, ps) if r > Q_star),
            "expected_leftover": sum((Q_star - r) * p for r, p in zip(rs, ps) if r < Q_star),
            "expected_sales": sum(min(Q_star, r) * p for r, p in zip(rs, ps)),
            "exact_tie": abs(F_star - ratio) < 1e-12,
        })
        # 若临界比恰好等于某累积概率，则 Q 与 Q+1 档同样最优（边际增益为 0）
        if res["exact_tie"]:
            nxt = rs[idx + 1] if idx + 1 < len(rs) else None
            res["tie_note"] = (
                f"F(Q*) = {F_star:.10f} 与临界比 k/(k+h) 恰好相等，此时该单位商品的"
                f"边际期望增益为 0，即 Q* = {_num(Q_star)} 与 "
                f"{('Q = ' + _num(nxt)) if nxt is not None else '再加一档'} 同样最优（成本相同）；"
                f"教材惯例取较小的 Q*。")

        if verbose:
            _title("模型 4  单周期随机存贮模型（报童模型）· 离散型需求")
            print("  假设：单周期 · 期末剩余不能转用 · 需求随机 · 一次订货")
            _sec("已知参数")
            _kv("单位售出赢利 k", _num(k), "元/件")
            _kv("单位滞销损失 h", _num(h), "元/件")
            _kv("临界比 k/(k+h)", _num(ratio, 6), "")
            _sec("需求分布与累积概率（找首次 ≥ 临界比的点）")
            print(f"  {'需求量 r':>12} {'概率 P(r)':>14} {'累积 F(r)':>16}   {'判断':<20}")
            print("  " + "-" * (_W - 4))
            for r, p, f in zip(rs, ps, cum):
                mark = "← F(r) ≥ k/(k+h) 首次成立" if r == Q_star else ""
                print(f"  {_num(r):>12} {_num(p, 6):>14} {_num(f, 6):>16}   {mark:<20}")
            _sec("计算结果")
            _kv("最优订货量 Q*", _num(Q_star), "件")
            _kv("F(Q*) 累积概率", _num(F_star, 6), "")
            _kv("期望总成本 C*", _num(C_star), "元")
            _kv("  其中 期望缺货机会损失", _num(es), "元")
            _kv("  其中 期望超储滞销损失", _num(eo), "元")
            _kv("缺货概率 P(r > Q*)", _num(res["stockout_prob"], 6), _pct(res["stockout_prob"]))
            _kv("超储概率 P(r < Q*)", _num(res["overstock_prob"], 6), _pct(res["overstock_prob"]))
            _kv("恰好售罄概率 P(r = Q*)", _num(res["prob_equal"], 6), _pct(res["prob_equal"]))
            _kv("临界服务水平", _num(ratio, 6), _pct(ratio))
            _kv("期望销售量 E[min(Q*,r)]", _num(res["expected_sales"]), "件")
            _kv("期望缺货量", _num(res["expected_shortage"]), "件")
            _kv("期望剩余量", _num(res["expected_leftover"]), "件")
            if res["exact_tie"]:
                print(f"\n  ⚠ {res['tie_note']}")
            print("\n  ▸ 解读：先算临界比 k/(k+h)——它由「多订一件的收益风险比」决定，")
            print("            与需求分布无关；再用累积分布去「卡」这个比例得到 Q*。")
            print("            k 越大（越好卖）Q* 越大；h 越大（越怕压货）Q* 越小。")

    # ---- 3. 正态（连续）分布 ----
    elif kind == "normal":
        mu = _nonneg("需求均值", mu, "μ", "件")
        sigma = _pos("需求标准差", sigma, "σ", "件")
        _chk(sigma > 0, "正态分布的标准差必须为正。")
        z = norm_ppf(ratio)
        Q_star = mu + sigma * z
        _chk(Q_star > 0,
             f"算出的最优订货量 Q* = {Q_star:g} ≤ 0，说明需求均值过小或变异过大，"
             f"请检查 μ、σ 是否合理（μ = {mu:g}，σ = {sigma:g}）。")

        def e_parts(q):
            zz = (q - mu) / sigma
            e_over = sigma * norm_pdf(zz) + (q - mu) * norm_cdf(zz)
            e_short = sigma * norm_pdf(zz) - (q - mu) * (1.0 - norm_cdf(zz))
            return max(e_short, 0.0), max(e_over, 0.0)

        es, eo = e_parts(Q_star)
        C_star = k * es + h * eo
        res.update({
            "mu": mu, "sigma": sigma, "z_star": z,
            "Q_star": Q_star, "expected_cost": C_star,
            "expected_shortage_cost": k * es, "expected_overstock_cost": h * eo,
            "F_at_Q": norm_cdf(z), "service_level": ratio,
            "stockout_prob": 1.0 - ratio, "overstock_prob": ratio,
            "expected_shortage": es, "expected_leftover": eo,
            "expected_sales": mu - es,
            "exact_tie": False,
        })

        if verbose:
            _title("模型 4  单周期随机存贮模型（报童模型）· 正态需求")
            print("  假设：单周期 · 期末剩余不能转用 · 需求 r ~ N(μ, σ²) · 一次订货")
            _sec("已知参数")
            _kv("单位售出赢利 k", _num(k), "元/件")
            _kv("单位滞销损失 h", _num(h), "元/件")
            _kv("需求均值 μ", _num(mu), "件")
            _kv("需求标准差 σ", _num(sigma), "件")
            _kv("临界比 k/(k+h)", _num(ratio, 6), _pct(ratio))
            _sec("求解过程（解析法，无需查表迭代）")
            print(f"  F(Q*) = k/(k+h) = {_num(ratio, 6)}")
            print(f"  => (Q*-μ)/σ = Φ⁻¹({_num(ratio, 6)}) = {_num(z, 6)}")
            print(f"  => Q* = μ + σ·z = {_num(mu)} + {_num(sigma)}×{_num(z, 6)} "
                  f"= {_num(Q_star)}")
            _sec("计算结果")
            _kv("最优订货量 Q*", _num(Q_star), "件")
            _kv("标准化分位 z*", _num(z, 6), "")
            _kv("期望总成本 C*", _num(C_star), "元")
            _kv("  其中 期望缺货机会损失", _num(k * es), "元")
            _kv("  其中 期望超储滞销损失", _num(h * eo), "元")
            _kv("缺货概率 P(r > Q*)", _num(1.0 - ratio, 6), _pct(1.0 - ratio),
                "= h/(k+h)")
            _kv("超储概率 P(r < Q*)", _num(ratio, 6), _pct(ratio), "= k/(k+h)")
            _kv("临界服务水平", _num(ratio, 6), _pct(ratio))
            _kv("期望销售量 E[min(Q*,r)]", _num(mu - es), "件")
            _kv("期望缺货量 E[(r-Q*)⁺]", _num(es), "件")
            _kv("期望剩余量 E[(Q*-r)⁺]", _num(eo), "件")
            print("\n  ▸ 解读：连续情形有闭式解，直接反查正态分位即可，")
            print("            不必像离散情形那样逐行比较累积概率。")
            print("            注意 Q* 通常 ≠ μ：只有 k = h 时临界比才是 0.5、Q* 才等于均值。")

    else:
        raise InventoryError(f"kind 只能是 'discrete' 或 'normal'，当前收到 {kind!r}。")

    return res


# ==============================================================================
# 模型 5  批量折扣模型（多价格区间 EOQ）
# ==============================================================================

def quantity_discount(D, c3, breaks, c1=None, holding_rate=None,
                       verbose: bool = True) -> dict:
    """
    【模型 5】批量折扣模型（多价格区间 / 阶梯价格 EOQ）
    教材对应：徐玖平《运筹学（第四版）》9.5* 批量折扣模型（p.298，* 为选讲）

    ---------------- 模型假设 ----------------
    (1) 与模型 1 相同的确定性假设（连续均匀需求、瞬时到货、不允许缺货）；
    (2) 采购单价不是常数，而是随订货批量呈阶梯式下降：买得越多，单价越低；
    (3) 存贮费按单位物品单位时间计（也可按"单价 × 存贮费率"计）。

    ---------------- 参数 ----------------
    D            : float  年总需求量（件/年）
    c3           : float  每次订货费（元/次）
    breaks       : list   价格分档，形如 [(分界点下限, 单价), ...]，按下限升序，
                          第一档下限必须为 0。例如
                          [(0, 10.0), (500, 9.5), (1000, 9.0), (2000, 8.5)]
                          表示 0≤Q<500 单价 10.0；500≤Q<1000 单价 9.5；
                          1000≤Q<2000 单价 9.0；Q≥2000 单价 8.5。
    c1           : float  单位物品单位时间存贮费（元/件·年）。与 holding_rate 二选一。
    holding_rate : float  存贮费率（如 0.2 表示存贮费 = 单价的 20%），
                          此时第 i 档 c1_i = holding_rate × K_i（教材常用口径）。

    ---------------- 核心公式 ----------------
    第 i 档（单价 K_i、存贮费 c1_i）的单位时间总费用：
        C_i(Q) = (1/2)·Q·c1_i + (D/Q)·c3 + D·K_i
                 └─存贮费─┘   └─订货费─┘   └─采购费─┘
    注意：采购费 D·K_i 与本档内 Q 无关（常数），但它随档位变化，
          所以【比较各档时必须计入】，否则会得出错误结论。

    各档内使 C_i(Q) 最小的 Q 是
        Q_i* = sqrt( 2·D·c3 / c1_i )
    由于 C_i 在 (0, Q_i*) 上递减、在 (Q_i*, ∞) 上递增（凸函数），
    若 Q_i* 落在本档区间外，则本档的最小值必在【最靠近 Q_i* 的那个端点】取得。

    ---------------- 计算步骤（教材标准三步） ----------------
    ① 逐档计算无约束最优批量 Q_i*；
    ② 可行性校验：Q_i* 是否落在本档区间 [lo_i, hi_i) 内？
        · 落在区间内      → 本档候选为 Q_i*
        · Q_i* < lo_i     → 本档内费用递增，候选为左端点 lo_i
        · Q_i* ≥ hi_i     → 本档内费用递减，最小值在右端点，
                            而右端点属于下一档（折扣按"达到即享受"计），
                            故本档不产生候选，交由下一档的左端点处理
    ③ 计算各候选点的总费用（含采购费），取全局最小者。

    ---------------- 返回值 ----------------
    dict，含 Q_star、K_star、cost_star（及其 breakdown）、brackets（逐档明细，
    含可行性与该档候选、费用）、best_bracket 等。
    """
    # ---- 1. 参数校验 ----
    D = _pos("年总需求量", D, "D", "件/年")
    c3 = _pos("每次订货费", c3, "c3", "元/次")
    _chk(isinstance(breaks, (list, tuple)) and len(breaks) >= 1,
         "breaks 必须是非空的 [(分界点下限, 单价), ...] 列表。")
    _chk((c1 is None) != (holding_rate is None),
         "必须且只能给出 c1（绝对存贮费）与 holding_rate（存贮费率）中的一个。")
    if holding_rate is not None:
        holding_rate = _pos("存贮费率", holding_rate, "i", "无量纲")

    tiers = []
    for entry in breaks:
        _chk(len(entry) == 2, f"breaks 的每一项必须是 (分界点下限, 单价)，当前为 {entry!r}。")
        lo, K = entry
        lo = _nonneg("分界点下限", lo, "Q_i", "件")
        K = _pos("采购单价", K, "K_i", "元/件")
        tiers.append([float(lo), K])
    _chk(abs(tiers[0][0]) < 1e-12, "breaks 第一档的分界点下限必须为 0。")
    for i in range(1, len(tiers)):
        _chk(tiers[i][0] > tiers[i - 1][0],
             f"breaks 的分界点必须严格递增，但第 {i} 档下限 {tiers[i][0]:g} "
             f"不大于上一档 {tiers[i - 1][0]:g}。")
        _chk(tiers[i][1] <= tiers[i - 1][1] + 1e-12,
             f"批量折扣要求单价随批量【不升】：第 {i} 档单价 {tiers[i][1]:g} "
             f"高于上一档 {tiers[i - 1][1]:g}，这与折扣模型前提矛盾。")

    # ---- 2. 逐档计算 ----
    n = len(tiers)
    rows = []
    for i, (lo, K) in enumerate(tiers):
        hi = tiers[i + 1][0] if i + 1 < n else None      # None 表示无上界
        c1_i = c1 if holding_rate is None else holding_rate * K
        q_eoq = math.sqrt(2.0 * D * c3 / c1_i)

        def cost_at(q, c1x=c1_i, Kx=K):
            return 0.5 * q * c1x + (D / q) * c3 + D * Kx

        if lo <= q_eoq < (hi if hi is not None else math.inf):
            status, cand = "可行（Qᵢ* 落在本档区间内）", q_eoq
        elif q_eoq < lo:
            status, cand = f"不可行：Qᵢ* < 下限，取本档左端点", lo
        else:
            status, cand = "不可行：Qᵢ* 超出本档上限（本档内费用递减，最低点在右端点，属下一档）", None

        rows.append({
            "index": i + 1,
            "lo": lo, "hi": hi, "K": K, "c1": c1_i,
            "eoq": q_eoq, "status": status, "candidate": cand,
            "cost": cost_at(cand) if cand is not None else None,
            "cost_purchase": D * K,
        })

    # 逐档补算候选点的费用明细
    for r in rows:
        if r["candidate"] is not None:
            q = r["candidate"]
            r["cost_holding"] = 0.5 * q * r["c1"]
            r["cost_ordering"] = (D / q) * c3

    feasible = [r for r in rows if r["candidate"] is not None]
    _chk(len(feasible) > 0, "所有档位都未产生候选批量，请检查 breaks 是否合理。")
    best = min(feasible, key=lambda r: r["cost"])
    q_best = best["candidate"]

    res = {
        "model": "模型5 批量折扣模型（多价格区间 EOQ）",
        "params": {"D": D, "c3": c3, "c1": c1, "holding_rate": holding_rate,
                   "breaks": breaks},
        "brackets": rows,
        "Q_star": q_best,
        "K_star": best["K"],
        "cost_holding": best["cost_holding"],
        "cost_ordering": best["cost_ordering"],
        "cost_purchase": best["cost_purchase"],
        "cost_star": best["cost"],
        "best_bracket": best["index"],
        "order_times_per_year": D / q_best,
        "T_star": q_best / D,
        "max_inventory": q_best,
        "avg_inventory": q_best / 2.0,
        # 参照：完全不考虑折扣（按第一档单价）时的 EOQ
        "eoq_no_discount": math.sqrt(2.0 * D * c3 / rows[0]["c1"]),
    }

    if verbose:
        _title("模型 5  批量折扣模型（多价格区间 EOQ）")
        print("  假设：需求连续均匀 · 瞬时到货 · 不允许缺货 · 单价随批量阶梯下降")
        _sec("已知参数")
        _kv("年总需求量 D", _num(D), "件/年")
        _kv("每次订货费 c3", _num(c3), "元/次")
        if holding_rate is not None:
            _kv("存贮费率 i", _num(holding_rate, 4), "",
                f"（第 i 档 c1_i = i × K_i，如第 1 档 c1 = {_num(rows[0]['c1'])}）")
        else:
            _kv("单位存贮费 c1", _num(c1), "元/件·年", "（各档相同）")
        _sec("价格分档")
        for r in rows:
            hi_s = "∞" if r["hi"] is None else _num(r["hi"])
            print(f"  第 {r['index']} 档：{_num(r['lo']):>10} ≤ Q < {hi_s:<10} "
                  f"单价 K = {_num(r['K'])} 元/件，c1 = {_num(r['c1'])} 元/件·年")
        _sec("① 逐档计算无约束最优批量 Qᵢ* = sqrt(2·D·c3/c1ᵢ)")
        _sec("② 可行性校验")
        for r in rows:
            print(f"  第 {r['index']} 档：Qᵢ* = {_num(r['eoq'])}  →  {r['status']}")
            if r["candidate"] is not None:
                print(f"           本档候选批量 = {_num(r['candidate'])}")
        _sec("③ 各候选点总费用比较（必须计入采购费 D·K，否则结论会错）")
        print(f"  {'档':<4}{'候选批量':>12}{'存贮费':>13}{'订货费':>13}"
              f"{'采购费':>15}{'合计':>15}")
        print("  " + "-" * (_W - 4))
        for r in feasible:
            mark = "  ← 全局最优" if r is best else ""
            print(f"  {r['index']:<4}{_num(r['candidate']):>12}{_num(r['cost_holding']):>13}"
                  f"{_num(r['cost_ordering']):>13}{_num(r['cost_purchase']):>15}"
                  f"{_num(r['cost']):>15}{mark}")
        _sec("最终结果")
        _kv("全局最优订货批量 Q*", _num(q_best), "件")
        _kv("适用单价 K*", _num(best["K"]), "元/件", f"（第 {best['index']} 档）")
        _kv("年最小总费用 C*", _num(best["cost"]), "元/年")
        _kv("  其中 年存贮费", _num(best["cost_holding"]), "元/年")
        _kv("  其中 年订货费", _num(best["cost_ordering"]), "元/年")
        _kv("  其中 年采购费", _num(best["cost_purchase"]), "元/年")
        _kv("年订货次数", _num(D / q_best), "次/年")
        print(f"\n  ▸ 折扣区间选择说明：全局最优落在第 {best['index']} 档"
              f"（{_num(best['lo'])} ≤ Q < "
              f"{'∞' if best['hi'] is None else _num(best['hi'])}，单价 {_num(best['K'])} 元/件）。"
              f"\n    " + (
                  "该档内 Qᵢ* 自身可行，直接取 Qᵢ*。"
                  if abs(q_best - best["eoq"]) < 1e-9 else
                  f"该档内 Qᵢ* = {_num(best['eoq'])} 越界，最优解被「顶」到区间端点上——"
                  f"\n    这正是折扣模型的特点：最优解常常不是 EOQ，而是某个价格分界点。"
              ))
        print(f"    对照：若完全不考虑折扣（按第 1 档单价），EOQ = "
              f"{_num(res['eoq_no_discount'])} 件，"
              f"但那样要按 {_num(rows[0]['K'])} 元/件采购，总费用反而更高。")

    return res


# ==============================================================================
# 模型 6  约束条件下的多产品存贮模型
# ==============================================================================

def multiproduct_constrained(items, constraint: str = "capital", limit=None,
                             average_basis: bool = False, min_order=None,
                             tol: float = 1e-12, max_iter: int = 200,
                             verbose: bool = True) -> dict:
    """
    【模型 6】约束条件下的多产品存贮模型（拉格朗日乘数法）
    教材对应：徐玖平《运筹学（第四版）》9.6* 约束条件模型（p.300，* 为选讲）

    ---------------- 模型假设 ----------------
    (1) 每种产品各自满足模型 1（EOQ）的确定性假设，独立补充、瞬时到货；
    (2) 各产品共享一项稀缺资源，构成一条线性约束：
        · 总资金约束： Σ Kᵢ·Qᵢ ≤ W   （Kᵢ 为单位采购单价，元/件）
        · 总库容约束： Σ vᵢ·Qᵢ ≤ V   （vᵢ 为单位物品占用库容，m³/件）
    (3) 目标：在满足约束的前提下，使各产品存贮与订货费用之和最小。

    ---------------- 参数 ----------------
    items      : list  每个元素为 dict，字段：
                        'name' 名称（可选，默认"产品i"）
                        'D'    年需求量（件/年）
                        'c1'   单位存贮费（元/件·年）
                        'c3'   每次订货费（元/次）
                        'K'    单位采购单价（元/件）—— 资金约束需要
                        'v'    单位物品占用库容（m³/件）—— 库容约束需要
    constraint : str   'capital'（总资金约束）或 'volume'（总库容约束）
    limit      : float W（元）或 V（m³），资源上限
    average_basis : bool  资源按"平均存贮量 Q/2"计还是按"最高存贮量 Q"计。
                        教材两种口径都有，默认 False（按 Q 计，即最高存贮量）。
                        若为 True，则约束为 Σ gᵢ·Qᵢ/2 ≤ limit。
    min_order  : list  各产品的最小起订量（可选，默认全 0），用于可行性校验。

    ---------------- 核心公式（拉格朗日乘数法） ----------------
    记 aᵢ = c3ᵢ·Dᵢ，bᵢ = c1ᵢ/2，gᵢ 为第 i 种产品每个单位批量占用的资源量
    （average_basis=True 时取 gᵢ/2）。问题为
        min  Σ ( aᵢ/Qᵢ + bᵢ·Qᵢ )
        s.t. Σ gᵢ·Qᵢ ≤ R ,  Qᵢ > 0

    构造拉格朗日函数  L = Σ( aᵢ/Qᵢ + bᵢ·Qᵢ ) + λ( ΣgᵢQᵢ − R )，令 ∂L/∂Qᵢ = 0：
        −aᵢ/Qᵢ² + bᵢ + λ·gᵢ = 0
        =>  Qᵢ(λ) = sqrt( aᵢ / (bᵢ + λ·gᵢ) ) = sqrt( 2·c3ᵢ·Dᵢ / (c1ᵢ + 2λ·gᵢ) )

    λ 的求法（互补松弛条件）：
        · 若 λ = 0 时约束自然满足（ΣgᵢQᵢ ≤ R），则 λ* = 0，即约束不起作用，
          各产品取无约束 EOQ；
        · 否则 λ* > 0，需使约束取等号 ΣgᵢQᵢ(λ) = R。由于 Qᵢ(λ) 关于 λ 严格
          单调递减，ΣgᵢQᵢ(λ) 也严格单调递减，故用二分法迭代求根。
    λ* 的经济含义：资源上限每放宽 1 个单位，总费用可下降 λ* 元 —— 即该项
    资源的影子价格。

    ---------------- 返回值 ----------------
    dict，含 items（各产品 Qᵢ*、资源占用、EOQ 对照）、lambda_star、
    resource_used、limit、binding、total_cost、cost_saving_vs_unconstrained、
    trace（λ 迭代过程）。
    """
    # ---- 1. 参数校验 ----
    _chk(isinstance(items, (list, tuple)) and len(items) > 0,
         "items 必须是非空的参数字典列表。")
    _chk(constraint in ("capital", "volume"),
         f"constraint 只能是 'capital' 或 'volume'，当前收到 {constraint!r}。")
    limit = _pos("资源上限", limit, "W/V", "元 或 m³")

    n = len(items)
    if min_order is None:
        min_order = [0.0] * n
    _chk(len(min_order) == n, f"min_order 长度必须与 items 相同（{len(min_order)} vs {n}）。")

    parsed = []
    for i, it in enumerate(items):
        name = it.get("name", f"产品{i + 1}")
        gkey = "K" if constraint == "capital" else "v"
        gunit = "元/件" if constraint == "capital" else "m³/件"
        gname = "单位采购单价" if constraint == "capital" else "单位物品占用库容"
        parsed.append({
            "name": name,
            "D": _pos(f"{name} 年需求量", it.get("D"), "D", "件/年"),
            "c1": _pos(f"{name} 单位存贮费", it.get("c1"), "c1", "元/件·年"),
            "c3": _pos(f"{name} 每次订货费", it.get("c3"), "c3", "元/次"),
            "g": _pos(f"{name} {gname}", it.get(gkey), gkey, gunit),
            "min": _nonneg(f"{name} 最小起订量", min_order[i]),
        })
    for p in parsed:
        if average_basis:                 # 资源按平均存贮量计 -> 系数减半
            p["g_eff"] = p["g"] / 2.0
        else:
            p["g_eff"] = p["g"]
        p["a"] = p["c3"] * p["D"]
        p["b"] = p["c1"] / 2.0
        p["eoq"] = math.sqrt(p["a"] / p["b"])

    # 资源按最小起订量计的最小占用 —— 若已超上限，说明约束不可行
    min_use = sum(p["g_eff"] * p["min"] for p in parsed)
    _chk(min_use <= limit * (1.0 + 1e-12),
         f"约束不可行：各产品按最小起订量订货时，资源占用 {_num(min_use)} 已超过上限 "
         f"{_num(limit)}（超出 {_num(min_use - limit)}，约 "
         f"{_pct((min_use - limit) / limit)}）。"
         f"请放宽上限、降低起订量，或删减产品数。")

    def q_of(lam):
        """给定 λ，返回各产品的最优批量 Qᵢ(λ)。"""
        out = []
        for p in parsed:
            denom = p["b"] + lam * p["g_eff"]
            q = math.sqrt(p["a"] / denom) if denom > 0 else float("inf")
            out.append(max(q, p["min"]))     # 起订量是下界
        return out

    def use_of(qs):
        """给定各产品批量，返回资源总占用。"""
        return sum(p["g_eff"] * q for p, q in zip(parsed, qs))

    # ---- 2. 先试 λ = 0（看约束是否起作用）----
    trace = []
    q0 = q_of(0.0)
    use0 = use_of(q0)
    trace.append({"iter": 0, "lam": 0.0, "use": use0})

    if use0 <= limit * (1.0 + 1e-12):
        lam_star, q_star, binding = 0.0, q0, False
        lo_, hi_ = 0.0, 0.0
    else:
        # ---- 3. 二分法求 λ*：ΣgᵢQᵢ(λ) 关于 λ 严格递减 ----
        lo_, hi_ = 0.0, 1.0
        for _ in range(200):                     # 先扩张找到上界
            if use_of(q_of(hi_)) <= limit:
                break
            hi_ *= 2.0
        _chk(hi_ < 1e300, "λ 上界搜索失败，请检查参数是否极端异常。")
        lam_star = hi_
        for k in range(max_iter):
            mid = 0.5 * (lo_ + hi_)
            qs = q_of(mid)
            u = use_of(qs)
            trace.append({"iter": k + 1, "lam": mid, "use": u})
            if abs(u - limit) <= max(tol, 1e-12) * max(1.0, limit):
                lam_star = mid
                break
            if u > limit:
                lo_ = mid
            else:
                hi_ = mid
            lam_star = mid
            if hi_ - lo_ <= 1e-15 * max(1.0, hi_):
                break
        q_star = q_of(lam_star)
        binding = True

    # ---- 4. 汇总 ----
    rows = []
    for p, q in zip(parsed, q_star):
        hold = 0.5 * q * p["c1"]
        order = p["D"] / q * p["c3"]
        rows.append({
            "name": p["name"], "D": p["D"], "c1": p["c1"], "c3": p["c3"],
            "g": p["g"], "g_eff": p["g_eff"], "min_order": p["min"],
            "eoq": p["eoq"], "Q": q,
            "resource_used": p["g_eff"] * q,
            "resource_used_if_order_basis": p["g"] * q,
            "cost_holding": hold, "cost_ordering": order, "cost_total": hold + order,
            "shrink_vs_eoq": (p["eoq"] - q) / p["eoq"],
        })
    total = sum(r["cost_total"] for r in rows)
    total_uncon = sum(0.5 * p["eoq"] * p["c1"] + p["D"] / p["eoq"] * p["c3"]
                      for p in parsed)
    resource_used = sum(r["resource_used"] for r in rows)

    res = {
        "model": "模型6 约束条件下的多产品存贮模型",
        "params": {"constraint": constraint, "limit": limit,
                   "average_basis": average_basis, "items": items},
        "items": rows,
        "lambda_star": lam_star,
        "binding": binding,
        "resource_name": "总资金 W（元）" if constraint == "capital" else "总库容 V（m³）",
        "resource_used": resource_used,
        "limit": limit,
        "slack": limit - resource_used,
        "resource_unit": "元" if constraint == "capital" else "m³",
        "total_cost": total,
        "total_cost_unconstrained": total_uncon,
        "extra_cost_due_to_constraint": total - total_uncon,
        "trace": trace,
        "min_resource_used": min_use,
    }

    if verbose:
        _title("模型 6  约束条件下的多产品存贮模型（拉格朗日乘数法）")
        print("  假设：各产品独立按 EOQ 补充，但共享一项线性稀缺资源约束")
        _sec("已知参数")
        _kv("约束类型", "总资金约束" if constraint == "capital" else "总库容约束", "")
        _kv("资源上限", _num(limit), "元" if constraint == "capital" else "m³")
        _kv("资源计量口径",
            "按平均存贮量 Q/2 计" if average_basis else "按最高存贮量 Q 计", "")
        print(f"\n  {'产品':<8}{'D':>10}{'c1':>10}{'c3':>10}{'单位占用':>12}{'无约束EOQ':>12}")
        print("  " + "-" * (_W - 4))
        for p in parsed:
            print(f"  {p['name']:<8}{_num(p['D']):>10}{_num(p['c1']):>10}"
                  f"{_num(p['c3']):>10}{_num(p['g']):>12}{_num(p['eoq']):>12}")

        _sec("第一步：先按无约束 EOQ 计算，检查约束是否起作用（λ = 0 试探）")
        print(f"  各产品取 EOQ 时资源占用 = "
              f"{' + '.join(_num(p['g_eff']) + '×' + _num(q) for p, q in zip(parsed, q0))}"
              f"\n                            = {_num(use0)} "
              f"{'元' if constraint == 'capital' else 'm³'}"
              f"  {'≤' if not binding else '>'} 上限 {_num(limit)}")
        if not binding:
            print("  => 约束自然满足，λ* = 0，约束不起作用，各产品取无约束 EOQ 即可。")
        else:
            print("  => 约束被突破，λ* > 0，需按拉格朗日乘数重新分配批量。")

        if binding:
            _sec("第二步：拉格朗日函数与一阶条件")
            print("  L = Σ(aᵢ/Qᵢ + bᵢ·Qᵢ) + λ(ΣgᵢQᵢ − R) ,  aᵢ = c3ᵢDᵢ , bᵢ = c1ᵢ/2")
            print("  ∂L/∂Qᵢ = −aᵢ/Qᵢ² + bᵢ + λ·gᵢ = 0")
            print("  =>  Qᵢ(λ) = sqrt( aᵢ/(bᵢ + λgᵢ) ) = sqrt( 2·c3ᵢDᵢ/(c1ᵢ + 2λgᵢ) )")
            _sec("第三步：二分法迭代求 λ*（ΣgᵢQᵢ(λ) 关于 λ 严格递减）")
            show = trace if len(trace) <= 14 else trace[:7] + trace[-7:]
            print(f"  {'迭代':>5}{'λ':>18}{'资源占用 ΣgᵢQᵢ(λ)':>22}{'与上限之差':>16}")
            print("  " + "-" * (_W - 4))
            for t in show:
                if t is trace[8]:
                    print(f"  {'…':>5}{'…':>18}{'…':>22}{'…':>16}")
                print(f"  {t['iter']:>5}{_num(t['lam'], 8):>18}{_num(t['use']):>22}"
                      f"{_num(t['use'] - limit):>16}")
            print(f"\n  收敛：λ* = {_num(lam_star, 8)}（二分迭代 {len(trace)} 次，"
                  f"资源占用与上限误差 < 1e-12 相对量级）")

        _sec("最终结果")
        unit = "元" if constraint == "capital" else "m³"
        print(f"  {'产品':<8}{'Qᵢ*':>12}{'资源占用':>14}{'存贮费':>12}"
              f"{'订货费':>12}{'费用合计':>12}{'较EOQ':>10}")
        print("  " + "-" * (_W - 4))
        for r in rows:
            print(f"  {r['name']:<8}{_num(r['Q']):>12}{_num(r['resource_used']):>14}"
                  f"{_num(r['cost_holding']):>12}{_num(r['cost_ordering']):>12}"
                  f"{_num(r['cost_total']):>12}{'-' + _pct(abs(r['shrink_vs_eoq']), 1) if r['shrink_vs_eoq'] > 1e-9 else '—':>10}")
        print("  " + "-" * (_W - 4))
        print(f"  {'合计':<8}{'':>12}{_num(resource_used):>14}"
              f"{_num(sum(r['cost_holding'] for r in rows)):>12}"
              f"{_num(sum(r['cost_ordering'] for r in rows)):>12}"
              f"{_num(total):>12}")
        print()
        lam_unit = "1/年" if constraint == "capital" else "元/(m³·年)"
        _kv("拉格朗日乘数 λ*", _num(lam_star, 8), lam_unit,
            "（该项资源的影子价格）")
        _kv("约束是否起作用", "起作用（取等号）" if binding else "不起作用（有余量）", "")
        _slack_s = ("0（约束取等号）" if abs(res["slack"]) <= 1e-6 * limit
                    else _num(res["slack"]))
        _kv("资源实际占用", _num(resource_used), unit,
            f"上限 {_num(limit)}，余量 {_slack_s}")
        _kv("占用率", _pct(resource_used / limit), "")
        _kv("最小总存贮费用 Σ", _num(total), "元/年")
        if binding:
            _kv("无约束时总费用", _num(total_uncon), "元/年")
            _kv("因约束多付的费用", _num(res["extra_cost_due_to_constraint"]), "元/年",
                f"（+{_pct(res['extra_cost_due_to_constraint'] / total_uncon)}）")
        print("\n  ▸ 解读：约束把每种的批量都「压小」了，费用随之上升；λ* 就是"
              "\n    该资源的影子价格——资源上限每放宽 1 个单位，总费用可下降 λ* 元。"
              "\n    若 λ* = 0，说明资源还有富余，约束不构成瓶颈，不必重新分配。")

    return res


# ==============================================================================
# 模型 7  动态需求模型（时变需求 / 动态批量问题）
# ==============================================================================

def dynamic_lot_sizing(demands, c1, c3, initial_inventory=0.0,
                       method: str = "all", verbose: bool = True) -> dict:
    """
    【模型 7】动态需求模型（时变需求下的动态批量问题 / 动态经济批量）

    教材对应：徐玖平《运筹学（第四版）》9.7* 动态需求模型（p.301，* 为选讲）
              9.7.1 动态规划法（p.303）  -> method='dp'（Wagner-Whitin 精确解法）
              9.7.2 启发式算法（p.305）  -> method='silver_meal' / 'ppb'
      ⚠ 教材 9.7 正文受 DRM 保护、未能获取，因此「教材具体用的是哪一种启发式
        算法、停则怎么写」属于【未核实】。本函数实现的是该问题的标准通用解法：
          · Wagner-Whitin 动态规划（精确最优）
          · Silver-Meal 最小平均费用法
          · 部分期间平衡法（PPB）
        三者的停则都写在代码注释里，便于与你教材的写法逐条对照。

    ---------------- 模型假设 ----------------
    (1) 需求不再均匀，而是逐期给定 d_1, d_2, …, d_T（时变需求）；
    (2) 计划期只有 T 期；期末不留存（期后无需求，故期末库存必为 0）；
    (3) 瞬时到货（提前期为零），本期订货本期可用；
    (4) 不允许缺货；
    (5) 每次订货费 c3、单位物品单位时期存贮费 c1 已知（c3 可逐期不同）；
    (6) 无数量折扣、无订货量上下限。

    ---------------- 参数 ----------------
    demands : list[float]  各期需求量 d_1..d_T（件/期），T = len(demands)
    c1      : float        单位物品单位时期存贮费（元/件·期）
    c3      : float | list 每次订货费（元/次）。给 list 表示逐期不同（长度须 = T）
    initial_inventory : float  期初库存 I0（件），默认 0。
                           按 MRP 净需求法从最早各期需求起依次抵扣：I0 先满足第 1 期，
                           剩余再满足第 2 期……（不计 I0 自身存贮费，它是已发生的存量）
    method  : str          'dp' | 'silver_meal' | 'ppb' | 'all'（默认 'all'）
                           控制【报告展示哪些算法】。三者计算量都极小（O(T²)），
                           函数内部总是全部算出并放进返回值，method 只影响打印。

    ---------------- 核心公式（Wagner-Whitin 动态规划） ----------------
    记 z(j,t) 为「在第 j 期订一次货、这批货覆盖第 j 到第 t 期全部需求」的费用：
        z(j,t) = c3_j + c1 · Σ_{i=j+1}^{t} (i − j)·d_i
        （第 j 期需求到货即用掉、不计存贮；第 i>j 期的需求要存放 (i−j) 期）
    记 f(t) 为「满足前 t 期需求的最小费用」，则
        f(t) = min_{1 ≤ j ≤ t} { f(j−1) + z(j,t) } ,      f(0) = 0
    最优值 = f(T)；最优订货期由 argmin 回溯得到。

    ★ 零需求区段的特殊处理：若某区段 j..t 内各期净需求【全为 0】，这一段
      根本不需要订货，费用按 0 计（而不是一次订货费 c3）。漏掉这一支会把
      「无需订货」当成「要订一次货」，从而把最优费用算高——这是时变需求模型
      特有的坑（需求均匀的 EOQ 类模型里不存在这种情形）。

    ---------------- 关键性质 ----------------
    ★ 零库存订货性质（zero-inventory ordering property）：
      存在最优解使得「只有上期期末库存为 0 时才订货」，也就是任何一期的需求
      都由唯一一次订货覆盖、计划期被切成若干【连续区段】。这正是 DP 只需枚举
      区段划分（而不是枚举任意订货量）的依据。函数会自检这条性质是否成立。
    ★ 当 c3 逐期相同时，只在净需求 > 0 的期订货；c3 逐期不同时，理论上可能存在
      「提前到订货费便宜的期去订」的解，DP 会自动处理这种情况。

    ---------------- 返回值 ----------------
    dict，含 net_demands、dp（f 表、递推明细、Z 矩阵、最优计划与费用）、
    silver_meal、ppb（各自计划与费用）、gap 对比、zero_inventory_property。
    """
    # ---- 1. 参数校验 ----
    _chk(isinstance(demands, (list, tuple)) and len(demands) > 0,
         "demands 必须是非空的需求序列，例如 [20, 40, 10, 50, 30, 20]。")
    ds = [_nonneg(f"第 {i + 1} 期需求量", v, f"d{i + 1}", "件/期")
          for i, v in enumerate(demands)]
    T = len(ds)
    _chk(T >= 2,
         f"动态需求模型至少要 2 期（当前 {T} 期）。只有 1 期时它退化为模型 1 的"
         f"单批量问题：一次订足即可，没有「何时订」的决策。")
    _chk(T <= 500, f"期数过多（{T} 期）。本实现为 O(T²)，建议 500 期以内。")
    c1 = _pos("单位存贮费", c1, "c1", "元/件·期")
    if isinstance(c3, (list, tuple)):
        _chk(len(c3) == T, f"c3 若给成序列，长度必须等于期数 {T}（当前 {len(c3)}）。")
        ks = [_pos(f"第 {i + 1} 期订货费", v, f"c3_{i + 1}", "元/次")
              for i, v in enumerate(c3)]
    else:
        ks = [_pos("每次订货费", c3, "c3", "元/次")] * T
    i0 = _nonneg("期初库存", initial_inventory, "I0", "件")
    _chk(method in ("dp", "silver_meal", "ppb", "all"),
         f"method 只能是 'dp' / 'silver_meal' / 'ppb' / 'all'，当前收到 {method!r}。")

    # ---- 2. 净需求：期初库存按 MRP 法从最早各期依次抵扣 ----
    net, rest = [], i0
    for d in ds:
        use = min(rest, d)
        rest -= use
        net.append(d - use)
    leftover_i0 = rest

    # ---- 3. Wagner-Whitin 动态规划（精确最优）----
    INF = float("inf")
    pre = [0.0] * (T + 1)                  # pre[i] = 前 i 期净需求之和
    for i in range(1, T + 1):
        pre[i] = pre[i - 1] + net[i - 1]
    Z = [[0.0] * (T + 1) for _ in range(T + 1)]     # Z[j][t]，1-based；j==t 即只覆盖本期
    for j in range(1, T + 1):
        Z[j][j] = ks[j - 1]
        for t in range(j + 1, T + 1):
            Z[j][t] = Z[j][t - 1] + c1 * (t - j) * net[t - 1]
    f = [0.0] + [INF] * T
    arg = [0] * (T + 1)
    trace = []
    for t in range(1, T + 1):
        best, bj, cands = INF, 0, []
        for j in range(1, t + 1):
            # ★ 区段 j..t 内净需求全为 0 时，这一段不需要订货，费用为 0。
            #   漏掉这一支就会把「无需订货」算成「订一次货」，把最优费用抬高
            #   —— 这正是内部一致性自检（DP 值 vs 按计划重算值）抓到的缺陷。
            if pre[t] - pre[j - 1] <= 1e-12:
                v, zval, fr = f[j - 1], 0.0, True
            else:
                v, zval, fr = f[j - 1] + Z[j][t], Z[j][t], False
            cands.append({"j": j, "f_prev": f[j - 1], "z": zval, "total": v,
                          "free": fr})
            if v < best - 1e-12:
                best, bj = v, j
        f[t], arg[t] = best, bj
        trace.append({"t": t, "candidates": cands, "f": best, "arg": bj})

    # 回溯：从 T 往前找出每一段的起点
    dp_blocks, tt = [], T
    while tt >= 1:
        j = arg[tt]
        dp_blocks.append((j, tt))
        tt = j - 1
    dp_blocks.reverse()

    def plan_of(blocks):
        """由区段划分构造逐期订货量与期末库存，并【独立重算】费用（不引用 Z 矩阵）。"""
        Qv = [0.0] * (T + 1)
        for (j, t2) in blocks:
            Qv[j] = sum(net[j - 1:t2])
        Iv = [0.0] * (T + 1)
        run = 0.0
        for i in range(1, T + 1):
            run += Qv[i] - net[i - 1]
            _chk(run >= -1e-9,
                 f"计划在第 {i} 期出现负库存，说明区段划分有误（内部错误）。")
            Iv[i] = max(run, 0.0)
        setup = sum(ks[i - 1] for i in range(1, T + 1) if Qv[i] > 1e-12)
        # 期末库存 I_i 是被"持有到下一期"的量，故存贮费按 I_1..I_{T-1} 计（I_T 必为 0）
        hold = c1 * sum(Iv[1:T])
        return {"blocks": blocks, "Q": Qv, "I": Iv,
                "cost_setup": setup, "cost_holding": hold,
                "cost_total": setup + hold,
                "orders": [i for i in range(1, T + 1) if Qv[i] > 1e-12]}

    def silver_meal_blocks():
        """
        Silver-Meal 最小平均费用法（停则：平均费用首次不再下降即停）。
            ACC(j,t) = [ c3_j + c1·Σ_{i=j+1}^{t}(i−j)d_i ] / (t − j + 1)
        从每个订货期 j 出发，逐期延长覆盖范围 t，取使 ACC 最小的 t。
        """
        out, j = [], 1
        while j <= T:
            if net[j - 1] <= 1e-12:          # 净需求为 0，不必在此订货
                j += 1
                continue
            K = ks[j - 1]
            H, best_t, best_acr = 0.0, j, K  # 只覆盖本期时，平均费用 = c3
            steps = [{"t": j, "H": 0.0, "acr": K, "take": True}]
            for t in range(j + 1, T + 1):
                H += c1 * (t - j) * net[t - 1]
                acr = (K + H) / (t - j + 1)
                take = acr < best_acr - 1e-12
                steps.append({"t": t, "H": H, "acr": acr, "take": take})
                if take:
                    best_acr, best_t = acr, t
                else:
                    break
            out.append({"j": j, "t": best_t, "steps": steps})
            j = best_t + 1
        return out

    def ppb_blocks():
        """
        部分期间平衡法 PPB（停则：累计存贮费 ≤ 一次订货费则继续延长覆盖）。
        含义：为省下一张订货单而多付的存贮费，一旦超过一次订货费就不划算了。
        """
        out, j = [], 1
        while j <= T:
            if net[j - 1] <= 1e-12:
                j += 1
                continue
            K = ks[j - 1]
            H, end = 0.0, j
            steps = [{"t": j, "acc": 0.0, "inc": 0.0, "take": True}]
            for t in range(j + 1, T + 1):
                inc = c1 * (t - j) * net[t - 1]
                if H + inc <= K + 1e-12:
                    H += inc
                    end = t
                    steps.append({"t": t, "acc": H, "inc": inc, "take": True})
                else:
                    steps.append({"t": t, "acc": H, "inc": inc, "take": False})
                    break
            out.append({"j": j, "t": end, "steps": steps})
            j = end + 1
        return out

    dp_plan = plan_of(dp_blocks)
    # 内部一致性：按计划逐期重算的费用，必须等于 DP 递推出来的 f(T)
    _chk(abs(dp_plan["cost_total"] - f[T]) <= 1e-7 * max(1.0, f[T]),
         f"内部不一致：DP 递推得 f(T) = {f[T]:g}，按计划重算得 "
         f"{dp_plan['cost_total']:g}，差值超出容差。")

    sm_raw = silver_meal_blocks()
    sm_plan = plan_of([(b["j"], b["t"]) for b in sm_raw])
    ppb_raw = ppb_blocks()
    ppb_plan = plan_of([(b["j"], b["t"]) for b in ppb_raw])

    # ---- 零库存订货性质自检 ----
    zio_ok = all(dp_plan["I"][j - 1] <= 1e-9 for (j, _t) in dp_blocks if j > 1)

    _opt = dp_plan["cost_total"]

    def _gap_pct(cost):
        """相对最优解的超出比例；最优费用为 0（全部需求为 0）时按 0 处理。"""
        return (cost - _opt) / _opt if _opt > 0 else 0.0

    res = {
        "model": "模型7 动态需求模型（时变需求 / 动态批量问题）",
        "params": {"demands": ds, "c1": c1, "c3": ks, "initial_inventory": i0},
        "T": T,
        "net_demands": net,
        "leftover_initial_inventory": leftover_i0,
        "dp": {"f": f, "arg": arg, "trace": trace, "Z": Z,
               "blocks": dp_blocks, "plan": dp_plan, "cost": dp_plan["cost_total"]},
        "silver_meal": {"blocks": [(b["j"], b["t"]) for b in sm_raw],
                        "detail": sm_raw, "plan": sm_plan,
                        "cost": sm_plan["cost_total"],
                        "gap_vs_optimal": sm_plan["cost_total"] - _opt,
                        "gap_pct": _gap_pct(sm_plan["cost_total"])},
        "ppb": {"blocks": [(b["j"], b["t"]) for b in ppb_raw],
                "detail": ppb_raw, "plan": ppb_plan,
                "cost": ppb_plan["cost_total"],
                "gap_vs_optimal": ppb_plan["cost_total"] - _opt,
                "gap_pct": _gap_pct(ppb_plan["cost_total"])},
        "zero_inventory_property": zio_ok,
        "optimal_cost": dp_plan["cost_total"],
        "order_times": len(dp_blocks),
    }

    if verbose:
        _title("模型 7  动态需求模型（时变需求 / 动态批量问题）")
        print("  假设：需求逐期给定且已知 · 瞬时到货 · 不允许缺货 · 期末不留存")
        print("        订货提前期为 0 · 无数量折扣与批量限制")
        _sec("已知参数")
        _kv("计划期数 T", T, "期")
        _kv("单位存贮费 c1", _num(c1), "元/件·期")
        if len(set(ks)) == 1:
            _kv("每次订货费 c3", _num(ks[0]), "元/次", "（各期相同）")
        else:
            _kv("每次订货费 c3", "逐期不同", "", "见下表")
        _kv("期初库存 I0", _num(i0), "件",
            "" if i0 == 0 else f"（抵完需求后还余 {_num(leftover_i0)} 件）")

        _sec("第一步：逐期需求与净需求（期初库存按 MRP 法从最早各期依次抵扣）")
        print(f"  {'期 t':>5}{'需求 d_t':>12}{'净需求':>12}   说明")
        print("  " + "-" * (_W - 4))
        for i in range(1, T + 1):
            note = ""
            covered = ds[i - 1] - net[i - 1]
            if covered > 1e-12:
                note = f"期初库存抵扣 {_num(covered)}"
            elif net[i - 1] <= 1e-12:
                note = "净需求为 0"
            if len(set(ks)) > 1:
                note = (note + "  " if note else "") + f"c3_{i}={_num(ks[i - 1])}"
            print(f"  {i:>5}{_num(ds[i - 1]):>12}{_num(net[i - 1]):>12}   {note}")

        if T <= 12:
            _sec("第二步：覆盖费用矩阵 z(j,t) = c3 + c1·Σ_{i>j}(i−j)·d_i")
            print("            " + "".join(f"{('t=' + str(t2)):>11}" for t2 in range(1, T + 1)))
            for j in range(1, T + 1):
                row = "".join(f"{_num(Z[j][t2]):>11}" if t2 >= j else f"{'—':>11}"
                              for t2 in range(1, T + 1))
                print(f"  订于 j={j:<3}" + row)
            print("\n  读法：z(j,t) = 第 j 期订一次货、这批货覆盖第 j…t 期需求的全部费用")
            print("        （含一次订货费 + 第 j+1…t 期货物各自的存贮费）")

        _sec("第三步：动态规划递推  f(t) = min_j { f(j−1) + z(j,t) }")
        if T <= 10:
            for rec in trace:
                items = []
                for c in rec["candidates"]:
                    body = (f"j={c['j']}: {_num(c['f_prev'], 3)}+0"
                            f"={_num(c['total'], 3)}（本段无净需求，免订货）"
                            if c["free"] else
                            f"j={c['j']}: {_num(c['f_prev'], 3)}+{_num(c['z'], 3)}"
                            f"={_num(c['total'], 3)}")
                    items.append(("[ " if c["j"] == rec["arg"] else "  ")
                                 + body + (" ]" if c["j"] == rec["arg"] else "  "))
                print(f"  t={rec['t']:>2}" + "".join(items))
                print(f"        └─ f({rec['t']}) = {_num(rec['f'])}，取 j* = {rec['arg']}"
                      f"（即第 {rec['arg']} 期订货覆盖到第 {rec['t']} 期）")
        print(f"\n  {'t':>4}{'f(t)':>14}{'最优 j*':>10}")
        print("  " + "-" * (_W - 4))
        idxs = (list(range(T)) if T <= 14
                else list(range(7)) + [None] + list(range(T - 7, T)))
        for k in idxs:
            if k is None:
                print("   …")
                continue
            rec = trace[k]
            print(f"  {rec['t']:>4}{_num(rec['f']):>14}{rec['arg']:>10}")
        _kv("最优总费用 f(T)", _num(f[T]), "元", f"（= f({T})）")

        _sec("第四步：最优订货计划（回溯 argmin 得到各区段）")
        print("  订货区段：" + "；".join(
            f"第 {j} 期订一次覆盖第 {j}…{t2} 期" for (j, t2) in dp_blocks))
        print()
        print(f"  {'期 t':>5}{'需求':>10}{'净需求':>10}{'本期订货 Q_t':>15}"
              f"{'期末库存 I_t':>15}   说明")
        print("  " + "-" * (_W - 4))
        for i in range(1, T + 1):
            note = ""
            if dp_plan["Q"][i] > 1e-12:
                for (j, t2) in dp_blocks:
                    if j == i:
                        note = f"← 本期订货 {_num(dp_plan['Q'][i])} 件，覆盖第 {j}…{t2} 期"
            print(f"  {i:>5}{_num(ds[i - 1]):>10}{_num(net[i - 1]):>10}"
                  f"{_num(dp_plan['Q'][i]):>15}{_num(dp_plan['I'][i]):>15}   {note}")

        _sec("费用构成（按计划逐期独立重算，与 DP 递推互为核对）")
        _kv("订货费合计", _num(dp_plan["cost_setup"]), "元",
            f"（共订货 {len(dp_blocks)} 次）")
        _kv("存贮费合计", _num(dp_plan["cost_holding"]), "元",
            f"（= c1 × Σ期末库存 = {_num(c1)} × "
            f"{_num(sum(dp_plan['I'][1:T]))}）")
        _kv("总费用", _num(dp_plan["cost_total"]), "元")
        _kv("与 DP 递推值 f(T) 核对",
            "✓ 完全一致" if abs(dp_plan["cost_total"] - f[T]) < 1e-9 else "✗ 不一致", "")
        _kv("零库存订货性质",
            "✓ 成立（每次订货时上期期末库存均为 0）" if zio_ok else "✗ 未成立", "")

        if method != "dp":
            _sec("第五步：启发式算法（逐期判断过程）")

        if method in ("silver_meal", "all"):
            print("  【Silver-Meal 最小平均费用法】")
            print("    停则：ACC(j,t) =(c3 + 累计存贮费)/(覆盖期数)，首次不再下降即停。")
            for b in sm_raw:
                seg = "  ".join(
                    f"t={s['t']}: ACC={_num(s['acr'], 4)}{'✓' if s['take'] else ' ✗停'}"
                    for s in b["steps"])
                print(f"    j={b['j']} → {seg}")
            print(f"    ⇒ 订货期 {[b['j'] for b in sm_raw]}，"
                  f"总费用 {_num(sm_plan['cost_total'])} 元"
                  f"（{('最优' if sm_plan['cost_total'] <= dp_plan['cost_total'] + 1e-9 else '高于最优 ' + _num(sm_plan['cost_total'] - dp_plan['cost_total']) + ' 元')}）")

        if method in ("ppb", "all"):
            print("\n  【部分期间平衡法 PPB】")
            print("    停则：累计存贮费 ≤ 一次订货费就继续延长覆盖（超过则不划算）。")
            for b in ppb_raw:
                seg = "  ".join(
                    f"t={s['t']}: 累计存贮费={_num(s['acc'])}"
                    f"{'✓' if s['take'] else ' ✗停'}"
                    for s in b["steps"])
                print(f"    j={b['j']} → {seg}")
            print(f"    ⇒ 订货期 {[b['j'] for b in ppb_raw]}，"
                  f"总费用 {_num(ppb_plan['cost_total'])} 元"
                  f"（{('最优' if ppb_plan['cost_total'] <= dp_plan['cost_total'] + 1e-9 else '高于最优 ' + _num(ppb_plan['cost_total'] - dp_plan['cost_total']) + ' 元')}）")

        if method == "all":
            _sec("第六步：三种方法对照")
            print(f"  {'方法':<24}{'订货期':<22}{'次数':>6}{'总费用':>13}{'高于最优':>16}")
            print("  " + "-" * (_W - 4))
            for nm, pl, blk in (("动态规划（精确最优）", dp_plan, dp_blocks),
                                ("Silver-Meal 启发式", sm_plan,
                                 [(b["j"], b["t"]) for b in sm_raw]),
                                ("部分期间平衡 PPB", ppb_plan,
                                 [(b["j"], b["t"]) for b in ppb_raw])):
                gap = "—"
                if not nm.startswith("动态规划"):
                    if pl["cost_total"] <= dp_plan["cost_total"] + 1e-9:
                        gap = "0（即最优）"
                    else:
                        gap = (f"+{_num(pl['cost_total'] - dp_plan['cost_total'])}"
                               f"（+{_pct(_gap_pct(pl['cost_total']))}）")
                print(f"  {nm:<24}{str([b[0] for b in blk]):<22}"
                      f"{len(blk):>6}{_num(pl['cost_total']):>13}{gap:>16}")

        print("\n  ▸ 解读：动态需求与前面模型的根本差别是需求不再均匀，")
        print("            「订几次」和「每次订多少」变成两个互相耦合的决策，")
        print("            不存在 EOQ 那样的单点闭式公式，必须逐期决策。")
        print("            动态规划把它化成【区段划分】：f(t) 枚举「最后一段从哪期")
        print("            开始覆盖」（j = 1…t），取费用最小者，复杂度 O(T²)。")
        print("            之所以只需枚举区段，是因为零库存性质保证了「一期需求只由")
        print("            一次订货覆盖」，不必枚举任意订货量——这是 DP 正确的根据。")
        if method == "all" and (sm_plan["cost_total"] > dp_plan["cost_total"] + 1e-9
                                or ppb_plan["cost_total"] > dp_plan["cost_total"] + 1e-9):
            print("            启发式算得快但可能不是最优（见上表差值）；")
            print("            考试里若要求最优，必须用动态规划。")

    return res


# ==============================================================================
# 教材经典算例演示
# ==============================================================================

def run_examples() -> None:
    """依次运行 6 个模型的经典算例，直接打印完整计算过程。"""

    print("\n" + "█" * _W)
    print("█  运筹学 · 存贮论 6 类核心模型 —— 经典算例演示")
    print("█  每个算例均可在 verify_inventory.py 中找到独立数值对拍验证")
    print("█" * _W)

    # ---- 例 1 ----
    print("\n\n【例 1】EOQ：某厂年需某材料 D = 10000 件，每次订货费 c3 = 200 元，")
    print("        单位存贮费 c1 = 4 元/(件·年)，单价 K = 10 元/件。求最优订货策略。")
    eoq_basic(D=10000, c1=4, c3=200, K=10)

    # ---- 例 2 ----
    print("\n\n【例 2】EPQ：某厂自制某零件，年需 D = 10000 件（按 d = 40 件/天计，")
    print("        一年 250 个工作日），生产率 p = 100 件/天，每次生产准备费")
    print("        c3 = 200 元，单位存贮费 c1 = 4 元/(件·年)。求最优生产批量。")
    epq_production(D=10000, d=40, p=100, c1=4, c3=200)

    # ---- 例 3 ----
    print("\n\n【例 3】允许缺货：参数同例 1，但允许缺货，单位缺货损失费")
    print("        c2 = 2 元/(件·年)。求最优订货批量与最大缺货量。")
    eoq_shortage(D=10000, c1=4, c2=2, c3=200, K=10)

    # ---- 例 4a ----
    print("\n\n【例 4a】报童（离散）：某商品每售出一件获利 k = 5 元，滞销一件损失")
    print("         h = 2 元。需求量 r 的分布为 100(0.1)、200(0.2)、300(0.3)、")
    print("         400(0.2)、500(0.2)。求最优进货量。")
    newsvendor(k=5, h=2, kind="discrete",
               values=[100, 200, 300, 400, 500],
               probs=[0.1, 0.2, 0.3, 0.2, 0.2])

    # ---- 例 4b ----
    print("\n\n【例 4b】报童（正态）：同上 k = 5、h = 2，但需求 r ~ N(300, 50²)。")
    newsvendor(k=5, h=2, kind="normal", mu=300, sigma=50)

    # ---- 例 5 ----
    print("\n\n【例 5】批量折扣：年需求 D = 5000 件，每次订货费 c3 = 100 元，")
    print("        存贮费率为单价的 20%。供应商阶梯报价：")
    print("        0≤Q<500：10 元；500≤Q<1000：9.5 元；1000≤Q<2000：9 元；Q≥2000：8.5 元。")
    quantity_discount(D=5000, c3=100,
                      breaks=[(0, 10.0), (500, 9.5), (1000, 9.0), (2000, 8.5)],
                      holding_rate=0.2)

    # ---- 例 6 ----
    print("\n\n【例 6】多产品资源约束：A、B 两种物资，参数如下表；受总资金")
    print("        W = 15000 元 限制。求各物资最优订货批量。")
    multiproduct_constrained(
        items=[
            {"name": "A", "D": 10000, "c1": 4, "c3": 200, "K": 10, "v": 0.5},
            {"name": "B", "D": 5000, "c1": 3, "c3": 150, "K": 15, "v": 1.0},
        ],
        constraint="capital", limit=15000)

    # ---- 例 6b：库容约束 ----
    print("\n\n【例 6b】同 A、B，但改为总库容约束 V = 900 m³")
    print("        （A 每件占 0.5 m³，B 每件占 1.0 m³）。")
    multiproduct_constrained(
        items=[
            {"name": "A", "D": 10000, "c1": 4, "c3": 200, "K": 10, "v": 0.5},
            {"name": "B", "D": 5000, "c1": 3, "c3": 150, "K": 15, "v": 1.0},
        ],
        constraint="volume", limit=900)

    # ---- 例 7 ----
    print("\n\n【例 7】动态需求：某物料未来 6 期的需求为 20、40、10、50、30、20 件，")
    print("        单位存贮费 c1 = 1 元/(件·期)，每次订货费 c3 = 50 元/次。")
    print("        （需求逐期不等，EOQ 那套闭式公式不再适用，必须逐期决策；")
    print("          本例还会显示两种启发式都不如动态规划，故考试要求最优必须用 DP。）")
    dynamic_lot_sizing(demands=[20, 40, 10, 50, 30, 20], c1=1, c3=50)

    # ---- 异常参数演示 ----
    _sec("附：参数校验演示（异常输入会给出友好中文提示）")
    for desc, fn in [
        ("负需求", lambda: eoq_basic(D=-100, c1=4, c3=200)),
        ("零存贮费", lambda: eoq_basic(D=10000, c1=0, c3=200)),
        ("生产率为 0（p ≤ d 无法补库）", lambda: epq_production(D=10000, d=40, p=40, c1=4, c3=200)),
        ("概率和 ≠ 1", lambda: newsvendor(k=5, h=2, kind="discrete",
                                          values=[1, 2], probs=[0.3, 0.3])),
        ("价格档位递增（不符合折扣前提）", lambda: quantity_discount(
            D=5000, c3=100, breaks=[(0, 10.0), (500, 12.0)], holding_rate=0.2)),
        ("约束不可行（上限过低）", lambda: multiproduct_constrained(
            items=[{"name": "A", "D": 10000, "c1": 4, "c3": 200, "K": 10},
                   {"name": "B", "D": 5000, "c1": 3, "c3": 150, "K": 15}],
            constraint="capital", limit=5000, min_order=[500, 400])),
    ]:
        try:
            fn()
            print(f"  {desc}：未报错（⚠ 预期应报错）")
        except InventoryError as e:
            print(f"  {desc}：✓ 已拦截 -> {e}")


if __name__ == "__main__":
    run_examples()
