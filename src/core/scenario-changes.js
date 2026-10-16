/* 条件变更：在原最优表上判断并继续迭代。 */
'use strict';

/* 依赖：求解内核 + 输入解析 + 数据模型 + 公共工具 + 格式化。
   原则是「别的模块已经有的东西一律不再写第二遍」：
     · 建模与初始表      → parse.js 的 toStandardForm
     · 入基 / 比值 / 枢轴 → simplex.js 的 selectEnteringDantzig / ratioTest / pivot
     · 完整求解、对偶解   → simplex.js 的 simplexSolve
     · 数值判定与矩阵运算 → util.js；数字与 λ 表达式的显示 → format.js
   本模块只留自己独有的部分：五类场景变换、参数线性规划的分段行走与 λ 区间求解，
   以及把它们组织成界面要用的报告结构。
   依赖一律显式 require（浏览器端由 src/build.js 的迷你打包器提供 require）。 */
var _core = require('./simplex.js');
var _util = require('./util.js');
var _fmt = require('./format.js');
var _parse = require('./parse.js');

var simplexSolve = _core.simplexSolve;
var selectEnteringDantzig = _core.selectEnteringDantzig;   // 入基规则（σ_j > 0 中最大者）
var ratioTest = _core.ratioTest;                           // 最小比值规则
var pivot = _core.pivot;                                   // 枢轴变换（就地改 rows / obj / basis）
var toStandardForm = _parse.toStandardForm;                 // 校验 + 规范化 + 建初始表

var EPS = _util.EPS, pAdd = _util.pAdd, pSub = _util.pSub, pMul = _util.pMul,
    pIsPos = _util.pIsPos, matInverse = _util.matInverse, matVec = _util.matVec,
    clampSign = _util.clampSign;
var fmtNum = _fmt.fmtNum, fmtPair = _fmt.fmtPair, fmtAff = _fmt.fmtAff;

var shared = require('./scenario-tableau.js');
var sensBuildModel = shared.sensBuildModel;
var sensTableau = shared.sensTableau;
var sensObjRow = shared.sensObjRow;
var sensIterate = shared.sensIterate;
var sensReadOut = shared.sensReadOut;
var sensClone = shared.sensClone;
var sensBasisNames = shared.sensBasisNames;
var sensMapBasis = shared.sensMapBasis;
var sensZj = shared.sensZj;
var nm = shared.nm;
var sub = shared.sub;
var vecStr = shared.vecStr;
var matrixStr = shared.matrixStr;
var sensFail = shared.sensFail;
/* =========================================================================
   5. 四类场景
   ========================================================================= */

/* 通用收尾：把「判断 + 继续迭代」组装成统一结构 */
function sensFinish(model, T, judgement, kind, title, extra) {
  var iter = sensIterate(model, T);
  var out = sensReadOut(model, iter);
  var res = {
    ok: true, kind: kind, title: title,
    judgement: judgement,
    vars: model.vars, N: model.N, n: model.n, m: model.m,
    /* 迭代表渲染函数（ui.js 的 renderTable）按这两个字段决定行数与列数，
       场景结果必须带上，否则基行画不出来 */
    mConstraints: model.m, nDecision: model.n,
    direction: model.direction, swapSign: model.swapSign,
    steps: iter.steps, status: iter.status,
    result: out, model: model
  };
  for (var k in extra) res[k] = extra[k];
  return res;
}

