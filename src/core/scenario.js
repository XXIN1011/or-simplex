/* 场景/参数分析的稳定公开入口；底层表运算、条件变更、参数行走分别维护。 */
'use strict';
var fmtAff = require('./format.js').fmtAff;
var simplexSolve = require('./simplex.js').simplexSolve;
var shared = require('./scenario-tableau.js');
var sensBuildModel = shared.sensBuildModel;
var sensTableau = shared.sensTableau;
var sensIterate = shared.sensIterate;
var sensReadOut = shared.sensReadOut;
var sensBasisNames = shared.sensBasisNames;
var sensChangeC = require('./scenario-changes.js').sensChangeC;
var sensChangeB = require('./scenario-changes.js').sensChangeB;
var sensChangeA = require('./scenario-changes.js').sensChangeA;
var sensAddConstraint = require('./scenario-changes.js').sensAddConstraint;
var sensAddVar = require('./scenario-changes.js').sensAddVar;
var sensParam = require('./scenario-param.js').sensParam;
function sensAnalyze(baseProblem, scenario) {
  var base = simplexSolve(baseProblem);
  if (base.status !== 'optimal' || base.sensitivity === null) {
    return { ok: false, message: '基准问题没有最优解，无法做灵敏度分析。' };
  }
  if (!scenario || !scenario.type) return { ok: false, message: '请选择要分析的变化类型。' };
  var r;
  if (scenario.type === 'c') r = sensChangeC(baseProblem, scenario);
  else if (scenario.type === 'a') r = sensChangeA(baseProblem, scenario);
  else if (scenario.type === 'b') r = sensChangeB(baseProblem, scenario);
  else if (scenario.type === 'add-con') r = sensAddConstraint(baseProblem, scenario);
  else if (scenario.type === 'add-var') r = sensAddVar(baseProblem, scenario);
  else return { ok: false, message: '未知的分析类型。' };
  if (r && r.ok) r.base = { solution: base.solution, objective: base.objective,
                            basisNames: sensBasisNames(base), dual: base.dual };
  return r;
}

module.exports = {
  sensAnalyze: sensAnalyze,
  sensParam: sensParam,
  sensBuildModel: sensBuildModel,
  sensTableau: sensTableau,
  sensIterate: sensIterate,
  sensReadOut: sensReadOut,
  fmtAff: fmtAff
};
