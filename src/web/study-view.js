/* 同一份算法快照在完整阅读与单步学习之间切换，不重新计算或改动求解结果。 */
'use strict';
var esc = require('./dom.js').esc;
var addScrollHints = require('./input-panel.js').addScrollHints;

function wrap(content, label) {
  return content ? '<div class="study-view" data-study role="region" aria-label="' + esc(label) + '">' + content + '</div>' : '';
}

function group(items, label) {
  return wrap(items.map(function (item) {
    return '<div class="study-step" data-study-step data-step-title="' + esc(item.title) + '">' + item.html + '</div>';
  }).join(''), label);
}

function toolbar(steps) {
  var h = '<div class="seg sm" role="group" aria-label="过程查看方式">'
    + '<button type="button" data-study-mode="all" class="on" aria-pressed="true">完整过程</button>'
    + '<button type="button" data-study-mode="single" aria-pressed="false">单步学习</button></div>'
    + '<p class="sens-note study-caption">共 ' + steps.length + ' 步，可切换为单步查看。</p>'
    + '<div class="study-controls" hidden><div class="study-progress" role="status" aria-live="polite"></div>'
    + '<div class="study-actions"><button type="button" class="btn" data-study-prev>上一步</button>'
    + '<label class="study-picker">跳转步骤<select aria-label="选择学习步骤" data-study-select>';
  Array.prototype.forEach.call(steps, function (step, i) {
    h += '<option value="' + i + '">' + (i + 1) + '. ' + esc(step.getAttribute('data-step-title')) + '</option>';
  });
  return h + '</select></label><button type="button" class="btn" data-study-next>下一步</button></div></div>';
}

function wire(root) {
  Array.prototype.forEach.call(root.querySelectorAll('[data-study]'), function (box) {
    if (box.getAttribute('data-study-ready')) return;
    var steps = box.querySelectorAll('[data-study-step]');
    if (!steps.length) return;
    box.setAttribute('data-study-ready', 'true');
    var bar = document.createElement('div');
    bar.className = 'card study-toolbar';
    bar.innerHTML = toolbar(steps);
    box.insertBefore(bar, box.firstChild);
    var parts = box.querySelectorAll('[data-study-part]');
    var wasOpen = [];
    var controls = box.querySelector('.study-controls');
    var progress = box.querySelector('.study-progress');
    var picker = box.querySelector('[data-study-select]');
    var prev = box.querySelector('[data-study-prev]');
    var next = box.querySelector('[data-study-next]');
    var mode = 'all', index = 0;
    function show() {
      controls.hidden = mode === 'all';
      box.querySelector('.study-caption').hidden = mode === 'single';
      Array.prototype.forEach.call(steps, function (step, i) { step.hidden = mode === 'single' && i !== index; });
      Array.prototype.forEach.call(parts, function (part) {
        part.hidden = mode === 'single' && !part.contains(steps[index]);
        if (mode === 'single' && !part.hidden) part.open = true;
      });
      Array.prototype.forEach.call(box.querySelectorAll('[data-study-mode]'), function (button) {
        var active = button.getAttribute('data-study-mode') === mode;
        button.classList.toggle('on', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      picker.value = String(index);
      prev.disabled = index === 0;
      next.disabled = index === steps.length - 1;
      progress.textContent = '第 ' + (index + 1) + ' / ' + steps.length + ' 步 · ' + steps[index].getAttribute('data-step-title');
      addScrollHints(box);
    }
    Array.prototype.forEach.call(box.querySelectorAll('[data-study-mode]'), function (button) {
      button.addEventListener('click', function () {
        var selected = button.getAttribute('data-study-mode');
        if (selected === mode) return;
        if (selected === 'single') wasOpen = Array.prototype.map.call(parts, function (part) { return part.open; });
        mode = selected;
        show();
        if (mode === 'all') Array.prototype.forEach.call(parts, function (part, i) { part.open = wasOpen[i]; });
      });
    });
    prev.addEventListener('click', function () { if (index > 0) { index--; show(); } });
    next.addEventListener('click', function () { if (index < steps.length - 1) { index++; show(); } });
    picker.addEventListener('change', function () {
      var selected = Number(picker.value);
      if (selected >= 0 && selected < steps.length && Math.floor(selected) === selected) { index = selected; show(); }
    });
    show();
  });
}

module.exports = { group: group, wrap: wrap, wire: wire };
