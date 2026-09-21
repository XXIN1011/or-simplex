/* =========================================================================
   指派问题（匈牙利法）：例题验证 + 逐步过程自检 + 随机题库生成（供 scipy 对拍）
   -------------------------------------------------------------------------
   这一套做三件事，缺一不可：

   ① **逐步过程自检**（本文件最有价值的部分）：不看结论，直接把 steps 里每一张
      矩阵快照拿「上一张 + 这一步宣称做的事」从头重算一遍，逐格比对。匈牙利法的
      教学价值全在中间过程上，只对最终最优值对拍是查不出「调整量取反」这类错的。

   ② **与独立实现对照**：同一个问题用「按列集合做子集 DP」再解一遍 —— 它和
      匈牙利法的实现路径毫无共同点（一个在矩阵上归约/覆盖线，一个枚举子集），
      所以两者都错成同一个数的概率很低。

   ③ **覆盖线的双向验证**：既证明圈出的 0 是**最多**的（圈数 ≥ 覆盖线条数是
      König 定理的另一面，这里还直接验证「覆盖线盖住了矩阵里全部 0」），
      也证明覆盖线是**最少**的（覆盖线条数 = 圈数 ⇒ 任何覆盖都不可能更少）。

   随机题库写进 assignment-bank.json（gitignore），交给 crosscheck-assign.py
   用 scipy.optimize.linear_sum_assignment 再解一遍 —— 第三份独立实现。
   ========================================================================= */
'use strict';

const A = require('../../src/core/assignment.js');
const { fmtNum } = require('../../src/core/format.js');
const fs = require('fs');
const path = require('path');

const EPS = 1e-9;
let bad = [];
function fail(msg) { bad.push(msg); }

/* ---------------- 独立实现①：子集 DP 口径（按列集合递推，与匈牙利法零共用代码） ----------------
   状态 = 已经用掉的列集合，逐行推进。禁止格直接不可用。
   与匈牙利法共享的只有「问题的定义」，没有任何共用代码。 */
function subsetOptimal(cost, direction) {
  const m = cost.length;
  const n = m ? cost[0].length : 0;
  if (m === 0 || n === 0) return { feasible: true, objective: 0 };
  const N = Math.max(m, n);
  const P = [];
  for (let i = 0; i < m; i++) { const r = cost[i].slice(); for (let j = n; j < N; j++) r.push(0); P.push(r); }
  for (let i = m; i < N; i++) { const r = []; for (let j = 0; j < N; j++) r.push(0); P.push(r); }

  const size = 1 << N;
  const f = new Array(size).fill(Infinity);      /* f[已用列集合] = 前 |集合| 行的最小代价 */
  f[0] = 0;
  for (let mask = 0; mask < size; mask++) {
    if (f[mask] === Infinity) continue;
    let i = 0;
    for (let b = 0; b < N; b++) if (mask & (1 << b)) i++;
    if (i >= N) continue;
    for (let j = 0; j < N; j++) {
      if (mask & (1 << j)) continue;
      const v = P[i][j];
      if (v === null) continue;                      // 禁止指派：这条边不存在
      const w = direction === 'max' ? -v : v;         // 最大化 → 最小化 −c（虚拟格 0 不影响）
      const nm = mask | (1 << j);
      if (f[mask] + w < f[nm]) f[nm] = f[mask] + w;
    }
  }
  const full = f[size - 1];
  if (full === Infinity) return { feasible: false, objective: null };
  const objective = direction === 'max' ? -full : full;
  return { feasible: true, objective: Math.abs(objective) < 1e-12 ? 0 : objective };
}

/* ---------------- 逐步过程自检 ---------------- */

