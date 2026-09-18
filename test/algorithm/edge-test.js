/* 边界测试：0 个变量 / 0 个约束 */
'use strict';
const { simplexSolve, fmtNum, fmtPair } = require('../../src/core/simplex-core.js');

const cases = [
  ['n=0, m=0（空题目）',            { direction: 'max', c: [], constraints: [] },            'z=0'],
  ['n=0, m=1, 0<=5（恒成立）',      { direction: 'max', c: [], constraints: [{ coef: [], rel: '<=', rhs: 5 }] }, 'z=0'],
  ['n=0, m=1, 0>=5（不可能）',      { direction: 'max', c: [], constraints: [{ coef: [], rel: '>=', rhs: 5 }] }, '无可行解'],
  ['n=0, m=1, 0=0（恒成立）',       { direction: 'max', c: [], constraints: [{ coef: [], rel: '=', rhs: 0 }] }, 'z=0'],
  ['n=2, m=0, max 2x1+3x2',         { direction: 'max', c: [2, 3], constraints: [] },       '无界解'],
  ['n=2, m=0, max -x1-2x2',         { direction: 'max', c: [-1, -2], constraints: [] },     'x=0, z=0'],
  ['n=2, m=0, min x1+2x2',          { direction: 'min', c: [1, 2], constraints: [] },       'x=0, z=0'],
  ['n=1, m=0, max 5x1',             { direction: 'max', c: [5], constraints: [] },          '无界解'],
  ['n=1, m=1（正常，回归对照）',      { direction: 'max', c: [3], constraints: [{ coef: [2], rel: '<=', rhs: 10 }] }, 'x1=5, z=15'],
];

let pass = 0, fail = 0;
for (const [name, prob, expect] of cases) {
  let r, err = null;
  try { r = simplexSolve(prob); } catch (e) { err = e; }

  if (err) {
    console.log(`FAIL  ${name}\n      抛异常: ${err.message}`);
    fail++; continue;
  }
  const sol = r.ok ? JSON.stringify(r.solution) : '-';
  const obj = r.ok ? fmtNum(r.objective) : '-';
  const st = r.ok ? r.status : ('ERROR: ' + r.message);
  const steps = r.ok ? r.steps.length : 0;
  const vnames = r.ok ? r.vars.map(v => v.name).join(',') || '(无)' : '-';

  const okStatus = r.ok && r.status !== undefined;
  const ok = okStatus;
  if (ok) pass++; else fail++;

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`      状态=${st}  解=${sol}  z=${obj}  步数=${steps}  变量=[${vnames}]`);
  console.log(`      期望: ${expect}`);
}
console.log(`\n合计: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
