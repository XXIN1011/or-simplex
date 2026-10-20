/* 分枝定界总览：只读快照；编号、访问顺序与左右位置分别取自各自的字段。 */
'use strict';
var dom = require('./dom.js');
var esc = dom.esc, subs = dom.subs;
var fmtNum = require('../core/format.js').fmtNum;
var addScrollHints = require('./input-panel.js').addScrollHints;
var WIDTH = 208, HEIGHT = 132, GAP = 32, PAD = 20;
var ZOOM_STEPS = [40, 50, 60, 75, 100, 125, 150, 175, 200];

function finite(v) { return typeof v === 'number' && isFinite(v); }
function sameBound(a, b) { return a && b && a.j === b.j && a.rel === b.rel && a.val === b.val; }

/* 只接受子结点确实记录的新增约束，不用最后的界或父结点的小数推测。 */
function edgeText(parent, child, side) {
  var prefix = side === 0 ? '左支' : side === 1 ? '右支' : '分支';
  var before = parent.bounds, after = child && child.bounds;
  if (!before || !after || after.length <= before.length) return prefix + ' · 条件未记录';
  for (var i = 0; i < before.length; i++) {
    if (!sameBound(before[i], after[i])) return prefix + ' · 新增条件未确认';
  }
  var added = after.slice(before.length);
  if (added.some(function (b) {
    return !b || !finite(b.j) || b.j < 0 || Math.floor(b.j) !== b.j
      || !finite(b.val) || (b.rel !== '<=' && b.rel !== '>=');
  })) return prefix + ' · 条件未记录';
  return prefix + ' · ' + added.map(function (b) {
    return 'x' + subs(b.j + 1) + (b.rel === '<=' ? ' ≤ ' : ' ≥ ') + fmtNum(b.val);
  }).join('，');
}

function nodeText(nd, m) {
  var status = nd.res && nd.res.status;
  var bound = status === 'optimal' && finite(nd.objective)
    ? '松弛' + (m.sense === 'max' ? '上界' : m.sense === 'min' ? '下界' : '目标') + ' z = ' + fmtNum(nd.objective)
    : status === 'infeasible' ? '松弛无可行解'
    : status === 'unbounded' ? '松弛无界'
    : status === 'iteration-limit' ? '松弛未收敛' : '松弛状态未确认';
  var kind = 'unknown', action = '处理结果未确认';
  if (nd.action === 'branch') { kind = 'branch'; action = '继续分枝'; }
  if (nd.action === 'incumbent') { kind = 'integer'; action = '整数解 · 当时更新最好解'; }
  if (nd.action === 'prune') {
    kind = 'prune';
    action = status === 'infeasible' ? '剪枝（无可行解）'
      : status === 'unbounded' ? '剪枝（松弛无界）'
      : status === 'optimal' ? '剪枝（界限不优）' : '剪枝（原因未确认）';
  }
  return {bound:bound, kind:kind, action:action,
    best:!!m.best && nd.id === m.bestNode,
    bestLabel:m.complete === true ? '最终最好结点' : '当前最好结点'};
}

/* 语义缩放先减少信息和留白，再放大文字；结构档仍保留可读字号及触摸面积。 */
function zoomView(value, edgeChars) {
  var zoom = finite(value) ? Math.max(40, Math.min(200, value)) : 100;
  var scale = zoom / 100, mode = zoom <= 60 ? 'structure' : zoom < 100 ? 'summary' : 'detail';
  var textScale = Math.max(1, scale);
  var width = mode === 'structure' ? Math.max(64, Math.round(WIDTH * scale - 24)) : Math.round(WIDTH * scale);
  var height = mode === 'structure' ? Math.max(76, Math.round(HEIGHT * scale))
    : mode === 'summary' ? 104 : Math.round(HEIGHT * scale);
  var lines = Math.max(1, Math.ceil((edgeChars || 0) / Math.max(8, 18 * width / (WIDTH * textScale))));
  return {zoom:zoom, mode:mode, name:mode === 'structure' ? '结构' : mode === 'summary' ? '概览' : '详情',
    width:width, height:height, gap:mode === 'structure' ? (zoom <= 40 ? 8 : 12) : Math.round(GAP * scale),
    pad:mode === 'structure' ? (zoom <= 40 ? 8 : 12) : PAD, textScale:textScale,
    lane:mode === 'structure' ? 36 : (60 + (lines - 1) * 20) * textScale};
}