const cloneM = M => M.map(r => r.slice());
function rowMins(M) { return M.map(r => { let b = null; for (const v of r) if (v !== null && (b === null || v < b)) b = v; return b; }); }
function colMins(M) { const N = M.length, out = []; for (let j = 0; j < N; j++) { let b = null; for (let i = 0; i < N; i++) if (M[i][j] !== null && (b === null || M[i][j] < b)) b = M[i][j]; out.push(b); } return out; }
const isZero = v => v !== null && Math.abs(v) < EPS;
function countZeros(M) { let c = 0; for (const r of M) for (const v of r) if (isZero(v)) c++; return c; }
function sameCell(a, b) { if (a === null || b === null) return a === b; return Math.abs(a - b) < 1e-9; }
function sameMatrix(X, Y) {
  if (X.length !== Y.length) return false;
  for (let i = 0; i < X.length; i++) for (let j = 0; j < X[i].length; j++) if (!sameCell(X[i][j], Y[i][j])) return false;
  return true;
}

/**
 * verifySteps —— 从 res.working 出发，把每一步的矩阵重新算一遍。
 * @returns {string[]} 问题列表（空数组 = 全部通过）
 */
function verifySteps(res, tag) {
  const errs = [];
  const N = res.N;
  if (res.status !== 'optimal') return errs;

  let prev = cloneM(res.working);
  const phases = [];
  let prevTrySize = -1;      // 上一轮试指派圈出的个数（每轮调整后必须严格变多）

  res.steps.forEach((s, k) => {
    const where = tag + ' 第' + (k + 1) + '步(' + s.phase + ')';
    phases.push(s.phase);

    if (s.phase === 'row') {
      const mn = rowMins(prev);
      if (JSON.stringify(mn.map(v => v === null ? null : +v.toFixed(9))) !== JSON.stringify(s.amounts.map(v => v === null ? null : +v.toFixed(9)))) {
        errs.push(where + ' 行最小值与重算不一致');
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const exp = prev[i][j] === null ? null : prev[i][j] - mn[i];
        if (!sameCell(exp, s.matrix[i][j])) errs.push(where + ' 第' + (i + 1) + '行第' + (j + 1) + '列应为 ' + exp + '，表里是 ' + s.matrix[i][j]);
      }
    } else if (s.phase === 'col') {
      const mn = colMins(prev);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const exp = prev[i][j] === null ? null : prev[i][j] - mn[j];
        if (!sameCell(exp, s.matrix[i][j])) errs.push(where + ' 第' + (i + 1) + '行第' + (j + 1) + '列应为 ' + exp + '，表里是 ' + s.matrix[i][j]);
      }
      // 归约之后每行每列都该有 0
      for (let i = 0; i < N; i++) if (rowMins(s.matrix)[i] !== 0) errs.push(where + ' 第' + (i + 1) + '行没有 0 元素');
      for (let j = 0; j < N; j++) if (colMins(s.matrix)[j] !== 0) errs.push(where + ' 第' + (j + 1) + '列没有 0 元素');

    } else if (s.phase === 'try') {
      if (!sameMatrix(prev, s.matrix)) errs.push(where + ' 试指派不该改动矩阵');
      // ① 圈出来的是合法的最大匹配：互不同行同列，且都落在 0 上
      const rowsSeen = new Set(), colsSeen = new Set();
      s.matching.forEach(([r, c]) => {
        if (rowsSeen.has(r) || colsSeen.has(c)) errs.push(where + ' 圈出了一个同行或同列的指派 (' + (r + 1) + ',' + (c + 1) + ')');
        rowsSeen.add(r); colsSeen.add(c);
        if (!isZero(s.matrix[r][c])) errs.push(where + ' 圈住的 (' + (r + 1) + ',' + (c + 1) + ') 不是 0 元素');
      });
      /* 圈数只能不减。注意它**不保证**每轮都严格变多：教材的「覆盖线→调整」是让
         增广树的规模变大，真正多圈出一个 0 可能在下一轮才发生（实测 1200 道题里
         停顿轮数平均很小）。所以这里判「不减」，另由「轮数有限且状态终止」兜底。 */
      if (prevTrySize >= 0 && s.matching.length < prevTrySize) {
        errs.push(where + ' 本轮圈出 ' + s.matching.length + ' 个，比上一轮的 ' + prevTrySize + ' 个还少');
      }
      prevTrySize = s.matching.length;
      // ② 标记要和矩阵对得上：圈 = 匹配，划掉 = 与已匹配的行/列同处的 0
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const got = s.marks ? s.marks[i][j] : null;
        if (isZero(s.matrix[i][j])) {
          // 教材的读法：圈住的 0 就是这次指派本身；同一行或同一列上已经被圈过的其它 0 一律划掉
          const matched = s.matching.some(([r, c]) => r === i && c === j);
          const want = matched ? 'circ' : ((rowsSeen.has(i) || colsSeen.has(j)) ? 'cross' : null);
          if (want !== got) {
            errs.push(where + ' 0 元素 (' + (i + 1) + ',' + (j + 1) + ') 的标记应是 '
              + (want || '不标记') + '，实际是 ' + (got || '不标记'));
          }
        } else if (got) {
          errs.push(where + ' 非 0 元素 (' + (i + 1) + ',' + (j + 1) + ') 被标成了 ' + got);
        }
      }
      if (s.done !== (s.matching.length === N)) errs.push(where + ' done 标记与圈数不一致');

    } else if (s.phase === 'cover') {
      if (!sameMatrix(prev, s.matrix)) errs.push(where + ' 画覆盖线不该改动矩阵');
      // ★ 双向验证：线盖住了全部 0（⇒ 覆盖合法），且线条数 = n − 圈数（⇒ 覆盖最少、圈数最多）
      let covered = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        if (!isZero(s.matrix[i][j])) continue;
        const byRow = s.lines.rows[i], byCol = s.lines.cols[j];
        if (!byRow && !byCol) errs.push(where + ' 0 元素 (' + (i + 1) + ',' + (j + 1) + ') 没有被任何一条线盖住');
      }
      for (let i = 0; i < N; i++) if (s.lines.rows[i]) covered++;
      for (let j = 0; j < N; j++) if (s.lines.cols[j]) covered++;
      // König 定理：最少覆盖线的条数 = 最多独立零元素的个数（= 上一步圈出的个数）
      const circles = res.steps[k - 1].matching.length;
      if (covered !== circles) errs.push(where + ' 覆盖线 ' + covered + ' 条，应为最多独立零元素个数 = ' + circles);
      // 打勾法：打勾的行 = 没有横线的行、打勾的列 = 有竖线的列，且打勾行里的 0 必然都在打勾列上
      const markRow = s.lines.rows.map(v => !v);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        if (isZero(s.matrix[i][j]) && markRow[i] && !s.lines.cols[j]) {
          errs.push(where + ' 打勾的行 ' + (i + 1) + ' 里的 0 元素 (' + (i + 1) + ',' + (j + 1) + ') 没有落在打勾的列上');
        }
      }
      if (!s.details.length) errs.push(where + ' 缺少讲解文字');

    } else if (s.phase === 'adjust') {
      // 未覆盖区 = 打勾的行 × 没打勾的列；θ 取其中的最小元素
      const lineRows = s.lines.rows, lineCols = s.lines.cols;
      let theta = null;
      for (let i = 0; i < N; i++) {
        if (lineRows[i]) continue;
        for (let j = 0; j < N; j++) {
          if (lineCols[j]) continue;
          const v = prev[i][j];
          if (v === null) continue;
          if (theta === null || v < theta) theta = v;
        }
      }
      if (theta === null || theta <= EPS) errs.push(where + ' 未覆盖区里算不出正的 θ');
      else if (Math.abs(theta - s.theta) > 1e-9) errs.push(where + ' θ = ' + fmtNum(theta) + '，表里是 ' + fmtNum(s.theta));
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        if (prev[i][j] === null) { if (s.matrix[i][j] !== null) errs.push(where + ' 禁止格被改动了'); continue; }
        // 逐格口径：未覆盖 −θ、交叉 +θ、只被一条线盖住的不变
        const cov = (lineRows[i] ? 1 : 0) + (lineCols[j] ? 1 : 0);
        const d = cov === 0 ? -theta : (cov === 2 ? theta : 0);
        if (!sameCell(prev[i][j] + d, s.matrix[i][j])) {
          errs.push(where + ' 第' + (i + 1) + '行第' + (j + 1) + '列应为 ' + (prev[i][j] + d) + '，表里是 ' + s.matrix[i][j]);
        }
      }
      /* 调整的收益是「未覆盖区里冒出了新的 0」——这是它必然发生的事；
         总 0 元素个数反而**不保证**增加：被打两条线交叉盖住的格子会 +θ，
         那里若原本就是 0（未打勾的行 × 打勾的列上确实可能有 0），这个 0 就没了。 */
      let newZeros = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        if (!lineRows[i] && !lineCols[j] && isZero(s.matrix[i][j])) newZeros++;
      }
      if (!newZeros) errs.push(where + ' 未覆盖区里没有冒出新的 0，调整白做了');
      for (const r of s.matrix) for (const v of r) if (v !== null && v < -1e-9) errs.push(where + ' 出现负元素 ' + v);
    } else {
      errs.push(where + ' 未知的步骤类型');
    }
    prev = cloneM(s.matrix);
  });

  // 步骤顺序：第 1 轮必须是「行归约 → 列归约 → 试指派」，之后每轮「试指派 → 覆盖线 → 调整」
  if (!phases.length) return errs;                       // 空问题没有迭代步骤
  if (phases[0] !== 'row' || phases[1] !== 'col') errs.push(tag + ' 开头应当是行归约 → 列归约');
  if (phases[2] !== 'try') errs.push(tag + ' 归约之后应当先试指派');
  for (let k = 3; k < phases.length; k += 3) {
    if (phases[k] !== 'cover' || phases[k + 1] !== 'adjust' || phases[k + 2] !== 'try') {
      errs.push(tag + ' 第 ' + (k + 1) + ' 步起的循环应当是 覆盖线 → 调整 → 试指派，实际是 '
        + phases.slice(k, k + 3).join('/'));
      break;
    }
  }
  return errs;
}