/* ---- ① 目标函数系数变化（教材 2.5.2 非基变量系数 / 2.5.4 基变量系数） ----
   教材把这一类按「改的是谁的系数」拆成两小节，因为**判据完全不同**：

     · 改的是**非基变量**的 c_j —— 它只出现在自己那一列的检验数里：
         σ′_j = c′_j − z_j ,  z_j = c_B·(B⁻¹P_j)
       c_B 没动，z_j 原封不动，所以**只需重算那一列**。

     · 改的是**基变量**的 c_j —— 它进的是 c_B，而 z_j = c_B·(B⁻¹P_j) 里每一项都含 c_B，
       所以**σ 的整行都要重算**：σ′_j = σ_j − Δ·(B⁻¹P_j)_k 。
       （被改的那一列是特例：c′_j 自己也加了 Δ，与 z′_j 里的 Δ 正好抵消，仍有 σ′_j = 0。）

   两种情形有个共同结论：**右端项 B⁻¹b 与 c 无关**，所以只要基仍然最优，
   **解本身不变**，变的只是目标值；若改的是非基变量，它还取 0，连目标值也不变。
   ========================================================================= */
function sensChangeC(baseProblem, scenario) {
  var newProb = sensClone(baseProblem);
  newProb.c = scenario.c.map(Number);
  var model = sensBuildModel(newProb);
  if (!model) return sensFail('改动后的条件不合法（系数个数或数值对不上），无法建立标准型。');

  var baseRes = simplexSolve(baseProblem);
  var baseModel = sensBuildModel(baseProblem);
  var baseNames = sensBasisNames(baseRes);

  var basisCols = sensMapBasis(model, baseNames);
  if (basisCols === null) return sensFail('原最优基在改动后无法定位（变量名对不上）');
  var T = sensTableau(model, basisCols);
  if (!T) return sensFail('原最优基在改动后无法构造（基矩阵奇异）');
  var baseT = sensTableau(baseModel, basisCols);
  if (!baseT) return sensFail('原最优表构造失败');

  /* 逐个数一变，基数按「是不是基变量」归到两个块里 */
  var nbLines = [], bLines = [], changed = false, hasBasic = false, hasNonBasic = false;
  for (var j = 0; j < model.n; j++) {
    var oldC = Number(baseProblem.c[j]), newC = Number(newProb.c[j]);
    if (Math.abs(newC - oldC) < 1e-12) continue;      // 这个系数没动
    var d = newC - oldC;
    var k = basisCols.indexOf(j);

    if (k === -1) {
      /* --- 非基变量：只影响它自己那一列的检验数 --- */
      hasNonBasic = true;
      var zj = sensZj(model, T, j);
      var sig = T.obj[j];                              // 新表里已经算好的 σ′_j
      var l = 'x' + (j + 1) + '：c' + sub(j + 1) + ' 由 ' + fmtNum(oldC) + ' 改为 ' + fmtNum(newC)
        + '　→　σ′' + sub(j + 1) + ' = c′' + sub(j + 1) + ' − z' + sub(j + 1) + ' = '
        + fmtPair(model.cObj[j]) + ' − ' + fmtPair(zj) + ' = ' + fmtPair(sig);
      if (pIsPos(sig)) { changed = true; l += ' > 0 → 这一列能进基，最优解要改'; }
      else { l += ' ≤ 0 → 仍不进基'; }
      nbLines.push(l);
    } else {
      /* --- 基变量：c_B 变了 → σ 整行重算 --- */
      hasBasic = true;
      var who = [];
      for (var jj = 0; jj < model.N; jj++) if (pIsPos(T.obj[jj])) who.push('x' + (jj + 1));
      var l2 = 'x' + (j + 1) + '：c' + sub(j + 1) + ' 由 ' + fmtNum(oldC) + ' 改为 ' + fmtNum(newC)
        + '，Δ = ' + fmtNum(d) + '。它是第 ' + (k + 1) + ' 个基变量，进了 c_B，'
        + '所以**σ 的整行都要重算**：σ′ⱼ = σⱼ − Δ·(B⁻¹Pⱼ)' + sub(k + 1) + '。';
      l2 += who.length
        ? '重算后 σ′ 变正的列有 ' + who.join('、') + ' → 最优解要改'
        : '重算后所有 σ′ⱼ ≤ 0 → 原基仍是最优基';
      bLines.push(l2);
      if (who.length) changed = true;
    }
  }

  var blocks = [];
  if (nbLines.length) blocks.push({ label: '非基变量的系数（教材 2.5.2）', lines: nbLines });
  if (bLines.length) blocks.push({ label: '基变量的系数（教材 2.5.4）', lines: bLines });

  var lines = [];
  if (!blocks.length) lines.push('这次没有改动任何目标函数系数，最优解与目标值都不变。');

  var concl;
  if (changed) {
    concl = '最优基改变，在原最优表上继续迭代（用原始单纯形法）';
  } else if (blocks.length) {
    /* B⁻¹b 与 c 无关：只要基还最优，解就不动 */
    concl = '最优基不变；右端项 B⁻¹b 与 c 无关，所以最优解不变'
      + (hasNonBasic && !hasBasic
          ? '，而且改的是非基变量、它仍取 0，目标值也不变'
          : '，只有目标值随新系数变化');
  } else {
    concl = '没有变化';
  }

  var judgement = {
    changed: changed,
    title: '检验数检验',
    head: '把新系数代回原最优表，检查检验数 σ′ⱼ = c′ⱼ − zⱼ 有没有变正：',
    blocks: blocks,
    lines: lines,
    conclusion: concl
  };
  return sensFinish(model, T, judgement, 'c', '目标函数系数变化', { newProblem: newProb });
}

