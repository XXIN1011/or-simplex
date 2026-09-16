/* 动态规划 —— 验证
   ---------------------------------------------------------------------------
   最短路线问题的判据最强也最好写：**从某个节点出发，把所有到终点的路径全枚举一遍**，
   取最小总长。它必须逐个格子等于递推表里算出来的 f_k(s)。

   递推表有 n×(节点数) 个格子，所以这是同时对「最优值」「每一个 f_k(s)」
   「最优决策 u*_k(s)」三样东西的检查，而不只是看最终答案对不对
   —— 只看最终答案的话，递推方向写反、边界条件写错都可能碰巧对上。
*/
'use strict';
const D = require('./dp-core.js');
const fmt = require('./simplex-core.js').fmtNum;

let bad = [];
const eq = (a, b) => Math.abs(a - b) < 1e-9;

/* 纯粹的全路径枚举（无记忆化，故意不写成递推），从第 li 层的 node 出发走到终点 */
function bruteFrom(layers, w, li, node) {
  if (li === layers.length - 1) return { best: 0, count: 1 };
  let best = Infinity, count = 0, bestTo = null;
  const r = layers[li].indexOf(node);
  layers[li + 1].forEach((to, c) => {
    const row = (w[li] || [])[r];
    const v = row ? row[c] : null;
    if (v === null || v === undefined || v === '') return;
    const sub = bruteFrom(layers, w, li + 1, to);
    if (sub.best === Infinity) return;
    count += sub.count;
    if (Number(v) + sub.best < best - 1e-12) { best = Number(v) + sub.best; bestTo = to; }
  });
  return { best, count, bestTo };
}

/* 把回溯出的策略逐段相加，确认它真的走得通、且总长等于最优值 */
function replay(layers, w, policy) {
  let sum = 0, node = layers[0][0];
  for (const step of policy) {
    const li = layers.findIndex(L => L.indexOf(node) >= 0);
    if (li < 0 || li + 1 >= layers.length) return { ok: false, why: '策略中途走丢：' + node };
    const c = layers[li + 1].indexOf(step.d);
    const row = (w[li] || [])[layers[li].indexOf(node)];
    const v = row ? row[c] : null;
    if (v === null || v === undefined) return { ok: false, why: `策略里 ${node}→${step.d} 这段弧不存在` };
    sum += Number(v);
    node = step.d;
  }
  if (node !== layers[layers.length - 1][0]) return { ok: false, why: '策略没走到终点，停在 ' + node };
  return { ok: true, sum };
}

/* 核对一道题的所有格子 */
function verify(tag, layers, w) {
  const b = bruteFrom(layers, w, 0, layers[0][0]);
  if (b.best === Infinity) return;                  // 起点到终点不通，跳过
  const r = D.dpSolve(D.dpShortest({ layers, w }));

  if (!eq(r.backward.value, b.best)) bad.push(`${tag}：逆序最优值 ${r.backward.value} vs 枚举 ${b.best}`);
  if (!eq(r.forward.value, b.best)) bad.push(`${tag}：顺序最优值 ${r.forward.value} vs 枚举 ${b.best}`);

  const rp = replay(layers, w, r.backward.policy);
  if (!rp.ok) bad.push(`${tag}：${rp.why}`);
  else if (!eq(rp.sum, b.best)) bad.push(`${tag}：回溯策略逐段相加 ${rp.sum} vs 枚举 ${b.best}`);

  /* 逐格子核对：第 k 阶段的状态就是第 k-1 层的节点 */
  r.backward.cells.forEach(cell => {
    cell.states.forEach(st => {
      const sub = bruteFrom(layers, w, cell.k - 1, st.key);
      if (sub.best === Infinity) return;             // 该点走不到终点，表里本来就是「不可达」
      if (st.best === null) { bad.push(`${tag}：f_${cell.k}(${st.key}) 表里为空，但该点其实走得到终点`); return; }
      if (!eq(st.best, sub.best)) bad.push(`${tag}：f_${cell.k}(${st.key}) = ${st.best}，枚举为 ${sub.best}`);
      /* 最优决策也必须真的指向那个最优后继 */
      if (st.bestD === null) { bad.push(`${tag}：f_${cell.k}(${st.key}) 有值却没有最优决策`); return; }
      const li = cell.k - 1;
      const row = (w[li] || [])[layers[li].indexOf(st.key)];
      const c = layers[cell.k].indexOf(st.bestD);
      const v = row ? row[c] : null;
      const nxt = layers[cell.k].indexOf(st.bestD) >= 0
        ? bruteFrom(layers, w, cell.k, st.bestD) : { best: Infinity };
      if (v === null || v === undefined) bad.push(`${tag}：f_${cell.k}(${st.key}) 选了一段不存在的弧 ${st.key}→${st.bestD}`);
      else if (!eq(Number(v) + nxt.best, st.best)) {
        bad.push(`${tag}：f_${cell.k}(${st.key}) 的最优决策 ${st.bestD} 对不上（${v}+${nxt.best} ≠ ${st.best}）`);
      }
    });
  });
  return { value: b.best, count: b.count };
}