/* ---------------- 结论自检 ---------------- */

function verifyResult(problem, res, tag) {
  const errs = [];
  const m = problem.cost.length, n = m ? problem.cost[0].length : 0;
  if (res.ok !== true) { errs.push(tag + ' ok 应为 true'); return errs; }
  const opt = subsetOptimal(problem.cost, problem.direction);

  if (res.status !== 'optimal') {
    if (opt.feasible) errs.push(tag + ' 判 ' + res.status + '，但独立实现算出了可行最优解 ' + opt.objective);
    return errs;
  }
  if (!opt.feasible) { errs.push(tag + ' 算出了最优解，但独立实现说无可行解'); return errs; }

  if (Math.abs(res.objective - opt.objective) > 1e-6) {
    errs.push(tag + ' 最优值 ' + fmtNum(res.objective) + ' ≠ 独立实现 ' + fmtNum(opt.objective));
  }
  // 指派本身要合法：每行每列各一次、不落在禁止格上
  const rowSeen = new Set(), colSeen = new Set();
  res.assignment.forEach(a => {
    if (rowSeen.has(a.row) || colSeen.has(a.col)) errs.push(tag + ' 指派重复使用第 ' + (a.row + 1) + ' 行或第 ' + (a.col + 1) + ' 列');
    rowSeen.add(a.row); colSeen.add(a.col);
    if (res.padded[a.row][a.col] === null) errs.push(tag + ' 把禁止指派的格子 (' + (a.row + 1) + ',' + (a.col + 1) + ') 派了出去');
  });
  if (res.assignment.length !== res.N) errs.push(tag + ' 指派个数 ' + res.assignment.length + ' ≠ n = ' + res.N);

  // 目标值 = 指派用的那些格子的元素之和
  let z = 0;
  res.assignment.forEach(a => { z += a.cost; });
  if (Math.abs(z - res.objective) > 1e-9) errs.push(tag + ' 目标值 ' + res.objective + ' ≠ 指派格子之和 ' + z);

  // 最大化：Σb = n·M − z 必须成立（转换没算歪的证据）
  if (res.direction === 'max') {
    if (res.M === null) errs.push(tag + ' 最大化问题没有给出转换常数 M');
    else if (Math.abs(res.zMin - (res.N * res.M - res.objective)) > 1e-6) {
      errs.push(tag + ' n·M − z = ' + fmtNum(res.N * res.M - res.objective) + '，但 Σb = ' + fmtNum(res.zMin));
    }
  } else if (Math.abs(res.zMin - res.objective) > 1e-9) {
    errs.push(tag + ' 最小化问题 Σb 应等于 z');
  }

  errs.push(...verifySteps(res, tag));
  return errs;
}