/* ---- ② 右端项变化 ---- */
function sensChangeB(baseProblem, scenario) {
  var newProb = sensClone(baseProblem);
  scenario.rhs.forEach(function (v, i) { newProb.constraints[i].rhs = Number(v); });
  var model = sensBuildModel(newProb);
  if (!model) return sensFail('改动后的条件不合法（系数个数或数值对不上），无法建立标准型。');

  var baseRes = simplexSolve(baseProblem);
  var baseNames = sensBasisNames(baseRes);
  var basisCols = sensMapBasis(model, baseNames);
  if (basisCols === null) return sensFail('原最优基在改动后无法构造（新右端项使基矩阵奇异）');
  var T = sensTableau(model, basisCols);
  if (!T) return sensFail('原最优基在改动后无法构造（新右端项使基矩阵奇异）');

  /* 教材式判断：x′_B = B⁻¹b′ */
  var xB = [], neg = false;
  for (var i = 0; i < model.m; i++) {
    var v = T.rows[i][model.N];
    xB.push(v);
    if (v < -1e-9) neg = true;
  }
  var lines = [];
  lines.push('B⁻¹b′ = ' + vecStr(xB) + (neg ? '，其中有负分量 → 原基不再可行' : ' > 0，最优基不变'));
  if (!neg) {
    lines.push('基变量取值变为 ' + T.basis.map(function (c, i2) {
      return model.vars[c].name + ' = ' + fmtNum(xB[i2]);
    }).join('、') + '；非基变量仍取 0');
  } else {
    lines.push('右端项越界，用**对偶单纯形法**在原来的表上继续迭代即可恢复可行');
  }

  var judgement = {
    changed: neg,
    title: '右端项检验',
    head: '目标的系数没变，所以检验数行不变；只有右端列要换成新的 x′_B = B⁻¹b′：',
    lines: lines,
    matrix: model.m <= 4 ? matrixStr(T.Binv) : null,
    conclusion: neg ? '最优基不变，但基取值越界 → 对偶单纯形法继续' : '最优基不变，直接得到新解'
  };
  return sensFinish(model, T, judgement, 'b', '右端项变化', { newProblem: newProb });
}

