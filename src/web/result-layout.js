'use strict';
var esc = require('./dom.js').esc;
var addScrollHints = require('./input-panel.js').addScrollHints;

function navigation(items) {
  return '<nav class="result-nav" aria-label="结果章节">' + items.map(function (item) {
    return '<button type="button" class="btn" data-jump="' + esc(item[0]) + '">' + esc(item[1]) + '</button>';
  }).join('') + '</nav>';
}

/* 章节跳转不改 hash，避免与模块路由冲突；从折叠状态跳转时先展开。 */
function wire(root) {
  require('./study-view.js').wire(root);
  Array.prototype.forEach.call(root.querySelectorAll('[data-jump]'), function (button) {
    button.addEventListener('click', function () {
      var section = root.querySelector('[data-section="' + button.getAttribute('data-jump') + '"]');
      if (!section) return;
      var parent = section.parentNode;
      while (parent && parent !== root) {
        if (parent.tagName === 'DETAILS') parent.open = true;
        parent = parent.parentNode;
      }
      section.setAttribute('tabindex', '-1');
      section.focus({preventScroll:true});
      section.scrollIntoView({behavior:'smooth',block:'start'});
    });
  });
  Array.prototype.forEach.call(root.querySelectorAll('details'), function (details) {
    details.addEventListener('toggle', function () { if (details.open) addScrollHints(details); });
  });
}
module.exports = { navigation: navigation, wire: wire };
