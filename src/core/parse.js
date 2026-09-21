/* =========================================================================
   输入解析模块 —— 校验用户输入，并转换成标准型
   -------------------------------------------------------------------------
   两件事，分开成两个函数，因为它们的使用者不同：

     validate(problem)       纯校验：能不能算？
                             返回 { ok:true, direction, swapped, c0, n, m } 或
                                  { ok:false, message: '…；…' }（原样交给界面横幅）
     toStandardForm(problem) 校验 + 规范化 + 建表，得到标准型（数据）
                             = 原 simplexSolve 的第 1~5 步，逐行照搬

   规范化的全部规则（与教材一致）：
     ① 右端项为负 → 整行取负并翻转关系符（≤ ↔ ≥，= 不变），记 flipSign = −1
     ② ≤ 约束补松弛变量 s_i；≥ 约束补 s_i 且 s_i 取 −1 并补人工变量 a_i；
        = 约束直接补 a_i
     ③ min 问题整体取负转成 max（swapped = true），原始系数 c0 原样留着，
        因为算影子价格必须用原系数（用取负后的 c 会让每个 y 都反号）
     ④ 目标函数里人工变量罚 −M（以 pair 形式记账），松弛/剩余变量系数为 0

   ★ 数学等价性：下面的循环体与重构前 core/simplex-core.js 的对应段落逐字符相同，
     只是把 vars.push({name,kind}) 换成了 model.createVariable(name, kind)。
   ========================================================================= */
'use strict';

var EPS = require('./util.js').EPS;
var pSub = require('./util.js').pSub;
var pMul = require('./util.js').pMul;
var model = require('./model.js');
var errors = require('./errors.js');

/**
 * validate —— 校验输入能否求解。
 * 允许 0 个变量、0 个约束（都有确定结论，见 core/simplex.js）。
 * @param {object} problem { direction, c, constraints }
 * @returns {{ok:true, direction:string, swapped:boolean, c0:number[], n:number, m:number}
 *          |{ok:false, message:string}}
 *          message 用全角分号连接各条原因，顺序即校验顺序（界面直接显示这段文字）
 */
function validate(problem) {
  var direction = problem.direction === 'min' ? 'min' : 'max';
  var swapped = direction === 'min';            // min z  ->  max w = -z
  var c0 = problem.c.map(Number);
  var n = c0.length;
  var m = problem.constraints.length;

  /* 允许 0 个变量或 0 个约束：
     - 0 个约束 = 无约束问题：存在正检验数则无界，否则最优解取 0；
     - 0 个变量 = 目标函数不含变量，目标值恒为 0。
     两种情况都能给出确定结论，因此不再硬性拦截。 */
  var invalid = [];
  for (var q = 0; q < m; q++) {
    var kk = problem.constraints[q];
    if (kk.coef.length !== n) invalid.push('第 ' + (q + 1) + ' 个约束的系数个数与变量数不一致');
    if (!isFinite(Number(kk.rhs))) invalid.push('第 ' + (q + 1) + ' 个约束的右端项不是有效数字');
  }
  for (var q2 = 0; q2 < n; q2++) {
    if (!isFinite(c0[q2])) invalid.push('目标函数第 ' + (q2 + 1) + ' 个系数不是有效数字');
  }
  if (invalid.length) return errors.invalidInput(invalid);

  return { ok: true, direction: direction, swapped: swapped, c0: c0, n: n, m: m };
}

/**
 * toStandardForm —— 校验 + 规范化 + 建初始表，返回标准型数据。
 * @param {object} problem { direction, c, constraints }
 * @returns {{ok:true, form:object}|{ok:false, message:string}} 校验失败时原样透传错误体
 */
