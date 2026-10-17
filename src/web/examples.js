'use strict';

/* 每次返回一份新数据，编辑示例不会污染其他模块或下一次载入。 */
function linear() {
  return {direction:'max', c:[2,3], constraints:[
    {coef:[1,2],rel:'<=',rhs:8}, {coef:[4,0],rel:'<=',rhs:16}, {coef:[0,4],rel:'<=',rhs:12}
  ]};
}
function integer() {
  return {direction:'max', c:[3,2], constraints:[
    {coef:[2,3],rel:'<=',rhs:14}, {coef:[2,1],rel:'<=',rhs:9}
  ],vtypes:['int','int']};
}
function assignment() {
  return {direction:'min',cost:[[2,15,13,4],[10,4,14,15],[9,14,16,13],[7,8,11,9]]};
}
function transport() {
  return { direction: 'min', cost: [[6,16,5,2],[9,2,5,8],[15,13,11,6]],
    supply: [20,30,25], demand: [10,25,20,20] };
}
function transportForbidden() {
  return { direction: 'min', cost: [[1,2],[3,'X']], supply: [5,5], demand: [5,5] };
}
module.exports = { linear: linear, integer: integer, assignment: assignment,
  transport: transport, transportForbidden: transportForbidden };
