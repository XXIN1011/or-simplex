/* =========================================================================
   单元测试 · 指派问题（core/assignment.js）与它的数据契约（core/model.js）
   -------------------------------------------------------------------------
   这里钉两类东西：
     ① **数值**：几道手工核对过的题（含最大化、非方阵、禁止指派、无可行解、
        空矩阵、1×1、全相等），以及「禁止指派的格子永远不会被派出去」这类硬约束；
     ② **结构契约**：结果对象与步骤对象的**字段顺序**（题库要逐字节对拍）、
        同一输入两次求解必须完全一致（否则题库不可复现）。
   随机化的对拍在 test/algorithm/assignment-test.js（逐步过程自检 + 子集 DP）
   与 crosscheck-assign.py（scipy 第三方实现）里，不在这里重复。
   ========================================================================= */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const A = require('../../src/core/assignment.js');
const model = require('../../src/core/model.js');
const format = require('../../src/core/format.js');

/* 独立的暴力口径（全排列），只用来复核小规模的最优值 —— 与匈牙利法零共用代码 */
function bruteForce(cost, direction) {
  const m = cost.length, n = m ? cost[0].length : 0;
  if (!m || !n) return 0;
  const N = Math.max(m, n);
  const P = [];
  for (let i = 0; i < m; i++) { const r = cost[i].slice(); for (let j = n; j < N; j++) r.push(0); P.push(r); }
  for (let i = m; i < N; i++) { const r = []; for (let j = 0; j < N; j++) r.push(0); P.push(r); }
  const cols = [];
  for (let j = 0; j < N; j++) cols.push(j);
  let best = null;
  const perm = (arr, cur) => {
    if (!arr.length) {
      let z = 0;
      for (let i = 0; i < N; i++) {
        if (P[i][cur[i]] === null) return;                 // 用到了禁止指派 ⇒ 这个排列不合法
        z += P[i][cur[i]];
      }
      const val = direction === 'max' ? z : z;
      if (best === null || (direction === 'max' ? val > best : val < best)) best = val;
      return;
    }
    for (let k = 0; k < arr.length; k++) {
      perm(arr.slice(0, k).concat(arr.slice(k + 1)), cur.concat([arr[k]]));
    }
  };
  if (N <= 7) perm(cols, []);
  return best;
}

test('教材式 4×4 最小化：z = 28，且逐行指派正确', () => {
  const cost = [[2, 15, 13, 4], [10, 4, 14, 15], [9, 14, 16, 13], [7, 8, 11, 9]];
  const res = A.assignSolve({ direction: 'min', cost: cost });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.status, 'optimal');
  assert.strictEqual(res.objective, 28);
  assert.strictEqual(res.roundCount, 1);
  assert.deepStrictEqual(res.pairs, [[0, 3, 4], [1, 1, 4], [2, 0, 9], [3, 2, 11]]);
  /* 三步：行归约、列归约、试指派（一次到位，没有 ④⑤） */
  assert.deepStrictEqual(res.steps.map(s => s.phase), ['row', 'col', 'try']);
  assert.strictEqual(res.steps[2].matching.length, 4);
  assert.strictEqual(res.steps[2].done, true);
});

test('最大化 4×4：z = 151（= n·M − Σb），M 取矩阵最大元素', () => {
  const cost = [[38, 42, 31, 45], [26, 20, 35, 28], [40, 33, 29, 37], [22, 30, 41, 25]];
  const res = A.assignSolve({ direction: 'max', cost: cost });
  assert.strictEqual(res.status, 'optimal');
  assert.strictEqual(res.M, 45);
  assert.strictEqual(res.objective, 151);
  /* 转换后求和的最小值必须满足 Σb = n·M − z */
  assert.strictEqual(res.zMin, 4 * 45 - 151);
  assert.strictEqual(res.roundCount, 2);
  /* 第 1 轮走到覆盖线与调整，第 2 轮才圈满 */
  assert.deepStrictEqual(res.steps.map(s => s.phase),
    ['row', 'col', 'try', 'cover', 'adjust', 'try']);
  assert.deepStrictEqual(res.steps.map(s => s.phase).filter(p => p === 'cover').length, 1);
  /* 覆盖线条数 = 该轮圈出的独立零元素个数（König） */
  const cover = res.steps[3];
  let lines = 0;
  cover.lines.rows.forEach(v => { if (v) lines++; });
  cover.lines.cols.forEach(v => { if (v) lines++; });
  assert.strictEqual(lines, res.steps[2].matching.length);
});

