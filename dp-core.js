/* =========================================================================
   动态规划（教材第 5 章）
   -------------------------------------------------------------------------
   教材里五花八门的动态规划问题，拆开看都是同一套东西：

     阶段 k        把过程按时间或空间分成 n 段，k = 1, 2, …, n
     状态 s_k      第 k 段开始时过程所处的状况
     决策 u_k      在第 k 段、状态 s_k 下可以做的选择
     状态转移       s_{k+1} = T_k(s_k, u_k)
     阶段指标       v_k(s_k, u_k) —— 这一段单独贡献的收益或费用
     最优值函数     f_k(s_k)      —— 从第 k 段的 s_k 出发，走完全过程的最优总指标

   逆序解法（教材 5.4.1，主用）——从最后一段往前推：
       f_k(s_k) = opt_{u_k} { v_k(s_k, u_k) + f_{k+1}( T_k(s_k, u_k) ) }
       f_{n+1} 由边界条件给定（最短路线里就是「终点到终点为 0」）

   顺序解法（教材 5.4.2，带 *）——从第一段往后推：
       f_k(s_{k+1}) = opt_{u_k} { v_k(s_k, u_k) + f_{k-1}( s_k ) }
       其中 s_k 是所有「经过决策 u_k 能到达 s_{k+1}」的那些状态

   本文件把上面这些抽象成 dpSolve(model)，各具体题型只负责把自己的
   状态集、决策集、状态转移、阶段指标填进去（见下面五个 model 构造器）。
   ========================================================================= */
'use strict';

/* Node 下用 fmtNum 保持与其它模块一致的分数显示；浏览器里是全局函数 */
if (typeof module !== 'undefined' && module.exports) {
  var _sx2 = require('./simplex-core.js');
  var fmtNum = _sx2.fmtNum;
}

var DP_EPS = 1e-9;

/* =========================================================================
   1. 通用求解引擎
   -------------------------------------------------------------------------
   model 需要提供：
     n                    阶段数
     sense                'max' | 'min'
     stateKeys(k)         第 k 阶段所有可能状态的 key（k = 1..n+1，n+1 段是终点层）
     stateLabel(k, key)   状态在表格里怎么显示
     decisionKeys(k, key) 该状态下所有可行决策的 key
     decisionLabel(k, key, dKey)
     next(k, key, dKey)   状态转移函数；返回下一阶段的状态 key
     payoff(k, key, dKey) 阶段指标 v_k(s_k, u_k)
     terminal()           逆序解法的边界 f_{n+1}，形如 { key: 值 }
     startKey()           起始状态（逆序解法报答案用），默认取 stateKeys(1) 的第一个
     meta                 题型的说明（阶段叫什么、状态叫什么、决策叫什么）
   ========================================================================= */
function dpSolve(model) {
  var n = model.n;
  var sense = model.sense === 'max' ? 'max' : 'min';
  var better = (sense === 'max')
    ? function (a, b) { return a > b + DP_EPS; }
    : function (a, b) { return a < b - DP_EPS; };

  var backward = dpBackward(model, n, better);
  var forward = dpForward(model, n, better);

  return {
    ok: true, n: n, sense: sense, meta: model.meta,
    backward: backward, forward: forward
  };
}

