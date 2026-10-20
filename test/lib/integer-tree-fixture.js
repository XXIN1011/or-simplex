'use strict';
// 纯布局夹具：300 个已处理分枝 + 301 个待展开结点，明确不是一次真实求解。
module.exports = function largeTree(base) {
  var m = {key:'bnb', name:'分枝定界法', applicable:true, sense:'max', complete:false,
    truncated:true, maxNodes:300, best:null, bestZ:null, bestNode:null, nodes:[], openLeft:[]};
  var bounds = [];
  for (var i = 1; i <= 300; i++) {
    m.nodes.push({id:i, parent:i === 1 ? null : i - 1, depth:i - 1,
      bounds:bounds.slice(), children:[i + 1, 1000 + i], action:'branch', actionName:'分枝',
      note:'仅用于布局测试，复用真实松弛快照。', res:base.res, solution:base.solution,
      objective:base.objective});
    bounds.push({j:0,rel:'<=',val:300 - i});
    m.openLeft.push(1000 + i);
  }
  m.openLeft.push(301);
  return m;
};
