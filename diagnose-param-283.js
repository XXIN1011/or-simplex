/* 定位：λ=0.5 处，模块声称的基到底为什么不满足可行性 */
'use strict';
const fs = require('fs');
const S = require('./simplex-core.js');
const SC = require('./sens-core.js');
const fmt = S.fmtNum;

const bank = JSON.parse(fs.readFileSync(__dirname + '/random-bank.json', 'utf8'));
const t = bank.find(x => x.id === 283);
const base = { direction: t.direction, c: t.c.map(Number), constraints: t.constraints };
const e = [-0.5, 1, -2.5, 2.5, 2];
const lam = 0.5;

function atLambda(l) {
  const p = { direction: base.direction, c: base.c.slice(),
    constraints: base.constraints.map(k => ({ coef: k.coef.slice(), rel: k.rel, rhs: k.rhs })) };
  p.constraints.forEach((k, i) => { k.rhs = base.constraints[i].rhs + l * e[i]; });
  return p;
}

const model0 = SC.sensBuildModel(base);
const modelL = SC.sensBuildModel(atLambda(lam));
const names = ['x1', 'x2', 'x3', 'x4'];

console.log('════════ λ = 0 与 λ = 0.5 的标准化模型对比 ════════');
console.log('  flipSign  λ=0 : [' + model0.flipSign.join(', ') + ']');
console.log('  flipSign  λ=.5: [' + modelL.flipSign.join(', ') + ']');
console.log('  内部 b0   λ=0 : [' + model0.b0.map(fmt).join(', ') + ']');
console.log('  内部 b0   λ=.5: [' + modelL.b0.map(fmt).join(', ') + ']');
console.log('  列数      λ=0 : ' + model0.N + '　λ=.5: ' + modelL.N);
console.log('  变量名    λ=0 : ' + model0.vars.map(v => v.name).join(','));
console.log('  变量名    λ=.5: ' + modelL.vars.map(v => v.name).join(','));
console.log('');

/* 模块声称的最优基 */
const r0 = S.simplexSolve(base);
const basisNames = r0.steps[r0.steps.length - 1].basis.map(c => r0.vars[c].name);
console.log('  模块声称的最优基：' + basisNames.join(', '));
console.log('');

const cols0 = basisNames.map(n => model0.colOf[n]);
const colsL = basisNames.map(n => modelL.colOf[n]);
console.log('  这些基在新模型里的列号：' + JSON.stringify(colsL));
console.log('');

const T0 = SC.sensTableau(model0, cols0);
const TL = SC.sensTableau(modelL, colsL);
if (!T0 || !TL) { console.log('  表构造失败 T0=' + !!T0 + ' TL=' + !!TL); process.exit(0); }

console.log('  λ = 0 处的 x_B（内部口径）: [' + T0.rows.map(r => fmt(r[model0.N])).join(', ') + ']');
console.log('  λ = .5 处的 x_B（直接重算）: [' + TL.rows.map(r => fmt(r[modelL.N])).join(', ') + ']');
console.log('');

/* 模块的公式：x_B(λ) = x_B(0) + λ·B⁻¹·data */
const data = e.map((v, i) => model0.flipSign[i] * v);
const be = SC.matVec ? SC.matVec(T0.Binv, data) : null;
console.log('  内部 λ 方向 data = [' + data.map(fmt).join(', ') + ']');
if (be) {
  console.log('  B⁻¹·data          = [' + be.map(fmt).join(', ') + ']');
  const pred = T0.rows.map((r, i) => r[model0.N] + lam * be[i]);
  console.log('  公式预测 x_B(.5)  = [' + pred.map(fmt).join(', ') + ']');
  console.log('  实际重算 x_B(.5)  = [' + TL.rows.map(r => fmt(r[modelL.N])).join(', ') + ']');
  const diff = pred.map((v, i) => v - TL.rows[i][modelL.N]);
  console.log('  两者之差          = [' + diff.map(fmt).join(', ') + ']'
    + (diff.every(d => Math.abs(d) < 1e-9) ? '   ✓ 一致' : '   ★不一致 → 公式错了'));
} else {
  console.log('  （matVec 未导出，跳过公式对比）');
}
console.log('');
console.log('  基变量的种类：' + basisNames.map((n, i) => n + '(' + model0.vars[cols0[i]].kind + ')').join(', '));