/* ---------------- 例题（教材式的小题，手工核对过） ---------------- */

function show(res, title) {
  console.log('\n' + '='.repeat(74));
  console.log(title);
  console.log('='.repeat(74));
  res.steps.forEach(s => {
    console.log('\n[' + s.round + '-' + s.phase + '] ' + s.label + '　' + s.title);
    s.matrix.forEach((row, i) => {
      let line = '  ';
      row.forEach((v, j) => {
        const mk = s.marks && s.marks[i][j];
        const cell = (v === null ? '  ×' : fmtNum(v).padStart(4));
        line += (mk === 'circ' ? '(' + cell + ')' : (mk === 'cross' ? ' ' + cell + ' ' : ' ' + cell + ' '));
      });
      if (s.lines && s.lines.rows[i]) line += '   ← 横线';
      console.log(line);
    });
    if (s.lines) console.log('  竖线所在列：' + s.lines.cols.map((v, j) => v ? (j + 1) : null).filter(x => x) .join('、'));
    s.details.forEach(d => console.log('  · ' + d));
    console.log('  → ' + s.note);
  });
  console.log('\n最终指派：');
  res.assignment.forEach(a => {
    console.log('  ' + a.rowName + ' → ' + a.colName
      + (a.used ? '　费用/收益 ' + fmtNum(a.cost) : '　（虚拟，表示没有真实工作）'));
  });
  console.log('  z = ' + fmtNum(res.objective)
    + (res.direction === 'max' ? '（Σb = ' + fmtNum(res.zMin) + '，n·M = ' + fmtNum(res.N * res.M) + '）' : ''));
  console.log('  迭代轮数 = ' + res.roundCount);
}