/* ---- 逆序解法：f_k(s) = opt{ v_k(s,u) + f_{k+1}(T_k(s,u)) } ---- */
function dpBackward(model, n, better) {
  var f = [], u = [], cells = [];

  /* 边界：f_{n+1} 由 terminal() 给（没给的格子视为不可达） */
  f[n + 1] = model.terminal() || {};

  for (var k = n; k >= 1; k--) {
    f[k] = {}; u[k] = {};
    var keys = model.stateKeys(k);
    var list = [];

    for (var i = 0; i < keys.length; i++) {
      var s = keys[i];
      var ds = model.decisionKeys(k, s);
      var cases = [], bestVal = null, bestD = null, alts = [];

      for (var t = 0; t < ds.length; t++) {
        var d = ds[t];
        var nx = model.next(k, s, d);
        var v = model.payoff(k, s, d);
        var fNext = (nx !== null && f[k + 1][nx] !== undefined) ? f[k + 1][nx] : null;
        var total = (fNext === null || v === null) ? null : v + fNext;
        cases.push({
          d: d, dLabel: model.decisionLabel(k, s, d),
          v: v, next: nx, nextLabel: nx === null ? '—' : model.stateLabel(k + 1, nx),
          fNext: fNext, total: total, reachable: total !== null
        });
        if (total !== null && (bestVal === null || better(total, bestVal))) {
          bestVal = total; bestD = d; alts = [d];
        } else if (total !== null && Math.abs(total - bestVal) < DP_EPS) {
          alts.push(d);
        }
      }

      f[k][s] = bestVal; u[k][s] = bestD;
      list.push({
        key: s, label: model.stateLabel(k, s),
        best: bestVal, bestD: bestD,
        bestDLabel: bestD === null ? '—' : model.decisionLabel(k, s, bestD),
        alts: alts,
        cases: cases
      });
    }
    cells.push({ k: k, states: list });
  }
  cells.reverse();                                  // 让 k 从小到大排

  /* 回溯最优策略：从起始状态顺着每阶段的 u* 走 */
  var start = model.startKey ? model.startKey() : model.stateKeys(1)[0];
  var policy = [], cur = start, total = f[1][start];
  for (var kk = 1; kk <= model.n; kk++) {
    var d2 = u[kk][cur];
    if (d2 === null || d2 === undefined) break;
    var nx2 = model.next(kk, cur, d2);
    policy.push({
      k: kk, s: cur, sLabel: model.stateLabel(kk, cur),
      d: d2, dLabel: model.decisionLabel(kk, cur, d2),
      v: model.payoff(kk, cur, d2),
      nextLabel: nx2 === null ? '—' : model.stateLabel(kk + 1, nx2)
    });
    cur = nx2;
  }

  return {
    mode: 'backward', modeName: '逆序解法',
    f: f, u: u, cells: cells,
    start: start, startLabel: model.stateLabel(1, start),
    end: model.stateKeys(model.n + 1)[0],
    value: total, policy: policy
  };
}

/* ---- 顺序解法：f_k(s_{k+1}) = opt{ v_k(s_k,u_k) + f_{k-1}(s_k) } ----
   注意它的「阶段 k 的最优值函数」是挂在**下一阶段的状态**上的
   —— 这正是顺序解法与逆序解法在写法上最容易被绕晕的地方。 */
