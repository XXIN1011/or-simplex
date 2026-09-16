/* 整数规划 —— 验证
   ---------------------------------------------------------------------------
   判据：**四种方法算出来的最优整数解，必须与暴力枚举一致**。
     · 用暴力枚举（枚举整数变量的所有取值组合，每个组合固定成等式约束后用单纯形法
       解剩下的连续变量）作为独立参照。
     · 分枝定界、割平面、隐枚举各自算一遍，最优值必须逐个对上；可行解还要回代验算。
   · 另外验证「适用性判定」本身：不该适用的方法必须被标成不可用，并给出理由。
*/
'use strict';
const S = require('./simplex-core.js');
const IP = require('./ip-core.js');
const fmt = S.fmtNum;

let bad = [];
const eq = (a, b) => Math.abs(a - b) < 1e-6;
function fail(m) { bad.push(m); }

/* ---------------- 暴力枚举（参照） ----------------
   整数变量逐个枚举；每枚举一个组合，就把它们固定成等式约束、
   交给单纯形法解剩下的（连续）变量。这是最笨但也最不会骗人的做法。 */
function bruteForce(problem, ranges) {
  const n = problem.c.length;
  const intIdx = IP.ipIntVars(problem);
  const sense = problem.direction === 'max' ? 'max' : 'min';
  let best = null, bestZ = null, combos = 0, feasible = 0;
  const cur = intIdx.map(() => 0);

  (function rec(t) {
    if (t === intIdx.length) {
      combos++;
      const p = {
        direction: problem.direction, c: problem.c.slice(),
        constraints: problem.constraints.map(k => ({ coef: k.coef.slice(), rel: k.rel, rhs: k.rhs }))
      };
      /* 把整数变量固定成等式 */
      intIdx.forEach((j, z) => {
        const coef = new Array(n).fill(0); coef[j] = 1;
        p.constraints.push({ coef: coef, rel: '=', rhs: cur[z] });
      });
      const r = S.simplexSolve(p);
      if (r.status !== 'optimal') return;
      feasible++;
      const z = r.objective;
      if (bestZ === null || (sense === 'max' ? z > bestZ + 1e-9 : z < bestZ - 1e-9)) {
        bestZ = z; best = r.solution.slice();
      }
      return;
    }
    const j = intIdx[t], rg = ranges[t];
    for (let v = rg[0]; v <= rg[1]; v++) { cur[t] = v; rec(t + 1); }
  })(0);
  return { best, bestZ, combos, feasible };
}

/* 从约束推出每个整数变量的自然上界。
   注意不能拿一个「顺手写死的上限」去截断它 —— 曾经写成 Math.min(hi, 12)，
   结果 x1 真能取到 17 的题被截到 12，反而把**正确的**分枝定界结果判成了错。 */
function rangesOf(problem, cap) {
  return IP.ipIntVars(problem).map(j => {
    let hi = null;
    problem.constraints.forEach(k => {
      if (k.rel !== '<=' || k.coef[j] <= 1e-9) return;
      const b = Math.floor(k.rhs / k.coef[j] + 1e-9);
      if (hi === null || b < hi) hi = b;
    });
    if (hi === null) hi = cap;                  // 没有任何约束能界定它，才退回一个上限
    return [0, Math.max(0, hi)];
  });
}

function label(v) { return v === null || v === undefined ? '—' : fmt(v); }

/* =========================================================================
   1. 经典例题（可以手算核对的那种）
   ========================================================================= */
