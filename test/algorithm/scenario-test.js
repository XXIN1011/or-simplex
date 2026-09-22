/* 场景式灵敏度分析 —— 生成随机算例供 scipy 对拍
   ---------------------------------------------------------------------------
   核心判据只有一条，但它足够强：
     **场景分析给出的新最优解，必须与「把题改成新样子后用独立求解器从头重解」
       的结果完全一致。**
   这样既验证了前置判断（该不该继续迭代），也验证了继续迭代本身（原始/对偶单纯形）。
   每道基准题配 5 类场景：改目标系数 / 改技术系数 / 改右端项 / 加约束 / 加变量。
  （改目标系数与改技术系数各自还要覆盖「改的是基变量」和「改的是非基变量」两种情形，
    所以除了每类一个算例外，再额外补两个「专挑基变量/非基变量下手」的算例。）
*/
'use strict';
const fs = require('fs');
const S = require('../../src/core/simplex.js');
const F = require('../../src/core/format.js');
const SC = require('../../src/core/scenario.js');
const RNG = require('../lib/rng.js');

/* 随机扰动走固定种子（--seed=N 可复现其它批次）：以前用 Math.random()，
   偶发失败无法复现——而这份套件又是「建表一致性」的唯一兜底，必须可复现。 */
const SEED = RNG.resolveSeed(3);
const R = RNG.rng(SEED);
const rnd = R.between;
const ri = R.ri;
console.log(RNG.banner('场景分析', SEED));
const q = v => Math.round(v * 2) / 2;          // 取到 0.5 的倍数，便于人看

const bank = JSON.parse(fs.readFileSync(__dirname + '/random-bank.json', 'utf8'));
const out = [];
const LIMIT = 120;

for (const t of bank) {
  if (out.length >= LIMIT) break;
  const base = { direction: t.direction, c: t.c.map(Number), constraints: t.constraints };
  if (S.simplexSolve(base).status !== 'optimal') continue;

  const n = base.c.length, m = base.constraints.length;
  const cases = [];

  /* ① 目标函数系数变化 */
  const c2 = base.c.map(v => q(v + rnd(-6, 6)));
  cases.push({
    type: 'c', sc: { type: 'c', c: c2 },
    prob: { direction: base.direction, c: c2, constraints: base.constraints }
  });

  /* ② 右端项变化 */
  const rhs2 = base.constraints.map(k => q(k.rhs + rnd(-8, 8)));
  cases.push({
    type: 'b', sc: { type: 'b', rhs: rhs2 },
    prob: { direction: base.direction, c: base.c,
            constraints: base.constraints.map((k, i) => ({ coef: k.coef, rel: k.rel, rhs: rhs2[i] })) }
  });

  /* ③ 增加一个约束 */
  const rel = ['<=', '>=', '='][ri(0, 2)];
  const coefC = Array.from({ length: n }, () => ri(-3, 3));
  if (coefC.every(v => v === 0)) coefC[ri(0, n - 1)] = 1;
  const rhsC = ri(-6, 12);
  cases.push({
    type: 'add-con', sc: { type: 'add-con', coef: coefC, rel: rel, rhs: rhsC },
    prob: { direction: base.direction, c: base.c,
            constraints: base.constraints.concat([{ coef: coefC, rel: rel, rhs: rhsC }]) }
  });

  /* ④ 增加一个变量 */
  const cNew = ri(-4, 6);
  const coefV = Array.from({ length: m }, () => ri(-2, 3));
  cases.push({
    type: 'add-var', sc: { type: 'add-var', c: cNew, coef: coefV },
    prob: { direction: base.direction, c: base.c.concat([cNew]),
            constraints: base.constraints.map((k, i) => ({ coef: k.coef.concat([coefV[i]]), rel: k.rel, rhs: k.rhs })) }
  });

  /* ⑤ 技术系数 a_ij 变化。
     基变量列与非基变量列的判据完全不同，所以两种情形各生成一个算例，
     保证两个分支都被随机题覆盖到（改的是哪一类由基准解的最优基决定）。 */
  const baseRes2 = S.simplexSolve(base);
  const basisCols2 = baseRes2.steps[baseRes2.steps.length - 1].basis;
  const isBasicVar = Array.from({ length: n }, (_, j) => basisCols2.indexOf(j) !== -1);
  const basicIdx = [], nonBasicIdx = [];
  for (let j = 0; j < n; j++) (isBasicVar[j] ? basicIdx : nonBasicIdx).push(j);

  for (const [tag, pool] of [['a-basic', basicIdx], ['a-nonbasic', nonBasicIdx]]) {
    if (!pool.length) continue;
    const jj = pool[ri(0, pool.length - 1)];
    const ii = ri(0, m - 1);
    const oldV = Number(base.constraints[ii].coef[jj]);
    const newV = q(oldV + rnd(-6, 6));
    const con2 = base.constraints.map((k, i2) => ({
      coef: k.coef.map((v, j2) => (i2 === ii && j2 === jj) ? newV : v), rel: k.rel, rhs: k.rhs
    }));
    cases.push({
      type: tag, sc: { type: 'a', con: ii, v: jj, value: newV },
      prob: { direction: base.direction, c: base.c, constraints: con2 }
    });
  }

  const rec = { id: t.id, base: base, cases: [] };
  for (const c of cases) {
    const r = SC.sensAnalyze(base, c.sc);
    rec.cases.push({
      type: c.type, sc: c.sc, prob: c.prob,
      jsOk: !!r.ok,
      jsMsg: r.ok ? null : r.message,
      jsStatus: r.ok ? r.status : null,
      jsObj: r.ok ? r.result.objective : null,
      jsSol: r.ok ? r.result.solution : null,
      changed: r.ok ? r.judgement.changed : null,
      steps: r.ok ? r.steps.length : 0
    });
  }
  out.push(rec);
}

/* 模型一致性自检：sensBuildModel 的标准型必须与共享求解内核建出来的表一致，
   否则说明两套建表逻辑已经分叉（这是最容易悄悄出问题的地方）。 */
let modelMismatch = 0;
for (const rec of out.slice(0, 40)) {
  const res = S.simplexSolve(rec.base);
  const mm = SC.sensBuildModel(rec.base);
  const first = res.steps[0].rows;                 // 第一张快照就是初始表
  for (let i = 0; i < mm.m; i++) {
    for (let j = 0; j < mm.N; j++) {
      if (Math.abs(first[i][j] - mm.A0[i][j]) > 1e-9) modelMismatch++;
    }
    if (Math.abs(first[i][mm.N] - mm.b0[i]) > 1e-9) modelMismatch++;
  }
}

fs.writeFileSync(__dirname + '/scenario-bank.json', JSON.stringify(out, null, 1));
const total = out.reduce((s, r) => s + r.cases.length, 0);
console.log(`场景题库已生成: scenario-bank.json`);
console.log(`  ${out.length} 道基准题 × 5 类场景（改 c / 改 a_ij / 改 b / 加约束 / 加变量）
                + 2 个专挑基变量、非基变量下手的补例 = ${total} 个算例`);
console.log(`  建表一致性自检: ${modelMismatch ? modelMismatch + ' 处不一致 ✗' : '与求解内核完全一致 ✓'}`);
process.exit(modelMismatch ? 1 : 0);
