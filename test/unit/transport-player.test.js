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

test('短回路最后一格先保持开链，到 θ 帧才闭合', () => {
  const s = pivot(four, 2);
  const lastNode = player.scene(m, s, 4);
  assert.equal(lastNode.closed, false, '标完最后一个节点仍不提前闭合');
  assert.equal(lastNode.animateLast, true, '最后一格只动画新增的一段');
  assert.match(lastNode.html, /路径已连通/);
  const theta = player.scene(m, s, 5);
  assert.equal(theta.closed, true, 'θ 帧补闭合边');
  assert.equal(theta.animateLast, true, '闭合边单独描边');
  assert.match(theta.html, /θ = 负号格的最小运量/);
  const final = player.scene(m, s, 6);
  assert.equal(final.closed, true);
  assert.equal(final.animateLast, false, '末帧同步运量，不再重画路径');
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
  assert.equal(first.closed, true, '长回路首帧直接闭合');
  assert.equal(first.animateLast, false);
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

test('最大收益闭回路每帧使用工作费用与工作目标，原快照保持不变', () => {
  const examples = require('../../src/web/examples');
  const { solveTransport } = require('../../src');
  const problem = examples.transport();
  problem.direction = 'max';
  problem.cost = problem.cost.map(row => row.map(c => 20 - c));
  const result = solveTransport(problem), step = result.steps.find(s => s.type === 'pivot');
  assert.equal(result.objective, 1140);
  assert.equal(step.workingObjectiveBefore, 280); assert.equal(step.workingObjectiveAfter, 230);
  const original = JSON.stringify(result);
  for (let frame = 0; frame < player.frames(step); frame++) {
    const html = player.scene(result.model, step, frame).html;
    assert.match(html, /最小化工作目标值/);
    assert.match(html, /class="tp-cost">4<\/b>/);
    assert.doesNotMatch(html, /原目标/);
  }
  assert.match(player.scene(result.model, step, player.frames(step)-1).html, /280 → 230/);
  assert.equal(JSON.stringify(result), original);
});
