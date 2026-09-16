/* 参数线性规划（教材 2.6）验证
   ---------------------------------------------------------------------------
   模块的结论是「λ 在 [lo, hi] 内最优基不变，该基算出 x(λ)、z(λ) 如下」。
   这句话要能被独立检验，所以对每一段区间取若干 λ，把 c_j(λ) / b_i(λ) 代进去：

     ① 该段声称的最优基，在这一点上必须**仍然可行**（B⁻¹b(λ) ≥ 0）且**仍然最优**（σ(λ) ≤ 0）
        —— 这直接验证了「最优基不变」；只看目标值对不对是验不出来的
        （多最优解、退化都可能让目标值碰巧对上）。
     ② 该基算出的目标值必须等于 z(λ) 表达式，也必须等于「把 λ 代进去后从头重解」的结果。
     ③ 区间端点必须真的是临界点：越过它一点点，原基就不再同时满足①②
        —— 这验证了区间是「恰好」的，没有切窄。

   另外把抽样写到 param-bank.json，交给 scipy 独立复算。
*/
'use strict';
const fs = require('fs');
const S = require('./simplex-core.js');
const SC = require('./sens-core.js');
const fmt = S.fmtNum;

const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const q = v => Math.round(v * 2) / 2;

/* 把 λ 代进 c 或 b，得到一个普通线性规划 */
function mutate(base, kind, coef, lam) {
  const p = { direction: base.direction, c: base.c.slice(),
              constraints: base.constraints.map(k => ({ coef: k.coef.slice(), rel: k.rel, rhs: k.rhs })) };
  if (kind === 'c') p.c = base.c.map((v, j) => v + lam * coef[j]);
  else p.constraints.forEach((k, i) => { k.rhs = base.constraints[i].rhs + lam * coef[i]; });
  return p;
}

/* 建表时「右端项为负的约束整行取负」的符号图案。
   图案一旦改变，整套标准化形式就换了，本模块按 λ = 0 的形式处理，
   所以那些 λ 不属于本模块的适用范围，检查时要跳过（而不是判成失败）。 */
function flipPattern(prob) {
  return SC.sensBuildModel(prob).flipSign.join(',');
}

/* 在某个 λ 上，检查「这一段声称的基」是否真的可行 + 最优 */
function basisState(base, kind, coef, lam, names) {
  const prob = mutate(base, kind, coef, lam);
  const model = SC.sensBuildModel(prob);
  const cols = names.map(nm => model.colOf[nm]);
  if (cols.indexOf(undefined) !== -1) return { s: 'basismiss' };
  const T = SC.sensTableau(model, cols);
  if (!T) return { s: 'singular' };
  let feasible = true;
  for (let i = 0; i < model.m; i++) if (T.rows[i][model.N] < -1e-7) feasible = false;
  /* 基里残留的人工变量即使取正也不算可行 —— 那是大 M 法的辅助量，
     它取正值意味着原问题的约束并没有被真正满足。 */
  for (let i = 0; i < model.m; i++) {
    if (model.vars[cols[i]].kind === 'a' && T.rows[i][model.N] > 1e-7) feasible = false;
  }
  let optimal = true;
  for (let j = 0; j < model.N; j++) {
    const o = T.obj[j];
    if (o.b > 1e-9) { optimal = false; break; }
    if (o.b < -1e-9) continue;
    if (o.a > 1e-7) { optimal = false; break; }
  }
  /* 该基给出的目标值（内部口径 → 用户口径） */
  const zInt = -T.obj[model.N].a;
  return { s: 'ok', feasible, optimal, obj: model.swapSign < 0 ? -zInt : zInt };
}

let bad = [];
let nSeg = 0, nSample = 0, nEdgeCheck = 0, offRange = 0, offEdge = 0;
const bank = [];

/* ---------- 1. 经典手工例题 ---------- */
const classic = {
  direction: 'max', c: [2, 3],
  constraints: [
    { coef: [1, 2], rel: '<=', rhs: 8 },
    { coef: [4, 0], rel: '<=', rhs: 16 },
    { coef: [0, 4], rel: '<=', rhs: 12 }
  ]
};
console.log('════════ 例题：max z = (2+λ)x₁ + 3x₂ ，x₁+2x₂ ≤ 8，4x₁ ≤ 16，4x₂ ≤ 12 ════════');
const rc = SC.sensParam(classic, { kind: 'c', d: [1, 0] });
if (!rc.ok) console.log('  !! ' + rc.message);
else rc.segments.forEach((g, i) => {
  console.log(`  第 ${i + 1} 段  λ ∈ [${g.lo === -Infinity ? '−∞' : fmt(g.lo)}, `
    + `${g.hi === Infinity ? '+∞' : fmt(g.hi)}]　最优基 ${g.basisNames.join(', ')}`);
  console.log(`         x = (${g.x.map(SC.fmtAff).join(', ')})　z = ${SC.fmtAff(g.z)}`
    + (g.note ? `　[${g.note}]` : ''));
});
console.log('');

/* ---------- 2. 随机题：逐段抽样验证 ---------- */
const rbank = JSON.parse(fs.readFileSync(__dirname + '/random-bank.json', 'utf8'));
let cases = 0;