function toStandardForm(problem) {
  var v = validate(problem);
  if (!v.ok) return v;

  var direction = v.direction, swapped = v.swapped, c0 = v.c0, n = v.n, m = v.m;

  /* ---- 1. 规范化：右端项一律化成非负（整行取负并翻转关系符） ----
     顺便记下哪些约束被取负过：内部 b = flipSign · 用户 b。后面算影子价格和
     b 的允许区间都要乘回去，否则「-x1 ≤ -2」这类约束的方向会反。 */
  var cons = problem.constraints.map(function (k) {
    return model.createConstraint(k.coef.map(Number), k.rel, Number(k.rhs));
  });
  var flipSign = [];
  for (var i = 0; i < m; i++) {
    flipSign[i] = 1;
    if (cons[i].rhs < -EPS) {
      cons[i].coef = cons[i].coef.map(function (v2) { return -v2; });
      cons[i].rhs = -cons[i].rhs;
      cons[i].rel = cons[i].rel === '<=' ? '>=' : (cons[i].rel === '>=' ? '<=' : '=');
      flipSign[i] = -1;
    }
    for (var j = 0; j < n; j++) {
      if (Math.abs(cons[i].coef[j]) < EPS) cons[i].coef[j] = 0;
    }
    if (Math.abs(cons[i].rhs) < EPS) cons[i].rhs = 0;
  }

  /* ---- 2. 建变量表：决策变量 x1..xn，松弛/剩余 s_i，人工 a_i ---- */
  var vars = [];
  for (var jx = 0; jx < n; jx++) vars.push(model.createVariable('x' + (jx + 1), 'x'));
  var sCol = [], aCol = [], basis = [];
  for (var i2 = 0; i2 < m; i2++) {
    var k2 = cons[i2];
    if (k2.rel === '<=') {
      sCol[i2] = vars.length; vars.push(model.createVariable('s' + (i2 + 1), 's'));
      basis[i2] = sCol[i2];
    } else if (k2.rel === '>=') {
      sCol[i2] = vars.length; vars.push(model.createVariable('s' + (i2 + 1), 's'));
      aCol[i2] = vars.length; vars.push(model.createVariable('a' + (i2 + 1), 'a'));
      basis[i2] = aCol[i2];
    } else {
      aCol[i2] = vars.length; vars.push(model.createVariable('a' + (i2 + 1), 'a'));
      basis[i2] = aCol[i2];
    }
  }
  var N = vars.length;

  /* ---- 3. 目标函数系数（统一按 max 处理；人工变量罚 -M） ---- */
  var cObj = [];
  for (var jc = 0; jc < N; jc++) cObj.push({ a: 0, b: 0 });
  for (var jd = 0; jd < n; jd++) cObj[jd] = { a: swapped ? -c0[jd] : c0[jd], b: 0 };
  for (var ia = 0; ia < m; ia++) {
    if (aCol[ia] !== undefined) cObj[aCol[ia]] = { a: 0, b: -1 };   // -M
  }

  /* ---- 4. 初始单纯形表 ---- */
  var rows = [];
  var A0 = [];      // 标准化后的约束系数矩阵（不含右端项），事后用于求对偶解
  for (var ir = 0; ir < m; ir++) {
    var r = new Array(N + 1).fill(0);
    for (var jr = 0; jr < n; jr++) r[jr] = cons[ir].coef[jr];
    if (sCol[ir] !== undefined) r[sCol[ir]] = (cons[ir].rel === '>=' ? -1 : 1);
    if (aCol[ir] !== undefined) r[aCol[ir]] = 1;
    r[N] = cons[ir].rhs;
    rows.push(r);
    A0.push(r.slice(0, N));
  }

  /* ---- 5. 检验数行：σ_j = c_j - z_j ，末位存 -z ---- */
  var obj = [];
  for (var jo = 0; jo < N; jo++) obj.push({ a: cObj[jo].a, b: cObj[jo].b });
  obj.push({ a: 0, b: 0 });
  for (var ib = 0; ib < m; ib++) {
    var cB = cObj[basis[ib]];
    for (var jb = 0; jb <= N; jb++) obj[jb] = pSub(obj[jb], pMul(cB, rows[ib][jb]));
  }

  return {
    ok: true,
    form: model.createStandardForm({
      direction: direction, swapped: swapped, c0: c0, n: n, m: m, N: N,
      vars: vars, basis: basis, cObj: cObj, rows: rows, A0: A0, obj: obj,
      flipSign: flipSign,
      consRhs: cons.map(function (k) { return k.rhs; }),
      userRhs: problem.constraints.map(function (k) { return Number(k.rhs); })
    })
  };
}

/**
 * parseProblem —— 对外公开的解析入口（校验 + 规范化一次完成）。
 * @param {object} problem
 * @returns {{ok:true, form:object}|{ok:false, message:string}}
 */
function parseProblem(problem) {
  return toStandardForm(problem);
}

module.exports = {
  validate: validate,
  toStandardForm: toStandardForm,
  parseProblem: parseProblem
};
