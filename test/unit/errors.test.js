/* =========================================================================
   单元测试 · 异常模块（core/errors.js）
   -------------------------------------------------------------------------
   两件事必须同时成立、且互相不干扰：
     ① 老的返回值契约（{ok:false,message} / status 字符串）一字不变；
     ② 新调用方拿到的是能按 code 分支的 LPError。
   ========================================================================= */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const E = require('../../src/core/errors.js');

test('结局码与状态字符串的取值是历史契约，不许改动', () => {
  assert.strictEqual(E.STATUS.OPTIMAL, 'optimal');
  assert.strictEqual(E.STATUS.INFEASIBLE, 'infeasible');
  assert.strictEqual(E.STATUS.UNBOUNDED, 'unbounded');
  assert.strictEqual(E.STATUS.ITERATION_LIMIT, 'iteration-limit');
  assert.strictEqual(E.CODES.INVALID_INPUT, 'E_INVALID_INPUT');
  assert.strictEqual(E.CODES.SINGULAR_BASIS, 'E_SINGULAR_BASIS');
});

test('invalidInput：兼容返回体用全角分号连接，顺序不变', () => {
  const r = E.invalidInput(['第一条', '第二条']);
  assert.deepStrictEqual(r, { ok: false, message: '第一条；第二条' });
  /* 单条时不能出现多余分隔符 */
  assert.strictEqual(E.invalidInput(['只有一条']).message, '只有一条');
});

test('LPError：是 Error 的子类，带 code 与 detail', () => {
  const err = new E.LPError(E.CODES.INFEASIBLE, '约束矛盾', { iter: 3 });
  assert.ok(err instanceof Error);
  assert.ok(err instanceof E.LPError);
  assert.strictEqual(err.code, 'E_INFEASIBLE');
  assert.strictEqual(err.message, '约束矛盾');
  assert.deepStrictEqual(err.detail, { iter: 3 });
  assert.strictEqual(String(err), '[E_INFEASIBLE] 约束矛盾');
  /* 不传 detail 时是 null（而不是 undefined，避免日志里出现 "detail: undefined"） */
  assert.strictEqual(new E.LPError(E.CODES.UNBOUNDED, 'x').detail, null);
});

test('toError：optimal 不给异常，其余三种各给对应 code', () => {
  assert.strictEqual(E.toError(E.STATUS.OPTIMAL), null);
  assert.strictEqual(E.toError(E.STATUS.INFEASIBLE).code, 'E_INFEASIBLE');
  assert.strictEqual(E.toError(E.STATUS.UNBOUNDED).code, 'E_UNBOUNDED');
  assert.strictEqual(E.toError(E.STATUS.ITERATION_LIMIT).code, 'E_ITERATION_LIMIT');
  assert.strictEqual(E.toError('不存在的状态'), null);
});

test('throwIfFailed：最优不抛，非最优抛 LPError', () => {
  assert.doesNotThrow(() => E.throwIfFailed(E.STATUS.OPTIMAL));
  assert.throws(() => E.throwIfFailed(E.STATUS.UNBOUNDED), (err) => {
    assert.ok(err instanceof E.LPError);
    assert.strictEqual(err.code, 'E_UNBOUNDED');
    return true;
  });
});

test('statusInfo：中文文案齐全（界面与 CLI 共用这一份）', () => {
  assert.match(E.statusInfo(E.STATUS.INFEASIBLE).message, /人工变量/);
  assert.match(E.statusInfo(E.STATUS.UNBOUNDED).message, /无限增大/);
  assert.match(E.statusInfo(E.STATUS.ITERATION_LIMIT).message, /循环/);
  assert.strictEqual(E.statusInfo(E.STATUS.OPTIMAL), null);   // 最优不是「异常结局」
});

test('isFailure：只有 optimal 是成功', () => {
  assert.strictEqual(E.isFailure(E.STATUS.OPTIMAL), false);
  assert.strictEqual(E.isFailure(E.STATUS.INFEASIBLE), true);
  assert.strictEqual(E.isFailure(E.STATUS.UNBOUNDED), true);
  assert.strictEqual(E.isFailure(E.STATUS.ITERATION_LIMIT), true);
});