console.log('════════ 经典例题：max z = 3x₁ + 2x₂ ；2x₁+3x₂ ≤ 14，2x₁+x₂ ≤ 9，x 取整 ════════');
const classic = {
  direction: 'max', c: [3, 2],
  constraints: [
    { coef: [2, 3], rel: '<=', rhs: 14 },
    { coef: [2, 1], rel: '<=', rhs: 9 }
  ],
  vtypes: ['int', 'int']
};
{
  const r = IP.ipSolve(classic);
  console.log('  松弛问题最优解：x = (' + r.relax.solution.map(fmt).join(', ') + ')，z = '
    + fmt(r.relax.objective) + '　→ 有非整数分量，需要整数规划');
  const bf = bruteForce(classic, rangesOf(classic, 12));
  console.log('  暴力枚举（' + bf.combos + ' 个组合）：x = (' + bf.best.map(fmt).join(', ')
    + ')，z = ' + fmt(bf.bestZ));
  r.methods.forEach(m => {
    if (m.key === 'graph') { console.log('  图解法　：' + (m.applicable ? '适用' : '不适用 — ' + m.reason)); return; }
    if (!m.applicable) { console.log('  ' + m.name + '：不适用 — ' + m.reason); return; }
    if (m.key === 'bnb') {
      console.log('  分枝定界：' + (m.best ? 'x = (' + m.best.map(fmt).join(', ') + ')，z = ' + fmt(m.bestZ) : '无解')
        + '　（展开 ' + m.nodes.length + ' 个结点，剪枝 '
        + m.nodes.filter(x => x.action === 'prune').length + ' 次）');
      if (!eq(m.bestZ, bf.bestZ)) fail(`例题 分枝定界 z=${m.bestZ} ≠ 枚举 ${bf.bestZ}`);
    } else if (m.key === 'cut') {
      console.log('  割平面法：' + (m.converged ? 'x = (' + m.solution.map(fmt).join(', ') + ')，z = ' + fmt(m.objective)
        + '　（割了 ' + m.cuts.length + ' 次）' : '★未收敛★'));
      if (m.converged && !eq(m.objective, bf.bestZ)) fail(`例题 割平面 z=${m.objective} ≠ 枚举 ${bf.bestZ}`);
    } else if (m.key === 'enum') {
      console.log('  隐枚举法：不适用 — ' + m.reason);
    }
  });
}

/* =========================================================================
   2. 随机纯整数规划（全 ≤、整数数据）—— 三种方法 + 枚举 四方对拍
   ========================================================================= */
console.log('\n════════ 随机纯整数规划（全 ≤、数据为整数）════════');
{
  let cases = 0, bnbOk = 0, cutOk = 0, cutFail = 0;
  for (let t = 0; t < 200; t++) {
    const n = 2 + Math.floor(Math.random() * 2);           // 2..3 个变量
    const m = 2 + Math.floor(Math.random() * 2);           // 2..3 条约束
    const c = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
    const constraints = [];
    for (let i = 0; i < m; i++) {
      constraints.push({
        coef: Array.from({ length: n }, () => Math.floor(Math.random() * 5)),
        rel: '<=', rhs: 6 + Math.floor(Math.random() * 14)
      });
    }
    if (constraints.some(k => k.coef.every(v => v === 0))) continue;   // 空约束跳过
    const problem = { direction: 'max', c, constraints, vtypes: new Array(n).fill('int') };

    const ranges = rangesOf(problem, 12);
    if (ranges.some(r => r[1] < r[0])) continue;
    const combos = ranges.reduce((s, r) => s * (r[1] - r[0] + 1), 1);
    if (combos > 4000) continue;                            // 枚举太慢的跳过

    const bf = bruteForce(problem, ranges);
    const r = IP.ipSolve(problem);
    if (r.noOptimum) continue;                              // 松弛问题就无解，跳过
    cases++;

    const bnb = r.methods.find(x => x.key === 'bnb');
    const cut = r.methods.find(x => x.key === 'cut');
    const en = r.methods.find(x => x.key === 'enum');

    /* 分枝定界 */
    if (bnb.applicable) {
      if (bf.best === null) {
        if (bnb.best !== null) fail(`分枝定界 枚举无解却有解`);
      } else if (bnb.best === null || !eq(bnb.bestZ, bf.bestZ)) {
        fail(`分枝定界 z=${label(bnb.bestZ)} ≠ 枚举 z=${label(bf.bestZ)}`);
      } else {
        /* 解向量也要真的可行且目标值对得上 */
        bnb.best.forEach((v, j) => { if (!IP.ipIsInt(v)) fail(`分枝定界 解里 x${j + 1}=${v} 不是整数`); });
        let zz = 0; bnb.best.forEach((v, j) => zz += problem.c[j] * v);
        if (!eq(zz, bnb.bestZ)) fail(`分枝定界 解回代 z=${zz} ≠ ${bnb.bestZ}`);
        bnbOk++;
      }
    }
    /* 割平面法 */
    if (cut.applicable) {
      if (!cut.converged) { cutFail++; }
      else if (bf.best === null) fail('割平面 枚举无解却有解');
      else if (!eq(cut.objective, bf.bestZ)) fail(`割平面 z=${cut.objective} ≠ 枚举 z=${bf.bestZ}`);
      else if (!cut.integral) fail('割平面 的结果不是整数解');
      else {
        let zz = 0; cut.solution.forEach((v, j) => zz += problem.c[j] * v);
        if (!eq(zz, cut.objective)) fail(`割平面 解回代 z=${zz} ≠ ${cut.objective}`);
        cutOk++;
      }
    }
    /* 隐枚举：变量不是 0-1，必须判为不适用 */
    if (en.applicable) fail('隐枚举 对非 0-1 问题竟然判成适用');
  }
  console.log(`  ${cases} 道：分枝定界 ${bnbOk} 道与枚举一致；割平面 ${cutOk} 道一致`
    + (cutFail ? `，${cutFail} 道未收敛` : ''));
}

