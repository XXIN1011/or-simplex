/* =========================================================================
   单元测试 · 公共工具模块（core/util.js）
   -------------------------------------------------------------------------
   覆盖：pair (a + bM) 的算术与字典序比较、数值容差判定、矩阵求逆与矩阵乘向量。
   这里断言的都是**数学性质**（交换律、字典序优先级、奇异返回 null），
   不是抄一遍实现 —— 抄实现只能证明「代码没变」，证明不了「代码对」。
   ========================================================================= */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const U = require('../../src/core/util.js');

test('pair 加法/减法满足交换律与逆运算', () => {
  const x = { a: 3, b: -2 }, y = { a: -5, b: 7 };
  assert.deepStrictEqual(U.pAdd(x, y), U.pAdd(y, x));
  assert.deepStrictEqual(U.pAdd(x, y), { a: -2, b: 5 });
  assert.deepStrictEqual(U.pSub(U.pAdd(x, y), y), x);        // (x+y)-y == x
});

test('pair 乘普通数：只缩放两个分量，不改动入参', () => {
  const x = { a: 3, b: -2 };
  assert.deepStrictEqual(U.pMul(x, 2), { a: 6, b: -4 });
  assert.deepStrictEqual(x, { a: 3, b: -2 });                // 纯函数，不许改入参
});

test('字典序比较：M 的系数优先于常数项', () => {
  /* 1M - 100 与 0.5M + 999：M 是形式上的无穷大，前者更大 */
  assert.strictEqual(U.pCmp({ a: -100, b: 1 }, { a: 999, b: 0.5 }), 1);
  /* 同为 1M 时再看常数项 */
  assert.strictEqual(U.pCmp({ a: -100, b: 1 }, { a: -200, b: 1 }), 1);
  assert.strictEqual(U.pCmp({ a: 5, b: 0 }, { a: 5, b: 0 }), 0);
});

test('pIsPos / pIsZero：M 项决定符号，容差内视为 0', () => {
  assert.strictEqual(U.pIsPos({ a: -1e6, b: 1 }), true);     // 1M - 1000000 > 0
  assert.strictEqual(U.pIsPos({ a: 1e6, b: -1 }), false);    // -1M + 1000000 < 0
  assert.strictEqual(U.pIsPos({ a: 1e-12, b: 0 }), false);   // 容差内不算正
  assert.strictEqual(U.pIsZero({ a: 1e-12, b: -1e-12 }), true);
});

test('nearZero / clampSign：同一个容差口径', () => {
  assert.strictEqual(U.nearZero(1e-10), true);
  assert.strictEqual(U.nearZero(1e-8), false);
  assert.strictEqual(U.clampSign(-0.9999999999999998 + 1), 0);   // 1e-16 级毛刺归零
  assert.strictEqual(U.clampSign(2.5), 2.5);
});

test('matInverse：单位阵、对角阵、往返乘法', () => {
  assert.deepStrictEqual(U.matInverse([[1, 0], [0, 1]]), [[1, 0], [0, 1]]);
  const A = [[2, 0], [0, 4]];
  const inv = U.matInverse(A);
  assert.deepStrictEqual(inv, [[0.5, 0], [0, 0.25]]);
  /* A·A⁻¹ 应当是单位阵（用 matVec 逐列验算） */
  for (let j = 0; j < 2; j++) {
    const col = U.matVec(A, [inv[0][j], inv[1][j]]);
    assert.ok(Math.abs(col[0] - (j === 0 ? 1 : 0)) < 1e-12);
    assert.ok(Math.abs(col[1] - (j === 1 ? 1 : 0)) < 1e-12);
  }
});

test('matInverse：奇异矩阵返回 null（不是抛异常 —— 调用方要按「基没了」处理）', () => {
  assert.strictEqual(U.matInverse([[1, 2], [2, 4]]), null);
  assert.strictEqual(U.matInverse([[0, 0], [0, 0]]), null);
});

test('matVec：维度与数值', () => {
  assert.deepStrictEqual(U.matVec([[1, 2], [3, 4]], [5, 6]), [17, 39]);
  assert.deepStrictEqual(U.matVec([], [1]), []);
});
