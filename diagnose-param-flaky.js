/* 诊断：参数线性规划（右边系数含 λ）在 id=283 这道题上偶发报错的根因
   ---------------------------------------------------------------------------
   现象：param-test.js 约一半的运行会失败，失败项永远是 id=283、kind='b'，
   报「该基在该 λ 处不可行; 从头重解 = infeasible」——
   即模块声称某个 λ 区间里原基最优，但那个区间里问题其实是**无可行解**的。
*/
'use strict';
const fs = require('fs');
const S = require('./simplex-core.js');
const SC = require('./sens-core.js');
const fmt = S.fmtNum;

const bank = JSON.parse(fs.readFileSync(__dirname + '/random-bank.json', 'utf8'));
const t = bank.find(x => x.id === 283);
if (!t) { console.log('random-bank.json 里没有 id=283'); process.exit(0); }

const base = { direction: t.direction, c: t.c.map(Number), constraints: t.constraints };
console.log('════════ id=283 原题 ════════');
console.log('  ' + base.direction + ' z = ' + base.c.map((v, j) => v + 'x' + (j + 1)).join(' + '));
base.constraints.forEach((k, i) => {
  console.log('    ' + k.coef.map((v, j) => v + 'x' + (j + 1)).join(' + ')
    + ' ' + k.rel + ' ' + k.rhs);
});
const r0 = S.simplexSolve(base);
console.log('  基准解：' + r0.status + '  x = ' + r0.solution.map(fmt).join(', ')
  + '  z = ' + fmt(r0.objective));
console.log('  最优基：' + r0.steps[r0.steps.length - 1].basis.map(c => r0.vars[c].name).join(', '));
console.log('');

/* 找一个能触发失败的 e 向量（右边系数的 λ 系数） */
function tryE(e) {
  const r = SC.sensParam(base, { kind: 'b', e: e });
  if (!r.ok) return { bad: false, r: r };
  for (const seg of r.segments) {
    const a = seg.lo === -Infinity ? -60 : Math.max(seg.lo, -60);
    const b = seg.hi === Infinity ? 60 : Math.min(seg.hi, 60);
    if (a > b) continue;
    for (const lam of [a + (b - a) * 0.25, (a + b) / 2, a + (b - a) * 0.75]) {
      const changed = SC.sensBuildModel((function () {
        const p = { direction: base.direction, c: base.c.slice(),
          constraints: base.constraints.map(k => ({ coef: k.coef.slice(), rel: k.rel, rhs: k.rhs })) };
        p.constraints.forEach((k, i) => { k.rhs = base.constraints[i].rhs + lam * e[i]; });
        return p;
      })());
      if (changed.flipSign.join(',') !== SC.sensBuildModel(base).flipSign.join(',')) continue;
      const fresh = S.simplexSolve((function () {
        const p = { direction: base.direction, c: base.c.slice(),
          constraints: base.constraints.map(k => ({ coef: k.coef.slice(), rel: k.rel, rhs: k.rhs })) };
        p.constraints.forEach((k, i) => { k.rhs = base.constraints[i].rhs + lam * e[i]; });
        return p;
      })());
      if (fresh.status !== 'optimal') {
        return { bad: true, r: r, seg: seg, lam: lam, fresh: fresh };
      }
    }
  }
  return { bad: false, r: r };
}

let hit = null;
for (let tries = 0; tries < 4000 && !hit; tries++) {
  const e = base.constraints.map(() => {
    const v = Math.round((Math.random() * 6 - 3) * 2) / 2;
    return v;
  });
  if (e.every(v => v === 0)) continue;
  const res = tryE(e);
  if (res.bad) hit = { e: e, res: res };
}

if (!hit) { console.log('（没扫到失败用例）'); process.exit(0); }

console.log('════════ 扫到一个失败用例 ════════');
console.log('  λ 系数 e = [' + hit.e.join(', ') + ']');
console.log('  模块给出的分段：');
hit.res.r.segments.forEach(s => {
  console.log('    λ ∈ [' + (s.lo === -Infinity ? '−∞' : fmt(s.lo)) + ', '
    + (s.hi === Infinity ? '+∞' : fmt(s.hi)) + ']　基 ' + s.basisNames.join(',')
    + '　x = (' + s.x.map(SC.fmtAff).join(', ') + ')　z = ' + SC.fmtAff(s.z)
    + (s.note ? '　[' + s.note + ']' : ''));
});
console.log('');
console.log('  ★出问题的点：λ = ' + fmt(hit.res.lam) + '（落在上面某一段内）');
console.log('    从该点从头重解这个线性规划 → ' + hit.res.fresh.status);
console.log('');
console.log('  把 λ 代进去后的实际右端项 b(λ)：');
base.constraints.forEach((k, i) => {
  console.log('    b' + (i + 1) + '(λ) = ' + k.rhs + ' + λ·' + hit.e[i]
    + ' = ' + fmt(k.rhs + hit.res.lam * hit.e[i]));
});
console.log('');
console.log('  各条约束的关系符：' + base.constraints.map((k, i) => 'r' + (i + 1) + ' ' + k.rel).join('，'));
console.log('');
console.log('  模型内部（标准化后）的 flipSign = [' + SC.sensBuildModel(base).flipSign.join(', ') + ']');
console.log('  内部 b0 = [' + SC.sensBuildModel(base).b0.map(fmt).join(', ') + ']');
