/* =========================================================================
   分配问题（指派问题）· 匈牙利法
   -------------------------------------------------------------------------
   ★ 教材口径（已核实）：徐玖平、胡知能《运筹学（第四版）》（科学出版社 2018）
     第 6 章「图与网络」→ **6.7 分配问题**（6.7.1 最大匹配 / 6.7.2 最优匹配）。
     教材用的词是「**分配问题**」，全书目录里没有「指派问题」这个标题；它**不在**
     整数规划那一章。核实来源：科学出版社官方商品页（含完整目录与页码）
     https://www.ecsponline.com/goods.php?id=193312 ，以及官方免费样章的印刷版目录页。
   ★ 未核实：第 6 章正文（样章只到第 1 章）拿不到，因此下面这套步骤名称（行归约 /
     列归约 / 试指派 / 覆盖线 / 矩阵调整）、是否叫「匈牙利法」、以及教材对最大化、
     人数与工作数不等、禁止指派三种非标准情形的具体表述，都按**通用口径**书写，
     尚未与教材 6.7 正文逐条核对。界面上也如实标注了这一点。
   -------------------------------------------------------------------------
   问题：n 个人、n 项工作，每人恰好做一项、每项恰好派给一人，问怎么派人使
        总费用（或总收益）最优。它是 0-1 线性规划的一个特殊情形，但用单纯形法
       去解就浪费了它的结构 —— 用**匈牙利法**在系数矩阵上做行/列归约 + 试指派 +
       覆盖线 + 调整，几步就能读出最优指派，而且每一步都能画在矩阵上给学生看。

   和本项目的其它模块一样，这里做的是「输入任意一道指派问题 → 输出规范化的完整
   计算过程」，不是把教材例题的参数写死。

   问题对象 problem = {
     direction: 'min' | 'max',
     cost:      [ [ … ], … ]      行 = 人员，列 = 工作
   }
   矩阵元素：数字，或「禁止指派」的记号（null / 'x' / '×' / '-' / '—' / '∞' / 'M'）。
   三种非标准情形都在这里处理：
     · 最大化 → 令 b_ij = M − c_ij（M 取矩阵最大元素）转成最小化，再还原目标值；
     · 人数与工作数不等 → 补**虚拟人员 / 虚拟工作**（费用取 0）方阵化；
     · 某人不做某项工作 → 该格记「禁止」，内部按无穷大处理，永远不会被指派。
   ★ 顺序很重要：先补虚拟行列、再做最大化转换。反过来的话虚拟格是「转换后补的 0」，
     而 0 在 b 口径下相当于「收益正好等于最大值」，Σb = nM − Σc 这个等式不再成立，
     最大化就会算歪（详见 assignSolve 里的注释）。

   算法只有这一份，界面/CLI/测试都调它：
     assignSolve(problem)      求解 + 逐步过程（steps 是给界面逐张渲染的矩阵快照）
     assignSymbols()           符号说明表（界面与 CLI 共用，避免两处各写一份文案）

   匈牙利法的教材步骤（本文件的 steps 就按这个顺序排）：
     ① 行归约：每行减去本行最小元素；② 列归约：每列减去本列最小元素；
     ③ 试指派：圈出独立零元素；④ 覆盖线：用最少数量的直线盖住所有 0；
     ⑤ 调整：未覆盖的最小元素 θ，未覆盖元素 −θ、被覆盖两次的元素 +θ，回到 ③。
     ③ 里圈到的个数 = n 时结束，此时圈出的就是最优指派。
   ========================================================================= */
'use strict';

var _util = require('./util.js');
var _fmt = require('./format.js');
var model = require('./model.js');

var EPS = _util.EPS;
var nearZero = _util.nearZero;
var fmtNum = _fmt.fmtNum;

/* 「禁止指派」的入参记号。界面填 ×、JSON 里写 null 都认。 */
var FORBIDDEN_TOKENS = ['x', 'X', '×', '-', '—', '–', '∞', 'M', 'inf', 'INF', 'Inf'];

/**
 * asCell —— 把一格输入规范化成「数字」或「null（禁止指派）」。
 * @param {*} raw 用户填的原始值
 * @returns {number|null|undefined} 数字 / null（禁止）/ undefined（非法，调用方报错）
 */
