/* 诊断：隐枚举法在「最小化」问题上的输出到底是答案错还是显示错 */
'use strict';
const S = require('./simplex-core.js');
const IP = require('./ip-core.js');
const fmt = S.fmtNum;

const prob = {
  direction: 'min',
  c: [3, 2, 4],
  constraints: [
    { coef: [2, 1, 3], rel: '>=', rhs: 4 },
    { coef: [1, 2, 1], rel: '>=', rhs: 3 }
  ],
  vtypes: ['bin', 'bin', 'bin']
};

/* 参照：暴力枚举 8 个点 */
let bfBest = null, bfZ = null;
for (let t = 0; t < 8; t++) {
  const x = [(t >> 2) & 1, (t >> 1) & 1, t & 1];
  let ok = true;
  prob.constraints.forEach(k => {
    let lhs = 0; k.coef.forEach((a, j) => lhs += a * x[j]);
    if (k.rel === '>=' && lhs < k.rhs - 1e-9) ok = false;
  });
  if (!ok) continue;
  let z = 0; prob.c.forEach((v, j) => z += v * x[j]);
  if (bfZ === null || z < bfZ) { bfZ = z; bfBest = x; }
}
console.log('════════ 题目：min z = 3x₁ + 2x₂ + 4x₃ ════════');
console.log('  2x₁ + x₂ + 3x₃ ≥ 4　　x₁ + 2x₂ + x₃ ≥ 3　　x 为 0-1');
console.log('  暴力枚举：最优 x = (' + bfBest.join(',') + ')，z = ' + fmt(bfZ));
console.log('');

const r = IP.ipSolve(prob);
const en = r.methods.find(m => m.key === 'enum');
console.log('隐枚举法适用？', en.applicable, en.reason || '');
if (!en.applicable) process.exit(0);

console.log('  核心报出的 sense =', en.sense);
console.log('  核心报出的最优 x = (' + en.best.join(',') + ')');
console.log('  核心报出的 bestZ = ' + fmt(en.bestZ) + '　（期望 ' + fmt(bfZ) + '）');
console.log('  核心内部的 offset = ' + fmt(en.offset) + '，flipped = [' + en.flipped.join(',') + ']');
console.log('  取负后的目标系数 c = [' + en.c.map(fmt).join(', ') + ']');
console.log('');
console.log('  枚举表里每一行的 z（表里显示的是 row.z，即原题口径）：');
en.rows.forEach(row => {
  const zOrig = prob.c.reduce((s, v, j) => s + v * row.x[j], 0);
  console.log('    #' + String(row.idx).padStart(2) + '  y=(' + row.y.join(',') + ')'
    + '  x=(' + row.x.join(',') + ')'
    + '  表里 z=' + String(fmt(row.z)).padStart(6)
    + '  标准形 z=' + String(fmt(row.zStd)).padStart(6)
    + '  该点的原题 z=' + String(fmt(zOrig)).padStart(6)
    + (Math.abs(row.z - zOrig) > 1e-9 ? '   ← ★显示值与该点原题目标值不符' : ''));
});
console.log('');
console.log('  倒数几行的结论文字：');
en.rows.slice(-3).forEach(row => console.log('    #' + row.idx + '：' + row.verdict));
console.log('');
console.log(badCheck());
function badCheck() {
  const out = [];
  if (Math.abs(en.bestZ - bfZ) > 1e-9) out.push('★核心报出的最优值不对：' + fmt(en.bestZ) + ' ≠ ' + fmt(bfZ));
  else out.push('✓ 核心报出的最优值是对的（' + fmt(en.bestZ) + '）');
  /* 表里的 z 是否等于该点的原题目标值 */
  const mismatch = en.rows.filter(row => {
    const zOrig = prob.c.reduce((s, v, j) => s + v * row.x[j], 0);
    return Math.abs(row.z - zOrig) > 1e-9;
  }).length;
  if (mismatch) out.push('★枚举表里有 ' + mismatch + ' 行的 z 不等于该点的原题目标值（显示的是取负后的值）');
  else out.push('✓ 枚举表每行的 z 都等于该点的原题目标值');
  return out.join('\n');
}
