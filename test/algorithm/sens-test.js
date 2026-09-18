/* 灵敏度分析测试
   ---------------------------------------------------------------------------
   ① 手算可核对的经典例题（区间与教材一致）
   ② 生成批量样本供 scipy 独立复算：对每道 optimal 的题，在每个 c/b 的允许区间
      内取点、在边界外取点，并算出「若最优基不变，z 应为多少」的线性预测值。
      预测的依据：
        · 改基变量的 cⱼ → z = z₀ + Δcⱼ · xⱼ      （区间内 x 不变）
        · 改非基变量的 cⱼ → z = z₀                （该变量仍取 0）
        · 改右端项 bᵢ    → z = z₀ + Δbᵢ · yᵢ      （区间内影子价格恒定）
      区间内预测必须成立；越界后预测应当失效（否则说明区间取窄了）。
*/
'use strict';
const fs = require('fs');
const { simplexSolve, fmtNum } = require('../../src/core/simplex-core.js');

function fmt(v) {
  if (v === Infinity) return '+∞';
  if (v === -Infinity) return '-∞';
  return fmtNum(v);
}
let bad = 0;
function eq(cond, msg) {
  if (!cond) { bad++; console.log('  ✗ ' + msg); } else { console.log('  ✓ ' + msg); }
}

function show(title, prob, expect) {
  const r = simplexSolve(prob);
  console.log('='.repeat(70));
  console.log(title);
  console.log('  状态 ' + r.status + '   z* = ' + fmtNum(r.objective) +
              '   解 ' + JSON.stringify(r.solution));
  if (expect) console.log('  手算期望: ' + expect);
  if (r.sensitivity) {
    console.log('  c 的允许范围（保持最优基不变）:');
    r.sensitivity.c.forEach(e => console.log(
      '    ' + e.name + (e.basic ? '（基变量）  ' : '（非基变量）') +
      '当前 ' + fmtNum(e.current) + '  →  [' + fmt(e.lo) + ', ' + fmt(e.hi) + ']' +
      '   z 斜率 ' + fmtNum(e.slope)));
    console.log('  b 的允许范围（影子价格 y 在此区间有效）:');
    r.sensitivity.b.forEach(e => console.log(
      '    约束' + (e.i + 1) + '  当前 ' + fmtNum(e.current) +
      '  →  [' + fmt(e.lo) + ', ' + fmt(e.hi) + ']' +
      '   影子价格 ' + fmtNum(e.shadow)));
  } else {
    console.log('  （本题不给灵敏度分析）');
  }
  console.log('');
  return r;
}

const near = (a, b) => Math.abs(a - b) < 1e-9;

/* ---------------- ① 经典题：全部可手算 ---------------- */
const r1 = show('经典题 max 2x1+3x2 ; x1+2x2≤8, 4x1≤16, 4x2≤12',
  { direction: 'max', c: [2, 3], constraints: [
    { coef: [1, 2], rel: '<=', rhs: 8 },
    { coef: [4, 0], rel: '<=', rhs: 16 },
    { coef: [0, 4], rel: '<=', rhs: 12 }] },
  '最优 (4,2) z=14，基={x1,x2,s3}；手推 B⁻¹ 得 c1∈[3/2,+∞) c2∈[0,4] b1∈[4,10] b2∈[8,32] b3∈[8,+∞)');

const c1 = r1.sensitivity.c[0], c2 = r1.sensitivity.c[1];
const b1 = r1.sensitivity.b[0], b2 = r1.sensitivity.b[1], b3 = r1.sensitivity.b[2];
console.log('经典题逐项核对:');
eq(c1.lo === 1.5 && c1.hi === Infinity, 'c₁ ∈ [3/2, +∞)');
eq(near(c2.lo, 0) && near(c2.hi, 4), 'c₂ ∈ [0, 4]');
eq(near(b1.lo, 4) && near(b1.hi, 10), 'b₁ ∈ [4, 10]');
eq(near(b2.lo, 8) && near(b2.hi, 32), 'b₂ ∈ [8, 32]');
eq(near(b3.lo, 8) && b3.hi === Infinity, 'b₃ ∈ [8, +∞)');
eq(near(c1.slope, 4) && near(c2.slope, 2), 'z 对 c 的斜率 = 基变量取值（4 与 2）');
eq(near(b1.shadow, 1.5) && near(b2.shadow, 0.125) && near(b3.shadow, 0), '影子价格 1.5 / 0.125 / 0');

/* ---------------- ② 负右端项：验证 flipSign 换算 ---------------- */
const r2 = show('max -x1-x2 , s.t. -x1-x2 ≤ -5（等价于 x1+x2 ≥ 5）',
  { direction: 'max', c: [-1, -1], constraints: [{ coef: [-1, -1], rel: '<=', rhs: -5 }] },
  '对「用户输入的 b = -5」求导：y 应为 +1（b 从 -5 增到 -4 会让 z 从 -5 升到 -4）');
