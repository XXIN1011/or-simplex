/* 诊断：分枝定界/割平面 与 枚举参照 不一致时，到底谁错了 */
'use strict';
const S = require('./simplex-core.js');
const IP = require('./ip-core.js');
const fmt = S.fmtNum;

function feasible(problem, x) {
  const why = [];
  problem.vtypes.forEach((t, j) => {
    if (x[j] < -1e-7) why.push(`x${j + 1}=${x[j]}<0`);
    if ((t === 'int') && Math.abs(x[j] - Math.round(x[j])) > 1e-6) why.push(`x${j + 1}=${x[j]} 非整数`);
    if ((t === 'bin') && x[j] !== 0 && x[j] !== 1) why.push(`x${j + 1}=${x[j]} 非0-1`);
  });
  problem.constraints.forEach((k, i) => {
    let lhs = 0;
    k.coef.forEach((a, j) => lhs += a * x[j]);
    if (k.rel === '<=' && lhs > k.rhs + 1e-6) why.push(`约束${i + 1}: ${lhs} > ${k.rhs}`);
    if (k.rel === '>=' && lhs < k.rhs - 1e-6) why.push(`约束${i + 1}: ${lhs} < ${k.rhs}`);
    if (k.rel === '=' && Math.abs(lhs - k.rhs) > 1e-6) why.push(`约束${i + 1}: ${lhs} ≠ ${k.rhs}`);
  });
  return why;
}
function objOf(problem, x) {
  let z = 0; x.forEach((v, j) => z += problem.c[j] * v); return z;
}

function rangesOf(problem, cap) {
  const n = problem.c.length;
  return IP.ipIntVars(problem).map(j => {
    let hi = cap;
    problem.constraints.forEach(k => {
      if (k.rel !== '<=') return;
      if (k.coef[j] > 1e-9) hi = Math.min(hi, Math.floor(k.rhs / k.coef[j] + 1e-9));
    });
    return [0, Math.max(0, hi)];
  });
}

function bruteForce(problem, ranges) {
  const n = problem.c.length;
  const intIdx = IP.ipIntVars(problem);
  const sense = problem.direction;
  let best = null, bestZ = null;
  const cur = intIdx.map(() => 0);
  (function rec(t) {
    if (t === intIdx.length) {
      const p = { direction: problem.direction, c: problem.c.slice(),
        constraints: problem.constraints.map(k => ({ coef: k.coef.slice(), rel: k.rel, rhs: k.rhs })) };
      intIdx.forEach((j, z) => {
        const coef = new Array(n).fill(0); coef[j] = 1;
        p.constraints.push({ coef: coef, rel: '=', rhs: cur[z] });
      });
      const r = S.simplexSolve(p);
      if (r.status !== 'optimal') return;
      if (bestZ === null || (sense === 'max' ? r.objective > bestZ + 1e-9 : r.objective < bestZ - 1e-9)) {
        bestZ = r.objective; best = r.solution.slice();
      }
      return;
    }
    const j = intIdx[t], rg = ranges[t];
    for (let v = rg[0]; v <= rg[1]; v++) { cur[t] = v; rec(t + 1); }
  })(0);
  return { best, bestZ };
}

/* 把用例打印全，谁错一目了然 */
function show(problem, tag) {
  console.log('──────── ' + tag + ' ────────');
  console.log('  max z = ' + problem.c.map((v, j) => v + 'x' + (j + 1)).join(' + '));
  problem.constraints.forEach(k => {
    console.log('    ' + k.coef.map((v, j) => v + 'x' + (j + 1)).join(' + ')
      + ' ' + k.rel + ' ' + k.rhs);
  });
  console.log('  变量类型: ' + problem.vtypes.join(','));
  const ranges = rangesOf(problem, 12);
  console.log('  枚举范围: ' + JSON.stringify(ranges));

  const bf = bruteForce(problem, ranges);
  const r = IP.ipSolve(problem);
  const bnb = r.methods.find(x => x.key === 'bnb');
  const cut = r.methods.find(x => x.key === 'cut');

  console.log('  松弛解 : x = ' + r.relax.solution.map(fmt).join(', ') + '  z = ' + fmt(r.relax.objective));
  console.log('  枚举   : x = ' + (bf.best ? bf.best.map(fmt).join(', ') : '无') + '  z = ' + fmt(bf.bestZ)
    + '　违反: ' + (bf.best ? JSON.stringify(feasible(problem, bf.best)) : '—'));
  if (bnb.applicable) {
    console.log('  分枝定界: x = ' + (bnb.best ? bnb.best.map(fmt).join(', ') : '无') + '  z = ' + fmt(bnb.bestZ)
      + '　违反: ' + (bnb.best ? JSON.stringify(feasible(problem, bnb.best)) : '—')
      + '　回代 z = ' + (bnb.best ? fmt(objOf(problem, bnb.best)) : '—'));
  }
  if (cut.applicable) {
    console.log('  割平面  : x = ' + cut.solution.map(fmt).join(', ') + '  z = ' + fmt(cut.objective)
      + '　收敛=' + cut.converged + '　违反: ' + JSON.stringify(feasible(problem, cut.solution))
      + '　割数=' + cut.cuts.length);
  }
  console.log('');
}

/* 先复现经典例题的割平面未收敛 */
show({ direction: 'max', c: [3, 2],
  constraints: [{ coef: [2, 3], rel: '<=', rhs: 14 }, { coef: [2, 1], rel: '<=', rhs: 9 }],
  vtypes: ['int', 'int'] }, '经典例题（割平面未收敛）');

/* 再随机撞，找出不一致的用例 */
let found = 0;
for (let t = 0; t < 4000 && found < 3; t++) {
  const n = 2 + Math.floor(Math.random() * 2);
  const m = 2 + Math.floor(Math.random() * 2);
  const c = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
  const constraints = [];
  for (let i = 0; i < m; i++) {
    constraints.push({ coef: Array.from({ length: n }, () => Math.floor(Math.random() * 5)),
      rel: '<=', rhs: 6 + Math.floor(Math.random() * 14) });
  }
  if (constraints.some(k => k.coef.every(v => v === 0))) continue;
  const problem = { direction: 'max', c, constraints, vtypes: new Array(n).fill('int') };
  const ranges = rangesOf(problem, 12);
  const combos = ranges.reduce((s, r) => s * (r[1] - r[0] + 1), 1);
  if (combos > 4000) continue;
  const bf = bruteForce(problem, ranges);
  const r = IP.ipSolve(problem);
  if (r.noOptimum) continue;
  const bnb = r.methods.find(x => x.key === 'bnb');
  if (bnb.applicable && bnb.bestZ !== null && bf.bestZ !== null && Math.abs(bnb.bestZ - bf.bestZ) > 1e-6) {
    found++;
    show(problem, '不一致 #' + found + '（分枝定界 ' + fmt(bnb.bestZ) + ' vs 枚举 ' + fmt(bf.bestZ) + '）');
  }
}
if (!found) console.log('（随机 4000 道没撞到不一致，说明不一致很罕见或另有原因）');
