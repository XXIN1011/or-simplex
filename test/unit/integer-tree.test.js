'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const tree = require('../../src/web/integer-tree');
const core = require('../../src/core/integer');
const example = require('../../src/web/examples').integer;
const largeTree = require('../lib/integer-tree-fixture');
const rootProblem = {direction:'max',c:[1],constraints:[{coef:[1],rel:'<=',rhs:2}],vtypes:['int']};
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze); return Object.freeze(value);
}
function bestItems(m) { return tree.model(m).items.filter(n => n.text && n.text.best); }

test('真实根结点已为整数解：一个结点、一次访问、唯一最好标记', () => {
  const m = core.ipBranchBound(rootProblem), html = tree.render(freeze(m));
  assert.equal(tree.model(m).items.length, 1);
  assert.equal(bestItems(m)[0].id, 1);
  assert.match(html, /第 1 个访问 · 根结点/);
  assert.match(html, /最终最好结点/);
  assert.match(html, /松弛上界 z = 2/);
  assert.doesNotMatch(html, /<path|data-study-step/);
});

test('真实多层树用 children 保留左右顺序，以 nodes 位置生成访问序号', () => {
  const m = core.ipBranchBound(example()), before = JSON.stringify(m);
  const model = tree.model(freeze(m)), root = model.roots[0];
  assert.deepEqual(root.children.map(n => n.id), [3,2]);
  assert.ok(root.children[0].x < root.children[1].x);
  assert.equal(model.items.find(n => n.id === 3).visit, 2);
  assert.equal(model.items.find(n => n.id === 2).visit, 5);
  assert.ok(model.items.some(n => n.level >= 2));
  assert.equal(root.children[0].edge, '左支 · x₂ ≤ 2');
  assert.equal(root.children[1].edge, '右支 · x₂ ≥ 3');
  tree.render(m); assert.equal(JSON.stringify(m), before);
});

test('历史两次 incumbent 只有 bestNode 得到最终标记，不复制最后 bestZ', () => {
  const m = core.ipBranchBound(example()), items = tree.model(m).items;
  assert.equal(m.nodes.filter(n => n.action === 'incumbent').length, 2);
  assert.equal(bestItems(m).length, 1); assert.equal(bestItems(m)[0].id, m.bestNode);
  assert.match(items.find(n => n.id === 5).text.bound, /z = 13$/);
  assert.match(items.find(n => n.id === 4).text.bound, /z = 14$/);
  assert.equal(items.find(n => n.id === 5).text.best, false);
});

test('真实无可行剪枝与界限剪枝使用正常搜索语义', () => {
  const p = {direction:'max',c:[1],constraints:[{coef:[1],rel:'=',rhs:0.5}],vtypes:['int']};
  const m = core.ipBranchBound(p), html = tree.render(m);
  assert.equal(m.nodes.filter(n => n.res.status === 'infeasible').length, 2);
  assert.match(html, /剪枝（无可行解）/);
  assert.match(tree.render(core.ipBranchBound(example())), /剪枝（界限不优）/);
  assert.doesNotMatch(html, /class="[^"]*(?:err|no)\b/);
});

test('真实最小化松弛是下界', () => {
  const p = {direction:'min',c:[1],constraints:[{coef:[1],rel:'>=',rhs:1.5}],vtypes:['int']};
  const html = tree.render(core.ipBranchBound(p));
  assert.match(html, /松弛下界 z = 3\/2/); assert.doesNotMatch(html, /松弛上界/);
});

test('真实截断搜索含当前整数解：不能标记最优', () => {
  const m = core.ipBranchBound(example(), {maxNodes:3}), html = tree.render(m);
  assert.equal(m.complete, false); assert.ok(m.best);
  assert.match(html, /当前最好整数解，未确认最优/);
  assert.equal(bestItems(m)[0].id, m.bestNode);
  assert.match(html, /当前最好结点/); assert.doesNotMatch(html, /最终最好结点|最优整数解/);
});

test('真实截断且无整数解：openLeft 占位无访问序号、松弛值和剪枝原因', () => {
  const m = core.ipBranchBound(example(), {maxNodes:1}), model = tree.model(m), html = tree.render(m);
  assert.equal(m.best, null);
  assert.equal(model.items.length, 3);
  model.items.filter(n => !n.data).forEach(n => {
    assert.equal(n.visit, undefined); assert.equal(n.text, undefined); assert.ok(n.parent);
    assert.match(n.edge, /条件未记录/);
  });
  assert.match(html, /尚未找到整数解，不能判定无可行整数解/);
  assert.equal((html.match(/class="ip-tree-bound"/g) || []).length, 1);
  assert.equal((html.match(/第 \d+ 个访问 ·/g) || []).length, 1);
});