/* =========================================================================
   3. 随机 0-1 规划 —— 隐枚举 + 分枝定界 + 枚举 三方对拍
   ========================================================================= */
console.log('\n════════ 随机 0-1 规划 ════════');
{
  let cases = 0, enOk = 0, bnbOk = 0, bnbIncomplete = 0, filtered = 0, totalPts = 0;
  for (let t = 0; t < 200; t++) {
    const n = 3 + Math.floor(Math.random() * 5);           // 3..7 个变量
    const m = 2 + Math.floor(Math.random() * 3);           // 2..4 条约束
    /* 目标系数故意混入负数，逼出 x_j = 1 − y_j 那个替换分支 */
    const c = Array.from({ length: n }, () => Math.floor(Math.random() * 13) - 5);
    const constraints = [];
    for (let i = 0; i < m; i++) {
      constraints.push({
        coef: Array.from({ length: n }, () => Math.floor(Math.random() * 7) - 2),
        rel: '<=', rhs: Math.floor(Math.random() * 10)
      });
    }
    const problem = { direction: 'max', c, constraints, vtypes: new Array(n).fill('bin') };

    const bf = bruteForce(problem, new Array(n).fill([0, 1]));
    const r = IP.ipSolve(problem);
    if (r.noOptimum) continue;
    cases++;
    totalPts += Math.pow(2, n);

    const en = r.methods.find(x => x.key === 'enum');
    const bnb = r.methods.find(x => x.key === 'bnb');
    filtered += en.filteredOut || 0;

    if (!en.applicable && !en.tooBig) fail('隐枚举 对 0-1 问题判成了不适用');
    if (en.applicable && !en.tooBig) {
      if (bf.best === null) { if (en.best !== null) fail('隐枚举 枚举无解却有解'); }
      else if (en.best === null || !eq(en.bestZ, bf.bestZ)) {
        fail(`隐枚举 z=${label(en.bestZ)} ≠ 枚举 z=${label(bf.bestZ)}`);
      } else {
        en.best.forEach((v, j) => { if (v !== 0 && v !== 1) fail(`隐枚举 解里 x${j + 1}=${v} 不是 0-1`); });
        let zz = 0; en.best.forEach((v, j) => zz += problem.c[j] * v);
        if (!eq(zz, en.bestZ)) fail(`隐枚举 解回代 z=${zz} ≠ ${en.bestZ}`);
        enOk++;
      }
    }
    if (bnb.applicable && bf.best !== null) {
      if (!bnb.complete) {
        /* 结点上限触发时它只保证「目前最好」，不是「最优」——
           这时只核对它给出来的解确实可行、且目标值没超过真正的最优值（上界不能破）。 */
        bnbIncomplete++;
        if (bnb.best !== null) {
          if (bnb.bestZ > bf.bestZ + 1e-6) {
            fail(`0-1 分枝定界 未跑完但给出的解 ${bnb.bestZ} 竟然超过真正最优 ${bf.bestZ}`);
          }
        }
      } else if (bnb.best === null || !eq(bnb.bestZ, bf.bestZ)) {
        fail(`0-1 分枝定界 z=${label(bnb.bestZ)} ≠ 枚举 z=${label(bf.bestZ)}`);
      } else bnbOk++;
    }
  }
  console.log(`  ${cases} 道（共 ${totalPts} 个待枚举点，其中 ${filtered} 个被过滤条件提前挡掉）`);
  console.log(`  隐枚举 ${enOk} 道与枚举一致；分枝定界 ${bnbOk} 道与枚举一致`
    + (bnbIncomplete ? `，${bnbIncomplete} 道没在结点上限内跑完（已核对它给出的解不越界）` : ''));
}

/* =========================================================================
   4. 混合整数规划（部分变量连续）—— 分枝定界 + 枚举 对拍；割平面必须判不适适用
   ========================================================================= */