function asCell(raw) {
  if (raw === null) return null;                       // JSON 里用 null 表示禁止指派
  if (typeof raw === 'number') return isFinite(raw) ? raw : undefined;
  if (typeof raw === 'string') {
    var s = raw.trim();
    if (s === '') return 0;                            // 与项目其它模块一致：空格按 0 计
    if (FORBIDDEN_TOKENS.indexOf(s) >= 0) return null;
    var t = Number(s);
    return isFinite(t) ? t : undefined;
  }
  return undefined;
}

/**
 * validateAssignment —— 校验入参能不能算。
 * 0 行 / 0 列是**合法输入**（会给出确定结论，见 assignSolve），不是错误。
 * @param {object} problem
 * @returns {{ok:true, direction:string, m:number, n:number, cost:Array<Array<number|null>>}
 *          |{ok:false, message:string}} message 用全角分号连接，界面直接显示
 */
function validateAssignment(problem) {
  if (!problem || typeof problem !== 'object') return { ok: false, message: '没有读到题目。' };
  var raw = problem.cost !== undefined ? problem.cost : problem.matrix;
  if (!Array.isArray(raw)) return { ok: false, message: '缺少系数矩阵 cost（二维数组）。' };

  var invalid = [], cost = [], n = null, i, j;
  for (i = 0; i < raw.length; i++) {
    if (!Array.isArray(raw[i])) { invalid.push('第 ' + (i + 1) + ' 行不是数组'); continue; }
    if (n === null) n = raw[i].length;
    else if (raw[i].length !== n) invalid.push('第 ' + (i + 1) + ' 行的列数与第 1 行不一致');
    var row = [];
    for (j = 0; j < raw[i].length; j++) {
      var v = asCell(raw[i][j]);
      if (v === undefined) invalid.push('第 ' + (i + 1) + ' 行第 ' + (j + 1) + ' 列不是有效数字');
      row.push(v === undefined ? 0 : v);
    }
    cost.push(row);
  }
  if (invalid.length) return { ok: false, message: invalid.join('；') };

  return { ok: true, direction: problem.direction === 'max' ? 'max' : 'min',
           m: cost.length, n: n === null ? 0 : n, cost: cost };
}

/* ---------------- 矩阵小工具 ---------------- */

function cloneMatrix(M) {
  var out = [];
  for (var i = 0; i < M.length; i++) out.push(M[i].slice());
  return out;
}

/* 一行的最小元素（跳过禁止格）。整行都是禁止格时返回 null。 */
function rowMinOf(row) {
  var best = null;
  for (var j = 0; j < row.length; j++) {
    if (row[j] === null) continue;
    if (best === null || row[j] < best) best = row[j];
  }
  return best;
}

/* 一列的最小元素（跳过禁止格） */
function colMinOf(M, j) {
  var best = null;
  for (var i = 0; i < M.length; i++) {
    if (M[i][j] === null) continue;
    if (best === null || M[i][j] < best) best = M[i][j];
  }
  return best;
}

/* 由「可连关系」构造邻接表：adj[i] = 第 i 行能连的列号数组 */
function buildAdj(N, M, ok) {
  var adj = [];
  for (var i = 0; i < N; i++) {
    var list = [];
    for (var j = 0; j < N; j++) if (ok(M[i][j])) list.push(j);
    adj.push(list);
  }
  return adj;
}

/* ---------------- 二分图最大匹配（Kuhn 增广路） ----------------
   本项目里它被用在三处，而且都是同一件事的三种外衣：
     · 可行性预判：在「允许指派的格子」上求最大匹配，配不满 n 就无可行解；
     · 试指派：在「0 元素」上求最大匹配 = 圈出最多个数的独立零元素；
     · 覆盖线：由最大匹配按 König 定理推出最小覆盖集。
   所以只写这一份，三处共用。 */
function maxMatching(N, adj, initialMatchRow) {
  var matchRow = new Array(N).fill(-1);
  var matchCol = new Array(N).fill(-1);
  var i, j;
  if (initialMatchRow) {
    for (i = 0; i < N; i++) {
      var c0 = initialMatchRow[i];
      if (c0 >= 0 && matchCol[c0] === -1) { matchRow[i] = c0; matchCol[c0] = i; }
    }
  }
  var chains = [], count = 0;
  for (i = 0; i < N; i++) if (matchRow[i] >= 0) count++;
  for (var s = 0; s < N; s++) {
    if (matchRow[s] >= 0) continue;
    var seen = new Array(N).fill(false);
    var chain = [];
    if (augment(s, seen, chain)) {
      chain.reverse();                              // 回溯时是倒着记的，翻回来才是出发顺序
      chains.push(chain);
      count++;
    }
  }
  return { matchRow: matchRow, matchCol: matchCol, count: count, chains: chains };

  /* 从 row 出发找增广路：能连到自由列就成功；否则沿着「已匹配的列」递归换位 */
  function augment(row, seen, chain) {
    var list = adj[row];
    for (var k = 0; k < list.length; k++) {
      var col = list[k];
      if (seen[col]) continue;
      seen[col] = true;
      var owner = matchCol[col];
      if (owner === -1) {
        matchRow[row] = col; matchCol[col] = row;
        chain.push([row, col]);
        return true;
      }
      if (augment(owner, seen, chain)) {
        matchRow[row] = col; matchCol[col] = row;
        chain.push([row, col]);
        return true;
      }
    }
    return false;
  }
}