function pathOf(item, view) {
  var p = item.parent, x1 = p.x + view.width / 2, x2 = item.x + view.width / 2;
  var y1 = p.y + view.height, mid = y1 + Math.min(view.lane / 2, 24 * view.textScale);
  return 'M' + x1 + ' ' + y1 + ' V' + mid + ' H' + x2 + ' V' + item.y;
}

function model(m, zoom) {
  var items = [], byId = {}, roots = [], unattached = [];
  (m.nodes || []).forEach(function (nd, i) {
    var item = {id:nd.id, data:nd, visit:i + 1, children:[], parent:null, text:nodeText(nd, m)};
    byId['n' + nd.id] = item;
    items.push(item);
  });
  (m.openLeft || []).forEach(function (id) {
    if (byId['n' + id]) return;
    var item = {id:id, data:null, children:[], parent:null};
    byId['n' + id] = item;
    items.push(item);
  });
  /* 多个父结点声称同一个子结点时，不把无法确认的关系画成事实。 */
  var claims = {};
  items.forEach(function (p) {
    if (!p.data) return;
    (p.data.children || []).forEach(function (id) { claims['n' + id] = (claims['n' + id] || 0) + 1; });
  });
  items.forEach(function (p) {
    if (!p.data) return;
    (p.data.children || []).forEach(function (id, side) {
      var child = byId['n' + id], ancestor = p;
      if (!child || claims['n' + id] !== 1 || (child.data && child.data.parent !== p.id)) return;
      while (ancestor) { if (ancestor === child) return; ancestor = ancestor.parent; }
      child.parent = p;
      child.edge = edgeText(p.data, child.data, side);
      p.children.push(child);
    });
  });
  items.forEach(function (item) {
    if (item.parent) return;
    if (item.data) roots.push(item);
    else unattached.push(item.id);
  });
  var laid = [], leaves = 0, maxDepth = 0, edgeChars = 0;
  function place(item, depth) {
    item.level = depth;
    laid.push(item);
    maxDepth = Math.max(maxDepth, depth);
    if (item.edge) edgeChars = Math.max(edgeChars, item.edge.length);
    if (!item.children.length) item.column = leaves++;
    else {
      item.children.forEach(function (child) { place(child, depth + 1); });
      item.column = (item.children[0].column + item.children[item.children.length - 1].column) / 2;
    }
  }
  roots.forEach(function (root) { place(root, 0); });
  var view = zoomView(zoom, edgeChars);
  laid.forEach(function (item) {
    item.x = view.pad + item.column * (view.width + view.gap);
    item.y = view.pad + item.level * (view.height + view.lane);
  });
  return {items:laid, roots:roots, unattached:unattached, view:view,
    width:Math.max(1, leaves) * (view.width + view.gap) - view.gap + view.pad * 2,
    height:laid.length ? view.pad * 2 + view.height + maxDepth * (view.height + view.lane) : 0};
}