test('人数与工作数不等：补虚拟人员，虚拟格的费用是 0 而不是转换后的 0', () => {
  const cost = [[3, 8, 5], [7, 2, 5]];
  const res = A.assignSolve({ direction: 'min', cost: cost });
  assert.strictEqual(res.hasVirtual, true);
  assert.deepStrictEqual(res.virtualRows, [2]);
  assert.deepStrictEqual(res.virtualCols, []);
  assert.strictEqual(res.N, 3);
  /* 最优：人员1 → 工作1（3）、人员2 → 工作2（2）、工作3 落到虚拟人员头上（0），
     所以 z = 5 而不是 3+2+5 —— 「没人做」的那一项不计费，这正是虚拟行列的意义 */
  assert.strictEqual(res.objective, 3 + 2);
  assert.strictEqual(bruteForce(cost, 'min'), 5);
  assert.strictEqual(bruteForce(cost, 'min'), res.objective);
  /* 虚拟行在「进入匈牙利法的矩阵」里必须是 0（最小化不作转换） */
  assert.deepStrictEqual(res.working[2], [0, 0, 0]);
  assert.strictEqual(res.assignment[2].colVirtual, false);
  assert.strictEqual(res.assignment[2].rowVirtual, true);
  assert.strictEqual(res.assignment[2].used, false);
});

test('最大化 + 非方阵：虚拟格在 b 口径下是 M（不能在转换之后再补 0）', () => {
  /* 3 个人 2 件事，收益：这道题里第二名收益是负的 → 最优是「宁可不做」 */
  const cost = [[10, 4], [3, -2], [-5, -1]];
  const res = A.assignSolve({ direction: 'max', cost: cost });
  assert.strictEqual(res.status, 'optimal');
  assert.strictEqual(res.N, 3);
  assert.deepStrictEqual(res.virtualCols, [2]);
  assert.strictEqual(res.M, 10);                          // 含虚拟格（费用 0）在内的最大元素
  /* 逐种指派比对后最优是：人员1 → 工作1（10）、人员3 → 工作2（−1）、人员2 闲着（0）→ z = 9。
     注意负收益那一格没被选中：宁可让这个人闲着，也不做亏本的活。 */
  assert.strictEqual(res.objective, 10 - 1);
  assert.strictEqual(res.zMin, 3 * res.M - 9);
  assert.strictEqual(bruteForce(cost, 'max'), 9);
  /* 谁被派到虚拟工作，谁就是「没有活干」的那个：这里是人员2（第 2 行） */
  assert.strictEqual(res.assignment[1].colVirtual, true);
  assert.strictEqual(res.assignment[1].cost, 0);
  assert.strictEqual(res.assignment[1].used, false);
});

test('禁止指派：最便宜的那一格也永远不会被派出去', () => {
  const cost = [[1, null], [null, 9]];
  const res = A.assignSolve({ direction: 'min', cost: [[null, 1], [9, null]] });
  assert.strictEqual(res.status, 'optimal');
  assert.strictEqual(res.objective, 1 + 9);               // 只能走 (1,2) 与 (2,1) 这一条对角线
  res.assignment.forEach(a => assert.notStrictEqual(res.padded[a.row][a.col], null));

  /* 最大化时同理：b = M − c 不会把禁止格「减」成可用的格子 */
  const r2 = A.assignSolve({ direction: 'max', cost: [[1, null], [9, null]] });
  assert.strictEqual(r2.status, 'infeasible');             // 两行都只能做工作1 → 无完整指派
  assert.strictEqual(r2.assignment.length, 0);
});