eq(near(r2.dual[0], 1), '负右端项的影子价格换算正确（+1，不是 -1）');

const r3 = show('同一约束的另一种写法 max -x1-x2 , s.t. x1+x2 ≥ 5',
  { direction: 'max', c: [-1, -1], constraints: [{ coef: [1, 1], rel: '>=', rhs: 5 }] },
  '参数化方向相反，同一个几何约束的 y 应为 -1');
eq(near(r3.dual[0], -1), '对照写法给出 -1（两者互为相反数，说明是按用户输入的 b 求导）');
eq(r2.objective === r3.objective, '两种写法最优值相同（-5），说明只是参数化不同');

/* ---------------- ③ 不该给灵敏度的情况 ---------------- */
const r4 = simplexSolve({ direction: 'max', c: [1, 1], constraints: [] });
const r5 = simplexSolve({ direction: 'max', c: [1], constraints: [
  { coef: [1], rel: '>=', rhs: 5 }, { coef: [1], rel: '<=', rhs: 2 }] });
eq(r4.sensitivity === null, '无约束（无界）时不产出灵敏度');
eq(r5.sensitivity === null, '无可行解时不产出灵敏度');

/* ---------------- ④ 非基变量只有单侧有限 ---------------- */
const r6 = show('max 2x1+3x2 ; x1+x2≤4（x2 会退为非基）',
  { direction: 'max', c: [2, 3], constraints: [{ coef: [1, 1], rel: '<=', rhs: 4 }] },
  '只有 1 个约束 → 恰有 1 个基变量，另一个非基');
console.log('');
console.log(bad ? `手算核对: ${bad} 项不符 ✗` : '手算核对: 全部通过 ✓');

/* =========================================================================
   生成批量样本，供 crosscheck-sens.py 用 scipy 独立复算
   ========================================================================= */
function addSamples(list, kind, idx, cur, lo, hi, slope, z0, label) {
  const push = (v, tag) => list.push({
    kind: kind, idx: idx, value: v, tag: tag, label: label,
    predicted: z0 + slope * (v - cur)
  });
  const span = Math.max(1, Math.abs(cur));

  if (isFinite(lo)) {
    push(cur + 0.5 * (lo - cur), 'in');
    push(cur + 0.95 * (lo - cur), 'in');
    push(lo - Math.max(1e-2, 0.05 * Math.abs(lo - cur) + 1e-9), 'out');
  } else {
    push(cur - span, 'in');
    push(cur - 10 * span, 'in');
  }
  if (isFinite(hi)) {
    push(cur + 0.5 * (hi - cur), 'in');
    push(cur + 0.95 * (hi - cur), 'in');
    push(hi + Math.max(1e-2, 0.05 * Math.abs(hi - cur) + 1e-9), 'out');
  } else {
    push(cur + span, 'in');
    push(cur + 10 * span, 'in');
  }
}

const bank = JSON.parse(fs.readFileSync(__dirname + '/random-bank.json', 'utf8'));
const out = [];
const LIMIT = 250;
for (const t of bank) {
  if (out.length >= LIMIT) break;
  const r = simplexSolve({ direction: t.direction, c: t.c, constraints: t.constraints });
  if (r.status !== 'optimal' || !r.sensitivity) continue;

  const samples = [];
  r.sensitivity.c.forEach(e => addSamples(samples, 'c', e.j, e.current, e.lo, e.hi,
    e.slope, r.objective, e.name));
  r.sensitivity.b.forEach(e => addSamples(samples, 'b', e.i, e.current, e.lo, e.hi,
    e.shadow, r.objective, '约束' + (e.i + 1)));
  if (!samples.length) continue;

  out.push({
    id: t.id, direction: t.direction, c: t.c, constraints: t.constraints,
    obj: r.objective, sol: r.solution, samples: samples
  });
}

fs.writeFileSync(__dirname + '/sens-bank.json', JSON.stringify(out, null, 1));
const nIn = out.reduce((s, o) => s + o.samples.filter(x => x.tag === 'in').length, 0);
const nOut = out.reduce((s, o) => s + o.samples.filter(x => x.tag === 'out').length, 0);
console.log(`\n灵敏度题库已生成: sens-bank.json`);
console.log(`  ${out.length} 道题 · 区间内样本 ${nIn} 个 · 越界样本 ${nOut} 个`);

/* =========================================================================
   紧致性校验（「不多不少」里的「不少」）
   -------------------------------------------------------------------------
   光看 z 是否变化还不够：越界后基可能只是发生了 θ=0 的退化转换，顶点没动，
   z 就恰好不变 —— 这和「区间给窄了」从外面看是一样的。所以这里直接在代数上
   判断：把越界点的数据代回去，重算 x_B 与 σ，看原最优基是否**仍然有效**。
     仍然有效 → 区间给窄了（失败）
     已经失效 → 边界取对了
   ========================================================================= */
