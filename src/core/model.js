/* =========================================================================
   数据模型层 —— 只承载数据，不含算法、不含 IO
   -------------------------------------------------------------------------
   四个「结构体」，以及它们的构造器：

     LPProblem      用户输入的问题          { direction, c, constraints[] }
     StandardForm   规范化后的标准型        { …, vars, basis, cObj, rows, A0, obj }
     StepSnapshot   一次迭代/一张单纯形表   { iter, rows, obj, basis, entering, leaving, … }
     SolveResult    调用方拿到的最终结果     { ok, status, solution, objective, dual, sensitivity, … }

   为什么单开一层（而不是让求解器随手拼对象）：
     ① 界面、CLI、单元测试、以及后续的扩展算法（对偶单纯形 / 两阶段法）
        看到的是同一份字段定义，字段含义只有一处说明。
     ② 字段的**插入顺序**在这里被固定。结果对象会被 JSON.stringify 序列化
        （题库对拍就是逐字节比的），顺序变了哈希就变了 —— 所以构造器必须唯一。
     ③ 本层不 import util / format，是依赖图里最底层；改数据结构不会牵动算法。

   ★ 兼容性：SolveResult 的字段与顺序与重构前完全一致，包括
     ok / status / direction / swapped / vars / nDecision / mConstraints / steps /
     basis / solution / objective / dual / sensitivity / artificialInBasis / altOptimal。
   ========================================================================= */
'use strict';

/**
 * createConstraint —— 一条约束的数据结构。
 * @param {number[]} coef 各决策变量的系数
 * @param {'<='|'>='|'='} rel 关系符
 * @param {number} rhs 右端项
 * @returns {{coef:number[], rel:string, rhs:number}}
 */
function createConstraint(coef, rel, rhs) {
  return { coef: coef, rel: rel, rhs: rhs };
}

/**
 * createLPProblem —— 用户输入的问题（进入校验/规范化之前）。
 * @param {'max'|'min'} direction 优化方向
 * @param {number[]} c 目标函数系数
 * @param {Array<{coef:number[],rel:string,rhs:number}>} constraints 约束表
 * @returns {{direction:string, c:number[], constraints:object[]}}
 */
function createLPProblem(direction, c, constraints) {
  return { direction: direction, c: c, constraints: constraints };
}

/**
 * createVariable —— 变量表里的一项。
 * @param {string} name 显示名（x1 / s2 / a3）
 * @param {'x'|'s'|'a'} kind 决策变量 / 松弛(剩余)变量 / 人工变量
 * @returns {{name:string, kind:string}}
 */
function createVariable(name, kind) {
  return { name: name, kind: kind };
}

/**
 * createRatio —— 比值检验中的一行结果。
 * @param {number} row 行号（0 起）
 * @param {number|null} theta θ 值；该行系数 ≤ 0 时无法参与比值，填 null
 * @param {boolean} ok 该行是否参与比值（ok=false 时 theta 必为 null）
 * @returns {{row:number, theta:number|null, ok:boolean}}
 */
function createRatio(row, theta, ok) {
  return { row: row, theta: theta, ok: ok };
}

/**
 * createStandardForm —— 规范化后的标准型：承载「建模结果 + 初始表 + 可变状态」。
 * 求解内核只读这份数据，不再碰用户输入。
 * @param {object} f 各字段
 * @param {string} f.direction 原方向 'max' | 'min'
 * @param {boolean} f.swapped 是否做过 min→max 取负（内部按 max 求解）
 * @param {number[]} f.c0 原始目标系数（用于对偶解：必须用原系数，不能用取负后的）
 * @param {number} f.n 决策变量个数
 * @param {number} f.m 约束个数
 * @param {number} f.N 变量总数（决策 + 松弛/剩余 + 人工）
 * @param {object[]} f.vars 变量表
 * @param {number[]} f.basis 当前基（变量列下标，逐行）
 * @param {object[]} f.cObj 目标函数系数，pair 形式（人工变量为 −M）
 * @param {number[][]} f.rows 当前单纯形表（每行末尾是右端项）
 * @param {number[][]} f.A0 标准化后的约束系数矩阵（不含右端项，求对偶解用）
 * @param {object[]} f.obj 检验数行 σ（末位存 −z），pair 形式
 * @param {number[]} f.flipSign 标准化时该行是否被整行取负（±1），换算影价/区间要用
 * @param {number[]} f.consRhs 内部右端项（已规范化）
 * @param {number[]} f.userRhs 用户输入的右端项（换算回用户量纲用）
 * @returns {object} 标准型
 */
function createStandardForm(f) {
  return {
    direction: f.direction,
    swapped: f.swapped,
    c0: f.c0,
    n: f.n,
    m: f.m,
    N: f.N,
    vars: f.vars,
    basis: f.basis,
    cObj: f.cObj,
    rows: f.rows,
    A0: f.A0,
    obj: f.obj,
    flipSign: f.flipSign,
    consRhs: f.consRhs,
    userRhs: f.userRhs
  };
}

/**
 * createSnapshot —— 给当前状态拍一张快照（深拷贝数值，供界面逐张渲染）。
 * 快照一经生成就与状态解耦：后续的枢轴变换不会改到已记录的表。
 * @param {object} form 标准型（读 vars/basis/rows/obj/m/N）
 * @param {object} extra 本次快照要标注的判定信息
 *   （iter / entering / leaving / pivot / ratios / degenerate / note）
 * @returns {object} StepSnapshot，字段顺序：iter, rows, obj, basis, entering, leaving,
 *                   pivot, ratios, degenerate, note（extra 里新增的键按传入顺序追加）
 */