/* ---- 例题 1：最小化 4×4（教材式的费用矩阵） ---- */
const p1 = { direction: 'min', cost: [[2, 15, 13, 4], [10, 4, 14, 15], [9, 14, 16, 13], [7, 8, 11, 9]] };
const r1 = A.assignSolve(p1);
show(r1, '例题1  min　4 人 4 事：每行减最小 → 试指派 → 覆盖线 → 调整');
bad.push(...verifyResult(p1, r1, '例题1'));

/* ---- 例题 2：最大化 4×4（m1：收益矩阵） ---- */
const p2 = { direction: 'max', cost: [[38, 42, 31, 45], [26, 20, 35, 28], [40, 33, 29, 37], [22, 30, 41, 25]] };
const r2 = A.assignSolve(p2);
show(r2, '例题2  max　4 人 4 事：b = M − c 转最小化');
bad.push(...verifyResult(p2, r2, '例题2'));

/* ---- 例题 3：非标准 —— 人少事多（补虚拟人员）+ 禁止指派 ---- */
const p3 = { direction: 'min', cost: [[3, 8, null], [7, null, 5]] };
const r3 = A.assignSolve(p3);
show(r3, '例题3  min　2 人 3 事（补虚拟人员）+ 两处「禁止指派」');
bad.push(...verifyResult(p3, r3, '例题3'));

/* ---- 例题 4：无可行解（两个人只能做同一件事） ---- */
const p4 = { direction: 'min', cost: [[null, 5], [null, 3]] };
const r4 = A.assignSolve(p4);
console.log('\n例题4  min　2 人 2 事但两人都只能做第 2 件事：status = ' + r4.status);
console.log('  ' + r4.message);
bad.push(...verifyResult(p4, r4, '例题4'));