function dpForward(model, n, better) {
  var f = [], cells = [];
  f[0] = {};
  /* 边界只给「初始状态」——顺序解法是从起点往后推的。
     把 stateKeys(1) 里所有状态都置 0 是错的：那等于允许从任意资源量出发，
     会把不同起点的值混进同一格（资源分配、背包这类问题的状态就是资源量，
     一混就整体偏大）。 */
  var startKeys = model.startKeys
    ? model.startKeys()
    : [model.startKey ? model.startKey() : model.stateKeys(1)[0]];
  for (var q = 0; q < startKeys.length; q++) f[0][startKeys[q]] = 0;

  for (var k = 1; k <= n; k++) {
    f[k] = {};
    var backTo = {};                                  // 记录这一格是从哪个 (状态, 决策) 来的
    var keys = model.stateKeys(k);

    for (var i = 0; i < keys.length; i++) {
      var s = keys[i];
      if (f[k - 1][s] === undefined) continue;        // 这个状态本身还没被到达过
      var ds = model.decisionKeys(k, s);
      for (var t = 0; t < ds.length; t++) {
        var d = ds[t];
        var nx = model.next(k, s, d);
        var v = model.payoff(k, s, d);
        if (v === null || nx === null) continue;
        var total = v + f[k - 1][s];
        if (f[k][nx] === undefined || better(total, f[k][nx])) {
          f[k][nx] = total;
          backTo[nx] = { s: s, d: d, v: v, prev: f[k - 1][s] };
        }
      }
    }

    /* 只把「这一阶段真的能到达的状态」排进表里，避免罗列一堆死格子 */
    var list = [];
    var nk = model.stateKeys(k + 1);
    for (var j = 0; j < nk.length; j++) {
      var key = nk[j];
      if (f[k][key] === undefined) continue;
      var bt = backTo[key];
      list.push({
        key: key, label: model.stateLabel(k + 1, key),
        best: f[k][key],
        bestD: bt ? bt.d : null,
        bestDLabel: bt ? model.decisionLabel(k, bt.s, bt.d) : '—',
        from: bt ? bt.s : null,
        fromLabel: bt ? model.stateLabel(k, bt.s) : '—',
        v: bt ? bt.v : null,
        prev: bt ? bt.prev : null
      });
    }
    cells.push({ k: k, states: list });
  }

  /* 终值要在**所有合法的终端状态**上取最优，而不是随手取第一个。
     哪些终端合法由 terminal() 说了算：
       资源分配（允许剩余）/ 背包 / 设备更新 → 终端全合法，于是取 max；
       生产与存储 / 资源分配（要求用尽）   → 只有 f_{n+1}(0) 合法。
     顺手漏掉这一步的话，「要求用尽」这种约束在顺序解法里就会失效。 */
  var term = model.terminal() || {};
  var endKeys = model.stateKeys(n + 1).filter(function (x) {
    return f[n][x] !== undefined && term[x] !== undefined;
  });
  var end = null, value = null;
  for (var z = 0; z < endKeys.length; z++) {
    var v2 = f[n][endKeys[z]];
    if (value === null || better(v2, value)) { value = v2; end = endKeys[z]; }
  }

  /* 回溯：从终点顺着 backTo 往回走 */
  var policy = [], cur = end;
  for (var kk = n; kk >= 1; kk--) {
    var cell = null, listK = cells[kk - 1].states;
    for (var z2 = 0; z2 < listK.length; z2++) if (listK[z2].key === cur) cell = listK[z2];
    if (!cell || cell.from === null) break;
    policy.unshift({
      k: kk, s: cell.from, sLabel: cell.fromLabel,
      d: cell.bestD, dLabel: cell.bestDLabel,
      v: cell.v, nextLabel: cell.label
    });
    cur = cell.from;
  }

  return {
    mode: 'forward', modeName: '顺序解法',
    f: f, cells: cells,
    start: startKeys[0], startLabel: model.stateLabel(1, startKeys[0]),
    end: end, endLabel: end === null ? '—' : model.stateLabel(n + 1, end),
    value: value, policy: policy
  };
}

/* =========================================================================
   2. 题型① 最短路线问题（分层网络上的最短路）
   -------------------------------------------------------------------------
   设网络分成若干层：第 0 层是起点层，最后一层是终点层，弧只连接相邻两层。
   阶段 k  = 第 k 次前进（从第 k-1 层走到第 k 层），k = 1..n
   状态 s_k = 前进前所在的节点（第 k-1 层的节点）
   决策 u_k = 接下来走去第 k 层的哪个节点
   状态转移：s_{k+1} = u_k
   阶段指标：v_k(s_k, u_k) = 弧长 d(s_k, u_k)
   边界    ：f_{n+1}(终点) = 0
   -------------------------------------------------------------------------
   input.layers = [[节点名…], …]      从起点层到终点层的节点名
   input.w      = [ 二维数组, … ]     第 i 项是「第 i 层 → 第 i+1 层」的弧长表
                                       w[i][r][c] 取 null 表示这两个节点之间没有弧
   ========================================================================= */
