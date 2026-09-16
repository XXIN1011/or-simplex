/* 对偶解（影子价格）测试：人工可核对的例题 + 生成批量题库供 scipy 对拍 */
'use strict';
const fs = require('fs');
const { simplexSolve, fmtNum } = require('./simplex-core.js');

function show(title, prob, expect) {
  const r = simplexSolve(prob);
  console.log('='.repeat(66));
  console.log(title);
  console.log('  状态:', r.status, ' z* =', r.ok ? fmtNum(r.objective) : '-');
  console.log('  对偶解 y =', r.dual ? JSON.stringify(r.dual.map(v => +v.toFixed(6))) : 'null');
  if (expect) console.log('  手算期望:', expect);
  return r;
}

/* 经典题：手工推导过 y = [3/2, 1/8, 0] */
const r1 = show('max 2x1+3x2 ; x1+2x2≤8, 4x1≤16, 4x2≤12',
  { direction: 'max', c: [2, 3], constraints: [
    { coef: [1, 2], rel: '<=', rhs: 8 },
    { coef: [4, 0], rel: '<=', rhs: 16 },
    { coef: [0, 4], rel: '<=', rhs: 12 }] },
  'y = [1.5, 0.125, 0]');
/* 手工校验：y1+4y2 = 1.5+0.5 = 2 ≥ c1 ✓；2y1+4y3 = 3 ≥ c2 ✓；8y1+16y2+12y3 = 14 = z* ✓ */

/* min 问题（含 = 与 ≥）：影子价格应满足 bᵀy = z* */
const r2 = show('min 4x1+x2 ; 3x1+x2=3, 4x1+3x2≥6, x1+2x2≤4',
  { direction: 'min', c: [4, 1], constraints: [
    { coef: [3, 1], rel: '=', rhs: 3 },
    { coef: [4, 3], rel: '>=', rhs: 6 },
    { coef: [1, 2], rel: '<=', rhs: 4 }] },
  'bᵀy 应等于 z* = 3.4');

if (r2.dual) {
  const b = [3, 6, 4];
  const dot = r2.dual.reduce((s, v, i) => s + v * b[i], 0);
  console.log('  校验 bᵀy =', fmtNum(dot), '  (应等于 z* =', fmtNum(r2.objective) + ')');
}

/* 无约束 / 无界 / 无可行解时不应给出对偶解 */
const r3 = simplexSolve({ direction: 'max', c: [2, 3], constraints: [] });
console.log('\n无约束问题 dual =', r3.dual, '(无界，应为 null 或 [])');
const r4 = simplexSolve({ direction: 'max', c: [1], constraints: [{ coef: [1], rel: '>=', rhs: 5 }, { coef: [1], rel: '<=', rhs: 2 }] });
console.log('无可行解问题 dual =', r4.dual, '(应为 null)');

/* ---- 生成批量题库：取前 400 道 optimal 的题 ---- */
const bank = JSON.parse(fs.readFileSync(__dirname + '/random-bank.json', 'utf8'));
const out = [];
for (const t of bank) {
  const res = simplexSolve({ direction: t.direction, c: t.c, constraints: t.constraints });
  if (res.status === 'optimal' && res.dual && res.dual.length) {
    out.push({
      id: t.id, direction: t.direction, c: t.c, constraints: t.constraints,
      obj: res.objective, sol: res.solution, dual: res.dual
    });
    if (out.length >= 400) break;
  }
}
fs.writeFileSync(__dirname + '/dual-bank.json', JSON.stringify(out, null, 1));
console.log('\n对偶题库已生成: dual-bank.json (' + out.length + ' 题)');
