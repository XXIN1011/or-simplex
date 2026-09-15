'use strict';
const { simplexSolve, fmtNum, fmtPair } = require('./simplex-core.js');

const cases = [
  { id: 60, direction: 'max', c: [-4, 8, 7], constraints: [
    { coef: [-4, 0, -3], rel: '=', rhs: 19 }, { coef: [5, 5, 0], rel: '>=', rhs: 9 }] },
  { id: 193, direction: 'max', c: [-2, 2], constraints: [
    { coef: [0, -1], rel: '>=', rhs: 2 }, { coef: [3, 6], rel: '>=', rhs: 4 }] },
  { id: 236, direction: 'max', c: [2, 4, 6], constraints: [
    { coef: [2, 6, -2], rel: '=', rhs: 6 }, { coef: [3, 1, -3], rel: '=', rhs: 20 }] },
  { id: 244, direction: 'max', c: [8, -4], constraints: [
    { coef: [4, -4], rel: '<=', rhs: 3 }, { coef: [5, -4], rel: '<=', rhs: 2 },
    { coef: [-2, 0], rel: '=', rhs: 1 }] },
];

for (const cs of cases) {
  const res = simplexSolve(cs);
  const names = res.vars.map(v => v.name);
  const kinds = res.vars.map(v => v.kind);
  const N = names.length;
  console.log('='.repeat(70));
  console.log(`id=${cs.id}  JS判定 = ${res.status}  (scipy = infeasible)`);
  console.log('变量: ' + names.map((n, i) => `${n}[${kinds[i]}]`).join(' '));
  res.steps.forEach((s, idx) => {
    const basisStr = s.basis.map(b => `${names[b]}(${kinds[b]})`).join(', ');
    const hasArt = s.basis.some(b => kinds[b] === 'a');
    console.log(`\n[${idx === 0 ? '初始表' : '第' + idx + '次迭代'}] 基 = ${basisStr}   基中有人工变量: ${hasArt}`);
    console.log('  b = [' + s.rows.map(r => fmtNum(r[N])).join(', ') + ']');
    if (s.entering !== null) {
      console.log(`  入基 = ${names[s.entering]}[${kinds[s.entering]}]   σ = ${fmtPair(s.obj[s.entering])}`);
      if (s.leaving === null) {
        console.log(`  >>> 出基失败（入基列无正系数）→ 判定无界`);
        console.log('  入基列系数 = [' + s.rows.map(r => fmtNum(r[s.entering])).join(', ') + ']');
      } else {
        console.log(`  出基 = ${names[s.basis[s.leaving]]}  枢轴 = ${fmtNum(s.pivot)}`);
      }
    } else {
      console.log('  σ 全 ≤ 0 → 最优/终止');
    }
  });
  console.log();
}