function dpShortest(input) {
  var layers = input.layers, w = input.w;
  var L = layers.length;
  var n = L - 1;
  var idxOf = [];
  for (var i = 0; i < L; i++) {
    idxOf[i] = {};
    for (var j = 0; j < layers[i].length; j++) idxOf[i][layers[i][j]] = j;
  }
  var weightOf = function (layer, from, to) {
    var r = idxOf[layer][from], c = idxOf[layer + 1][to];
    if (r === undefined || c === undefined) return null;
    var v = w[layer] ? w[layer][r][c] : null;
    return (v === null || v === undefined || v === '') ? null : Number(v);
  };

  return {
    n: n, sense: 'min',
    meta: {
      title: '最短路线问题',
      stageName: '阶段 k（第 k 次前进）',
      stageLabel: function (k) { return '阶段 ' + k + '（第 ' + k + ' 次前进）'; },
      stateName: '状态 s_k（出发前所在节点）',
      decisionName: '决策 u_k（下一点去哪）',
      formula: 'f_k(s_k) = min { d(s_k,u_k) + f_{k+1}(u_k) }　，f_{n+1}(终点) = 0',
      boundary: '终点到终点为 0：f' + (n + 1) + '(终点) = 0'
    },
    stateKeys: function (k) {
      return (k >= 1 && k <= L) ? layers[k - 1].slice() : [];
    },
    stateLabel: function (k, key) { return key; },
    decisionKeys: function (k, key) {
      var out = [];
      var tos = layers[k] || [];
      for (var t = 0; t < tos.length; t++) {
        if (weightOf(k - 1, key, tos[t]) !== null) out.push(tos[t]);
      }
      return out;
    },
    decisionLabel: function (k, key, d) { return '→ ' + d; },
    next: function (k, key, d) { return d; },
    payoff: function (k, key, d) { return weightOf(k - 1, key, d); },
    terminal: function () {
      var last = layers[L - 1], o = {};
      for (var t = 0; t < last.length; t++) o[last[t]] = 0;
      return o;
    },
    startKey: function () { return layers[0][0]; }
  };
}

/* =========================================================================
   3. 题型② 资源分配问题
   -------------------------------------------------------------------------
   把总量为 m 的资源分给 n 个项目，给第 i 个项目分配 x_i 可获收益 g_i(x_i)，
   求总收益最大（允许有剩余则用 Σx ≤ m，要求用尽则用 Σx = m）。

   阶段 k = 第 k 个项目
   状态 s_k = 分给第 k..n 个项目之前**还剩多少资源**
   决策 u_k = 分给第 k 个项目的量
   状态转移：s_{k+1} = s_k − u_k
   阶段指标：v_k = g_k(u_k)
   边界：f_{n+1}(s) = 0（资源分完就结束，剩多少都不再产生收益）
   ========================================================================= */
function dpResource(input) {
  var m = Number(input.total);
  var g = input.g;
  var n = g.length;
  var exhaust = !!input.exhaust;

  return {
    n: n, sense: 'max',
    meta: {
      title: '资源分配问题',
      stageName: '阶段 k（第 k 个项目）',
      stageLabel: function (k) { return '阶段 ' + k + '（第 ' + k + ' 个项目）'; },
      stateName: '状态 s_k（还剩多少资源没分）',
      decisionName: '决策 u_k（分给这个项目多少）',
      formula: 'f_k(s) = max_{0≤u≤s} { g_k(u) + f_{k+1}(s − u) }　，f_{n+1}(s) = 0',
      boundary: exhaust ? '要求资源用完：f' + (n + 1) + '(0) = 0，其余不可行'
                        : '允许有剩余：f' + (n + 1) + '(s) = 0 对一切 s'
    },
    stateKeys: function (k) {
      var out = [];
      for (var s = 0; s <= m; s++) out.push(s);
      return out;
    },
    stateLabel: function (k, key) { return String(key); },
    decisionKeys: function (k, key) {
      var out = [];
      for (var u = 0; u <= key; u++) out.push(u);
      return out;
    },
    decisionLabel: function (k, key, d) { return String(d); },
    next: function (k, key, d) { return key - d; },
    payoff: function (k, key, d) { return Number(g[k - 1][d]); },
    terminal: function () {
      var o = {};
      if (exhaust) o[0] = 0;
      else for (var s = 0; s <= m; s++) o[s] = 0;
      return o;
    },
    startKey: function () { return m; }
  };
}

/* =========================================================================
   4. 题型③ 背包问题（教材 5.6.1）
   -------------------------------------------------------------------------
   背包容量 W，n 种物品，第 i 种重量 w_i、价值 v_i。
   0/1 背包每种最多拿一件；整数背包每种可以拿任意多件。

   阶段 k = 考虑第 k 种物品
   状态 s_k = 背包还剩多少容量
   决策 u_k = 拿几件
   状态转移：s_{k+1} = s_k − w_k·u_k
   阶段指标：v_k = v_k·u_k
   边界：f_{n+1}(s) = 0
   ========================================================================= */
