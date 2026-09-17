/* =========================================================================
   inv-core.js 对拍题库生成器（Node 侧）
   -------------------------------------------------------------------------
   思路：本脚本用 inv-core.js（JS 实现）解一批随机题，把「题目参数 + JS 结果」
   写进 inv-bank.json；再由 crosscheck-inv.py 用 python/inventory.py
   （**另一套独立实现**）重解同一批题，逐项比对。

   两边都是独立写的代码，公式抄错、系数写反、边界处理不同都会立刻暴露。

   用法：  node inv-test.js
   产出：  inv-bank.json（已加入 .gitignore）
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const C = require('./inv-core.js');

/* 固定种子，保证可复现 */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260917);
const U = (lo, hi) => lo + (hi - lo) * rnd();
const LOG = (lo, hi) => Math.pow(10, U(lo, hi));
const RI = (lo, hi) => Math.floor(U(lo, hi + 1 - 1e-9));

const cases = [];
let gen = 0;

function push(model, params, res) {
  if (!res || res.ok !== true) {
    throw new Error('生成器造出的题居然算不出来（' + model + '）：'
      + JSON.stringify(params) + ' -> ' + (res && res.message));
  }
  cases.push({ id: ++gen, model: model, params: params, js: res });
}

/* ---------------- 9.2 EOQ ---------------- */
for (let i = 0; i < 400; i++) {
  const D = LOG(2, 6), c1 = LOG(-1, 2), c3 = LOG(1, 4);
  const K = (i % 3 === 0) ? LOG(-0.5, 1.5) : null;   /* 有时不给单价 */
  const p = { D: D, c1: c1, c3: c3, K: K };
  push('eoq', p, C.invEOQ(p));
}

/* ---------------- 9.4 陆续到货 EPQ ---------------- */
for (let i = 0; i < 300; i++) {
  const d = LOG(2, 6), D = d;                    /* 同口径：D = d */
  const pp = d * U(1.05, 8);
  const c1 = LOG(-1, 2), c3 = LOG(1, 4);
  const p = { D: D, d: d, p: pp, c1: c1, c3: c3, K: null, n: null };
  push('epq', p, C.invEPQ(p));
}
/* 再补几条「D = d × n 且显式给出 n」的，验证单位口径校验通过 */
for (let i = 0; i < 40; i++) {
  const d = LOG(1, 3), n = RI(200, 366), D = d * n;
  const pp = d * U(1.2, 5);
  const c1 = LOG(0, 1.5), c3 = LOG(2, 3.5);
  const p = { D: D, d: d, p: pp, c1: c1, c3: c3, K: null, n: n };
  push('epq', p, C.invEPQ(p));
}

/* ---------------- 9.3 允许缺货 ---------------- */
for (let i = 0; i < 300; i++) {
  const D = LOG(2, 6), c1 = LOG(-1, 2), c2 = LOG(-1, 2), c3 = LOG(1, 4);
  const K = (i % 4 === 0) ? LOG(0, 1) : null;
  const p = { D: D, c1: c1, c2: c2, c3: c3, K: K };
  push('short', p, C.invShortage(p));
}

/* ---------------- 9.5 批量折扣 ---------------- */
for (let i = 0; i < 300; i++) {
  const D = LOG(2.5, 5.5), c3 = LOG(1, 3.5);
  const nTier = RI(1, 5);
  let lo = 0, K = LOG(0.5, 1.5);
  const tiers = [];
  for (let t = 0; t < nTier; t++) {
    if (t > 0) lo = lo + LOG(1.5, 3.5);
    tiers.push({ lo: lo, K: K });
    K = K * U(0.6, 0.98);
  }
  const useRate = (i % 2 === 0);
  const p = useRate
    ? { D: D, c3: c3, tiers: tiers, mode: 'rate', rate: U(0.05, 0.4), c1: null }
    : { D: D, c3: c3, tiers: tiers, mode: 'abs', rate: null, c1: LOG(-0.5, 1) };
  push('disc', p, C.invDiscount(p));
}

/* ---------------- 9.6 多产品资源约束 ---------------- */
for (let i = 0; i < 250; i++) {
  const n = RI(2, 4);
  const constraint = (i % 3 === 0) ? 'volume' : 'capital';
  const averageBasis = (i % 4 === 0);
  const gKey = constraint === 'capital' ? 'K' : 'v';
  const items = [];
  for (let k = 0; k < n; k++) {
    items.push({
      name: 'P' + (k + 1),
      D: LOG(2.5, 5.5), c1: LOG(-0.5, 1.5), c3: LOG(1, 3.5),
      K: LOG(0.5, 1.5), v: LOG(-1.5, 0.5), min: null
    });
  }
  /* 把上限设在「无约束占用」的 50%~95%，保证约束起作用 */
  let uncon = 0;
  for (const it of items) {
    const gEff = averageBasis ? it[gKey] / 2 : it[gKey];
    uncon += gEff * Math.sqrt(2 * it.c3 * it.D / it.c1);
  }
  const limit = uncon * U(0.5, 0.95);
  const p = { items: items, constraint: constraint, limit: limit, averageBasis: averageBasis };
  push('multi', p, C.invMulti(p));
}

/* ---------------- 汇总 ---------------- */
const counts = {};
for (const c of cases) counts[c.model] = (counts[c.model] || 0) + 1;

const out = path.join(__dirname, 'inv-bank.json');
fs.writeFileSync(out, JSON.stringify({ seed: 20260917, cases: cases }, null, 1), 'utf8');

console.log('题库已生成：' + out);
console.log('  共 ' + cases.length + ' 题  ' + JSON.stringify(counts));
console.log('  下一步：python crosscheck-inv.py');
