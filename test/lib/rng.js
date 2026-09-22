/* =========================================================================
   可复现随机数（测试专用）
   -------------------------------------------------------------------------
   为什么要有它：ip-test / param-test / scenario-test 原来直接用 Math.random()，
   于是「这次跑挂了、下次跑又过了」——查一个偶发失败要重跑三五次才敢下结论，
   而且失败现场无法复现（连是哪道题都不知道）。

   现在统一走这里：默认固定种子，可用 `--seed=N` 或环境变量 OR_SEED 覆盖，
   每个套件开头都会打印当次种子，失败时照着那行就能原样重跑。

   ★ 为什么不用 test-simplex.js 里那个手写 LCG：那个是**旧的固定实现**，
     它决定了 random-bank.json 的字节内容（对拍题库），换算法会让题库变样，
     所以保持原样不动；新写的套件用这里这份。
   ========================================================================= */
'use strict';

/**
 * mulberry32 —— 32 位状态、分布够用、实现只有几行的确定性随机数发生器。
 * @param {number} seed 任意 32 位整数
 * @returns {function():number} 调用一次返回 [0,1) 的浮点数
 */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * resolveSeed —— 取种子：命令行 `--seed=N` > 环境变量 OR_SEED > 传入的默认值。
 * @param {number} fallback
 * @returns {number}
 */
function resolveSeed(fallback) {
  const arg = process.argv.find(a => a.startsWith('--seed='));
  const raw = arg ? arg.slice('--seed='.length) : process.env.OR_SEED;
  const n = Number(raw);
  return Number.isFinite(n) && raw !== undefined && raw !== '' ? (n >>> 0) : (fallback >>> 0);
}

/**
 * rng —— 造一个随机源，带常见取值助手。
 * @param {number} seed
 * @returns {{next:function():number, between:function(number,number):number,
 *            int:function(number):number, ri:function(number,number):number,
 *            pick:function(Array):*}}
 */
function rng(seed) {
  const next = mulberry32(seed);
  return {
    next: next,
    /** [a,b) 上的浮点数 */
    between: (a, b) => a + next() * (b - a),
    /** [0,n) 上的整数 */
    int: n => Math.floor(next() * n),
    /** [lo,hi] 闭区间整数（含两端） */
    ri: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    /** 数组里随机取一个 */
    pick: arr => arr[Math.floor(next() * arr.length)]
  };
}

/**
 * banner —— 生成「本次种子」那一行，套件开头打印它。
 * @param {string} name 套件名
 * @param {number} seed
 * @returns {string}
 */
function banner(name, seed) {
  return `${name}　随机种子 ${seed}（复现：node ${process.argv[1].replace(/\\/g, '/')} --seed=${seed}）`;
}

module.exports = { mulberry32, resolveSeed, rng, banner };