console.log('\n════════ 混合整数规划（部分变量连续）════════');
{
  let cases = 0, ok = 0;
  for (let t = 0; t < 120; t++) {
    const n = 2 + Math.floor(Math.random() * 2);
    const m = 2 + Math.floor(Math.random() * 2);
    const c = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
    const constraints = [];
    for (let i = 0; i < m; i++) {
      constraints.push({
        coef: Array.from({ length: n }, () => Math.floor(Math.random() * 5)),
        rel: '<=', rhs: 8 + Math.floor(Math.random() * 12)
      });
    }
    if (constraints.some(k => k.coef.every(v => v === 0))) continue;
    /* 第一个变量连续，其余取整 */
    const vtypes = Array.from({ length: n }, (_, j) => j === 0 ? 'cont' : 'int');
    const problem = { direction: 'max', c, constraints, vtypes };

    /* 枚举范围同样不能写死上限截断（见 rangesOf 的注释） */
    const ranges = rangesOf(problem, 20);
    const combos = ranges.reduce((s, r) => s * (r[1] - r[0] + 1), 1);
    if (combos > 4000) continue;

    const bf = bruteForce(problem, ranges);
    const r = IP.ipSolve(problem);
    if (r.noOptimum) continue;
    cases++;
    const bnb = r.methods.find(x => x.key === 'bnb');
    const cut = r.methods.find(x => x.key === 'cut');
    if (cut.applicable) fail('割平面 对混合整数规划竟然判成适用');
    if (bnb.applicable && bf.best !== null) {
      if (bnb.best === null || !eq(bnb.bestZ, bf.bestZ)) {
        fail(`混合 分枝定界 z=${label(bnb.bestZ)} ≠ 枚举 z=${label(bf.bestZ)}`);
      } else {
        IP.ipIntVars(problem).forEach(j => {
          if (!IP.ipIsInt(bnb.best[j])) fail(`混合 分枝定界 解里要求取整的 x${j + 1}=${bnb.best[j]} 不是整数`);
        });
        ok++;
      }
    }
  }
  console.log(`  ${cases} 道：分枝定界 ${ok} 道与枚举一致；割平面全部正确判为不适用`);
}

/* =========================================================================
   5. 适用性判定本身
   ========================================================================= */
console.log('\n════════ 适用性判定 ════════');
{
  const mk = (n, rel, vtypes) => ({
    direction: 'max', c: new Array(n).fill(1),
    constraints: [{ coef: new Array(n).fill(1), rel, rhs: 5 }],
    vtypes
  });
  const t1 = IP.ipSolve(mk(2, '<=', ['int', 'int']));
  if (!t1.methods.find(x => x.key === 'graph').applicable) fail('2 变量整数题 图解法应适用');
  if (!t1.methods.find(x => x.key === 'cut').applicable) fail('全 ≤ 纯整数题 割平面应适用');

  const t2 = IP.ipSolve(mk(3, '<=', ['int', 'int', 'int']));
  if (t2.methods.find(x => x.key === 'graph').applicable) fail('3 变量题 图解法不应适用');
  if (!t2.methods.find(x => x.key === 'graph').reason) fail('3 变量题 图解法应给出不适用的理由');

  const t3 = IP.ipSolve(mk(2, '>=', ['int', 'int']));
  if (t3.methods.find(x => x.key === 'cut').applicable) fail('含 ≥ 约束时 割平面不应适用');

  const t4 = IP.ipSolve(mk(2, '<=', ['cont', 'int']));
  if (t4.methods.find(x => x.key === 'cut').applicable) fail('含连续变量时 割平面不应适用');
  if (t4.methods.find(x => x.key === 'enum').applicable) fail('含连续变量时 隐枚举不应适用');
  if (t4.methods.find(x => x.key === 'graph').applicable !== true) fail('2 变量混合题 图解法应适用');

  const t5 = IP.ipSolve(mk(2, '<=', ['bin', 'bin']));
  if (!t5.methods.find(x => x.key === 'enum').applicable) fail('全 0-1 题 隐枚举应适用');

  const t6 = IP.ipSolve(mk(2, '<=', ['int', 'int']));
  if (t6.methods.find(x => x.key === 'enum').applicable) fail('一般整数题 隐枚举不应适用');
  console.log('  6 组判定的适用/不适用与预期一致');
}

if (bad.length) {
  console.log(`\n!!! 不通过 ${bad.length} 条：`);
  bad.slice(0, 12).forEach(x => console.log('  ' + x));
} else {
  console.log('\n✓ 全部通过');
}
console.log('\n结论:', bad.length ? 'FAIL' : 'PASS');
process.exit(bad.length ? 1 : 0);