function createSnapshot(form, extra) {
  var s = {
    iter: 0, rows: [], obj: [], basis: form.basis.slice(),
    entering: null, leaving: null, pivot: null, ratios: null,
    degenerate: false, note: ''
  };
  for (var x in extra) s[x] = extra[x];
  for (var i = 0; i < form.m; i++) s.rows.push(form.rows[i].slice());
  for (var j = 0; j <= form.N; j++) s.obj.push({ a: form.obj[j].a, b: form.obj[j].b });
  return s;
}

/**
 * createSensitivityReport —— 灵敏度分析的报告结构。
 * @param {object[]} c 目标系数 c 的允许变化范围（逐变量）
 * @param {object[]} b 右端项 b 的允许变化范围（逐约束）
 * @param {boolean} degenerate 最优基里是否残留取值为 0 的人工变量
 * @returns {{c:object[], b:object[], degenerate:boolean}}
 */
function createSensitivityReport(c, b, degenerate) {
  return { c: c, b: b, degenerate: degenerate };
}

/**
 * createSolveResult —— 最终结果（对外契约，字段顺序不可改动）。
 * @param {object} f 各字段，含义见 core/simplex.js 的 readOut/dualAndSensitivity
 * @returns {object} SolveResult
 */
function createSolveResult(f) {
  return {
    ok: true,
    status: f.status,
    direction: f.direction,
    swapped: f.swapped,
    vars: f.vars,
    nDecision: f.nDecision,
    mConstraints: f.mConstraints,
    steps: f.steps,
    basis: f.basis,
    solution: f.solution,
    objective: f.objective,
    dual: f.dual,
    sensitivity: f.sensitivity,
    artificialInBasis: f.artificialInBasis,
    altOptimal: f.altOptimal
  };
}

/**
 * createAssignProblem —— 指派问题的用户输入（进入校验之前）。
 * @param {'min'|'max'} direction 优化方向
 * @param {Array<Array<number|null>>} cost 系数矩阵（行 = 人员，列 = 工作；null 表示禁止指派）
 * @returns {{direction:string, cost:Array<Array<number|null>>}}
 */
function createAssignProblem(direction, cost) {
  return { direction: direction, cost: cost };
}

/**
 * createAssignStep —— 指派问题的一步迭代（一张矩阵快照）。
 * 与单纯形法的 createSnapshot 同一个角色：一经生成就与后续计算解耦。
 * @param {object} f 各字段
 * @param {number}    f.round   第几轮（行/列归约算第 1 轮的两步）
 * @param {string}    f.phase   row / col / try / cover / adjust
 * @param {string}    f.label   教材步骤编号 + 名称，如 '③ 试指派'
 * @param {string}    f.title   这一步做了什么
 * @param {number[][]} f.matrix 该步之后的矩阵（数字，或 null 表示禁止指派）
 * @param {Array<Array<string|null>>} [f.marks]  逐格标记：'circ' 圈定的 0 / 'cross' 被划掉的 0
 * @param {{rows:boolean[],cols:boolean[]}} [f.lines] 覆盖线（true = 该行/列被一条线盖住）
 * @param {number|null} [f.theta]  调整量
 * @param {number[]|null} [f.amounts] 行归约的行最小值 / 列归约的列最小值
 * @param {number[][]|null} [f.matching] 当前试指派得到的配对 [ [row,col], … ]
 * @param {string[]} [f.details] 逐条讲解（界面逐行渲染）
 * @param {string}  [f.note]    一句话结论
 * @param {boolean} [f.done]    该步之后是否已得到完整指派
 * @returns {object} AssignStep（字段插入顺序固定：题库逐字节对拍要用）
 */
function createAssignStep(f) {
  return {
    round: f.round,
    phase: f.phase,
    label: f.label,
    title: f.title,
    matrix: f.matrix.map(function (row) { return row.slice(); }),
    marks: f.marks || null,
    lines: f.lines || null,
    theta: f.theta === undefined ? null : f.theta,
    amounts: f.amounts || null,
    matching: f.matching || null,
    details: f.details || [],
    note: f.note || '',
    done: !!f.done
  };
}

/**
 * createAssignResult —— 指派问题的最终结果（对外契约，字段顺序不可改动）。
 * @param {object} f 各字段，含义见 core/assignment.js 的 assignSolve
 * @returns {object} AssignResult
 */
function createAssignResult(f) {
  return {
    ok: f.ok,
    status: f.status,
    direction: f.direction,
    message: f.message || '',
    m: f.m,
    n: f.n,
    N: f.N,
    empty: f.empty,
    hasVirtual: f.hasVirtual,
    virtualRows: f.virtualRows,
    virtualCols: f.virtualCols,
    original: f.original,
    padded: f.padded,
    working: f.working,
    M: f.M,
    steps: f.steps,
    roundCount: f.roundCount,
    stallRounds: f.stallRounds === undefined ? 0 : f.stallRounds,
    assignment: f.assignment,
    pairs: f.pairs,
    objective: f.objective,
    zMin: f.zMin,
    rowLabels: f.rowLabels,
    colLabels: f.colLabels
  };
}

module.exports = {
  createConstraint: createConstraint,
  createLPProblem: createLPProblem,
  createVariable: createVariable,
  createRatio: createRatio,
  createStandardForm: createStandardForm,
  createSnapshot: createSnapshot,
  createSensitivityReport: createSensitivityReport,
  createSolveResult: createSolveResult,
  createAssignProblem: createAssignProblem,
  createAssignStep: createAssignStep,
  createAssignResult: createAssignResult
};
