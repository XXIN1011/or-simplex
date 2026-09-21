/* =========================================================================
   公共工具模块 —— 数值判定 + 矩阵运算（纯函数，无状态、不碰 DOM、不做 IO）
   -------------------------------------------------------------------------
   两件事：

   ① **pair (a + bM) 的算术与比较**
      M 是形式上的「无穷大」（大 M 法里的人工变量罚因子）。把每个检验数写成
      「常数 + M 的系数」这一对，就能按教材的写法显示成 3 − 2M，而且比大小
      是良定义的：先比 M 的系数，再比常数（M 的字典序）。
      本模块只提供 pair 的运算；怎么用它做判定属于求解内核的事。

   ② **矩阵运算与数值判定**
      matInverse 是高斯–约当消元 + 部分选主元，奇异时返回 null（不是抛异常——
      调用方要按「基没了，需要重新求解」处理，见 scenario 模块）。
      nearZero / clampSign 承接各模块里反复出现的「小于 EPS 就当 0」这类判断，
      统一到一处，避免每个文件各写一份容差。

   ★ 数学等价性：pAdd…matInverse 六个函数与重构前的 core/simplex-core.js
     逐字符相同，只是换了文件位置（有 test/algorithm/deep-snapshot.js 对拍兜底）。
   ========================================================================= */
'use strict';

/* 全局容差。1e-9 是这套代码一直用的值，改它会改变数值判定结果 —— 不要动。 */
var EPS = 1e-9;

/* ---------------- pair (a + bM) 运算 ---------------- */

/**
 * pAdd —— 两个 pair 相加。
 * @param {{a:number,b:number}} x
 * @param {{a:number,b:number}} y
 * @returns {{a:number,b:number}} x + y（新的对象，不改动入参）
 */
function pAdd(x, y) { return { a: x.a + y.a, b: x.b + y.b }; }

/**
 * pSub —— 两个 pair 相减。
 * @param {{a:number,b:number}} x
 * @param {{a:number,b:number}} y
 * @returns {{a:number,b:number}} x − y
 */
function pSub(x, y) { return { a: x.a - y.a, b: x.b - y.b }; }

/**
 * pMul —— pair 乘一个普通数（行变换里用得到）。
 * @param {{a:number,b:number}} x
 * @param {number} s 普通实数
 * @returns {{a:number,b:number}} s·x
 */
function pMul(x, s) { return { a: x.a * s, b: x.b * s }; }   // s 为普通数字

/**
 * pCmp —— M → +∞ 意义下的字典序比较。
 * @param {{a:number,b:number}} x
 * @param {{a:number,b:number}} y
 * @returns {number} x > y 返回 1，x < y 返回 −1，相等（含容差内）返回 0
 */
function pCmp(x, y) {                                        // M -> +∞ 的字典序比较
  if (Math.abs(x.b - y.b) > EPS) return x.b > y.b ? 1 : -1;
  if (Math.abs(x.a - y.a) > EPS) return x.a > y.a ? 1 : -1;
  return 0;
}

/**
 * pIsPos —— 判断 pair 在 M → +∞ 下是否为正。
 * @param {{a:number,b:number}} x
 * @returns {boolean}
 */
function pIsPos(x) { return x.b > EPS || (Math.abs(x.b) <= EPS && x.a > EPS); }

/**
 * pIsZero —— 判断 pair 是否为零。
 * @param {{a:number,b:number}} x
 * @returns {boolean}
 */
function pIsZero(x) { return Math.abs(x.a) <= EPS && Math.abs(x.b) <= EPS; }

/* ---------------- 数值判定 ---------------- */

/**
 * nearZero —— 小于容差即视为 0（默认用全局 EPS）。
 * 就是把各模块里重复出现的 `Math.abs(v) < 1e-9` 收敛到一处。
 * @param {number} v
 * @param {number} [eps=EPS]
 * @returns {boolean}
 */
function nearZero(v, eps) { return Math.abs(v) < (eps === undefined ? EPS : eps); }

/**
 * clampSign —— 把「容差内的毛刺」压成精确 0，其余原样返回。
 * 注意只在**做判定**时用它；显示层的 0 处理属于 core/format.js（fmtNum 自己会做）。
 * @param {number} v
 * @param {number} [eps=EPS]
 * @returns {number} 要么是 0，要么是 v 本身
 */
function clampSign(v, eps) { return Math.abs(v) < (eps === undefined ? EPS : eps) ? 0 : v; }

/* ---------------- 矩阵运算 ---------------- */

/**
 * matInverse —— 小规模方阵求逆（高斯–约当 + 部分选主元）。
 * @param {number[][]} M m×m 的方阵
 * @returns {number[][]|null} 逆矩阵；主元小于 1e-12（奇异）时返回 null
 */
function matInverse(M) {
  var m = M.length, i, j, k;
  var A = [];
  for (i = 0; i < m; i++) {
    var row = M[i].slice();
    for (k = 0; k < m; k++) row.push(i === k ? 1 : 0);
    A.push(row);
  }
  for (i = 0; i < m; i++) {
    var p = i;
    for (k = i + 1; k < m; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    }
    if (Math.abs(A[p][i]) < 1e-12) return null;
    if (p !== i) { var t = A[i]; A[i] = A[p]; A[p] = t; }
    var piv = A[i][i];
    for (j = 0; j < 2 * m; j++) A[i][j] /= piv;
    for (k = 0; k < m; k++) {
      if (k === i) continue;
      var f = A[k][i];
      if (f === 0) continue;
      for (j = 0; j < 2 * m; j++) A[k][j] -= f * A[i][j];
    }
  }
  var inv = [];
  for (i = 0; i < m; i++) inv.push(A[i].slice(m));
  return inv;
}

/**
 * matVec —— 矩阵乘向量（M·v），对偶解 y = c_B·B⁻¹ 的收尾计算会用到。
 * @param {number[][]} M m×k
 * @param {number[]} v k 维
 * @returns {number[]} m 维
 */
function matVec(M, v) {
  var out = [];
  for (var i = 0; i < M.length; i++) {
    var acc = 0;
    for (var j = 0; j < v.length; j++) acc += M[i][j] * v[j];
    out.push(acc);
  }
  return out;
}

module.exports = {
  EPS: EPS,
  pAdd: pAdd, pSub: pSub, pMul: pMul, pCmp: pCmp, pIsPos: pIsPos, pIsZero: pIsZero,
  nearZero: nearZero, clampSign: clampSign,
  matInverse: matInverse, matVec: matVec
};