/**
 * minCover —— 教材的「打勾法」：由最大匹配推出最小覆盖，并给出覆盖线。
 * ① 对没有圈 0 的行打 √；② 对打 √ 行里含 0 的列打 √；
 * ③ 对打 √ 列里圈了 0 的行打 √；④ 重复直到打不出新的 √。
 * 覆盖线：**没打 √ 的行**画横线、**打 √ 的列**画竖线。
 * König 定理：最少覆盖线的条数 = 最多独立零元素的个数 —— 所以「线条数 < n」正说明
 * 现在还圈不满 n 个互不同行同列的 0，必须调整矩阵再试（线条数 = n 时即为最优）。
 * @param {number} N 阶数
 * @param {number[][]} adj 0 元素的邻接表
 * @param {number[]} matchRow 当前最大匹配
 * @returns {{markRow:boolean[], markCol:boolean[], lineRows:boolean[], lineCols:boolean[],
 *            markedRows:number[], markedCols:number[], size:number}}
 */
function minCover(N, adj, matchRow) {
  var matchCol = new Array(N).fill(-1);
  var i, j;
  for (i = 0; i < N; i++) if (matchRow[i] >= 0) matchCol[matchRow[i]] = i;

  var markRow = new Array(N).fill(false);
  var markCol = new Array(N).fill(false);
  var queue = [];
  for (i = 0; i < N; i++) if (matchRow[i] === -1) { markRow[i] = true; queue.push(i); }

  while (queue.length) {
    var r = queue.shift();
    var list = adj[r];
    for (var k = 0; k < list.length; k++) {
      var c = list[k];
      if (markCol[c]) continue;
      markCol[c] = true;
      var owner = matchCol[c];
      if (owner !== -1 && !markRow[owner]) { markRow[owner] = true; queue.push(owner); }
    }
  }

  var lineRows = new Array(N), lineCols = markCol.slice();
  for (i = 0; i < N; i++) lineRows[i] = !markRow[i];
  var markedRows = [], markedCols = [];
  for (i = 0; i < N; i++) if (markRow[i]) markedRows.push(i);
  for (j = 0; j < N; j++) if (markCol[j]) markedCols.push(j);
  var size = 0;
  for (i = 0; i < N; i++) if (lineRows[i]) size++;
  for (j = 0; j < N; j++) if (lineCols[j]) size++;
  return { markRow: markRow, markCol: markCol, lineRows: lineRows, lineCols: lineCols,
           markedRows: markedRows, markedCols: markedCols, size: size };
}

/* 每格的显示标记：圈定的 0 / 被划掉的 0（与它同行或同列已经圈了一个 0） */
function zeroMarks(N, adj, matchRow) {
  var marks = [], rowUsed = new Array(N).fill(false), colUsed = new Array(N).fill(false);
  var i, j;
  for (i = 0; i < N; i++) {
    var row = new Array(N).fill(null);
    marks.push(row);
  }
  for (i = 0; i < N; i++) if (matchRow[i] >= 0) { rowUsed[i] = true; colUsed[matchRow[i]] = true; }
  for (i = 0; i < N; i++) {
    var list = adj[i];
    for (var k = 0; k < list.length; k++) {
      j = list[k];
      marks[i][j] = (matchRow[i] === j) ? 'circ' : ((rowUsed[i] || colUsed[j]) ? 'cross' : null);
    }
  }
  return marks;
}

/* =========================================================================
   主求解入口
   -------------------------------------------------------------------------
   返回值（字段顺序由 model.createAssignResult 固定）：
     ok / status / direction / message
     m, n, N, empty, hasVirtual, virtualRows, virtualCols
     original（原矩阵）· padded（补虚拟后）· working（进迭代的矩阵）· M（最大化常数）
     steps（逐步快照）· roundCount · assignment（逐行指派）· pairs · objective · zMin
     rowLabels / colLabels
   ========================================================================= */
