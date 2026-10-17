'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const player = require('../../src/web/transport-player.js');

/* 帧结构是被断言的产品行为：长回路不逐格揭示、退化换基不空转一帧。 */
const m = {
  m: 4, n: 4, rows: 4, cols: 4, total: 12, basisSize: 7, components: 1,
  allowed: [[true, true, true, true], [true, true, true, true], [true, true, true, true], [true, true, true, true]],
  cost: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]],
  supply: [3, 3, 3, 3], demand: [3, 3, 3, 3]
};
const zeros = () => [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
function pivot(cycle, theta) {
  return {
    type: 'pivot', entering: cycle[0], leaving: cycle[cycle.length / 2], theta: theta,
    cycle: cycle,
    beforeAllocation: [[3, 0, 0, 0], [0, 3, 0, 0], [0, 0, 3, 0], [0, 0, 0, 3]],
    allocation: [[3, 0, 0, 0], [0, 3, 0, 0], [0, 0, 3, 0], [0, 0, 0, 3]],
    beforeBasis: [[true, false, false, false], [false, true, false, false], [false, false, true, false], [false, false, false, true]],
    basis: [[true, false, false, false], [false, true, false, false], [false, false, true, false], [false, false, false, true]],
    beforeRemainingSupply: [3, 3, 3, 3], beforeRemainingDemand: [3, 3, 3, 3],
    remainingSupply: [3, 3, 3, 3], remainingDemand: [3, 3, 3, 3],
    objective: 40, objectiveBefore: 40, objectiveAfter: 36, delta: -4
  };
}
/* 4x4 上合法的 8 格交替回路 */
const eight = [
  { i: 0, j: 0, sign: 1 }, { i: 0, j: 1, sign: -1 }, { i: 1, j: 1, sign: 1 }, { i: 1, j: 2, sign: -1 },
  { i: 2, j: 2, sign: 1 }, { i: 2, j: 3, sign: -1 }, { i: 3, j: 3, sign: 1 }, { i: 3, j: 0, sign: -1 }
];
const four = [{ i: 0, j: 0, sign: 1 }, { i: 0, j: 1, sign: -1 }, { i: 1, j: 1, sign: 1 }, { i: 1, j: 0, sign: -1 }];
const alloc = () => ({ type: 'allocation', cell: { i: 0, j: 0 }, cost: 1, quantity: 3, proposedQuantity: 3,
  guarded: false, ties: [], basis: zeros(), remainingSupply: [0, 3, 3, 3], remainingDemand: [0, 3, 3, 3],
  beforeRemainingSupply: [3, 3, 3, 3], beforeRemainingDemand: [3, 3, 3, 3],
  beforeAllocation: zeros(), allocation: zeros(), beforeBasis: zeros(), objective: 0, objectiveBefore: 0 });

test('分配演示固定三帧', () => {
  assert.equal(player.frames(alloc()), 3);
});

test('短回路逐格揭示：帧数为 回路格数 + 3（θ>0）/ + 2（θ=0）', () => {
  assert.equal(player.frames(pivot(four, 2)), 7);
  assert.equal(player.frames(pivot(four, 0)), 6);
  const first = player.scene(m, pivot(four, 2), 1).html;
  assert.match(first, /标记回路第 1 格/);
  assert.equal((first.match(/tp-cycle/g) || []).length, 1, '短回路仍逐格揭示');
});

test('长回路不逐格揭示：首帧就标全正负号，帧数压到 3 / 2', () => {
  const long = pivot(eight, 2);
  assert.equal(player.frames(long), 3);
  assert.equal(player.frames(Object.assign({}, long, { theta: 0 })), 2);
  const first = player.scene(m, long, 0);
  assert.match(first.html, /整条闭回路/);
  assert.equal((first.html.match(/class="tp-cell[^"]*tp-cycle/g) || []).length, 8, '首帧标出全部 8 格');
  assert.doesNotMatch(first.html, /标记回路第/, '长回路不再有“标记回路第 k 格”帧');
  assert.match(player.scene(m, long, 1).html, /θ = 负号格的最小运量/);
  assert.match(player.scene(m, long, 2).html, /同步调整/);
});

test('退化换基不占“同步调整”空帧，末帧直说只换基', () => {
  const degenerate = pivot(four, 0);
  const last = player.frames(degenerate) - 1;
  const html = player.scene(m, degenerate, last).html;
  assert.match(html, /θ = 0/);
  assert.match(html, /只换基/);
  assert.doesNotMatch(html, /同步调整/, 'θ=0 时不再单独留一帧“同步调整”');
});