/* ---------- 1. 经典例题 ---------- */
const layers = [['A'], ['B1', 'B2'], ['C1', 'C2', 'C3'], ['D1', 'D2'], ['E']];
const w = [
  [[5, 3]],
  [[1, 3, 6], [8, 7, 6]],
  [[6, 8], [3, 5], [8, 4]],
  [[3], [4]]
];
console.log('════════ 经典例题：A→B→C→D→E 五层网络 ════════');
const r0 = D.dpSolve(D.dpShortest({ layers, w }));
console.log(`  逆序解法最优值 = ${fmt(r0.backward.value)}　顺序解法最优值 = ${fmt(r0.forward.value)}`);
const b0 = bruteFrom(layers, w, 0, 'A');
console.log(`  枚举全部 ${b0.count} 条路径的最短 = ${fmt(b0.best)}`);
console.log(`  最优策略：A → ${r0.backward.policy.map(p => p.d).join(' → ')}`);
console.log('\n  逐阶段递推表（逆序解法，教材写法）：');
r0.backward.cells.forEach(c => {
  console.log(`    k=${c.k}　` + c.states.map(s =>
    `${s.label}: f=${s.best === null ? '—' : fmt(s.best)}, u*=${s.bestDLabel.replace('→ ', '') || '—'}`
  ).join('　　'));
});
console.log('\n  逐阶段递推表（顺序解法，注意 f 挂在下一阶段的状态上）：');
r0.forward.cells.forEach(c => {
  console.log(`    k=${c.k}　` + c.states.map(s =>
    `${s.label}: f=${s.best === null ? '—' : fmt(s.best)} ← 由 ${s.fromLabel} 经 ${s.bestDLabel.replace('→ ', '')} 而来`
  ).join('　　'));
});
verify('经典例题', layers, w);

/* ---------- 2. 随机分层网络 ---------- */
console.log('\n════════ 随机分层网络 ════════');
let cases = 0, totalPaths = 0, cells = 0;
for (let t = 0; t < 300; t++) {
  const L = 2 + Math.floor(Math.random() * 4);              // 2..5 次前进
  const lay = [];
  for (let i = 0; i <= L; i++) {
    const cnt = (i === 0 || i === L) ? 1 : 1 + Math.floor(Math.random() * 3);
    lay.push(Array.from({ length: cnt }, (_, z) => 'N' + i + 'x' + z));
  }
  const ww = [];
  for (let i = 0; i < L; i++) {
    ww.push(lay[i].map(() => lay[i + 1].map(() =>
      Math.random() < 0.25 ? null : Math.round(Math.random() * 14) + 1)));
  }
  /* 只要求起点能走到终点；中间有走不到终点的节点也没关系
     —— 那种格子在递推表里本来就该显示「不可达」，是个该被覆盖到的情况 */
  const b = bruteFrom(lay, ww, 0, lay[0][0]);
  if (b.best === Infinity) continue;
  cases++; totalPaths += b.count;
  verify('随机#' + t, lay, ww);
  cells += D.dpSolve(D.dpShortest({ layers: lay, w: ww })).backward.cells
    .reduce((s, c) => s + c.states.length, 0);
}
console.log(`  ${cases} 道随机网络，共枚举 ${totalPaths} 条路径、核对 ${cells} 个递推格子`);