function render(m) {
  if (!m.applicable) return '<p class="sens-note">分枝定界树不适用：' + esc(m.reason || '未提供原因') + '</p>';
  var tree = model(m), count = (m.nodes || []).length;
  var summary = m.complete === true ? '搜索已完成' : '搜索未完成';
  if (m.best) summary += ' · ' + (m.complete === true ? '最好整数解' : '当前最好整数解，未确认最优')
    + (m.bestNode !== null && m.bestNode !== undefined ? '；来自结点 ' + m.bestNode : '（所在结点未记录）') + '，z = ' + fmtNum(m.bestZ);
  else summary += m.complete === true ? ' · 未找到整数解' : ' · 尚未找到整数解，不能判定无可行整数解';
  var h = '<section class="ip-tree" data-integer-tree aria-label="分枝定界树形总览">'
    + '<h3 class="sens-h">分枝定界树形总览</h3><p class="ip-tree-summary">' + esc(summary) + '</p>'
    + '<p class="sens-note">已处理 ' + count + ' 个结点，未展开 ' + (m.openLeft || []).length
    + ' 个。编号表示结点身份；访问序号按实际处理顺序排列。点击结点查看原有推导。</p>'
    + '<ul class="ip-tree-legend" aria-label="结点状态说明"><li class="ip-tree-branch">继续分枝</li>'
    + '<li class="ip-tree-integer">整数解：当时更新最好解</li><li class="ip-tree-best">最终 / 当前最好结点</li>'
    + '<li class="ip-tree-prune">剪枝：见结点原因</li><li class="ip-tree-open">未展开</li></ul>';
  if (count) h += '<button type="button" class="btn" data-integer-tree-details>查看全部原始结点过程</button>';
  if (tree.items.length) {
    h += '<div class="ip-tree-controls" role="group" aria-label="树图缩放">'
      + '<button type="button" class="btn" data-integer-tree-zoom="out" aria-label="缩小树图">−</button>'
      + '<output data-integer-tree-zoom-output aria-live="polite" aria-atomic="true" aria-label="树图缩放比例与信息量">100% · 详情</output>'
      + '<button type="button" class="btn" data-integer-tree-zoom="in" aria-label="放大树图">+</button>'
      + '<button type="button" class="btn" data-integer-tree-zoom="reset">重置</button></div>'
      + '<p class="sens-note ip-tree-zoom-note" data-integer-tree-zoom-note>缩小看结构，放大看访问序号、分枝条件和松弛界值；仍可在图内滑动。</p>'
      + '<div class="scroll ip-tree-scroll" data-scroll-label="← 在树图区域内左右、上下滚动查看全部结点 →" tabindex="0" role="region" aria-label="分枝定界树，可在区域内上下左右滚动">'
      + '<div class="ip-tree-canvas" style="width:' + tree.width + 'px;height:' + tree.height + 'px">'
      + '<svg class="ip-tree-lines" width="' + tree.width + '" height="' + tree.height + '" aria-hidden="true" focusable="false">';
    tree.items.forEach(function (item) {
      if (!item.parent) return;
      h += '<path data-integer-tree-link="' + esc(item.id) + '" d="' + pathOf(item, tree.view) + '"/>';
    });
    h += '</svg>';
    /* DOM 顺序沿用真实访问顺序；占位在后，不把空间位置当作访问次序。 */
    tree.items.slice().sort(function (a, b) { return (a.visit || Infinity) - (b.visit || Infinity); }).forEach(function (item) {
      var t = item.text, body = '<strong>结点 ' + esc(item.id)
        + (t && t.best ? ' <span class="ip-tree-best-label">· ' + esc(t.bestLabel) + '</span>' : '') + '</strong>';
      var label = '结点 ' + item.id;
      if (item.parent) h += '<span class="ip-tree-edge" data-integer-tree-edge="' + esc(item.id) + '" style="left:' + item.x + 'px;bottom:'
        + (tree.height - item.y + 8) + 'px">' + esc(item.edge) + '</span>';
      if (item.data) {
        var relation = item.data.parent === null ? '根结点'
          : item.parent ? '由结点 ' + item.parent.id + ' 分出' : '父子关系未确认';
        body += '<span class="ip-tree-meta">第 ' + item.visit + ' 个访问' + (item.data.parent === null ? ' · 根结点' : '') + '</span>'
          + '<span class="ip-tree-bound">' + esc(t.bound) + '</span>'
          + '<span class="ip-tree-action">' + esc(t.action) + '</span>'
          + '<span class="ip-tree-short-action">' + (t.kind === 'branch' ? '继续分枝' : t.kind === 'integer' ? '整数解'
            : t.kind === 'prune' ? '剪枝' : '未确认') + '</span>'
          + (t.best ? '<span class="ip-tree-short-best">' + (m.complete === true ? '最终最好' : '当前最好') + '</span>' : '');
        label += '，第 ' + item.visit + ' 个访问，' + relation + '，' + t.bound + '，' + t.action
          + (t.best ? '，' + t.bestLabel : '') + (item.edge ? '，' + item.edge : '') + '，查看详细过程';
      } else {
        body += '<span class="ip-tree-action">未展开</span><span class="ip-tree-meta">尚无松弛结果和访问序号</span>';
        label += '，未展开，' + item.edge + '，查看未展开说明';
      }
      h += '<button type="button" class="ip-tree-node ip-tree-' + (t ? t.kind : 'open') + (t && t.best ? ' ip-tree-best' : '')
        + '" data-integer-tree-node="' + esc(item.id) + '"' + (item.data ? '' : ' data-integer-tree-open')
        + ' aria-pressed="false" aria-label="' + esc(label) + '" style="left:' + item.x + 'px;top:' + item.y + 'px">' + body + '</button>';
    });
    h += '</div></div>';
  } else h += '<p class="sens-note">没有可展示的已处理结点。</p>';
  if ((m.openLeft || []).length) h += '<p class="sens-note">未展开结点仅记录编号；不提供松弛解、目标值、访问序号或剪枝原因。边上未记录的条件不作推测。</p>';
  if (tree.unattached.length) h += '<p class="sens-note">无法可靠关联父结点的未展开编号：' + esc(tree.unattached.join('、')) + '。</p>';
  return h + '<p class="sens-note ip-tree-feedback" role="status" aria-live="polite" data-integer-tree-feedback></p></section>';
}