for (const t of rbank) {
  if (cases >= 100) break;
  const base = { direction: t.direction, c: t.c.map(Number), constraints: t.constraints };
  if (S.simplexSolve(base).status !== 'optimal') continue;
  const n = base.c.length, m = base.constraints.length;
  if (n < 1 || m < 1) continue;
  cases++;

  const kinds = [];
  /* 2.6.1 变量系数：给 1~2 个变量加 λ 系数 */
  const d = base.c.map(() => 0);
  for (let k = 0; k < Math.min(2, n); k++) d[ri(0, n - 1)] = q(rnd(-3, 3)) || 1;
  kinds.push(['c', d]);
  /* 2.6.2 右边系数：给 1~2 条约束加 λ 系数 */
  const e = base.constraints.map(() => 0);
  for (let k = 0; k < Math.min(2, m); k++) e[ri(0, m - 1)] = q(rnd(-3, 3)) || 1;
  kinds.push(['b', e]);

  for (const [kind, coef] of kinds) {
    const r = SC.sensParam(base, kind === 'c' ? { kind: 'c', d: coef } : { kind: 'b', e: coef });
    if (!r.ok) continue;

    for (const seg of r.segments) {
      nSeg++;
      /* 段内取 3 个 λ（含端点稍微内缩、中点） */
      const a = seg.lo === -Infinity ? -60 : Math.max(seg.lo, -60);
      const b = seg.hi === Infinity ? 60 : Math.min(seg.hi, 60);
      if (a > b) continue;          // 这一段整体落在抽样窗口之外
      const samples = [a + (b - a) * 0.25, (a + b) / 2, a + (b - a) * 0.75];
      for (const lam of samples) {
        nSample++;
        /* 标准化形式已经变了 → 不在本模块适用范围内，跳过（单独统计） */
        if (flipPattern(mutate(base, kind, coef, lam)) !== flipPattern(base)) { offRange++; continue; }
        const st = basisState(base, kind, coef, lam, seg.basisNames);
        const fresh = S.simplexSolve(mutate(base, kind, coef, lam));
        const zExpr = seg.z.a + lam * seg.z.b;
        const prob = [];
        if (st.s !== 'ok') prob.push('基取不到(' + st.s + ')');
        else {
          if (!st.feasible) prob.push('该基在该 λ 处不可行');
          if (!st.optimal) prob.push('该基在该 λ 处不最优');
          if (fresh.status !== 'optimal') prob.push('从头重解 = ' + fresh.status);
          else {
            if (Math.abs(fresh.objective - st.obj) > 1e-6) prob.push(`该基 z=${fmt(st.obj)} vs 重解 z=${fmt(fresh.objective)}`);
            if (Math.abs(zExpr - st.obj) > 1e-6) prob.push(`λ 表达式 z=${fmt(zExpr)} vs 该基 z=${fmt(st.obj)}`);
          }
        }
        if (prob.length) bad.push(`${t.id} [${kind}] λ=${fmt(lam)} 段[${fmt(seg.lo)},${fmt(seg.hi)}] :: ${prob.join('; ')}`);
        bank.push({ id: t.id, kind, coef, lam, prob: mutate(base, kind, coef, lam),
                    jsSegBasis: seg.basisNames, jsZ: zExpr, jsObj: st.obj });
      }

      /* 端点紧致性：刚越过上界一点点，原基就不该再同时可行且最优 */
      if (seg.hi !== Infinity && Math.abs(seg.hi) < 50) {
        const p2 = mutate(base, kind, coef, seg.hi + 0.05);
        if (flipPattern(p2) === flipPattern(base)) {
          nEdgeCheck++;
          const st = basisState(base, kind, coef, seg.hi + 0.05, seg.basisNames);
          if (st.s === 'ok' && st.feasible && st.optimal) {
            bad.push(`${t.id} [${kind}] 越过上界 ${fmt(seg.hi)} 后原基仍然可行且最优 → 区间切窄了`);
          }
        } else offEdge++;
      }
      if (seg.lo !== -Infinity && Math.abs(seg.lo) < 50) {
        const p3 = mutate(base, kind, coef, seg.lo - 0.05);
        if (flipPattern(p3) === flipPattern(base)) {
          nEdgeCheck++;
          const st = basisState(base, kind, coef, seg.lo - 0.05, seg.basisNames);
          if (st.s === 'ok' && st.feasible && st.optimal) {
            bad.push(`${t.id} [${kind}] 越过下界 ${fmt(seg.lo)} 后原基仍然可行且最优 → 区间切窄了`);
          }
        } else offEdge++;
      }
    }
  }
}

fs.writeFileSync(__dirname + '/param-bank.json', JSON.stringify(bank));
console.log(`随机题 ${cases} 道，共切出 ${nSeg} 段 λ 区间`);
console.log(`  段内抽样 ${nSample} 个点：每个点都要求「声称的最优基在该 λ 处仍可行且仍最优」`,
            `+「目标值与 λ 表达式一致」+「与从头重解一致」`);
console.log(`  端点紧致性检查 ${nEdgeCheck} 次：越过端点 0.05 后原基必须已经失效`);
console.log(`  跳过 ${offRange} 个抽样点、${offEdge} 次紧致性检查：`
          + `那些 λ 已经改变了「整行取负」的标准化形式，不属于本模块的适用范围`);
console.log(`  抽样记录写入 param-bank.json（${bank.length} 条）供 scipy 复算`);

if (bad.length) {
  console.log(`\n!!! 不通过 ${bad.length} 条：`);
  bad.slice(0, 12).forEach(x => console.log('  ' + x));
} else {
  console.log('\n✓ 全部通过');
}
console.log('\n结论:', bad.length ? 'FAIL' : 'PASS');
process.exit(bad.length ? 1 : 0);