test('无可行解：有人无活可干时给出确定结论与原因', () => {
  const res = A.assignSolve({ direction: 'min', cost: [[null, 5], [null, 3]] });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.status, 'infeasible');
  assert.strictEqual(res.objective, null);
  assert.ok(res.message.indexOf('工作1') >= 0, res.message);
  assert.deepStrictEqual(res.steps, []);
});

test('0 行 / 0 列：合法输入，返回确定结论而不是报错', () => {
  const r1 = A.assignSolve({ direction: 'min', cost: [] });
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.status, 'optimal');
  assert.strictEqual(r1.empty, true);
  assert.strictEqual(r1.objective, 0);
  assert.deepStrictEqual(r1.steps, []);
  const r2 = A.assignSolve({ direction: 'max', cost: [[], []] });
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(r2.status, 'optimal');
  assert.strictEqual(r2.objective, 0);
});

test('1×1：直接取那一格', () => {
  const res = A.assignSolve({ direction: 'max', cost: [[7]] });
  assert.strictEqual(res.objective, 7);
  assert.strictEqual(res.N, 1);
  assert.deepStrictEqual(res.pairs, [[0, 0, 7]]);
  assert.strictEqual(res.M, 7);
});

test('全相等矩阵（多重最优）：值正确且指派合法', () => {
  const cost = [[4, 4, 4], [4, 4, 4], [4, 4, 4]];
  const res = A.assignSolve({ direction: 'min', cost: cost });
  assert.strictEqual(res.objective, 12);
  assert.deepStrictEqual(res.assignment.map(a => a.col).sort(), [0, 1, 2]);
  assert.strictEqual(bruteForce(cost, 'min'), 12);
});

test('随机小规模：与全排列暴力口径逐题一致（含负数与禁止格）', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  for (let t = 0; t < 60; t++) {
    const dir = rnd() < 0.5 ? 'min' : 'max';
    const m = ri(1, 4), n = ri(1, 4);
    const cost = [];
    for (let i = 0; i < m; i++) {
      const row = [];
      for (let j = 0; j < n; j++) row.push(rnd() < 0.2 ? null : ri(-6, 20));
      cost.push(row);
    }
    const res = A.assignSolve({ direction: dir, cost: cost });
    const expect = bruteForce(cost, dir);
    if (expect === null) {
      assert.strictEqual(res.status, 'infeasible', JSON.stringify(cost));
    } else {
      assert.strictEqual(res.status, 'optimal', JSON.stringify(cost));
      assert.strictEqual(res.objective, expect, JSON.stringify(cost) + ' dir=' + dir);
      assert.strictEqual(res.assignment.length, res.N);
    }
  }
});

test('输入容错：字符串数字、x / × / - / null 都认得；列数不齐要报错', () => {
  const res = A.assignSolve({ direction: 'min', cost: [['3', 'x'], ['-', 5]] });
  assert.strictEqual(res.status, 'optimal');
  assert.strictEqual(res.objective, 3 + 5);
  assert.deepStrictEqual(res.original, [[3, null], [null, 5]]);
  const bad = A.assignSolve({ direction: 'min', cost: [[1, 2], [3]] });
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.message.indexOf('列数') >= 0, bad.message);
  const bad2 = A.assignSolve({ direction: 'min', cost: [[1, 'abc']] });
  assert.strictEqual(bad2.ok, false);
  assert.ok(bad2.message.indexOf('不是有效数字') >= 0, bad2.message);
});