/* ---- ② 技术系数 a_ij 变化 ----
   判据的差别比改 c 还大，教材同样分成两种情形：

     · x_j 是**非基变量** → 基矩阵 B 的列全是基变量的列，P_j 不在其中，
       所以 B、B⁻¹、x_B、z **全都不变**，只有 P_j 那一列变 → 只有 σ_j 会动：
         σ′_j = c_j − c_B·(B⁻¹P′_j)
       又因为 x_j = 0，它在约束里的那一项恒等于 0 —— 连约束都没被改动。

     · x_j 是**基变量**（设在第 k 行）→ B 的第 k 列**正是** P_j，它一变 B 就变、
       B⁻¹ 跟着变，于是**整张表（每一行、x_B、σ 全部）都要重算**。
       重算后：x′_B 出现负分量 → 失去可行性（该用对偶单纯形法）；
                 σ′ 出现正分量 → 失去最优性（该用原始单纯形法）。
       **两者同时坏掉时，两种局部迭代法都不适用**，只能重新求解。
   ========================================================================= */
function sensChangeA(baseProblem, scenario) {
  var i = Number(scenario.con), j = Number(scenario.v), val = Number(scenario.value);
  var newProb = sensClone(baseProblem);
  var oldA = Number(baseProblem.constraints[i].coef[j]);
  newProb.constraints[i].coef[j] = val;
  var model = sensBuildModel(newProb);
  if (!model) return sensFail('改动后的条件不合法（系数个数或数值对不上），无法建立标准型。');

  var baseRes = simplexSolve(baseProblem);
  var baseNames = sensBasisNames(baseRes);
  var basisCols = sensMapBasis(model, baseNames);
  if (basisCols === null) return sensFail('原最优基在新问题里无法定位（变量名对不上）');

  var k = basisCols.indexOf(j);
  var isBasic = (k !== -1);
  var lines = [], changed, restart = false, negRow = -1, posCol = -1;

  var T = sensTableau(model, basisCols);
  if (T === null) {
    /* 改完之后原基的基矩阵奇异（列变得线性相关）→ 局部修改法无从谈起 */
    if (!isBasic) return sensFail('改完之后原最优基的基矩阵变成奇异矩阵，这个基不能再用，需要重新求解');
    lines.push('x' + (j + 1) + ' 是**基变量**，改的是它自己的列。重算后发现'
      + '原最优基的基矩阵 B 已经**奇异**（列之间线性相关），它不再能充当一组基 —— '
      + '局部修改法（原始/对偶单纯形二选一）无从谈起，只能重新求解。');
    lines.push('下面从标准初始基（松弛/剩余变量 + 人工变量）重跑一遍大 M 法。');
    var T0 = sensTableau(model, model.basis0);
    if (!T0) return sensFail('重新求解时无法构造初始表');
    return sensFinish(model, T0, {
      changed: true, title: '技术系数检验',
      head: '把 a' + sub(i + 1) + sub(j + 1) + '（第 ' + (i + 1) + ' 条约束里 x' + (j + 1)
        + ' 的系数）由 ' + fmtNum(oldA) + ' 改成 ' + fmtNum(val) + '，看它对原最优表的影响：',
      lines: lines, conclusion: '原最优基被破坏（基矩阵奇异），改为重新求解'
    }, 'a', '技术系数 a_ij 变化',
      { newProblem: newProb, restart: true, aInfo: { i: i, j: j, oldA: oldA, newA: val } });
  }

  if (!isBasic) {
    /* ---------- 非基变量的列：只动这一列 ---------- */
    var colNums = [];
    for (var r = 0; r < model.m; r++) colNums.push(T.rows[r][j]);
    var zj = sensZj(model, T, j);
    var sig = pSub(model.cObj[j], zj);
    changed = pIsPos(sig);

    lines.push('x' + (j + 1) + ' 是**非基变量**，它的列 P' + sub(j + 1)
      + ' 不在基矩阵 B 里 → B、B⁻¹、x_B、z 全都不变，**只有这一列要换**，'
      + '所以只需重算它自己的检验数：');
    lines.push('σ′' + sub(j + 1) + ' = c' + sub(j + 1) + ' − c_B·(B⁻¹P′' + sub(j + 1) + ') = '
      + fmtPair(model.cObj[j]) + ' − ' + fmtPair(zj) + ' = ' + fmtPair(sig));
    lines.push('其中 B⁻¹P′' + sub(j + 1) + ' = ' + vecStr(colNums)
      + '（原来的第 ' + (i + 1) + ' 行系数由 ' + fmtNum(oldA) + ' 改成 ' + fmtNum(val) + '，'
      + '这一列的值随之变化）');
    lines.push(changed
      ? 'σ′' + sub(j + 1) + ' > 0 → 这一列能进基，最优解要改，接**原始单纯形法**继续迭代。'
      : 'σ′' + sub(j + 1) + ' ≤ 0 → 这一列仍不进基。又因为 x' + (j + 1) + ' = 0，'
        + '它在约束 ' + (i + 1) + ' 里的那一项 a·x' + (j + 1) + ' 恒等于 0，'
        + '**约束其实一点没被改动** → 最优解与目标值都不变。');
  } else {
    /* ---------- 基变量的列：整张表重算 ---------- */
    lines.push('x' + (j + 1) + ' 是**基变量**（第 ' + (k + 1) + ' 行的基变量），'
      + '基矩阵 B 的第 ' + (k + 1) + ' 列**正是** P' + sub(j + 1) + '。'
      + '它一变 B 就变、B⁻¹ 跟着变，所以**整张表（每一行、x_B、σ 全部）都要重算**，'
      + '不能只看这一列。');
    if (model.m <= 4) lines.push('重算后 B⁻¹ = ' + matrixStr(T.Binv));

    var xB = [];
    for (var r2 = 0; r2 < model.m; r2++) {
      xB.push(T.rows[r2][model.N]);
      if (T.rows[r2][model.N] < -1e-9 && negRow === -1) negRow = r2;
    }
    for (var c2 = 0; c2 < model.N; c2++) if (pIsPos(T.obj[c2])) { posCol = c2; break; }

    lines.push('新右端项 x′_B = B⁻¹b = ' + vecStr(xB)
      + (negRow === -1
          ? ' ≥ 0 → 可行性没坏'
          : '，其中第 ' + (negRow + 1) + ' 行 = ' + fmtNum(xB[negRow]) + ' < 0 → **原基不再可行**'));
    lines.push('新检验数行 σ′ = c − c_B·B⁻¹A′：'
      + (posCol === -1
          ? '全部 σ′ⱼ ≤ 0 → 最优性没坏'
          : 'σ′' + sub(posCol + 1) + ' = ' + fmtPair(T.obj[posCol]) + ' > 0 → **原基不再最优**'));

    changed = (negRow !== -1 || posCol !== -1);
    if (negRow !== -1 && posCol !== -1) {
      restart = true;
      lines.push('两个条件**同时**被破坏：表既不可行又不最优。'
        + '原始单纯形法要求右端项非负、对偶单纯形法要求检验数非正，'
        + '**两种局部迭代法都用不上** —— 教材的做法是重新求解。'
        + '下面从标准初始基（松弛/剩余变量 + 人工变量）重跑一遍大 M 法。');
    } else if (negRow !== -1) {
      lines.push('只有可行性被破坏（检验数仍全 ≤ 0）→ 用**对偶单纯形法**在原表上继续迭代。');
    } else if (posCol !== -1) {
      lines.push('只有最优性被破坏（右端项仍全 ≥ 0）→ 用**原始单纯形法**在原表上继续迭代。');
    } else {
      lines.push('两个条件都没坏 → 原基仍是新问题的最优基，直接读出新解。');
    }
  }

  var Tuse = T;
  if (restart) {
    Tuse = sensTableau(model, model.basis0);          // 标准初始基（B = 单位阵）
    if (!Tuse) return sensFail('重新求解时无法构造初始表');
  }

  var judgement = {
    changed: changed,
    title: '技术系数检验',
    head: '把 a' + sub(i + 1) + sub(j + 1) + '（第 ' + (i + 1) + ' 条约束里 x' + (j + 1)
      + ' 的系数）由 ' + fmtNum(oldA) + ' 改成 ' + fmtNum(val)
      + '，看它对原最优表的影响：',
    lines: lines,
    conclusion: !changed ? '最优解与目标值都不变'
      : (restart ? '原表可行性与最优性同时被破坏，改为重新求解'
                 : '最优基改变，在原最优表上继续迭代')
  };
  return sensFinish(model, Tuse, judgement, 'a', '技术系数 a_ij 变化',
    { newProblem: newProb, restart: restart, aInfo: { i: i, j: j, oldA: oldA, newA: val } });
}

