/* 禁运可行性辅助网络：只检查剩余供需，不代替最小元素法与 MODI 优化。 */
'use strict';
var common = require('./transport-model.js');
function completion(model, supply, demand, allowed) {
  var m = model.rows, n = model.cols, sink = m + n + 1, source = m + n;
  var graph = [], i, j, head, queue, previous, edges, node, e, theta;
  for (i = 0; i <= sink; i++) graph[i] = [];
  function add(a, b, cap) {
    var forward = { to: b, cap: cap, reverse: graph[b].length };
    graph[a].push(forward); graph[b].push({ to: a, cap: 0, reverse: graph[a].length - 1 });
    return forward;
  }
  var from = [], to = [];
  for (i = 0; i < m; i++) from[i] = add(source, i, supply[i]);
  var capacity = Math.max(common.sum(supply), common.sum(demand));
  for (i = 0; i < m; i++) for (j = 0; j < n; j++) if (allowed[i][j]) add(i, m + j, capacity);
  for (j = 0; j < n; j++) to[j] = add(m + j, sink, demand[j]);
  while (true) {
    queue = [source]; previous = []; edges = []; previous[source] = source; head = 0;
    while (head < queue.length && previous[sink] === undefined) {
      node = queue[head++];
      for (i = 0; i < graph[node].length; i++) {
        e = graph[node][i];
        if (e.cap > 0 && previous[e.to] === undefined) {
          previous[e.to] = node; edges[e.to] = e; queue.push(e.to);
        }
      }
    }
    if (previous[sink] === undefined) break;
    theta = Infinity;
    for (node = sink; node !== source; node = previous[node]) theta = Math.min(theta, edges[node].cap);
    for (node = sink; node !== source; node = previous[node]) {
      e = edges[node]; e.cap -= theta; graph[node][e.reverse].cap += theta;
    }
  }
  var remainingSupply = from.map(function (edge) { return edge.cap; });
  var remainingDemand = to.map(function (edge) { return edge.cap; });
  /* 局部相对界保留真正微小但完全不可达的供需，避免被其他行的大数吞掉。 */
  var feasible = remainingSupply.every(function (v, k) { return v <= supply[k] * common.ROUND_EPS * (m + n); })
    && remainingDemand.every(function (v, k) { return v <= demand[k] * common.ROUND_EPS * (m + n); });
  var cutRows = [], cutCols = [];
  for (i = 0; i < m; i++) if (previous[i] !== undefined) cutRows.push(i);
  for (j = 0; j < n; j++) if (previous[m + j] !== undefined) cutCols.push(j);
  return { feasible: feasible, deficit: Math.max(common.sum(remainingSupply), common.sum(remainingDemand)),
    remainingSupply: remainingSupply, remainingDemand: remainingDemand, cutRows: cutRows, cutCols: cutCols,
    cutSupply: common.sum(cutRows.map(function (k) { return supply[k]; })),
    cutDemand: common.sum(cutCols.map(function (k) { return demand[k]; })) };
}
module.exports = { completion: completion };