/* =========================================================================
   以下四种题型的验证策略同上：**从原始输入直接穷举**（完全不碰模型里的
   状态集/转移函数，避免自己验自己），逐个核对递推表里的每一格 f_k(s)。
   ========================================================================= */

/* ---------- 3. 资源分配问题 ---------- */
function resBrute(g, k, s, exhaust) {
  if (k > g.length) return exhaust ? (s === 0 ? 0 : -Infinity) : 0;
  let best = -Infinity;
  for (let u = 0; u <= s; u++) {
    const sub = resBrute(g, k + 1, s - u, exhaust);
    if (sub === -Infinity) continue;
    best = Math.max(best, g[k - 1][u] + sub);
  }
  return best;
}

console.log('\n════════ 资源分配问题 ════════');
{
  let cases = 0;
  for (let t = 0; t < 120; t++) {
    const m = 3 + Math.floor(Math.random() * 5);            // 总资源 3..7
    const n = 2 + Math.floor(Math.random() * 3);            // 项目 2..4
    const g = Array.from({ length: n }, () =>
      Array.from({ length: m + 1 }, () => Math.round(Math.random() * 12)));
    for (const exhaust of [false, true]) {
      const r = D.dpSolve(D.dpResource({ total: m, g, exhaust }));
      const expect = resBrute(g, 1, m, exhaust);
      cases++;
      if (!eq(r.backward.value, expect)) {
        bad.push(`资源分配(用尽=${exhaust}) 最优值 ${r.backward.value} vs 穷举 ${expect}`); continue;
      }
      if (!eq(r.forward.value, expect)) bad.push(`资源分配 顺序解法 ${r.forward.value} vs 穷举 ${expect}`);
      /* 逐格子 */
      r.backward.cells.forEach(cell => {
        cell.states.forEach(st => {
          const e2 = resBrute(g, cell.k, st.key, exhaust);
          if (e2 === -Infinity) { if (st.best !== null) bad.push(`资源分配 f_${cell.k}(${st.key}) 该不可行却有值`); return; }
          if (st.best === null || !eq(st.best, e2)) {
            bad.push(`资源分配 f_${cell.k}(${st.key}) = ${st.best}，穷举为 ${e2}`);
          }
        });
      });
      /* 最优策略的解必须可行且收益相符 */
      let used = 0, gain = 0;
      r.backward.policy.forEach(p => { used += p.d; gain += p.v; });
      if (used > m) bad.push(`资源分配 最优策略分配了 ${used} 份，超过总量 ${m}`);
      if (exhaust && used !== m) bad.push(`资源分配 要求用尽却只分了 ${used}/${m}`);
      if (!eq(gain, r.backward.value)) bad.push(`资源分配 策略收益 ${gain} vs 最优值 ${r.backward.value}`);
    }
  }
  console.log(`  ${cases} 道（含允许剩余 / 要求用尽两种边界），每格 f_k(s) 都单独穷举核对`);
}

/* ---------- 4. 背包问题 ---------- */
function knapBrute(items, k, s, multi) {
  if (k > items.length) return 0;
  const it = items[k - 1];
  let best = knapBrute(items, k + 1, s, multi);              // 不拿
  if (it.w > 0) {
    const top = multi ? Math.floor(s / it.w) : Math.min(1, Math.floor(s / it.w));
    for (let u = 1; u <= top; u++) {
      best = Math.max(best, it.v * u + knapBrute(items, k + 1, s - it.w * u, multi));
    }
  }
  return best;
}