function wire(root, method) {
  Array.prototype.forEach.call(root.querySelectorAll('[data-integer-tree]'), function (tree) {
    if (tree.getAttribute('data-integer-tree-ready')) return;
    if (!method) return;
    tree.setAttribute('data-integer-tree-ready', 'true');
    var scope = tree.parentNode, selected = null;
    var buttons = tree.querySelectorAll('[data-integer-tree-node]');
    var scroll = tree.querySelector('.ip-tree-scroll');
    var canvas = tree.querySelector('.ip-tree-canvas'), svg = tree.querySelector('.ip-tree-lines');
    var nodesById = {}, edgesById = {}, linksById = {};
    Array.prototype.forEach.call(buttons, function (button) { nodesById['n' + button.getAttribute('data-integer-tree-node')] = button; });
    Array.prototype.forEach.call(tree.querySelectorAll('[data-integer-tree-edge]'), function (edge) { edgesById['n' + edge.getAttribute('data-integer-tree-edge')] = edge; });
    Array.prototype.forEach.call(tree.querySelectorAll('[data-integer-tree-link]'), function (link) { linksById['n' + link.getAttribute('data-integer-tree-link')] = link; });
    var zoomOut = tree.querySelector('[data-integer-tree-zoom="out"]');
    var zoomIn = tree.querySelector('[data-integer-tree-zoom="in"]');
    var zoomIndex = ZOOM_STEPS.indexOf(100);
    function resetZoom() { return window.innerWidth <= 360 ? 40 : window.innerWidth <= 600 ? 50 : 100; }
    function applyZoom(value, reset) {
      if (!canvas) return;
      /* 先读当前视口，再批量写布局；缩放围绕眼前的结点，避免跳回根结点。 */
      var anchor = null, oldRect = null, distance = Infinity, viewport = scroll.getBoundingClientRect();
      var oldWidth = parseFloat(canvas.style.width), oldHeight = parseFloat(canvas.style.height);
      var oldX = scroll.scrollLeft + scroll.clientWidth / 2, oldY = scroll.scrollTop + scroll.clientHeight / 2;
      if (!reset) Array.prototype.forEach.call(buttons, function (button) {
        var r = button.getBoundingClientRect();
        if (r.right < viewport.left || r.left > viewport.right || r.bottom < viewport.top || r.top > viewport.bottom) return;
        var dx = (r.left + r.right - viewport.left - viewport.right) / 2;
        var dy = (r.top + r.bottom - viewport.top - viewport.bottom) / 2;
        var d = dx * dx + dy * dy;
        if (d < distance) { distance = d; anchor = button; oldRect = r; }
      });
      var layout = model(method, value), view = layout.view;
      zoomIndex = ZOOM_STEPS.indexOf(view.zoom);
      tree.setAttribute('data-integer-tree-zoom', String(view.zoom));
      tree.setAttribute('data-integer-tree-density', view.mode);
      tree.style.setProperty('--ip-tree-width', view.width + 'px');
      tree.style.setProperty('--ip-tree-height', view.height + 'px');
      tree.style.setProperty('--ip-tree-font', (13 * view.textScale) + 'px');
      tree.style.setProperty('--ip-tree-title-font', (14 * view.textScale) + 'px');
      tree.style.setProperty('--ip-tree-label-font', (12 * view.textScale) + 'px');
      tree.style.setProperty('--ip-tree-edge-line', (20 * view.textScale) + 'px');
      tree.style.setProperty('--ip-tree-padding', (10 * view.textScale) + 'px ' + (12 * view.textScale) + 'px');
      canvas.style.width = layout.width + 'px'; canvas.style.height = layout.height + 'px';
      svg.setAttribute('width', String(layout.width)); svg.setAttribute('height', String(layout.height));
      layout.items.forEach(function (item) {
        var node = nodesById['n' + item.id], edge = edgesById['n' + item.id];
        node.style.left = item.x + 'px'; node.style.top = item.y + 'px';
        if (edge) {
          edge.style.left = item.x + 'px';
          edge.style.bottom = (layout.height - item.y + 8 * view.textScale) + 'px';
          linksById['n' + item.id].setAttribute('d', pathOf(item, view));
        }
      });
      tree.querySelector('[data-integer-tree-zoom-output]').textContent = view.zoom + '% · ' + view.name;
      tree.querySelector('[data-integer-tree-zoom-note]').textContent = view.mode === 'structure'
        ? '结构档：显示编号、处理状态与最好标记。放大可看分枝条件和更多数据；仍可滑动。'
        : view.mode === 'summary' ? '概览档：增加访问序号与分枝条件。继续放大可看松弛界值；仍可滑动。'
        : '详情档：显示访问序号、松弛界值、处理结果与分枝条件；仍可滑动。';
      zoomOut.disabled = zoomIndex === 0; zoomIn.disabled = zoomIndex === ZOOM_STEPS.length - 1;
      if (reset) {
        var first = buttons[0].getBoundingClientRect(), box = scroll.getBoundingClientRect();
        scroll.scrollLeft += (first.left + first.right - box.left - box.right) / 2;
        scroll.scrollTop = 0;
      } else if (anchor) {
        var next = anchor.getBoundingClientRect();
        scroll.scrollLeft += (next.left + next.right - oldRect.left - oldRect.right) / 2;
        scroll.scrollTop += (next.top + next.bottom - oldRect.top - oldRect.bottom) / 2;
      } else {
        scroll.scrollLeft = oldX * layout.width / oldWidth - scroll.clientWidth / 2;
        scroll.scrollTop = oldY * layout.height / oldHeight - scroll.clientHeight / 2;
      }
      if (zoomOut.disabled && document.activeElement === zoomOut) zoomIn.focus({preventScroll:true});
      if (zoomIn.disabled && document.activeElement === zoomIn) zoomOut.focus({preventScroll:true});
      addScrollHints(scope);
    }
    function find(attr, id) {
      var found = null;
      Array.prototype.forEach.call(scope.querySelectorAll('[' + attr + ']'), function (el) {
        if (el.getAttribute(attr) === id) found = el;
      });
      return found;
    }
    function locate(el) {
      if (!el) return;
      var p = el.parentNode;
      while (p) { if (p.tagName === 'DETAILS') p.open = true; p = p.parentNode; }
      el.focus({preventScroll:true});
      el.scrollIntoView({behavior:'instant', block:'center', inline:'center'});
      addScrollHints(scope);
    }
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener('click', function () {
        if (selected) selected.setAttribute('aria-pressed', 'false');
        selected = button;
        button.setAttribute('aria-pressed', 'true');
        if (button.hasAttribute('data-integer-tree-open')) {
          tree.querySelector('[data-integer-tree-feedback]').textContent = '结点 '
            + button.getAttribute('data-integer-tree-node') + ' 未展开：没有详细推导，尚未计算松弛问题。';
          return;
        }
        tree.querySelector('[data-integer-tree-feedback]').textContent = '';
        locate(find('data-integer-node-title', button.getAttribute('data-integer-tree-node')));
      });
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-integer-tree-return]'), function (button) {
      button.addEventListener('click', function () {
        locate(selected || find('data-integer-tree-node', button.getAttribute('data-integer-tree-return')));
      });
    });
    var all = tree.querySelector('[data-integer-tree-details]');
    if (all) all.addEventListener('click', function () { locate(scope.querySelector('[data-integer-node-title]')); });
    if (zoomOut) {
      zoomOut.addEventListener('click', function () { if (zoomIndex > 0) applyZoom(ZOOM_STEPS[zoomIndex - 1], false); });
      zoomIn.addEventListener('click', function () { if (zoomIndex < ZOOM_STEPS.length - 1) applyZoom(ZOOM_STEPS[zoomIndex + 1], false); });
      tree.querySelector('[data-integer-tree-zoom="reset"]').addEventListener('click', function () { applyZoom(resetZoom(), true); });
      applyZoom(resetZoom(), true);
    }
  });
}

module.exports = {render:render, wire:wire, model:model};