function matInv(M) {
  const mm = M.length;
  const A = M.map((row, i) => row.slice().concat(row.map((_, k) => i === k ? 1 : 0)));
  for (let i = 0; i < mm; i++) {
    let p = i;
    for (let k = i + 1; k < mm; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    if (Math.abs(A[p][i]) < 1e-12) return null;
    if (p !== i) { const t = A[i]; A[i] = A[p]; A[p] = t; }
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

let tight = 0, loose = [], skipped = 0;
for (const t of out) {
  const n = t.c.length, m = t.constraints.length;
  const prob = { direction: t.direction, c: t.c, constraints: t.constraints };
  const r = simplexSolve(prob);
  const last = r.steps[r.steps.length - 1];
  const basis = last.basis, rows = last.rows, obj = last.obj, vars = r.vars;
  const N = vars.length;
  const swapSign = t.direction === 'min' ? -1 : 1;

  /* 重建标准化矩阵 A0 与 flipSign */
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
    if (k.rel === '<=') sCol[i] = cnt++;
    else if (k.rel === '>=') { sCol[i] = cnt++; aCol[i] = cnt++; }
    else aCol[i] = cnt++;
  }
  const A0 = [];
  for (let i = 0; i < m; i++) {
    const row = new Array(N).fill(0);
    for (let j = 0; j < n; j++) row[j] = cons[i].coef[j];
    if (sCol[i] !== undefined) row[sCol[i]] = (cons[i].rel === '>=' ? -1 : 1);
    if (aCol[i] !== undefined) row[aCol[i]] = 1;
    A0.push(row);
  }
  const B = [];
  for (let i = 0; i < m; i++) B.push(basis.map(c => A0[i][c]));
  const Binv = matInv(B);
  if (!Binv) { skipped++; continue; }

  /* 参与判定的非基列（与区间推导里用的是同一组） */
  const free = [];
  for (let j = 0; j < N; j++) {
    if (vars[j].kind === 'a') continue;
    if (basis.indexOf(j) !== -1) continue;
    if (Math.abs(obj[j].b) > 1e-9) continue;
    free.push(j);
  }
  const artRows = [];
  for (let p = 0; p < m; p++) if (vars[basis[p]].kind === 'a') artRows.push(p);

  for (const s of t.samples) {
    if (s.tag !== 'out') continue;
    let xB, sig = {}, ok = true;

    if (s.kind === 'b') {
      /* 越界后右端项可能跨过 0，那样整行会被取负、A0 结构改变，不可直接比较 */
      if ((cons[s.idx].rhs > 0) !== (s.value > 0) && Math.abs(s.value) > 1e-12) { skipped++; continue; }
      const bNew = flip[s.idx] * s.value;
      xB = Binv.map(row => row.reduce((a, v, k) => a + v * (k === s.idx ? bNew : cons[k].rhs), 0));
      free.forEach(j => sig[j] = obj[j].a);
    } else {
      const dc = swapSign * (s.value - t.c[s.idx]);
      xB = rows.map(row => row[N]);
      const pos = basis.indexOf(s.idx);
      if (pos === -1) {
        /* 非基变量：只有它自己的检验数受影响，σ_k' = σ_k + Δ */
        free.forEach(j => { sig[j] = obj[j].a + (j === s.idx ? dc : 0); });
      } else {
        /* 基变量：所有非基列的检验数一起平移 σ_j' = σ_j − Δ·(B⁻¹Pⱼ)_p */
        free.forEach(j => { sig[j] = obj[j].a - dc * rows[pos][j]; });
      }
    }

    for (let p = 0; p < m && ok; p++) {
      if (artRows.indexOf(p) !== -1) { if (Math.abs(xB[p]) > 1e-6) ok = false; }
      else if (xB[p] < -1e-6) ok = false;
    }
    free.forEach(j => { if (sig[j] > 1e-6) ok = false; });

    if (ok) loose.push({ id: t.id, label: s.label, kind: s.kind, idx: s.idx, value: s.value });
    else tight++;
  }
}

console.log(`\n紧致性校验（越界点处原最优基必须已失效）:`);
console.log(`  边界取对: ${tight} 个`);
console.log(`  仍然有效(区间给窄了): ${loose.length} 个`);
console.log(`  跳过(右端项跨 0 或矩阵奇异): ${skipped} 个`);
loose.slice(0, 12).forEach(x => console.log(
  `    ! id=${x.id} ${x.label} ${x.kind}#${x.idx} 取值=${x.value.toFixed(6)}`));

const problems = bad + loose.length;
console.log(`\n最终结论: ${problems ? problems + ' 项待查 ✗' : '全部通过 ✓（区间不多不少）'}`);
process.exit(problems ? 1 : 0);