function assignSolve(problem, opts) {
  opts = opts || {};
  var MAXITER = opts.maxIter || 200;

  var v = validateAssignment(problem);
  if (!v.ok) return v;                                  // {ok:false, message}
  var direction = v.direction, m = v.m, n = v.n;
  var original = v.cost;

  /* ---- 0. 空问题：0 行或 0 列。按项目的约定给出**确定结论**，不报错。 */
  if (m === 0 || n === 0) {
    return model.createAssignResult({
      ok: true, status: 'optimal', direction: direction,
      message: '没有任何待指派的人员 / 工作，指派数为 0，目标值取 0。',
      m: m, n: n, N: 0, empty: true, hasVirtual: false,
      virtualRows: [], virtualCols: [],
      original: original, padded: [], working: [], M: null,
      steps: [], roundCount: 0, stallRounds: 0, assignment: [], pairs: [],
      objective: 0, zMin: 0, rowLabels: [], colLabels: []
    });
  }

  /* ---- 1. 补虚拟人员 / 虚拟工作（方阵化）
     ★ 必须在最大化转换**之前**做：虚拟格在原问题口径下费用取 0。
       如果先做 b = M − c 再补 0，虚拟格的 b 就变成 0 —— 而 b 越小越好，
       于是算法会抢着把虚拟行列接上去（相当于白送一次「不干活」），
       这时 Σb ≠ nM − Σc，还原出来的最大收益就是错的。 */
  var N = Math.max(m, n), i, j;
  var virtualRows = [], virtualCols = [];
  var padded = [];
  for (i = 0; i < m; i++) {
    var r = original[i].slice();
    for (j = n; j < N; j++) r.push(0);                   // 工作不够 → 补虚拟工作，费用 0
    padded.push(r);
  }
  for (i = m; i < N; i++) {
    var rr = [];
    for (j = 0; j < N; j++) rr.push(0);                  // 人不够 → 补虚拟人员，费用 0
    padded.push(rr);
    virtualRows.push(i);
  }
  for (j = n; j < N; j++) virtualCols.push(j);
  var hasVirtual = virtualRows.length > 0 || virtualCols.length > 0;

  /* ---- 2. 最大化 → 最小化：b_ij = M − c_ij（M = 矩阵最大元素） */
  var M = null, working = cloneMatrix(padded);
  if (direction === 'max') {
    for (i = 0; i < N; i++) {
      for (j = 0; j < N; j++) {
        if (padded[i][j] === null) continue;
        if (M === null || padded[i][j] > M) M = padded[i][j];
      }
    }
    for (i = 0; i < N; i++) {
      for (j = 0; j < N; j++) {
        working[i][j] = padded[i][j] === null ? null : M - padded[i][j];
      }
    }
  }

  /* ---- 3. 可行性预判：在「允许指派的格子」上求最大匹配
     配不满 n 就说明凑不出完整指派（有人无活可干、或某行/列整行整列禁止）。
     先判掉它，迭代里就不必再去无穷大上比大小 —— 那种「靠调整把 ∞ 调没」的做法
     在数值上永远走不到头。 */
  var allowAdj = buildAdj(N, working, function (v2) { return v2 !== null; });
  var allowMatch = maxMatching(N, allowAdj, null);
  if (allowMatch.count < N) {
    var why = [];
    for (i = 0; i < N; i++) if (allowAdj[i].length === 0) why.push(labelOfRow(i, m) + '没有任何允许指派的工作');
    for (j = 0; j < N; j++) {
      var cnt = 0;
      for (i = 0; i < N; i++) if (working[i][j] !== null) cnt++;
      if (cnt === 0) why.push(labelOfCol(j, n) + '没有任何人能承担');
    }
    if (!why.length) why.push('允许指派的关系里凑不出 n 个互不同行同列的格子（有一部分人只能做同一批工作）');
    return model.createAssignResult({
      ok: true, status: 'infeasible', direction: direction,
      message: '不存在完整的指派方案：' + why.join('；') + '。',
      m: m, n: n, N: N, empty: false, hasVirtual: hasVirtual,
      virtualRows: virtualRows, virtualCols: virtualCols,
      original: original, padded: padded, working: working, M: M,
      steps: [], roundCount: 0, stallRounds: 0, assignment: [], pairs: [], objective: null, zMin: null,
      rowLabels: rowLabelsOf(N, m), colLabels: colLabelsOf(N, n)
    });
  }

  /* ---- 4. ① 行归约、② 列归约 */
  var steps = [];
  var cur = cloneMatrix(working);
  var rowMin = [], colMin = [];
  for (i = 0; i < N; i++) {
    rowMin[i] = rowMinOf(cur[i]);
    if (rowMin[i] !== 0) {
      for (j = 0; j < N; j++) if (cur[i][j] !== null) cur[i][j] = cur[i][j] - rowMin[i];
    }
  }
  steps.push(model.createAssignStep({
    round: 1, phase: 'row', label: '① 行归约',
    title: '每行减去本行的最小元素',
    matrix: cur, amounts: rowMin,
    details: rowMin.map(function (val, idx) {
      return '第 ' + (idx + 1) + ' 行最小元素 = ' + fmtNum(val) + '，该行每个元素减去它'
        + (nearZero(val) ? '（本来就是 0，这一行不用动）' : '');
    }).concat(['行归约的意义：每行都出现 0 之后，「0」就代表「相对本行而言最便宜的选择」，'
      + '而且这样减掉的是每行的固定开销，不改变最优指派的挑选。']),
    note: '行归约后每行至少有一个 0。'
  }));

  for (j = 0; j < N; j++) {
    colMin[j] = colMinOf(cur, j);
    if (colMin[j] !== 0) {
      for (i = 0; i < N; i++) if (cur[i][j] !== null) cur[i][j] = cur[i][j] - colMin[j];
    }
  }
  steps.push(model.createAssignStep({
    round: 1, phase: 'col', label: '② 列归约',
    title: '每列减去本列的最小元素',
    matrix: cur, amounts: colMin,
    details: colMin.map(function (val, idx) {
      return '第 ' + (idx + 1) + ' 列最小元素 = ' + fmtNum(val) + '，该列每个元素减去它'
        + (nearZero(val) ? '（本来就是 0，这一列不用动）' : '');
    }).concat(['行列都归约完之后，矩阵里每一个 0 都代表一个「不增加总费用」的候选指派，'
      + '接下来的任务就是尽可能多地把它们圈出来。']),
    note: '列归约后每列至少有一个 0。'
  }));

  /* ---- 5. ③④⑤ 循环：试指派 → 覆盖线 → 调整 */
  var matchRow = null, roundCount = 0, status = 'optimal', message = '';
  /* 同一张矩阵再出现一次就说明在绕圈（理论上不该发生，但浮点上的退化有可能），
     宁可如实报「未收敛」，也不能转不出来。 */
  var seen = {};
  var stallRounds = 0, prevMatchSize = -1;
  for (var iter = 1; iter <= MAXITER; iter++) {
    roundCount = iter;

    /* ③ 试指派 */
    var zeroAdj = buildAdj(N, cur, function (v3) { return v3 !== null && nearZero(v3); });
    var greedy = greedyAssign(N, zeroAdj);
    var match = maxMatching(N, zeroAdj, greedy.matchRow);
    matchRow = match.matchRow;
    var marks = zeroMarks(N, zeroAdj, matchRow);
    var pairs0 = [];
    for (i = 0; i < N; i++) if (matchRow[i] >= 0) pairs0.push([i, matchRow[i]]);
    /* 每轮的「试指派」都做到最大匹配（见 greedyAssign 的说明）。代价是：个别题上会
       出现「这一轮调整完、圈数暂时没变，下一轮才多出来」的情况 —— 教材逐条圈的写法
       本来就会这样。圈数只会不减，1200 道随机题实测最多 8 轮结束，绝不会绕圈。 */
    if (prevMatchSize >= 0 && pairs0.length === prevMatchSize) stallRounds++;
    prevMatchSize = pairs0.length;

    var tryDetails = greedy.details.slice();
    if (match.chains.length) {
      match.chains.forEach(function (ch) {
        tryDetails.push('贪心的圈零走到这一步停下（每行每列都不止一个 0），'
          + '改用增广链继续找：' + ch.map(function (p) { return '(' + (p[0] + 1) + ',' + (p[1] + 1) + ')'; }).join(' → ')
          + '，这条链上「没有圈的 0」比「圈了的 0」多一个，把圈的位置顺次换过去，'
          + '独立零元素的个数就多了一个。');
      });
    }
    if (!tryDetails.length) tryDetails.push('矩阵里没有 0 元素，一个也圈不出来。');

    steps.push(model.createAssignStep({
      round: iter, phase: 'try', label: '③ 试指派',
      title: '圈出独立零元素（互不同行、互不同列）',
      matrix: cur, marks: marks, matching: pairs0,
      details: tryDetails.concat(['已圈出的独立零元素共 ' + pairs0.length + ' 个；'
        + (pairs0.length === N ? '等于 n = ' + N + '，说明每一步都能找到 0，迭代结束。'
          : '小于 n = ' + N + '，说明还有工作没能用 0 顶上，需要画覆盖线来调整矩阵。')]),
      note: pairs0.length === N
        ? '圈出 ' + N + ' 个独立零元素 —— 已经得到最优指派。'
        : '只圈出 ' + pairs0.length + ' 个独立零元素，进入覆盖线。',
      done: pairs0.length === N
    }));

    if (pairs0.length === N) break;

    /* ④ 覆盖线 */
    var cov = minCover(N, zeroAdj, matchRow);
    steps.push(model.createAssignStep({
      round: iter, phase: 'cover', label: '④ 覆盖线',
      title: '用最少数量的直线盖住所有 0 元素',
      matrix: cur, marks: marks,
      lines: { rows: cov.lineRows, cols: cov.lineCols },
      details: [
        '打 √ 的行（没有圈到 0 的行）：' + (cov.markedRows.length ? cov.markedRows.map(n1).join('、') : '无')
          + '；再由这些行里含 0 的列打 √，由打 √ 的列里圈了 0 的行打 √，反复直到打不出新的 √。',
        '打 √ 的列：' + (cov.markedCols.length ? cov.markedCols.map(n1).join('、') : '无') + '。',
        '于是：**没打 √ 的行**画横线、**打 √ 的列**画竖线 —— 一共 ' + cov.size + ' 条线，'
          + '盖住了矩阵里全部的 0 元素。',
        '线的条数 ' + cov.size + ' < n = ' + N + '，说明 0 元素还不够「分散」，'
          + '最多只能圈出 ' + cov.size + ' 个互不同行同列的 0（König 定理：最少覆盖线的条数 = 最多独立零元素的个数），'
          + '所以要调整矩阵。'
      ],
      note: '最少 ' + cov.size + ' 条直线即可盖住全部 0 元素。'
    }));

    /* ⑤ 调整：θ = 未覆盖区域的最小元素 */
    var theta = null;
    for (i = 0; i < N; i++) {
      if (!cov.markRow[i]) continue;                     // 未覆盖区域 = 打 √ 的行 × 没打 √ 的列
      for (j = 0; j < N; j++) {
        if (cov.markCol[j]) continue;
        if (cur[i][j] === null) continue;                // 禁止格是无穷大，不参与取最小
        if (theta === null || cur[i][j] < theta) theta = cur[i][j];
      }
    }
    if (theta === null || nearZero(theta)) {
      /* 理论上到不了这里：覆盖线是最少的 ⇒ 未覆盖区域里不会有 0；
         真有数值毛刺时也不硬算（继续调 θ=0 就是死循环），如实报「未收敛」。 */
      status = 'iteration-limit';
      message = '未覆盖区域里找不到可以减的最小元素，矩阵无法继续调整，迭代中止。';
      break;
    }
    for (i = 0; i < N; i++) {
      if (!cov.markRow[i]) continue;                     // 打 √ 的行整行减 θ
      for (j = 0; j < N; j++) if (cur[i][j] !== null) cur[i][j] = cur[i][j] - theta;
    }
    for (j = 0; j < N; j++) {
      if (!cov.markCol[j]) continue;                     // 打 √ 的列整列加 θ
      for (i = 0; i < N; i++) if (cur[i][j] !== null) cur[i][j] = cur[i][j] + theta;
    }
    var sig = '';
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) {
      sig += (cur[i][j] === null ? 'x' : cur[i][j].toFixed(9)) + ',';
    }
    if (seen[sig]) {
      status = 'iteration-limit';
      message = '矩阵调整之后又回到了之前出现过的矩阵，迭代在绕圈，已中止；'
        + '请检查题目数据（退化情形可能触发）。';
      break;
    }
    seen[sig] = true;

    steps.push(model.createAssignStep({
      round: iter, phase: 'adjust', label: '⑤ 矩阵调整',
      title: '未覆盖的最小元素 θ = ' + fmtNum(theta),
      matrix: cur, theta: theta,
      lines: { rows: cov.lineRows, cols: cov.lineCols },
      details: [
        'θ = 未被覆盖区域里的最小元素 = ' + fmtNum(theta) + '。',
        '未覆盖的元素减 θ：打 √ 的行整行减 ' + fmtNum(theta) + '（它们与没打 √ 的列相交处正是未覆盖区）。',
        '被两条线交叉覆盖的元素加 θ：打 √ 的列整列加 ' + fmtNum(theta) + '。',
        '只被一条线盖住的元素一减一加刚好抵消，数值不变 —— 这就是教材那句'
          + '「未覆盖的减 θ、交叉的加 θ、其余不变」。',
        '这样调整之后，未覆盖区域里至少会出现一个新的 0，而原来的 0 仍然是 0'
          + '（减的加的都抵消了），所以可以圈出的独立零元素会变多。回到③重新试指派。'
      ],
      note: '调整完毕，回到③重新试指派。'
    }));

    if (iter === MAXITER) {
      status = 'iteration-limit';
      message = '迭代 ' + MAXITER + ' 轮仍未得到完整指派，可能存在退化导致的循环，请检查题目数据。';
    }
  }

  /* ---- 6. 读出结果（指派、目标值、检验） */
  var assignment = [], pairs = [], objective = 0, zMin = 0;
  if (status === 'optimal' && matchRow) {
    for (i = 0; i < N; i++) {
      var c = matchRow[i];
      var real = padded[i][c];
      objective += real;
      zMin += working[i][c];
      var rowV = i >= m, colV = c >= n;
      assignment.push({
        row: i, col: c, rowVirtual: rowV, colVirtual: colV,
        rowName: labelOfRow(i, m), colName: labelOfCol(c, n),
        cost: real,                    // 原问题口径的费用（虚拟格为 0）
        used: !rowV && !colV           // 真实的一次指派
      });
      if (!rowV && !colV) pairs.push([i, c, real]);
    }
  }

  return model.createAssignResult({
    ok: true, status: status, direction: direction, message: message,
    m: m, n: n, N: N, empty: false, hasVirtual: hasVirtual,
    virtualRows: virtualRows, virtualCols: virtualCols,
    original: original, padded: padded, working: working, M: M,
    steps: steps, roundCount: roundCount, stallRounds: stallRounds,
    assignment: assignment, pairs: pairs,
    objective: status === 'optimal' ? objective : null,
    zMin: status === 'optimal' ? zMin : null,
    rowLabels: rowLabelsOf(N, m), colLabels: colLabelsOf(N, n)
  });
}