/* ---- ③ 增加一个约束 ---- */
function sensAddConstraint(baseProblem, scenario) {
  var newProb = sensClone(baseProblem);
  newProb.constraints.push({
    coef: scenario.coef.map(Number), rel: scenario.rel, rhs: Number(scenario.rhs)
  });
  var model = sensBuildModel(newProb);
  if (!model) return sensFail('新约束不合法（系数个数或数值对不上），无法并入原表。');
  var baseRes = simplexSolve(baseProblem);
  var baseNames = sensBasisNames(baseRes);

  /* 旧基在新模型里的列号（新约束的 s/a 排在最后，旧列号其实不变，但仍按名字定位更稳） */
  var basisCols = sensMapBasis(model, baseNames);
  if (basisCols === null) return sensFail('原最优基在新问题里无法定位');

  var mOld = baseProblem.constraints.length;
  var N = model.N;
  var baseModel = sensBuildModel(baseProblem);
  var baseN = baseModel.N;

  /* 旧表：前 mOld 行照抄。注意旧表的列是 0..baseN-1、右端项在列 baseN，
     而新表里下标 baseN 已经是「新增的 s/a 列」了，所以右端项必须单独搬。 */
  var rows = [];
  for (var i = 0; i < mOld; i++) rows.push(new Array(N + 1).fill(0));
  var baseT = sensTableau(baseModel, sensMapBasis(baseModel, baseNames));
  if (!baseT) return sensFail('原最优表构造失败');
  for (var i2 = 0; i2 < mOld; i2++) {
    for (var j = 0; j < baseN; j++) rows[i2][j] = baseT.rows[i2][j];
    rows[i2][N] = baseT.rows[i2][baseN];
  }

  /* 新行：先写成原始系数，再消去旧基变量。
     消元后该行的右端项恰好就是「新约束在当前最优解处的余量」。 */
  var newRow = new Array(N + 1).fill(0);
  var last = mOld;                                  // 新约束在 cons 里的下标
  for (var j2 = 0; j2 < model.n; j2++) {
    newRow[j2] = model.cons[last].coef[j2];
  }
  if (model.sCol[last] !== undefined) {
    newRow[model.sCol[last]] = (model.cons[last].rel === '>=' ? -1 : 1);
  }
  if (model.aCol[last] !== undefined) newRow[model.aCol[last]] = 1;
  newRow[N] = model.cons[last].rhs;

  /* 消元：newRow -= newRow[基列ᵖ] · 第 p 行。
     列与右端项要分开搬（见上），否则右端项会被写进新增的 s 列里。 */
  for (var p = 0; p < mOld; p++) {
    var cb = newRow[basisCols[p]];
    if (Math.abs(cb) < 1e-12) continue;
    for (var j3 = 0; j3 < baseN; j3++) newRow[j3] -= cb * baseT.rows[p][j3];
    newRow[N] -= cb * baseT.rows[p][baseN];
  }

  /* ≥ 约束的剩余变量在标准化里系数是 −1，要让它可以当基变量须整行取负。
     取负后右端项 = 新约束左端 − b，正是「剩余量」，为负即当前解不满足。 */
  var isGe = (model.cons[last].rel === '>=');
  if (isGe) {
    for (var j4 = 0; j4 <= N; j4++) newRow[j4] = -newRow[j4];
  }
  rows.push(newRow);

  var basis = basisCols.slice();
  basis.push(model.cons[last].rel === '=' ? model.aCol[last] : model.sCol[last]);

  /* 新表：前 mOld 行是原最优表，最后一行是新约束消除基变量后的结果。
     表对象带上 m / N —— 内核的 pivot / ratioTest / selectEnteringDantzig 要用 */
  var T = { rows: rows, obj: sensObjRow(model, rows, basis), basis: basis, m: model.m, N: N };

  /* 教材式判断：当前最优解是否满足新约束 */
  var lhs = 0;
  for (var j5 = 0; j5 < model.n; j5++) lhs += model.cons[last].coef[j5] * baseRes.solution[j5];
  var sl = newRow[N];                                // 新约束在当前解处的余量（基变量值）
  var sat = sl > -1e-9;
  var sym = model.cons[last].rel;
  var lines = [];
  lines.push('当前最优解 (' + baseRes.solution.map(fmtNum).join(', ') + ') 处，新约束左端 = '
    + fmtNum(lhs) + ' ' + sym + ' ' + fmtNum(model.cons[last].rhs)
    + ' → ' + (sat ? '满足' : '不满足'));
  lines.push('把新行并入原表并消去基变量后，它自己的松弛/剩余变量取值 = ' + fmtNum(sl)
    + (sat ? ' ≥ 0，原最优解仍然可行，最优解不变'
           : ' < 0，原最优解对新问题不可行 → 用**对偶单纯形法**继续迭代'));

  var judgement = {
    changed: !sat,
    title: '新约束检验',
    head: '把新约束直接并入原来的最优表，看当前最优解是否满足它：',
    lines: lines,
    conclusion: sat ? '最优解不变' : '原最优解不可行，需继续迭代'
  };
  return sensFinish(model, T, judgement, 'add-con', '增加一个约束', { newProblem: newProb });
}

