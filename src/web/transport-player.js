/* 快照驱动的分配/回路演示；播放只改变显示阶段，绝不重新求解或插值运量。 */
'use strict';
var view = require('./transport-table.js'), num = view.num, table = view.table, cellName = view.cellName;
var esc = require('./dom.js').esc;
var addScrollHints = require('./input-panel.js').addScrollHints;
var NS = 'http://www.w3.org/2000/svg';
function count(s) { return s.type === 'allocation' ? 3 : s.cycle.length + 3; }
/* 末帧真正改变的格：用来闪一下，证明「同步调整」落在哪些格上。 */
function changedCells(s) {
  var out = [];
  if (!s.beforeAllocation || !s.allocation) return out;
  s.cycle.forEach(function (c) {
    if (String(s.beforeAllocation[c.i][c.j]) !== String(s.allocation[c.i][c.j])) out.push(c);
  });
  return out;
}
function routeList(s, frame) {
  return '<ol class="tp-route" aria-label="闭回路顺序">' + s.cycle.map(function (c, k) {
    return '<li class="tp-route-item ' + (c.sign > 0 ? 'tp-route-plus' : 'tp-route-minus') + (k < frame ? ' tp-route-visited' : '') + '"'
      + (frame === k + 1 ? ' aria-current="step"' : '') + '>'
      + '<b class="tp-route-n">' + (k + 1) + '</b><span class="tp-route-cell">' + cellName(c) + '</span>'
      + '<span class="tp-route-sign" aria-label="' + (c.sign > 0 ? '加' : '减') + '">' + (c.sign > 0 ? '+' : '−') + '</span></li>';
  }).join('') + '</ol>';
}
function scene(m, s, frame) {
  var allocation = s.type === 'allocation', last = count(s) - 1, done = frame === last;
  var values = done ? s.allocation : s.beforeAllocation, basis = done ? s.basis : s.beforeBasis;
  var loop = allocation ? [] : s.cycle.slice(0, Math.min(frame, s.cycle.length));
  var active = allocation ? s.cell : frame === 0 ? s.entering : frame <= s.cycle.length ? s.cycle[frame - 1] : s.leaving;
  var costName = m.direction === 'max' ? '原收益' : '原费用';
  var title, note, h = '', options = { active: active, selected: allocation ? s.cell : s.entering,
    selectedLabel: allocation ? '本次选择' : '入基格' };
  if (allocation) {
    options.supply = done ? s.remainingSupply : s.beforeRemainingSupply;
    options.demand = done ? s.remainingDemand : s.beforeRemainingDemand;
    options.ties = s.ties;
    if (frame === 1 && s.guarded) { options.cutRows = s.blockedCutRows; options.cutCols = s.blockedCutCols; }
    title = frame === 0 ? '选择最小费用格' : frame === 1 ? '确定可行分配量' : '分配完成，更新剩余供需';
    note = frame === 0 ? '选中 ' + cellName(s.cell) + '，工作费用 ' + num(s.cost) + '；并列时按行、列下标选择。右侧和底部显示本轮分配前的剩余量。'
      : frame === 1 ? '普通分配上限 ' + num(s.proposedQuantity) + '；实际分配量 ' + num(s.quantity) + '。'
        + (s.guarded ? '若按上限分配，后续将有 ' + num(s.feasibilityDeficit) + ' 单位无法匹配。高亮瓶颈针对试分配后的剩余网络，已固定格不再使用。' : '本次可按上限分配；下一帧更新所选格及对应供需。')
      : (s.quantity === 0 ? '为保持可行，本格跳过，运量和基身份不变。' : '已分配 ' + num(s.quantity) + '，所选格与右侧剩余供应、底部剩余需求同步更新。');
  } else {
    if (frame >= s.cycle.length + 1) options.leaving = s.leaving;
    options.dim = loop.length > 0;
    options.theta = frame === s.cycle.length + 1;
    options.updated = done ? changedCells(s) : [];
    title = frame === 0 ? '从入基格开始' : frame <= s.cycle.length ? '标记回路第 ' + frame + ' 格' : done ? '同步调整运量与基身份' : '从负号格确定调整量';
    note = frame === 0 ? '入基格 ' + cellName(s.entering) + ' 运量暂不改变。下一帧沿基树路径交替标记 + / −。'
      : frame <= s.cycle.length ? cellName(active) + (active.sign > 0 ? ' 标 +，调整时增加 θ。' : ' 标 −，调整时减少 θ。')
        + (frame === s.cycle.length ? '路径已闭合，下一帧比较所有负号格的运量。' : '此时仅标记路径，尚未改变运输量。')
      : done ? (s.theta === 0 ? 'θ = 0：退化换基，运量不变，入基格与离基格的基身份已更新。' : 'θ = ' + num(s.theta) + '：所有正负号格同步更新，显示的是算法记录的调整后方案。')
      : 'θ = 负号格的最小运量 = ' + num(s.theta) + '；' + cellName(s.leaving) + ' 离基，并列时取下标最小者。';
    h += routeList(s, frame);
  }
  var objective = done ? s.objective : s.objectiveBefore;
  return { html: '<h4 class="tp-scene-title">' + title + '</h4><p>' + note + '</p>' + h
    + table(m, values, basis, loop, allocation
      ? '最小元素分配表（左上角 ' + costName + '；右侧 / 底部为剩余量）'
      : '闭回路演示表（左上角 ' + costName + '，＋ 加 θ / − 减 θ）', false, options)
    + '<p class="tp-player-objective">当前原目标值 <b>' + num(objective) + '</b>'
    + (!allocation && done ? '；' + num(s.objectiveBefore) + ' → ' + num(s.objectiveAfter) + '（变化 ' + num(s.delta) + '）' : '') + '。</p>', loop: loop };
}
function render(m, s, index) {
  return '<section class="tp-player" data-transport-player="' + index + '" data-kind="' + s.type + '" data-frame="0" aria-label="' + (s.type === 'allocation' ? '最小元素分配演示' : '闭回路动画') + '">'
    + '<div class="tp-player-controls" role="group" aria-label="演示播放控制">'
    + '<button type="button" class="btn" data-tp-prev disabled>上一帧</button><button type="button" class="btn" data-tp-play aria-pressed="false">播放</button>'
    + '<button type="button" class="btn" data-tp-next>下一帧</button><button type="button" class="btn" data-tp-reset>重播</button>'
    + '<label class="tp-speed">帧间隔<select data-tp-speed aria-label="演示帧间隔"><option value="1000">1 秒</option><option value="1800">1.8 秒</option><option value="600">0.6 秒</option></select></label></div>'
    + '<p class="sens-note tp-motion-note" hidden>已启用减少动态效果，请用上一帧 / 下一帧查看；阶段内容完整保留。</p>'
    + '<p class="tp-player-progress" role="status" aria-live="polite">第 1 / ' + count(s) + ' 帧 · 等待播放</p>'
    + '<div class="tp-scene">' + scene(m, s, 0).html + '</div></section>';
}
function wire(root, result) {
  var players = [], disposed = false, listeners = [];
  var media = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function on(target, event, fn) { target.addEventListener(event, fn); listeners.push(function () { target.removeEventListener(event, fn); }); }
  function visible(box) {
    if (document.hidden || !root.parentNode || !document.getElementById('mod-transport').classList.contains('on')) return false;
    for (var p = box; p && p !== root; p = p.parentNode) if (p.hidden || (p.tagName === 'DETAILS' && !p.open)) return false;
    return true;
  }
  function pauseAll() { players.forEach(function (p) { p.pause(); }); }
  function svgEl(name, attrs) {
    var el = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  /* 节点取格内「序号 + 正负号」角标的中心：连线正好穿进符号位，与教材画法一致。 */
  function nodeAt(stage, rect, c) {
    var cell = stage.querySelector('[data-tp-cell="' + c.i + '-' + c.j + '"]');
    var node = cell && (cell.querySelector('.tp-anchor') || cell);
    if (!node) return null;
    var r = node.getBoundingClientRect();
    return [r.left - rect.left + r.width / 2, r.top - rect.top + r.height / 2];
  }
  function draw(box, loop, closed, playing) {
    if (loop.length < 2 || !visible(box)) return;
    var stage = box.querySelector('.tp-stage'), rect = stage.getBoundingClientRect(), points = [];
    if (!rect.width || !rect.height) return;
    loop.forEach(function (c) { var p = nodeAt(stage, rect, c); if (p) points.push(p); });
    if (points.length < 2) return;
    if (closed) points.push(points[0].slice());
    var svg = svgEl('svg', { class: 'tp-path', 'aria-hidden': 'true', viewBox: '0 0 ' + rect.width + ' ' + rect.height });
    var d = points.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    svg.appendChild(svgEl('polyline', { class: 'tp-line', points: d }));
    /* 流动光点：自动播放时沿闭合回路循环；手动逐帧时只在最新一段画一次，指明方向。 */
    if (!media.matches && (!closed || playing)) {
      var motion = 'M' + points.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' L');
      var dot = svgEl('circle', { class: 'tp-flow' + (closed ? ' tp-flow-loop' : ''), r: '3.4' });
      dot.style.offsetPath = 'path("' + motion + '")';
      dot.style.offsetRotate = '0deg';
      svg.appendChild(dot);
    }
    for (var k = 1; k < points.length; k++) {
      var a = points[k - 1], b = points[k], dx = b[0] - a[0], dy = b[1] - a[1];
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 44) continue;
      var arrow = svgEl('polyline', { class: 'tp-arrow' + (!closed && k === points.length - 1 ? ' tp-arrow-live' : ''),
        points: '-5,-5.5 0,0 -5,5.5',
        transform: 'translate(' + ((a[0] + b[0]) / 2).toFixed(1) + ',' + ((a[1] + b[1]) / 2).toFixed(1) + ') rotate('
          + (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1) + ')' });
      svg.appendChild(arrow);
    }
    stage.appendChild(svg);
  }
  Array.prototype.forEach.call(root.querySelectorAll('[data-transport-player]'), function (box) {
    var s = result.steps[+box.getAttribute('data-transport-player')], frame = 0, timer = null, playing = false;
    var body = box.querySelector('.tp-scene'), play = box.querySelector('[data-tp-play]'), prev = box.querySelector('[data-tp-prev]');
    var next = box.querySelector('[data-tp-next]'), progress = box.querySelector('.tp-player-progress'), speed = box.querySelector('[data-tp-speed]');
    function pause() {
      clearTimeout(timer); timer = null; playing = false;
      play.textContent = '播放'; play.setAttribute('aria-pressed', 'false'); box.setAttribute('data-playing', 'false');
      progress.textContent = '第 ' + (frame + 1) + ' / ' + count(s) + ' 帧 · ' + (frame === count(s) - 1 ? '演示完成' : '已暂停');
    }
    function paint() {
      var rendered = scene(result.model, s, frame), scroll = body.querySelector('.scroll'), left = scroll ? scroll.scrollLeft : 0;
      body.innerHTML = rendered.html; box.setAttribute('data-frame', String(frame));
      prev.disabled = frame === 0; next.disabled = frame === count(s) - 1;
      play.disabled = media.matches;
      box.querySelector('.tp-motion-note').hidden = !media.matches;
      progress.textContent = '第 ' + (frame + 1) + ' / ' + count(s) + ' 帧 · ' + (playing ? '播放中' : frame === count(s) - 1 ? '演示完成' : '已暂停');
      addScrollHints(body); body.querySelector('.scroll').scrollLeft = left;
      /* 只移动表内横向滚动，手机上不能把正在标记的格留在屏幕外，也不抢页面焦点。
         滚动量按格边界取整：把当前格的左边界正好贴到固定行名列的右边界上，
         固定列外侧就永远是完整的一格 —— 半个格子和半个费用角标露在固定列旁，
         正是手机上读起来像乱码的样子。 */
      var viewport = body.querySelector('.scroll'), current = body.querySelector('.tp-active');
      var vr = viewport.getBoundingClientRect(), cr = current.getBoundingClientRect();
      var leading = body.querySelector('tbody th').getBoundingClientRect().right;
      var trailing = body.querySelector('tbody td:last-child').getBoundingClientRect().left;
      if (cr.left < leading - 1 || cr.right > trailing + 1) {
        var offset = cr.left - vr.left + viewport.scrollLeft;   /* 当前格在内容里的左边界 */
        var max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
        viewport.scrollLeft = Math.max(0, Math.min(max, offset - (leading - vr.left)));
      }
      draw(box, rendered.loop, s.type === 'pivot' && frame >= s.cycle.length, playing && !media.matches);
    }
    function schedule() {
      timer = setTimeout(function () {
        if (disposed || !visible(box) || media.matches) { pause(); paint(); return; }
        if (frame < count(s) - 1) frame++;
        if (frame === count(s) - 1) pause();
        paint(); if (playing) schedule();
      }, +speed.value);
    }
    on(play, 'click', function () {
      if (playing) { pause(); paint(); return; }
      if (media.matches || !visible(box)) return;
      pauseAll(); if (frame === count(s) - 1) frame = 0;
      playing = true; play.textContent = '暂停'; play.setAttribute('aria-pressed', 'true'); box.setAttribute('data-playing', 'true'); paint(); schedule();
    });
    on(prev, 'click', function () { pause(); if (frame > 0) frame--; paint(); });
    on(next, 'click', function () { pause(); if (frame < count(s) - 1) frame++; paint(); });
    on(box.querySelector('[data-tp-reset]'), 'click', function () { pause(); frame = 0; paint(); });
    on(speed, 'change', function () { if (playing) { clearTimeout(timer); schedule(); } });
    players.push({ box: box, pause: pause, refresh: paint, wasVisible: visible(box), isPlaying: function () { return playing; } });
    pause();
    paint();
  });
  function sync() {
    players.forEach(function (p) {
      var shown = visible(p.box);
      if (!shown) p.pause();
      if (shown && !p.wasVisible) p.refresh();
      p.wasVisible = shown;
    });
  }
  on(root, 'click', sync); on(root, 'change', sync);
  on(document, 'visibilitychange', sync); on(window, 'hashchange', sync);
  Array.prototype.forEach.call(root.querySelectorAll('details'), function (d) { on(d, 'toggle', sync); });
  function redraw() { players.forEach(function (p) { if (visible(p.box)) p.refresh(); }); }
  on(window, 'resize', redraw);
  function preference() { pauseAll(); redraw(); }
  if (media.addEventListener) { media.addEventListener('change', preference); listeners.push(function () { media.removeEventListener('change', preference); }); }
  else if (media.addListener) { media.addListener(preference); listeners.push(function () { media.removeListener(preference); }); }
  var observer = window.IntersectionObserver ? new window.IntersectionObserver(function (entries) {
    entries.forEach(function (entry) { if (!entry.isIntersecting) players.forEach(function (p) { if (p.box === entry.target && p.isPlaying()) p.pause(); }); });
  }) : null;
  if (observer) players.forEach(function (p) { observer.observe(p.box); });
  else on(window, 'scroll', function () {
    players.forEach(function (p) {
      if (!p.isPlaying()) return;
      var r = p.box.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= window.innerHeight) p.pause();
    });
  });
  return function () { disposed = true; pauseAll(); listeners.forEach(function (remove) { remove(); }); if (observer) observer.disconnect(); };
}
module.exports = { render: render, wire: wire };
