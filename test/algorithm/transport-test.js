/* 可复现随机题库与每一步的不变量；SciPy 脚本另外独立构造 LP。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { solveTransport } = require('../../src');
const common = require('../../src/core/transport-model');
const { rng, resolveSeed, banner } = require('../lib/rng');
const seed = resolveSeed(20261016), random = rng(seed);
console.log(banner('运输问题', seed));
const bank = [];
let steps = 0, pivots = 0, degenerate = 0, multiple = 0, infeasible = 0, guarded = 0;
for (let k = 0; k < 3600; k++) {
  const m = random.ri(1,8), n = random.ri(1,8), divisor = random.pick([1,1,2,3,10]);
  const supply = Array.from({length:m}, () => random.ri(0,30) / divisor);
  const demand = Array.from({length:n}, () => random.ri(0,30) / divisor);
  if (k % 3 === 0) {
    const a = common.sum(supply), b = common.sum(demand);
    if (a >= b) demand[n-1] += a - b; else supply[m-1] += b - a;
  }
  const p = { direction: k % 2 ? 'min' : 'max',
    cost: Array.from({length:m}, () => Array.from({length:n}, () => random.ri(-10,20) / divisor)), supply, demand,
    surplusCost: Array.from({length:m}, () => random.ri(0,6) / divisor),
    shortageCost: Array.from({length:n}, () => random.ri(0,6) / divisor) };
  if (k % 7 === 0) {
    const fraction = v => Math.round(v*divisor) + '/' + divisor;
    p.cost = p.cost.map(row => row.map(fraction));
    for (const name of ['supply','demand','surplusCost','shortageCost']) p[name] = p[name].map(fraction);
  }
  if (k >= 1800) p.cost = p.cost.map(row => row.map(v => random.next() < [0.15,0.4,0.7,1][k%4] ? 'X' : v));
  const r = solveTransport(p);
  bank.push({problem:p,status:r.status,objective:r.objective,allocation:r.allocation});
  if (r.status === 'infeasible') {
    infeasible++; assert.equal(r.feasible,false); assert.equal(r.objective,null);
    const f=r.feasibility;
    assert.ok(f.deficit>0);
    f.cutRows.forEach(i => r.model.allowed[i].forEach((a,j) => { if(a) assert.ok(f.cutCols.includes(j),'割集合包含全部可达销地'); }));
    const cutSupply=common.sum(f.cutRows.map(i=>r.model.supply[i])),cutDemand=common.sum(f.cutCols.map(j=>r.model.demand[j]));
    assert.ok(cutSupply>cutDemand,'无解具有供应超过可达需求的独立割见证');
    assert.ok(Math.abs(cutSupply-cutDemand-f.deficit)<=r.model.quantityTolerance);
    continue;
  }
  assert.equal(r.status, 'optimal', `case ${k}: ${r.message}`);
  assert.equal(r.feasible, true);
  let previous = null;
  for (const s of r.steps) {
    steps++;
    assert.ok(s.invariant.valid, `case ${k}: ${s.invariant.errors}`);
    assert.equal(common.inspect(r.model, s.allocation, s.basis, s.type === 'allocation').valid, true);
    const tol = Math.max(1, r.model.total * r.model.costScale) * 1e-8;
    assert.ok(Math.abs(common.total(s.allocation,r.model.cost) - s.objective) <= tol);
    if (s.remainingSupply) {
      if (s.guarded) guarded++;
      s.invariant.rowTotals.forEach((v,i) => assert.ok(Math.abs(v+s.remainingSupply[i]-r.model.supply[i]) <= r.model.quantityTolerance));
      s.invariant.colTotals.forEach((v,j) => assert.ok(Math.abs(v+s.remainingDemand[j]-r.model.demand[j]) <= r.model.quantityTolerance));
    }
    if (s.type === 'potentials') {
      s.basis.forEach((row,i) => row.forEach((b,j) => { if (b) assert.ok(Math.abs(s.u[i]+s.v[j]-r.model.working[i][j]) <= r.model.costTolerance * 10); }));
    }
    if (s.type === 'pivot') {
      pivots++; if (s.theta === 0) degenerate++;
      assert.ok(s.theta >= 0); assert.equal(s.cycle.length % 2, 0);
      assert.ok(s.workingDelta <= tol);
      assert.ok(Math.abs(s.workingDelta - s.theta*s.reducedEntering) <= tol);
      const loop = common.copy(s.beforeAllocation);
      s.cycle.forEach((c, i) => {
        assert.equal(c.sign, i%2 ? -1 : 1);
        const next = s.cycle[(i+1)%s.cycle.length];
        assert.ok(c.i === next.i || c.j === next.j);
        loop[c.i][c.j] += s.theta*c.sign;
      });
      assert.deepEqual(loop, s.allocation);
      if (previous) assert.ok(s.workingObjective <= previous.workingObjective + tol);
    }
    previous = s;
  }
  r.potentials.reduced.forEach((row,i) => row.forEach((v,j) => { if (r.model.allowed[i][j] && !r.basis[i][j]) assert.ok(v >= -r.model.costTolerance); }));
  if (r.multipleOptimal) {
    multiple++; assert.ok(r.alternative.theta > 0);
    const x = r.alternative.allocation, tol = Math.max(1,Math.abs(r.objective))*1e-8;
    assert.ok(Math.abs(r.alternative.objective-r.objective) <= tol);
    x.forEach((row,i) => { assert.ok(row.every(v => v >= 0)); assert.ok(Math.abs(common.sum(row)-r.model.supply[i]) <= r.model.quantityTolerance); });
    x.forEach((row,i) => row.forEach((v,j) => { if (!r.model.allowed[i][j]) assert.equal(v,0); }));
    r.model.demand.forEach((v,j) => assert.ok(Math.abs(common.sum(x.map(row => row[j]))-v) <= r.model.quantityTolerance));
  }
  if (k < 30) assert.deepEqual(solveTransport(p),r,'确定性重算');
}
assert.ok(degenerate > 0, '随机题覆盖退化零步长换基');
assert.ok(multiple > 0, '随机题覆盖多重最优');
assert.ok(infeasible > 0 && guarded > 0,'覆盖禁运无解与防堵路分配');
fs.writeFileSync(path.join(__dirname,'transport-bank.json'), JSON.stringify(bank));
console.log(`3600 题（1800 题含禁运），${infeasible} 题无解，${guarded} 次可行性保护；${steps} 步逐轮校验，${pivots} 次换基（${degenerate} 次退化），${multiple} 题多重最优`);
console.log('运输题库已生成；结论: PASS');