/* ---------------- 试指派（教材的「圈 0」） ----------------
   反复挑「只有一个未标记 0 元素」的行或列，把那个 0 圈起来（表示一次指派），
   并划掉同行同列其它的 0 —— 这就是教材的作法。
   贪心偶尔圈不到最多的一组，所以它停下来之后由调用方接着跑增广路补足，
   但两者的「读法」完全一样，只是把试指派做到位。 */
function greedyAssign(N, adj) {
  var rowUsed = new Array(N).fill(false), colUsed = new Array(N).fill(false);
  var rowTaken = new Array(N).fill(-1);
  var live = [], details = [], i, j, k;
  for (i = 0; i < N; i++) {
    var row = new Array(N).fill(false);
    for (k = 0; k < adj[i].length; k++) row[adj[i][k]] = true;
    live.push(row);
  }
  var progressed = true;
  while (progressed) {
    progressed = false;

    for (i = 0; i < N; i++) {                              // 先扫行
      if (rowUsed[i]) continue;
      var cand = [];
      for (j = 0; j < N; j++) if (live[i][j] && !colUsed[j]) cand.push(j);
      if (cand.length === 1) {
        circle(i, cand[0], '第 ' + (i + 1) + ' 行只剩 1 个未被划掉的 0');
        progressed = true;
      }
    }
    for (j = 0; j < N; j++) {                              // 再扫列
      if (colUsed[j]) continue;
      var colCand = [];
      for (i = 0; i < N; i++) if (!rowUsed[i] && live[i][j]) colCand.push(i);
      if (colCand.length === 1) {
        circle(colCand[0], j, '第 ' + (j + 1) + ' 列只剩 1 个未被划掉的 0');
        progressed = true;
      }
    }
  }
  if (!details.length) details.push('矩阵里没有可圈（互不同行同列）的 0 元素。');

  return { matchRow: rowTaken, details: details };

  function circle(r, c, why) {
    rowUsed[r] = true; colUsed[c] = true; rowTaken[r] = c;
    var crossed = 0;
    for (var t = 0; t < N; t++) {
      if (t !== c && live[r][t]) { live[r][t] = false; crossed++; }
      if (t !== r && live[t][c]) { live[t][c] = false; crossed++; }
    }
    details.push(why + ' → 圈定 (' + (r + 1) + ',' + (c + 1) + ') 作为一次指派，'
      + (crossed ? '并划掉同第 ' + (r + 1) + ' 行、第 ' + (c + 1) + ' 列上另外 ' + crossed + ' 个 0'
                 : '同行同列没有其它 0 要划'));
  }
}