/* ---- 边界：0 行 / 0 列 / 1×1 ---- */
const r5 = A.assignSolve({ direction: 'min', cost: [] });
console.log('\n边界：0 行 0 列 → status = ' + r5.status + '，z = ' + fmtNum(r5.objective) + '；' + r5.message);
bad.push(...verifyResult({ direction: 'min', cost: [] }, r5, '边界0'));
const r6 = A.assignSolve({ direction: 'max', cost: [[7]] });
console.log('边界：1×1 max → 指派 ' + r6.assignment[0].rowName + ' → ' + r6.assignment[0].colName + '，z = ' + fmtNum(r6.objective));
bad.push(...verifyResult({ direction: 'max', cost: [[7]] }, r6, '边界1'));

/* ============================ 随机题库 ============================ */
/* 固定种子的 LCG：题库必须可复现，否则对拍脚本的「逐字节」没意义 */
let seed = 20260921;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

const bank = [];
let nOpt = 0, nInf = 0, nVirtual = 0, nForbid = 0, roundsHist = {};
let stallCases = 0, stallRoundsTotal = 0, maxStall = 0, maxRounds = 0;
for (let t = 0; t < 1200; t++) {
  const direction = rnd() < 0.5 ? 'min' : 'max';
  let m = ri(1, 8), n = ri(1, 8);
  if (rnd() < 0.65) n = m;                                     // 六成方阵
  const cost = [];
  for (let i = 0; i < m; i++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      // 收益矩阵的取值范围刻意画宽：负数会让「不做」比「做」更划算，是真实会遇到的题型
      const dense = rnd();
      if (dense < 0.14) row.push(null);                        // 约 14% 的格子禁止指派
      else if (direction === 'max') row.push(ri(-5, 60));
      else row.push(ri(0, 40));
    }
    cost.push(row);
  }
  const problem = { direction, cost };
  const res = A.assignSolve(problem);
  const errs = verifyResult(problem, res, '随机#' + (t + 1) + '（' + direction + ' ' + m + '×' + n + '）');
  bad.push(...errs.slice(0, 4));
  if (res.status === 'optimal') {
    nOpt++;
    roundsHist[res.roundCount] = (roundsHist[res.roundCount] || 0) + 1;
    if (res.stallRounds) { stallCases++; stallRoundsTotal += res.stallRounds; maxStall = Math.max(maxStall, res.stallRounds); }
    maxRounds = Math.max(maxRounds, res.roundCount);
    if (res.hasVirtual) nVirtual++;
    if (res.padded.some(r => r.some(v => v === null))) nForbid++;
  } else nInf++;
  bank.push({
    id: t + 1, direction: direction, cost: cost,
    js_status: res.status, js_objective: res.objective,
    js_rounds: res.roundCount, js_M: res.M
  });
}

const OUT = path.join(__dirname, 'assignment-bank.json');
fs.writeFileSync(OUT, JSON.stringify(bank), 'utf8');
console.log('\n随机题库已生成: assignment-bank.json (' + bank.length + ' 题)');
console.log('  最优 ' + nOpt + ' 题（其中含虚拟行列 ' + nVirtual + '、含禁止指派 ' + nForbid
  + '）；无可行解 ' + nInf + ' 题');
console.log('  迭代轮数分布: ' + Object.keys(roundsHist).sort((a, b) => a - b)
  .map(k => k + ' 轮 × ' + roundsHist[k]).join('，'));
console.log('  最多 ' + maxRounds + ' 轮结束；出现「调整完圈数暂时不变」的题 ' + stallCases
  + ' 道（合计 ' + stallRoundsTotal + ' 轮，单题最多连续 ' + maxStall + ' 轮）');

if (bad.length) {
  console.log('\n!!! 不通过 ' + bad.length + ' 条：');
  bad.slice(0, 20).forEach(x => console.log('  ' + x));
} else {
  console.log('\n✓ 全部通过');
}
console.log('\n结论:', bad.length ? 'FAIL' : 'PASS');
process.exit(bad.length ? 1 : 0);