/* ---- ④ 增加一个变量 ---- */
function sensAddVar(baseProblem, scenario) {
  var newProb = sensClone(baseProblem);
  newProb.c = newProb.c.concat([Number(scenario.c)]);
  scenario.coef.forEach(function (v, i) { newProb.constraints[i].coef.push(Number(v)); });
  var model = sensBuildModel(newProb);
  if (!model) return sensFail('新增变量不合法（系数个数或数值对不上），无法并入原表。');

  var baseRes = simplexSolve(baseProblem);
  var baseNames = sensBasisNames(baseRes);
  var basisCols = sensMapBasis(model, baseNames);
  if (basisCols === null) return sensFail('原最优基在新问题里无法定位');
  var T = sensTableau(model, basisCols);
  if (!T) return sensFail('原最优基在新问题里无法定位');

  var jNew = model.n - 1;
  var newC = model.cObj[jNew];
  var zj = sensZj(model, T, jNew);
  var sig = pSub(newC, zj);
  var changed = pIsPos(sig);

  var lines = [];
  lines.push('新变量 ' + nm(jNew) + ' 的检验数 σ′' + sub(jNew + 1) + ' = c′' + sub(jNew + 1)
    + ' − z' + sub(jNew + 1) + ' = ' + fmtPair(newC) + ' − ' + fmtPair(zj) + ' = ' + fmtPair(sig));
  lines.push(changed
    ? '> 0，说明增加这个变量还能让目标函数变好 → 它在新的最优解里会取正值，需继续迭代'
    : '≤ 0，说明增加它不会改善目标函数 → 它仍取 0，最优解不变');

  var judgement = {
    changed: changed,
    title: '新变量检验',
    head: '把新变量作为新的一列并入原最优表，算它的检验数：',
    lines: lines,
    conclusion: changed ? '最优解改变，需继续迭代' : '最优解不变'
  };
  return sensFinish(model, T, judgement, 'add-var', '增加一个变量', { newProblem: newProb });
}


module.exports = {
  sensChangeC: sensChangeC,
  sensChangeB: sensChangeB,
  sensChangeA: sensChangeA,
  sensAddConstraint: sensAddConstraint,
  sensAddVar: sensAddVar
};