function dpKnapsack(input) {
  var W = Number(input.cap);
  var items = input.items;
  var n = items.length;
  var multi = (input.mode === 'multi');

  return {
    n: n, sense: 'max',
    meta: {
      title: multi ? '背包问题（每种可取多件）' : '背包问题（0/1，每种至多一件）',
      stageName: '阶段 k（第 k 种物品）',
      stageLabel: function (k) { return '阶段 ' + k + '（第 ' + k + ' 种物品）'; },
      stateName: '状态 s_k（背包还剩多少容量）',
      decisionName: '决策 u_k（这种物品拿几件）',
      formula: 'f_k(s) = max_{u} { v_k·u + f_{k+1}(s − w_k·u) }　，f_{n+1}(s) = 0',
      boundary: '装完所有种类就结束：f' + (n + 1) + '(s) = 0'
    },
    stateKeys: function (k) {
      var out = [];
      for (var s = 0; s <= W; s++) out.push(s);
      return out;
    },
    stateLabel: function (k, key) { return String(key); },
    decisionKeys: function (k, key) {
      var it = items[k - 1], out = [];
      if (it.w <= 0) return [0];                       // 重量为 0 的东西不做限制，避免死循环
      var top = Math.floor(key / it.w);
      if (!multi) top = Math.min(top, 1);
      for (var u = 0; u <= top; u++) out.push(u);
      return out;
    },
    decisionLabel: function (k, key, d) {
      var it = items[k - 1];
      return d === 0 ? '不拿' : ('拿 ' + d + ' 件（' + String(it.w) + '×' + d + '）');
    },
    next: function (k, key, d) { return key - items[k - 1].w * d; },
    payoff: function (k, key, d) { return items[k - 1].v * d; },
    terminal: function () {
      var o = {};
      for (var s = 0; s <= W; s++) o[s] = 0;
      return o;
    },
    startKey: function () { return W; }
  };
}

/* =========================================================================
   5. 题型④ 生产与存储问题
   -------------------------------------------------------------------------
   n 个时期，第 k 期需求 d_k。每期决定产量 x_k，产多了进库存、产少了不够卖。
     · 生产费用：开产就有准备费 a，另外每件变动成本 c（不生产则都不计）
     · 存储费用：每件每期 h
   求满足全部需求的最小总费用，且期末库存为 0。

   阶段 k = 第 k 期
   状态 s_k = 期初库存
   决策 u_k = 本期产量
   状态转移：s_{k+1} = s_k + u_k − d_k（必须 ≥ 0，即不能欠货）
   阶段指标：v_k = [u_k>0](a + c·u_k) + h·s_{k+1}
   边界：f_{n+1}(0) = 0，期末库存不为 0 视为不可行
   ========================================================================= */
function dpProdInv(input) {
  var d = input.demands.map(Number);
  var n = d.length;
  var setup = Number(input.setup || 0);        // 准备费
  var unit = Number(input.unit || 0);          // 单位变动成本
  var hold = Number(input.hold || 0);          // 单位存储费
  var initStock = Number(input.initStock || 0); // 期初库存（教材变形①）
  var endStock = Number(input.endStock || 0);   // 期末库存（教材变形②）
  var cap = endStock;
  for (var i = 0; i < n; i++) cap += d[i];     // 库存不可能超过「总需求 + 期末存量」
  var maxProd = input.maxProd ? Number(input.maxProd) : cap;

  var stateKeys = function () {
    var out = [];
    for (var s = 0; s <= cap; s++) out.push(s);
    return out;
  };

  return {
    n: n, sense: 'min',
    meta: {
      title: '生产与存储问题',
      stageName: '阶段 k（第 k 个时期）',
      stageLabel: function (k) { return '阶段 ' + k + '（第 ' + k + ' 个时期）'; },
      stateName: '状态 s_k（期初库存）',
      decisionName: '决策 u_k（本期产量）',
      formula: 'f_k(s) = min_{u} { C(u) + h·(s+u−d_k) + f_{k+1}(s+u−d_k) }　，f_{n+1}(' + endStock + ') = 0',
      boundary: '期末库存必须为 ' + endStock + '：只有 f' + (n + 1) + '(' + endStock + ') = 0 有效'
    },
    stateKeys: function (k) { return stateKeys(); },
    stateLabel: function (k, key) { return String(key); },
    decisionKeys: function (k, key) {
      var out = [], need = d[k - 1];
      var lo = Math.max(0, need - key);            // 至少要补到够本期需求
      var hi = Math.min(maxProd, cap - key + need); // 生产后库存不超过 cap
      for (var u = lo; u <= hi; u++) out.push(u);
      return out;
    },
    decisionLabel: function (k, key, d2) { return d2 === 0 ? '不生产' : ('生产 ' + d2); },
    next: function (k, key, d2) { return key + d2 - d[k - 1]; },
    payoff: function (k, key, d2) {
      var end = key + d2 - d[k - 1];
      var prod = (d2 > 0 ? setup + unit * d2 : 0);
      return prod + hold * end;
    },
    terminal: function () { var o = {}; o[endStock] = 0; return o; },
    startKey: function () { return initStock; }
  };
}

