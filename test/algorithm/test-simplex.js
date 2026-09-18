/* 经典例题验证 + 随机题库生成（供 scipy 对拍） */
'use strict';
const { simplexSolve, fmtNum, fmtPair } = require('../../src/core/simplex-core.js');

function renderSteps(res) {
  const names = res.vars.map(v => v.name);
  const N = names.length;
  let out = '';
  res.steps.forEach((s, idx) => {
    const title = idx === 0 ? '初始表' : `第 ${idx} 次迭代`;
    out += `\n--- ${title} ---\n`;
    out += '基变量 | ' + names.map(n => n.padStart(7)).join('') + ' |' + 'b'.padStart(8) + '\n';
    s.rows.forEach((row, i) => {
      out += res.vars[s.basis[i]].name.padStart(5) + ' | ' +
        row.slice(0, N).map(v => fmtNum(v).padStart(7)).join('') + ' |' +
        fmtNum(row[N]).padStart(8) + '\n';
    });
    out += '   σ  |' + s.obj.slice(0, N).map(p => fmtPair(p).padStart(7)).join('') + ' |' +
      fmtPair(s.obj[N]).padStart(8) + '\n';
    if (s.entering !== null) {
      out += `  入基: ${names[s.entering]}`;
      if (s.leaving !== null) out += `, 出基: ${res.vars[s.basis[s.leaving]].name}, 枢轴: ${fmtNum(s.pivot)}`;
      const rs = s.ratios.map(r => r.ok ? `r${r.row + 1}=${fmtNum(r.theta)}` : `r${r.row + 1}=—`).join(', ');
      out += `\n  比值: ${rs}`;
    }
    out += '\n';
  });
  return out;
}

function run(title, prob, expect) {
  const res = simplexSolve(prob);
  console.log('='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
  console.log(renderSteps(res));
  console.log('状态:', res.status);
  if (res.status === 'optimal') {
    console.log('最优解:', res.vars.filter(v => v.kind === 'x').map(v => {
      const idx = res.vars.indexOf(v);
      return `${v.name}=${fmtNum(res.solution[res.vars.slice(0, res.nDecision).indexOf(v)])}`;
    }).join(', '));
    console.log('最优值 z =', fmtNum(res.objective));
    if (res.altOptimal.length) console.log('多重最优解: 存在（' + res.altOptimal.map(i => res.vars[i].name).join(', ') + ' 检验数为 0）');
  }
  console.log('期望:', expect);
  console.log();
  return res;
}

/* ---- 例题 1：标准 max + 全 ≤（手工验证：x1=4, x2=2, z=14） ---- */
const r1 = run('例题1  max z = 2x1+3x2 ; x1+2x2≤8, 4x1≤16, 4x2≤12',
  { direction: 'max', c: [2, 3], constraints: [
    { coef: [1, 2], rel: '<=', rhs: 8 },
    { coef: [4, 0], rel: '<=', rhs: 16 },
    { coef: [0, 4], rel: '<=', rhs: 12 }] },
  'x1=4, x2=2, z=14');

/* ---- 例题 2：min + ≥（手工验证：x1=2, x2=1, z=7） ---- */
const r2 = run('例题2  min z = 2x1+3x2 ; x1+x2≥3, x1+2x2≥4',
  { direction: 'min', c: [2, 3], constraints: [
    { coef: [1, 1], rel: '>=', rhs: 3 },
    { coef: [1, 2], rel: '>=', rhs: 4 }] },
  'x1=2, x2=1, z=7');

/* ---- 例题 3：含 = 与 ≥ 与 ≤（手工验证：x1=2/5, x2=9/5, z=17/5） ---- */
const r3 = run('例题3  min z = 4x1+x2 ; 3x1+x2=3, 4x1+3x2≥6, x1+2x2≤4',
  { direction: 'min', c: [4, 1], constraints: [
    { coef: [3, 1], rel: '=', rhs: 3 },
    { coef: [4, 3], rel: '>=', rhs: 6 },
    { coef: [1, 2], rel: '<=', rhs: 4 }] },
  'x1=2/5, x2=9/5, z=17/5');

/* ---- 例题 4：无界 ---- */
const r4 = run('例题4  max z = x1 ; -x1+x2≤0, x2≤3',
  { direction: 'max', c: [1, 0], constraints: [
    { coef: [-1, 1], rel: '<=', rhs: 0 },
    { coef: [0, 1], rel: '<=', rhs: 3 }] },
  '无界解');

/* ---- 例题 5：无可行解 ---- */
const r5 = run('例题5  max z = x1 ; x1≥5, x1≤2',
  { direction: 'max', c: [1, 0], constraints: [
    { coef: [1, 0], rel: '>=', rhs: 5 },
    { coef: [1, 0], rel: '<=', rhs: 2 }] },
  '无可行解');

/* ---- 例题 6：= 约束（手工验证：x1=1, x2=3, z=18） ---- */
const r6 = run('例题6  max z = 3x1+5x2 ; x1+x2=4, x1≤3, x2≤3',
  { direction: 'max', c: [3, 5], constraints: [
    { coef: [1, 1], rel: '=', rhs: 4 },
    { coef: [1, 0], rel: '<=', rhs: 3 },
    { coef: [0, 1], rel: '<=', rhs: 3 }] },
  'x1=1, x2=3, z=18');

/* ---- 例题 7：负右端项 ---- */
const r7 = run('例题7  max z = x1+x2 ; -x1+2x2≤4, 3x1+2x2≤12, x1≥0,x2≥0',
  { direction: 'max', c: [1, 1], constraints: [
    { coef: [-1, 2], rel: '<=', rhs: 4 },
    { coef: [3, 2], rel: '<=', rhs: 12 }] },
  '(顶点法核对)');

/* ================= 随机题库（供 scipy 对拍） ================= */
let seed = 20260915;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function ri(lo, hi) { return lo + Math.floor(rnd() * (hi - lo + 1)); }

const bank = [];
const RELS = ['<=', '<=', '>=', '>=', '>=', '=', '='];   // 刻意偏向 >= 与 =
for (let t = 0; t < 2000; t++) {
  const n = ri(2, 5), m = ri(1, 5);
  const direction = rnd() < 0.5 ? 'max' : 'min';
  const c = Array.from({ length: n }, () => ri(-6, 8));
  const constraints = [];
  for (let i = 0; i < m; i++) {
    const coef = Array.from({ length: n }, () => ri(-4, 6));
    const rel = RELS[ri(0, RELS.length - 1)];
    // 混入负右端项，专门测"整行取负 + 翻转关系符"这条路径
    const rhs = rnd() < 0.15 ? -ri(1, 12) : ri(1, 20);
    constraints.push({ coef, rel, rhs });
  }
  const res = simplexSolve({ direction, c, constraints });
  bank.push({
    id: t, direction, c, constraints,
    js_status: res.status,
    js_status_raw: res.status,
    js_obj: res.objective,
    js_sol: res.solution
  });
}
require('fs').writeFileSync(__dirname + '/random-bank.json',
  JSON.stringify(bank, null, 1));
console.log('随机题库已生成: random-bank.json (' + bank.length + ' 题)');
console.log('状态分布:', JSON.stringify(bank.reduce((a, b) => {
  a[b.js_status] = (a[b.js_status] || 0) + 1; return a;
}, {})));