test('未展开关联不明时保留编号列表，不伪造连线；异常关联不循环', () => {
  const m = core.ipBranchBound(example(), {maxNodes:1});
  m.openLeft.push(999); m.nodes[0].children.push(1);
  const model = tree.model(m);
  assert.deepEqual(model.unattached, [999]);
  assert.equal(model.items.length, 3);
  assert.match(tree.render(m), /无法可靠关联父结点的未展开编号：999/);
});

test('缺失或不一致的新增 bounds 不猜分枝条件，并转义编号与说明', () => {
  const m = core.ipBranchBound(example());
  m.nodes[1].bounds = [{j:0,rel:'bad',val:3}];
  assert.match(tree.model(m).items.find(n => n.id === 3).edge, /条件未记录/);
  m.openLeft.push('<img src=x onerror=1>');
  const html = tree.render(m);
  assert.match(html, /&lt;img src=x onerror=1&gt;/); assert.doesNotMatch(html, /<img/);
});

test('不适用、空快照与未知状态使用保守表述', () => {
  const m = core.ipBranchBound({...rootProblem, vtypes:['cont']});
  assert.equal(m.applicable, false); assert.match(tree.render(m), /不适用/);
  assert.doesNotMatch(tree.render(m), /data-integer-tree-node/);
  assert.match(tree.render({applicable:true, complete:false}), /没有可展示的已处理结点/);
  const abnormal = core.ipBranchBound(rootProblem);
  abnormal.nodes[0].res.status = 'iteration-limit'; abnormal.nodes[0].action = 'prune';
  assert.match(tree.render(abnormal), /松弛未收敛/);
  assert.match(tree.render(abnormal), /剪枝（原因未确认）/);
  abnormal.nodes[0].res.status = 'unexpected';
  assert.match(tree.render(abnormal), /松弛状态未确认/);
  assert.doesNotMatch(tree.render(abnormal), /松弛无界|剪枝（无可行解）/);
});

test('300 个已处理结点外的 301 个占位全部参与布局，同行结点不重叠', () => {
  const m = largeTree(core.ipBranchBound(rootProblem).nodes[0]), before = JSON.stringify(m);
  const model = tree.model(freeze(m)), html = tree.render(m);
  assert.equal(model.items.length, 601); assert.equal(model.unattached.length, 0);
  assert.equal((html.match(/data-integer-tree-node=/g) || []).length, 601);
  assert.ok(model.height > 50000); assert.ok(model.width > 60000);
  const levels = new Map();
  model.items.forEach(n => { if (!levels.has(n.y)) levels.set(n.y, []); levels.get(n.y).push(n.x); });
  levels.forEach(xs => xs.sort((a,b) => a-b).forEach((x,i) => { if (i) assert.ok(x - xs[i-1] >= 208); }));
  assert.equal(JSON.stringify(m), before);
});

test('语义缩放逐档展开数据、扩大布局，始终保留身份、顺序与最好结点', () => {
  const m = freeze(core.ipBranchBound(example())), before = JSON.stringify(m);
  const widths = [];
  for (const [zoom,mode] of [[40,'structure'],[50,'structure'],[60,'structure'],[75,'summary'],[100,'detail'],[125,'detail'],[200,'detail']]) {
    const layout = tree.model(m,zoom);
    assert.equal(layout.view.mode,mode);
    assert.equal(layout.view.zoom,zoom);
    assert.deepEqual(layout.roots[0].children.map(n=>n.id),[3,2]);
    assert.equal(layout.items.find(n=>n.id===2).visit,5);
    assert.equal(layout.items.filter(n=>n.text && n.text.best)[0].id,m.bestNode);
    assert.ok(layout.view.width>=44 && layout.view.height>=44);
    assert.ok(layout.view.textScale>=1,'结构档不将文字缩到不可读');
    widths.push(layout.width);
  }
  assert.ok(widths.every((w,i)=>!i || w>widths[i-1]));
  assert.equal(JSON.stringify(m),before);
  assert.equal(tree.model(m,1).view.zoom,40);
  assert.equal(tree.model(m,999).view.zoom,200);
});

test('缩放极限仍保留 601 个结点及全部未展开占位', () => {
  const m = freeze(largeTree(core.ipBranchBound(rootProblem).nodes[0]));
  for(const zoom of [40,75,200]) {
    const layout=tree.model(m,zoom);
    assert.equal(layout.items.length,601);
    assert.equal(layout.items.filter(n=>!n.data).length,301);
    assert.equal(layout.items.filter(n=>n.parent).length,600);
    assert.ok(layout.items.every(n=>n.x>=0 && n.y>=0 && n.x+layout.view.width<=layout.width && n.y+layout.view.height<=layout.height));
  }
});
