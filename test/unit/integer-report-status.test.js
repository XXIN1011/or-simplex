'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
// 测试内部纯渲染入口，不向正式页面增加 API。
const filename = path.resolve(__dirname, '../../src/web/integer-report.js');
const report = new Module(filename, module);
report.filename = filename;
report.paths = module.paths;
report._compile(fs.readFileSync(filename, 'utf8') + '\nmodule.exports = {viewBnb:viewBnb,viewGraph:viewGraph,chipOf:chipOf};', filename);
const core = require('../../src/core/integer.js');
const prob = require('../../src/web/examples.js').integer();
function limited(nodes) { return core.ipSolve(prob, {maxNodes:nodes, maxCuts:1}); }
test('未完成分枝且无候选解时不能声称无可行整数解', () => {
  const r = limited(1), bnb = r.methods.find(m => m.key === 'bnb');
  assert.equal(bnb.complete, false);
  assert.equal(bnb.best, null);
  const html = report.exports.viewBnb(prob, r, bnb);
  assert.match(html, /搜索未完成，不能判定/);
  assert.doesNotMatch(html, /vtitle">无可行整数解/);
});
test('未完成分枝的候选解在分枝与图解中均标记未确认最优', () => {
  // 使用真实限额输出寻找已找到候选、但栈尚未耗尽的状态。
  let r, bnb;
  for (let n = 2; n <= 20; n++) {
    const candidate = limited(n), b = candidate.methods.find(m => m.key === 'bnb');
    if (!b.complete && b.best) { r = candidate; bnb = b; break; }
  }
  assert.ok(bnb, '固定题应包含尚未完成的候选状态');
  assert.match(report.exports.viewBnb(prob, r, bnb), /当前整数解，未确认最优/);
  assert.doesNotMatch(report.exports.viewBnb(prob, r, bnb), /vtitle">最优整数解/);
  assert.match(report.exports.viewGraph(prob, r, r.methods[0]), /当前整数解，未确认最优/);
  assert.match(report.exports.chipOf(prob, r, r.methods[0]), /^当前 z/);
  const full = core.ipSolve(prob);
  r.methods = r.methods.map(m => m.key === 'cut' ? full.methods.find(f => f.key === 'cut') : m);
  assert.match(report.exports.viewGraph(prob, r, r.methods[0]), /当前整数解，未确认最优/,
    '另一个方法完成不能把正在展示的未完成分枝候选标成最优');
});