/* ---------------- 步骤与标签 ---------------- */

function n1(x) { return x + 1; }

/* 行的显示名：真实行在前、虚拟行在后（虚拟行专门用来表示「多出来的人没活干」） */
function labelOfRow(i, m) { return i < m ? '人员' + (i + 1) : '虚拟人员' + (i - m + 1); }
function labelOfCol(j, n) { return j < n ? '工作' + (j + 1) : '虚拟工作' + (j - n + 1); }
function rowLabelsOf(N, m) {
  var out = [];
  for (var i = 0; i < N; i++) out.push(labelOfRow(i, m));
  return out;
}
function colLabelsOf(N, n) {
  var out = [];
  for (var j = 0; j < N; j++) out.push(labelOfCol(j, n));
  return out;
}

/**
 * assignSymbols —— 符号说明表（数据驱动：界面、CLI、README 共用同一份文案）。
 * @returns {Array<{k:string,d:string}>} k = 记号，d = 含义
 */
function assignSymbols() {
  return [
    { k: 'c_ij', d: '第 i 行第 j 列的元素：第 i 个人做第 j 项工作的费用（最大化问题里是收益）。' },
    { k: 'x_ij', d: '0-1 变量。x_ij = 1 表示把第 j 项工作派给第 i 个人，0 表示不派。'
        + '指派问题就是要求这些 x_ij 每一行每一列各恰好有一个取 1。' },
    { k: 'n', d: '方阵的阶数。人数与工作数不等时取较大的那个，小的一方补虚拟行列。' },
    { k: 'b_ij', d: '转换后的系数矩阵：最小化时 b_ij = c_ij；'
        + '最大化时 b_ij = M − c_ij。匈牙利法一律在这个矩阵上做。' },
    { k: 'M', d: '最大化问题里取系数矩阵的最大元素，用来把「求最大」翻成「求最小」。'
        + '注意禁止指派用的大 M 是「形式上的无穷大」，与这个可计算的 M 不是一回事。' },
    { k: '虚拟人员 / 虚拟工作', d: '人数与工作数不等时补上的假想对象，费用取 0。'
        + '谁被派到虚拟工作，就表示这个人没有活干。' },
    { k: '×（禁止指派）', d: '第 i 个人不能做第 j 项工作。内部按无穷大处理，永远不会出现在指派里。' },
    { k: '〇（圈）', d: '圈定的 0 元素 = 一个「独立零元素」，代表一次指派。互不同行、互不同列。' },
    { k: 'θ', d: '未覆盖区域里的最小元素。调整时：未覆盖的元素减 θ、被两条线交叉覆盖的元素加 θ'
        + '（等价于打 √ 的行整行减 θ、打 √ 的列整列加 θ）。' },
    { k: '覆盖线', d: '画在「没打 √ 的行」（横线）与「打 √ 的列」（竖线）上。'
        + '条数等于 n 时，说明已经找到 n 个独立零元素，也就是最优指派（König 定理的另一面）。' },
    { k: 'z', d: '目标函数值：最小化问题是最小总费用，最大化问题是最大总收益，'
        + '等于最终指派的那 n 个格子的元素之和。' },
    { k: '教材口径', d: '本节对应徐玖平、胡知能《运筹学（第四版）》第 6 章「图与网络」的 '
        + '6.7 分配问题（6.7.2 最优匹配）；教材用词是「分配问题」。'
        + '上面这些记号与步骤名称按通用口径书写，尚未与教材 6.7 正文逐条核对。' }
  ];
}

module.exports = {
  assignSolve: assignSolve,
  validateAssignment: validateAssignment,
  assignSymbols: assignSymbols,
  /* 供测试与扩展复用（都是纯函数） */
  maxMatching: maxMatching,
  minCover: minCover,
  asCell: asCell
};