/* =========================================================================
   6. 题型⑤ 设备更新问题
   -------------------------------------------------------------------------
   一台设备要用 n 年，每年年初决定「继续用」还是「换新的」。
     · 役龄为 t 的设备：当年收益 r(t)，维持费 u(t)
     · 换新：付设备价 c，旧设备按役龄折价（残值）s(t) 抵掉一部分
   求 n 年总收益（收益 − 各种费用）最大。

   阶段 k = 第 k 年
   状态 s_k = 年初设备的役龄（0 表示全新）
   决策 u_k = 继续用 / 更新
   状态转移：继续用 → 役龄 +1；更新 → 役龄 1
   阶段指标：继续用 → r(t) − u(t)；更新 → −c + s(t) + r(0) − u(0)
   边界：f_{n+1}(t) = 0（期末不再计残值）
   ========================================================================= */
function dpReplace(input) {
  var years = Number(input.years);
  var price = Number(input.price);
  var salvage = input.salvage.map(Number);
  var income = input.income.map(Number);
  var upkeep = input.upkeep.map(Number);
  var maxAge = income.length - 1;
  var initAge = Number(input.initAge || 0);

  return {
    n: years, sense: 'max',
    meta: {
      title: '设备更新问题',
      stageName: '阶段 k（第 k 年）',
      stageLabel: function (k) { return '阶段 ' + k + '（第 ' + k + ' 年）'; },
      stateName: '状态 s_k（年初设备役龄，0 = 全新）',
      decisionName: '决策 u_k（继续用 / 更新）',
      formula: 'f_k(t) = max{ 继续: r(t)−u(t)+f_{k+1}(t+1)，更新: −c+s(t)+r(0)−u(0)+f_{k+1}(1) }',
      boundary: '期末不再计残值：f' + (years + 1) + '(t) = 0'
    },
    stateKeys: function (k) {
      var out = [];
      for (var t = 0; t <= maxAge; t++) out.push(t);
      return out;
    },
    stateLabel: function (k, key) { return key === 0 ? '0（全新）' : String(key); },
    decisionKeys: function (k, key) {
      var out = [];
      if (key + 1 <= maxAge) out.push('keep');       // 还能继续用
      if (key >= 1) out.push('replace');             // 全新设备没有「更新」可言
      return out;
    },
    decisionLabel: function (k, key, d) { return d === 'keep' ? '继续用' : '更新'; },
    next: function (k, key, d) { return d === 'keep' ? key + 1 : 1; },
    payoff: function (k, key, d) {
      if (d === 'keep') return income[key] - upkeep[key];
      return -price + salvage[key] + income[0] - upkeep[0];
    },
    terminal: function () {
      var o = {};
      for (var t = 0; t <= maxAge; t++) o[t] = 0;
      return o;
    },
    startKey: function () { return initAge; }
  };
}

/* 兼容 Node / 浏览器 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    dpSolve: dpSolve,
    dpShortest: dpShortest,
    dpResource: dpResource,
    dpKnapsack: dpKnapsack,
    dpProdInv: dpProdInv,
    dpReplace: dpReplace
  };
}
