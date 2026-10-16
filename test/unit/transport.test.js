'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { solveTransport, transport } = require('../../src');
const examples = require('../../src/web/examples');
const { validTransport } = require('../../src/web/draft');
function solve(p, z) {
  const before = JSON.stringify(p), r = solveTransport(p);
  assert.equal(r.ok, true, r.message); assert.equal(r.status, 'optimal', r.message);
  assert.equal(JSON.stringify(p), before, '不修改调用方输入');
  assert.ok(Math.abs(r.objective - z) < 1e-8, `${r.objective} != ${z}`);
  assert.equal(transport.inspect(r.model, r.allocation, r.basis).valid, true);
  return r;
}
const base = { direction: 'min', cost: [[2, 3], [4, 1]], supply: [20, 30], demand: [30, 20] };
test('运输标准题与独立统一 API', () => {
  solve(base, 100);
  const r = solveTransport(examples.transport());
  assert.equal(r.status, 'optimal');
  assert.ok(r.initial.objective > r.objective, '示例确实需要 MODI 调整');
  assert.ok(r.steps.some(s => s.type === 'pivot'));
});
test('供大于求逐产地处理费，虚拟销地费用可见', () => {
  const r = solve({ direction: 'min', cost: [[2], [4]], supply: [5, 5], demand: [6], surplusCost: [10, 1] }, 18);
  assert.deepEqual(r.surplus, [0, 4]); assert.equal(r.penalty, 4);
  assert.deepEqual(r.model.cost, [[2,10],[4,1]]);
});
test('供小于求逐销地罚金与默认零费用', () => {
  const p = { direction: 'min', cost: [[2, 3]], supply: [5], demand: [4, 4], shortageCost: [10, 20] };
  const r = solve(p, 44); assert.deepEqual(r.shortage, [3, 0]);
  const zero = solve(Object.assign({}, p, { shortageCost: undefined }), 11);
  assert.equal(zero.penalty, 0); assert.deepEqual(zero.shortage, [0,3]);
});
test('最大收益、负收益和罚金正确还原原目标', () => {
  solve(Object.assign({}, base, { direction: 'max' }), 180);
  const r = solve({ direction: 'max', cost: [[10,20]], supply: [5], demand: [4,4], shortageCost: [2,3] }, 84);
  assert.equal(r.realObjective, 90); assert.equal(r.penalty, 6); assert.equal(r.workingObjective, -84);
  solve({direction:'max',cost:[[-2],[-3]],supply:[4,4],demand:[5],surplusCost:[1,2]}, -17);
});
test('分数、小数、科学计数法、微小运量', () => {
  solve({direction:'min',cost:[['1/2','3/2']],supply:['3/4'],demand:['1/4','.5']}, .875);
  const r = solve({direction:'min',cost:[[1]],supply:['1e-12'],demand:['1e-12']}, 1e-12);
  assert.equal(r.allocation[0][0], 1e-12);
  const round = solve({direction:'min',cost:[[1,1]],supply:[.1+.2],demand:[.1,.2]}, .3);
  assert.equal(round.model.virtual, null);
});
test('零供需、全零、退化基、并列选择确定且不成回路', () => {
  const r = solve({direction:'min',cost:[[1,1],[1,1]],supply:[0,2],demand:[1,1]}, 2);
  assert.equal(r.basis.flat().filter(Boolean).length, 3);
  assert.ok(r.steps.find(s => s.type === 'initial').zeroBasics.length);
  assert.equal(r.multipleOptimal, false, '零检验数不必有不同运输方案');
  assert.deepEqual(solveTransport({direction:'min',cost:[[1,1],[1,1]],supply:[1,1],demand:[1,1]}).steps[0].cell, {i:0,j:0});
  const z = solve({direction:'min',cost:[[0,0],[0,0]],supply:[0,0],demand:[0,0]}, 0);
  assert.equal(z.multipleOptimal, false);
});
test('多重最优有实际正量调整见证，包括穿越退化基', () => {
  const r = solve({direction:'min',cost:[[1,1],[1,1]],supply:[1,1],demand:[1,1]}, 2);
  assert.equal(r.multipleOptimal, true); assert.ok(r.alternative.theta > 0);
  assert.notDeepEqual(r.alternative.allocation, r.allocation);
  assert.equal(r.alternative.objective, r.objective);
});
test('迭代限制不误报最优，初始已最优允许零轮', () => {
  const r = solveTransport(examples.transport(), { maxIterations: 0 });
  assert.equal(r.status, 'iteration-limit'); assert.equal(r.feasible, true); assert.equal(r.multipleOptimal, false);
  assert.equal(solveTransport(base, {maxIterations:0}).status, 'optimal');
  for (const maxIterations of [-1, 1.5, Infinity, '3', 10001]) assert.equal(solveTransport(base, {maxIterations}).ok, false);
});
test('拒绝非法模型、分母为零、负供需、禁运与错误费率维度', () => {
  for (const p of [null, {}, Object.assign({}, base, {direction:'bad'}), Object.assign({}, base,{supply:[-1,2]}),
    Object.assign({},base,{cost:[[1],[2]]}),Object.assign({},base,{cost:[[null,1],[1,1]]}),
    Object.assign({},base,{demand:['1/0',2]}), Object.assign({},base,{surplusCost:[1]}),
    Object.assign({},base,{shortageCost:-1}),Object.assign({},base,{cost:[['×',1],[1,1]]})]) {
    assert.equal(solveTransport(p).ok, false, JSON.stringify(p));
  }
});
test('浮点溢出明确停止而非最优', () => {
  const r = solveTransport({direction:'min',cost:[[1e308]],supply:[2],demand:[2]});
  assert.equal(r.status, 'numerical-error'); assert.equal(r.feasible, false);
});
test('远处高费用不吞掉其他格的小幅改善；平衡提示独立于未完成费用', () => {
  solve({direction:'min',cost:[[1e12,2,5],[5,1,8],[7,2,1]],supply:[10,10,10],demand:[10,10,10]},80);
  const b=transport.balance({cost:[['1/']],supply:['1/2'],demand:['3/4']});
  assert.equal(b.ok,true);assert.equal(b.difference,-.25);
  assert.equal(solveTransport(Object.assign({},base,{supply:Array(2)})).ok,false);
});
test('步骤快照独立，费用与基不被后续调用修改', () => {
  const r = solveTransport(examples.transport()), original = JSON.stringify(r.steps);
  r.allocation[0][0] = 123; r.basis[0][0] = !r.basis[0][0];
  assert.equal(JSON.stringify(r.steps), original);
  assert.equal(JSON.stringify(solveTransport(examples.transport()).steps), original);
});
test('运输草稿保留未完成分数、供需及罚金原文并校验形状', () => {
  const p = {direction:'min',rows:1,cols:1,cells:[['1/']],supply:['2/3'],demand:['1'],surplusCost:['0'],shortageCost:['1/2']};
  assert.equal(validTransport(p), true);
  assert.equal(validTransport(Object.assign({}, p, {supply:[]})), false);
});
test('核心规模边界与巨大收益下的小罚金仍独立可见', () => {
  const p={direction:'min',cost:Array.from({length:20},()=>Array(20).fill(0)),supply:Array(20).fill(0),demand:Array(20).fill(0)};
  solve(p,0);p.supply.push(0);assert.equal(solveTransport(p).ok,false);
  const r=solveTransport({direction:'max',cost:[[1e12]],supply:[2],demand:[1],surplusCost:1e-8});
  assert.equal(r.status,'optimal');assert.equal(r.penalty,1e-8);
});