test('结构契约：结果与步骤的字段顺序固定', () => {
  const res = A.assignSolve({ direction: 'min', cost: [[1, 2], [3, 4]] });
  assert.deepStrictEqual(Object.keys(res), [
    'ok', 'status', 'direction', 'message', 'm', 'n', 'N', 'empty', 'hasVirtual',
    'virtualRows', 'virtualCols', 'original', 'padded', 'working', 'M', 'steps',
    'roundCount', 'stallRounds', 'assignment', 'pairs', 'objective', 'zMin',
    'rowLabels', 'colLabels'
  ]);
  assert.deepStrictEqual(Object.keys(res.steps[0]), [
    'round', 'phase', 'label', 'title', 'matrix', 'marks', 'lines', 'theta',
    'amounts', 'matching', 'details', 'note', 'done'
  ]);
  assert.deepStrictEqual(Object.keys(model.createAssignStep({
    round: 1, phase: 'row', label: '', title: '', matrix: [[0]]
  })), [
    'round', 'phase', 'label', 'title', 'matrix', 'marks', 'lines', 'theta',
    'amounts', 'matching', 'details', 'note', 'done'
  ]);
});

test('可复现：同一道题两次求解的 JSON 逐字节相同', () => {
  const p = { direction: 'max', cost: [[38, 42, 31, 45], [26, 20, 35, 28], [40, 33, 29, 37], [22, 30, 41, 25]] };
  const a = JSON.stringify(A.assignSolve(p));
  const b = JSON.stringify(A.assignSolve(p));
  assert.strictEqual(a, b);
});

test('符号说明表：条目齐全、可直接渲染', () => {
  const syms = A.assignSymbols();
  assert.ok(syms.length >= 10);
  syms.forEach(s => {
    assert.strictEqual(typeof s.k, 'string');
    assert.ok(s.d.length > 8);
    assert.ok(s.k.indexOf('<') < 0, '符号说明里不要塞 HTML：CLI 与界面共用同一份文案');
  });
  const keys = syms.map(s => s.k).join('|');
  ['c_ij', 'x_ij', 'b_ij', 'θ', '覆盖线', '×（禁止指派）'].forEach(k => {
    assert.ok(keys.indexOf(k) >= 0, '缺少符号：' + k);
  });
});

test('纯文本报告：把每一步与最终指派都写出来', () => {
  const res = A.assignSolve({ direction: 'min', cost: [[2, 15, 13, 4], [10, 4, 14, 15], [9, 14, 16, 13], [7, 8, 11, 9]] });
  const txt = format.assignReport(res, A.assignSymbols());
  assert.ok(txt.indexOf('指派问题（匈牙利法）· 最小化') >= 0);
  assert.ok(txt.indexOf('① 行归约') >= 0 && txt.indexOf('③ 试指派') >= 0);
  assert.ok(txt.indexOf('人员1 → 工作4') >= 0);
  assert.ok(txt.indexOf('最小总费用 z = 28') >= 0);
  assert.ok(txt.indexOf('符号说明') >= 0);
  assert.ok(txt.indexOf('(0)') >= 0, '圈定的 0 在文本里应当写成 (0)');
  /* 非最优时只报结论与原因，不硬凑过程 */
  const bad = format.assignReport(A.assignSolve({ direction: 'min', cost: [[null, 5], [null, 3]] }), null);
  assert.ok(bad.indexOf('无可行解') >= 0);
});

test('覆盖线的双向验证：盖住全部 0，且条数 = 最多独立零元素个数', () => {
  const res = A.assignSolve({ direction: 'min', cost: [[4, 1, 3], [2, 0, 5], [3, 2, 2]] });
  const tryStep = res.steps.find(s => s.phase === 'try');
  const cover = res.steps.find(s => s.phase === 'cover');
  assert.ok(cover, '这道题应当需要覆盖线');
  /* ① 每个 0 都被线（横线所在行 / 竖线所在列）盖住 */
  cover.matrix.forEach((row, i) => row.forEach((v, j) => {
    if (v !== null && Math.abs(v) < 1e-9) {
      assert.ok(cover.lines.rows[i] || cover.lines.cols[j], '0 元素 (' + (i + 1) + ',' + (j + 1) + ') 没被盖住');
    }
  }));
  /* ② 线条数 = 圈出的个数 ⇒ 覆盖最少、圈得最多（König） */
  let lines = 0;
  cover.lines.rows.forEach(v => { if (v) lines++; });
  cover.lines.cols.forEach(v => { if (v) lines++; });
  assert.strictEqual(lines, tryStep.matching.length);
});
