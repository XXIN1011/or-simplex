/* =========================================================================
   库的统一出口（package.json 的 "main"）
   -------------------------------------------------------------------------
   两种用法：

     const or = require('or-simplex');            // 一站式
     or.solve(problem);

     const { simplexSolve } = require('or-simplex/src/core/simplex.js');   // 只要内核

   分层导出的意义：调用方**只依赖自己需要的那一层**。
   比如写个批量求解脚本只需要 core/simplex.js；渲染界面只需要 core/format.js。
   ========================================================================= */
'use strict';

var errors = require('./core/errors.js');
var util = require('./core/util.js');
var model = require('./core/model.js');
var parse = require('./core/parse.js');
var format = require('./core/format.js');
var simplex = require('./core/simplex.js');
var sensitivity = require('./core/sensitivity.js');
var scenario = require('./core/scenario.js');
var integer = require('./core/integer.js');

module.exports = {
  /* ---- 主入口 ---- */
  /** 求解线性规划（max/min、≤/≥/=、任意右端项；允许 0 变量 / 0 约束） */
  solve: simplex.simplexSolve,
  simplexSolve: simplex.simplexSolve,
  /** 在已建好的标准型上迭代（扩展算法用） */
  solveStandardForm: simplex.solveStandardForm,
  /** 场景式灵敏度分析：改 c / 改 a_ij / 改 b / 加约束 / 加变量 */
  analyzeScenario: scenario.sensAnalyze,
  /** 参数线性规划：c、b 随 λ 变化时的分段最优基 */
  analyzeParametric: scenario.sensParam,
  /** 整数规划：分枝定界 / 割平面 / 隐枚举 / 图解的适用性与过程 */
  solveInteger: integer.ipSolve,

  /* ---- 各层（按需取用） ---- */
  errors: errors,
  util: util,
  model: model,
  parse: parse,
  format: format,
  simplex: simplex,
  sensitivity: sensitivity,
  scenario: scenario,
  integer: integer
};