console.log('\n════════ 背包问题 ════════');
{
  let cases = 0, combos = 0;
  for (let t = 0; t < 120; t++) {
    const W = 4 + Math.floor(Math.random() * 8);            // 容量 4..11
    const n = 2 + Math.floor(Math.random() * 3);            // 种类 2..4
    const items = Array.from({ length: n }, () => ({
      w: 1 + Math.floor(Math.random() * 4),
      v: 1 + Math.floor(Math.random() * 9)
    }));
    for (const mode of ['01', 'multi']) {
      const r = D.dpSolve(D.dpKnapsack({ cap: W, items, mode }));
      const expect = knapBrute(items, 1, W, mode === 'multi');
      cases++; combos += expect;
      if (!eq(r.backward.value, expect)) { bad.push(`背包(${mode}) ${r.backward.value} vs 穷举 ${expect}`); continue; }
      if (!eq(r.forward.value, expect)) bad.push(`背包(${mode}) 顺序解法 ${r.forward.value} vs 穷举 ${expect}`);
      r.backward.cells.forEach(cell => {
        cell.states.forEach(st => {
          const e2 = knapBrute(items, cell.k, st.key, mode === 'multi');
          if (st.best === null || !eq(st.best, e2)) {
            bad.push(`背包 f_${cell.k}(${st.key}) = ${st.best}，穷举为 ${e2}`);
          }
        });
      });
      /* 策略的重量不能超容量 */
      let wsum = 0, vsum = 0;
      r.backward.policy.forEach((p, z) => { wsum += items[z].w * p.d; vsum += p.v; });
      if (wsum > W) bad.push(`背包 策略总重 ${wsum} 超过容量 ${W}`);
      if (!eq(vsum, r.backward.value)) bad.push(`背包 策略价值 ${vsum} vs 最优值 ${r.backward.value}`);
      if (mode === '01' && r.backward.policy.some(p => p.d > 1)) bad.push('背包(0/1) 却拿了多件');
    }
  }
  console.log(`  ${cases} 道（0/1 与可重复两种），每格 f_k(s) 都单独穷举核对`);
}

/* ---------- 5. 生产与存储问题 ---------- */
function prodBrute(cfg, k, s, bound) {
  const n = cfg.demands.length;
  if (k > n) return s === 0 ? 0 : Infinity;
  let best = Infinity;
  for (let u = 0; u <= cfg.maxProd; u++) {
    const end = s + u - cfg.demands[k - 1];
    if (end < 0 || end > bound) continue;
    const cost = (u > 0 ? cfg.setup + cfg.unit * u : 0) + cfg.hold * end;
    const sub = prodBrute(cfg, k + 1, end, bound);
    if (sub === Infinity) continue;
    best = Math.min(best, cost + sub);
  }
  return best;
}

console.log('\n════════ 生产与存储问题 ════════');
{
  let cases = 0, pruneOk = 0;
  for (let t = 0; t < 120; t++) {
    const n = 2 + Math.floor(Math.random() * 3);            // 2..4 期
    const demands = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 4));
    const cfg = {
      demands,
      setup: Math.round(Math.random() * 8),
      unit: 1 + Math.round(Math.random() * 3),
      hold: 1 + Math.round(Math.random() * 2),
      maxProd: 5 + Math.floor(Math.random() * 4)
    };
    const total = demands.reduce((a, b) => a + b, 0);
    const r = D.dpSolve(D.dpProdInv(cfg));
    const expect = prodBrute(cfg, 1, 0, total);
    if (expect === Infinity) continue;
    cases++;
    if (!eq(r.backward.value, expect)) { bad.push(`生产存储 ${r.backward.value} vs 穷举 ${expect}`); continue; }
    if (!eq(r.forward.value, expect)) bad.push(`生产存储 顺序解法 ${r.forward.value} vs 穷举 ${expect}`);
    r.backward.cells.forEach(cell => {
      cell.states.forEach(st => {
        const e2 = prodBrute(cfg, cell.k, st.key, total);
        if (e2 === Infinity) return;
        if (st.best === null || !eq(st.best, e2)) {
          bad.push(`生产存储 f_${cell.k}(${st.key}) = ${st.best}，穷举为 ${e2}`);
        }
      });
    });
    /* 策略要真的可行：逐期库存非负、期末归零、费用相符 */
    let inv = 0, cost = 0;
    r.backward.policy.forEach((p, z) => {
      inv = inv + p.d - demands[z];
      if (inv < 0) bad.push('生产存储 策略出现欠货');
      cost += (p.d > 0 ? cfg.setup + cfg.unit * p.d : 0) + cfg.hold * inv;
    });
    if (inv !== 0) bad.push(`生产存储 期末库存为 ${inv}，应为 0`);
    if (!eq(cost, r.backward.value)) bad.push(`生产存储 策略费用 ${cost} vs 最优值 ${r.backward.value}`);
    /* 模型把库存上限收在「总需求」上，确认这个剪枝没有把最优解剪掉 */
    const wide = prodBrute(cfg, 1, 0, total + 6);
    if (eq(wide, expect)) pruneOk++;
    else bad.push(`生产存储 放宽库存上限后最优值变成 ${wide}（原 ${expect}）→ 剪枝掉了最优解`);
  }
  console.log(`  ${cases} 道，每格 f_k(s) 单独穷举核对；其中 ${pruneOk} 道确认库存剪枝不丢最优解`);
}

