/* =========================================================================
   异常模块 —— 求解过程中「所有非正常结局」的一等公民
   -------------------------------------------------------------------------
   一个线性规划求解器会遇到五类「非正常但含义明确」的结局：

     E_INVALID_INPUT     输入非法   ：系数个数对不上、右端项不是有效数字
     E_INFEASIBLE        无可行解   ：约束之间互相矛盾
     E_UNBOUNDED         无界解     ：目标函数在可行域上无上界
     E_ITERATION_LIMIT   迭代超限   ：退化可能引起循环，超过 maxIter 步
     E_SINGULAR_BASIS    基奇异     ：B 不可逆（对偶解/灵敏度分析时才会碰上）

   为什么需要一个专门的模块：
     ① 调用方常常要**按结局分支**（界面要渲染不同结论、CLI 要决定退出码、
        单元测试要断言「这题应当无可行解」）。分支靠 code，不靠匹配中文字符串。
     ② 文案只有一份。以前「无可行解」的解释散落在界面里，改一次要翻三个文件。
     ③ 后续新增算法（对偶单纯形、两阶段法）只需在这里补一个 code，
        求解内核不必改动 —— 这是本模块作为扩展点的意义。

   ★ 兼容性约束（不可违反）：
     simplexSolve() 的**对外返回值一字不改** —— 输入非法仍返回 {ok:false, message}，
     无可行解仍返回 {status:'infeasible'}。LPError 只是给新调用方
     （CLI / 单元测试 / 扩展算法）做结构化判断用的通道，
     老的契约由 core/simplex.js 保持，并有 test/algorithm/deep-snapshot.js 逐字节对拍兜底。
   ========================================================================= */
'use strict';

/* ---------------- 结局码 ---------------- */
/* 用字符串常量而不是数字：日志、断言里出现 'E_INFEASIBLE' 一眼就懂 */
var CODES = {
  INVALID_INPUT: 'E_INVALID_INPUT',
  INFEASIBLE: 'E_INFEASIBLE',
  UNBOUNDED: 'E_UNBOUNDED',
  ITERATION_LIMIT: 'E_ITERATION_LIMIT',
  SINGULAR_BASIS: 'E_SINGULAR_BASIS'
};

/* 求解结果里的 status 取值 —— 这是历史契约，改名会破坏所有既有调用方与题库，
   所以这里既定义它，也用它做映射键。 */
var STATUS = {
  OPTIMAL: 'optimal',
  INFEASIBLE: 'infeasible',
  UNBOUNDED: 'unbounded',
  ITERATION_LIMIT: 'iteration-limit'
};

/* status -> { code, message }：message 就是界面/日志里给用户看的那句话。
   文案与重构前完全一致（曾经由 core/simplex.js 与界面各写一份，现在只有这一份）。 */
var STATUS_INFO = {};
STATUS_INFO[STATUS.INFEASIBLE] = {
  code: CODES.INFEASIBLE,
  message: '迭代结束时人工变量仍然留在基中并取正值，说明约束条件之间互相矛盾，' +
    '不存在能同时满足全部约束的非负解。'
};
STATUS_INFO[STATUS.UNBOUNDED] = {
  code: CODES.UNBOUNDED,
  message: '入基变量的列中没有正的系数，它可以在满足约束的前提下无限增大，' +
    '目标函数值也随之无限增大（或减小），因此最优解不存在。'
};
STATUS_INFO[STATUS.ITERATION_LIMIT] = {
  code: CODES.ITERATION_LIMIT,
  message: '可能存在退化导致的循环，请检查题目数据。'
};

/* ---------------- 异常类型 ---------------- */

/**
 * LPError —— 线性规划领域的统一异常。
 * @param {string} code    结局码，取自 CODES
 * @param {string} message 给用户看的中文说明
 * @param {object} [detail] 诊断数据（基、迭代数、触发的约束下标……），供日志与单元测试使用
 * @returns {LPError}      new 出来的异常实例（继承 Error，instanceof 判定可用）
 */
function LPError(code, message, detail) {
  this.name = 'LPError';
  this.code = code;
  this.message = message;
  this.detail = (detail === undefined) ? null : detail;
  if (typeof Error.captureStackTrace === 'function') {
    Error.captureStackTrace(this, LPError);
  } else {
    this.stack = new Error(message).stack;
  }
}
LPError.prototype = Object.create(Error.prototype);
LPError.prototype.constructor = LPError;

/**
 * toString —— 日志里输出 '[E_INFEASIBLE] 约束互相矛盾'。
 * @returns {string}
 */
LPError.prototype.toString = function () {
  return '[' + this.code + '] ' + this.message;
};

/* ---------------- 构造与判断 ---------------- */

/**
 * invalidInput —— 输入非法时的**兼容返回体**。
 * 逐字节复刻重构前的 `{ ok:false, message: invalid.join('；') }`：
 * 分隔符是全角分号，顺序即校验顺序，界面直接把它塞进错误横幅。
 * @param {string[]} messages 各条校验失败的原因
 * @returns {{ok:false, message:string}}
 */
function invalidInput(messages) {
  return { ok: false, message: messages.join('；') };
}

/**
 * isFailure —— 求解结论里哪些 status 代表「没得到最优解」。
 * @param {string} status
 * @returns {boolean}
 */
function isFailure(status) {
  return status !== STATUS.OPTIMAL;
}

/**
 * statusInfo —— 取某个 status 的 code 与中文文案。
 * @param {string} status
 * @returns {{code:string, message:string}|null} 未知 status 返回 null
 */
function statusInfo(status) {
  return STATUS_INFO[status] || null;
}

/**
 * toError —— 把求解结论升级成可抛出的异常（新调用方用；老调用方继续看 status）。
 * @param {string} status  取自 STATUS
 * @param {object} [detail]
 * @returns {LPError|null} optimal 返回 null，其余返回对应异常
 */
function toError(status, detail) {
  var info = statusInfo(status);
  if (!info) return null;
  return new LPError(info.code, info.message, detail);
}

/**
 * throwIfFailed —— 命令式用法：`throwIfFailed(res.status, {…})`。
 * @param {string} status
 * @param {object} [detail]
 * @returns {void} optimal 时什么也不做
 */
function throwIfFailed(status, detail) {
  var e = toError(status, detail);
  if (e) throw e;
}

/**
 * wrapUnknown —— 把内核里「理论上不会发生」的意外（例如 B 不可逆）统一成 LPError，
 * 避免调用方拿到一个裸 Error 还得自己分类。
 * @param {string} code
 * @param {string} message
 * @returns {LPError}
 */
function wrapUnknown(code, message) {
  return new LPError(code, message, null);
}

module.exports = {
  CODES: CODES,
  STATUS: STATUS,
  LPError: LPError,
  invalidInput: invalidInput,
  isFailure: isFailure,
  statusInfo: statusInfo,
  toError: toError,
  throwIfFailed: throwIfFailed,
  wrapUnknown: wrapUnknown
};
