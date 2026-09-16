/* 诊断：重建 A0 / B / B⁻¹ / x_B，逐个核对 b 区间是怎么算出来的
   用法: node diagnose-sens.js <题目id> */
'use strict';
const fs = require('fs');
const { simplexSolve, fmtNum } = require('./simplex-core.js');

const bank = JSON.parse(fs.readFileSync(__dirname + '/random-bank.json', 'utf8'));
const wantId = Number(process.argv[2]);
const t = bank.filter(x => x.id === wantId)[0];
const prob = { direction: t.direction, c: t.c, constraints: t.constraints };
const r = simplexSolve(prob);

const n = t.c.length, m = t.constraints.length;
console.log(`id=${wantId}  ${t.direction}  c=${JSON.stringify(t.c)}`);
t.constraints.forEach((k, i) =>
  console.log(`   约束${i + 1}: ${JSON.stringify(k.coef)} ${k.rel} ${k.rhs}${k.rhs < 0 ? '   ← 取负' : ''}`));
console.log(`状态=${r.status}  z*=${fmtNum(r.objective)}  解=${JSON.stringify(r.solution)}`);

const last = r.steps[r.steps.length - 1];
const basis = last.basis;
const rows = last.rows;
const vars = r.vars;
const N = vars.length;

/* --- 重建标准化的 A0（与 core 里的顺序保持一致） --- */
const cons = t.constraints.map(k => ({ coef: k.coef.map(Number), rel: k.rel, rhs: Number(k.rhs) }));
const flip = [];
for (let i = 0; i < m; i++) {
  flip[i] = 1;
  if (cons[i].rhs < -1e-9) {
    cons[i].coef = cons[i].coef.map(v => -v);
    cons[i].rhs = -cons[i].rhs;
    cons[i].rel = cons[i].rel === '<=' ? '>=' : (cons[i].rel === '>=' ? '<=' : '=');
    flip[i] = -1;
  }
}
const sCol = [], aCol = [];
let cnt = n;
for (let i = 0; i < m; i++) {
  const k = cons[i];
  if (k.rel === '<=') { sCol[i] = cnt++; }
  else if (k.rel === '>=') { sCol[i] = cnt++; aCol[i] = cnt++; }
  else { aCol[i] = cnt++; }
}
const A0 = [];
for (let i = 0; i < m; i++) {
  const row = new Array(N).fill(0);
  for (let j = 0; j < n; j++) row[j] = cons[i].coef[j];
  if (sCol[i] !== undefined) row[sCol[i]] = (cons[i].rel === '>=' ? -1 : 1);
  if (aCol[i] !== undefined) row[aCol[i]] = 1;
  A0.push(row);
}
console.log(`\n变量表: ${vars.map((v, i) => i + '=' + v.name).join(' ')}`);
console.log(`sCol=${JSON.stringify(sCol)}  aCol=${JSON.stringify(aCol)}  N=${N}`);

/* --- B = A0 里基所对应的列 --- */
const B = [];
for (let i = 0; i < m; i++) {
  const row = [];
  for (let k = 0; k < m; k++) row.push(A0[i][basis[k]]);
  B.push(row);
}
function inv(M) {
  const mm = M.length, A = M.map((row, i) => row.slice().concat(row.map((_, k) => i === k ? 1 : 0)));
  for (let i = 0; i < mm; i++) {
    let p = i;
    for (let k = i + 1; k < mm; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    if (Math.abs(A[p][i]) < 1e-12) return null;
    if (p !== i) { const tmp = A[i]; A[i] = A[p]; A[p] = tmp; }
    const piv = A[i][i];
    for (let j = 0; j < 2 * mm; j++) A[i][j] /= piv;
    for (let k = 0; k < mm; k++) {
      if (k === i) continue;
      const f = A[k][i];
      if (!f) continue;
      for (let j = 0; j < 2 * mm; j++) A[k][j] -= f * A[i][j];
    }
  }
  return A.map(row => row.slice(mm));
}
const Binv = inv(B);

console.log('\n基:', basis.map((c, i) => `第${i + 1}行←${vars[c].name}`).join('  '));
console.log('x_B(表末右端项):', rows.map(row => +row[N].toFixed(6)).join('  '));
console.log('b_int(标准化右端项):', cons.map(k => k.rhs).join('  '), '  flipSign:', flip.join(' '));
console.log('\nB⁻¹ 各列（∂x_B/∂b_int）：');
for (let i = 0; i < m; i++) {
  console.log(`  b${i + 1}: ` + Binv.map((row, p) => `x_${vars[basis[p]].name}:${row[i].toFixed(4)}`).join('  '));
}

console.log('\n逐约束核对 b 区间（要求 x_B + Δ·B⁻¹第i列 ≥ 0）:');
for (let i = 0; i < m; i++) {
  let lo = -Infinity, hi = Infinity;
  const terms = [];
  for (let p = 0; p < m; p++) {
    const xB = rows[p][N], tt = Binv[p][i];
    if (tt > 1e-9) { const lb = -xB / tt; terms.push(`  x_${vars[basis[p]].name}≥0 ⇒ Δ≥${lb.toFixed(4)}`); if (lb > lo) lo = lb; }
    else if (tt < -1e-9) { const ub = -xB / tt; terms.push(`  x_${vars[basis[p]].name}≥0 ⇒ Δ≤${ub.toFixed(4)}`); if (ub < hi) hi = ub; }
  }
  const s = r.sensitivity.b[i];
  console.log(`  约束${i + 1}  b_int=${cons[i].rhs}  Δ∈[${lo === -Infinity ? '-∞' : lo.toFixed(4)}, ${hi === Infinity ? '+∞' : hi.toFixed(4)}]` +
              `  → 用户区间 [${s.lo === -Infinity ? '-∞' : fmtNum(s.lo)}, ${s.hi === Infinity ? '+∞' : fmtNum(s.hi)}]`);
  terms.forEach(x => console.log('      ' + x.trim()));
}