/* ---------- 6. 设备更新问题 ---------- */
function replBrute(cfg, k, age) {
  if (k > cfg.years) return 0;
  let best = -Infinity;
  if (age + 1 <= cfg.maxAge) {
    best = Math.max(best, cfg.income[age] - cfg.upkeep[age] + replBrute(cfg, k + 1, age + 1));
  }
  if (age >= 1) {
    best = Math.max(best, -cfg.price + cfg.salvage[age] + cfg.income[0] - cfg.upkeep[0]
      + replBrute(cfg, k + 1, 1));
  }
  return best;
}

console.log('\n════════ 设备更新问题 ════════');
{
  let cases = 0;
  for (let t = 0; t < 120; t++) {
    const years = 2 + Math.floor(Math.random() * 4);        // 2..5 年
    const maxAge = 3 + Math.floor(Math.random() * 2);       // 役龄 0..3/4
    const cfg = {
      years, maxAge,
      price: 10 + Math.round(Math.random() * 12),
      salvage: Array.from({ length: maxAge + 1 }, (_, z) => (z === 0 ? 0 : Math.round(8 - z * 2 + Math.random() * 3))),
      income: Array.from({ length: maxAge + 1 }, (_, z) => Math.max(1, 12 - z * 2 + Math.round(Math.random() * 3))),
      upkeep: Array.from({ length: maxAge + 1 }, (_, z) => z * 2 + Math.round(Math.random() * 2))
    };
    const initAge = 0;
    const r = D.dpSolve(D.dpReplace(Object.assign({ initAge }, cfg)));
    const expect = replBrute(cfg, 1, initAge);
    cases++;
    if (!eq(r.backward.value, expect)) { bad.push(`设备更新 ${r.backward.value} vs 穷举 ${expect}`); continue; }
    if (!eq(r.forward.value, expect)) bad.push(`设备更新 顺序解法 ${r.forward.value} vs 穷举 ${expect}`);
    r.backward.cells.forEach(cell => {
      cell.states.forEach(st => {
        const e2 = replBrute(cfg, cell.k, st.key);
        if (e2 === -Infinity) return;
        if (st.best === null || !eq(st.best, e2)) {
          bad.push(`设备更新 f_${cell.k}(${st.key}) = ${st.best}，穷举为 ${e2}`);
        }
      });
    });
    /* 策略推演：逐年跟踪役龄，总收益必须对得上 */
    let age = initAge, gain = 0, okSeq = true;
    r.backward.policy.forEach((p, z) => {
      if (p.d === 'keep') {
        if (age + 1 > maxAge) okSeq = false;
        gain += cfg.income[age] - cfg.upkeep[age];
        age = age + 1;
      } else {
        if (age < 1) okSeq = false;
        gain += -cfg.price + cfg.salvage[age] + cfg.income[0] - cfg.upkeep[0];
        age = 1;
      }
      if (age !== (p.d === 'keep' ? p.nextLabel : 1) && String(age) !== String(p.nextLabel)) okSeq = okSeq;
    });
    if (!okSeq) bad.push('设备更新 策略出现不合法的动作');
    if (!eq(gain, r.backward.value)) bad.push(`设备更新 策略收益 ${gain} vs 最优值 ${r.backward.value}`);
  }
  console.log(`  ${cases} 道，每格 f_k(s) 单独穷举核对（含役龄 0 与役龄上界两种边界）`);
}

if (bad.length) {
  console.log(`\n!!! 不通过 ${bad.length} 条：`);
  bad.slice(0, 10).forEach(x => console.log('  ' + x));
} else {
  console.log('\n✓ 全部通过');
}
console.log('\n结论:', bad.length ? 'FAIL' : 'PASS');
process.exit(bad.length ? 1 : 0);
