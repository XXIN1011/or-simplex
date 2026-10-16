/* 每个模块只保留当前题目。存原始输入，不存计算结果，恢复后仍由用户重新求解。 */
'use strict';
var PREFIX = 'or-simplex-draft:';

function scalar(v) {
  return typeof v === 'string' || (typeof v === 'number' && isFinite(v));
}
function size(n, max) { return typeof n === 'number' && n >= 0 && n <= max && Math.floor(n) === n; }
function validLinear(p, maxN, maxM) {
  if (!p || ['max', 'min'].indexOf(p.direction) < 0 || !Array.isArray(p.c)
      || p.c.length > maxN || !p.c.every(scalar) || !Array.isArray(p.constraints)
      || p.constraints.length > maxM) return false;
  if (p.vtypes !== undefined && (!Array.isArray(p.vtypes) || p.vtypes.length !== p.c.length
      || !p.vtypes.every(function (v) { return ['cont', 'int', 'bin'].indexOf(v) >= 0; }))) return false;
  return p.constraints.every(function (k) {
    return k && Array.isArray(k.coef) && k.coef.length === p.c.length && k.coef.every(scalar)
      && ['<=', '>=', '='].indexOf(k.rel) >= 0 && scalar(k.rhs);
  });
}
function validAssignment(p) {
  return !!p && ['min', 'max'].indexOf(p.direction) >= 0
    && size(p.rows, 8) && size(p.cols, 8) && Array.isArray(p.cells) && p.cells.length === p.rows
    && p.cells.every(function (row) { return Array.isArray(row) && row.length === p.cols && row.every(scalar); });
}

/* 单独封装存储，浏览器拒绝访问、配额不足或旧数据损坏都不能阻止录题与求解。 */
function createStore(key, valid, storage) {
  var access = storage || function () { return window.localStorage; };
  return {
    load: function () {
      var raw;
      try { raw = access().getItem(PREFIX + key); }
      catch (e) { return { status: 'unavailable' }; }
      if (raw === null) return { status: 'empty' };
      try {
        if (raw.length > 1048576) return { status: 'invalid' };
        var record = JSON.parse(raw);
        if (!record || record.version !== 1 || !valid(record.data)) return { status: 'invalid' };
        return { status: 'restored', data: record.data };
      } catch (e2) { return { status: 'invalid' }; }
    },
    save: function (data) {
      try {
        access().setItem(PREFIX + key, JSON.stringify({ version: 1, data: data }));
        return true;
      } catch (e) { return false; }
    },
    clear: function () {
      try { access().removeItem(PREFIX + key); return true; }
      catch (e) { return false; }
    }
  };
}

function attach(cfg) {
  var mount = document.getElementById(cfg.mount);
  var tools = document.createElement('div');
  tools.className = 'draft-tools';
  tools.innerHTML = '<p class="guide-note" role="status" aria-live="polite"></p>'
    + '<button type="button" class="btn" data-draft-clear>清空题目</button>';
  var clear = tools.querySelector('[data-draft-clear]');
  var intro = mount.querySelector('.guide-intro');
  var actions = document.createElement('div');
  actions.className = 'guide-actions';
  actions.appendChild(intro.querySelector('[data-guide="sample"]'));
  actions.appendChild(clear);
  intro.appendChild(actions);
  mount.querySelector('.input-guide').appendChild(tools);
  var status = tools.querySelector('[role="status"]');
  var store = createStore(cfg.key, cfg.valid);
  var loaded = store.load();
  if (loaded.status === 'restored') cfg.restore(loaded.data);
  var previous = JSON.stringify(cfg.read());

  function message(value) { if (status.textContent !== value) status.textContent = value; }
  if (loaded.status === 'restored') message('已恢复上次题目，请重新求解。');
  else if (loaded.status === 'invalid') message('上次保存的题目无法读取，请重新输入。');
  else if (loaded.status === 'unavailable') message('当前浏览器无法保存题目。');
  else message('当前题目会自动保存在此浏览器。');

  function save() {
    var data = cfg.read();
    var next = JSON.stringify(data);
    if (next === previous) return;
    if (store.save(data)) {
      previous = next;
      message('当前题目已自动保存在此浏览器。');
    } else message('题目未能保存，请保持页面打开。');
  }
  clear.addEventListener('click', function (event) {
    event.stopPropagation();
    cfg.reset();
    previous = JSON.stringify(cfg.read());
    message(store.clear() ? '已清空题目，可重新输入。' : '无法清除已保存的题目，刷新后可能恢复旧题。');
  });
  /* 在冒泡阶段保存，等目标控件先完成更新；小规模输入立即落盘，刷新不丢最后一格。 */
  [cfg.mount].concat(cfg.watch || []).forEach(function (id) {
    var root = document.getElementById(id);
    ['input', 'change', 'click'].forEach(function (name) { root.addEventListener(name, save); });
  });
}

function attachLinear(cfg) {
  attach({
    key: cfg.key, mount: cfg.mount, watch: cfg.watch,
    valid: function (p) {
      return validLinear(p, cfg.maxN || 6, cfg.maxM || 8) && (!cfg.validExtra || cfg.validExtra(p));
    },
    read: function () {
      var p = cfg.panel.getDraft();
      if (cfg.readExtra) cfg.readExtra(p);
      return p;
    },
    restore: function (p) {
      cfg.panel.loadProblem(p);
      if (cfg.restoreExtra) cfg.restoreExtra(p);
    },
    reset: function () {
      cfg.panel.loadProblem({ direction: 'max', c: [], constraints: [], vtypes: [] });
      if (cfg.clearExtra) cfg.clearExtra();
    }
  });
}

module.exports = { createStore: createStore, validLinear: validLinear, validAssignment: validAssignment,
  attach: attach, attachLinear: attachLinear };
