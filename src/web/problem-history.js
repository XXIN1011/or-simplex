'use strict';
var createStore = require('./local-store.js').createStore;
var LIMIT = 20;

function createHistory(key, valid, storage, now) {
  var clock = now || Date.now;
  var store = createStore(key, function (items) {
    return Array.isArray(items) && items.length <= LIMIT && items.every(function (item) {
      return item && typeof item.savedAt === 'number' && isFinite(item.savedAt)
        && item.savedAt >= 0 && item.savedAt <= 8640000000000000 && valid(item.data);
    });
  }, storage, 'or-simplex-history:');
  return {
    load: store.load,
    clear: store.clear,
    add: function (data) {
      try {
        if (!valid(data)) return false;
        var signature = JSON.stringify(data);
        var loaded = store.load();
        if (loaded.status === 'unavailable') return false;
        var items = (loaded.data || []).filter(function (item) {
          return JSON.stringify(item.data) !== signature;
        });
        /* 快照不能引用输入面板的数组，否则继续编辑会改写内存里的旧题。 */
        items.unshift({ savedAt: clock(), data: JSON.parse(signature) });
        return store.save(items.slice(0, LIMIT));
      } catch (e) { return false; }
    },
    remove: function (data) {
      var loaded = store.load();
      if (loaded.status !== 'restored') return false;
      var signature = JSON.stringify(data);
      var items = loaded.data.filter(function (item) { return JSON.stringify(item.data) !== signature; });
      return items.length ? store.save(items) : store.clear();
    }
  };
}

function describe(p) {
  var direction = p.direction === 'max' ? '最大化' : '最小化';
  if (p.supply) return {
    title: (p.direction === 'max' ? '最大收益' : '最小运费') + ' · ' + p.rows + ' 产地 × ' + p.cols + ' 销地',
    preview: (p.direction === 'max' ? '收益' : '运费') + '：' + p.cells.map(function (row) {
      return '[' + row.map(function (value) { return value === '' ? '0' : value; }).join(', ') + ']';
    }).join('  '),
    facts: [['供应', p.supply.map(function (v) { return v === '' ? '0' : v; }).join(' / ')],
      ['需求', p.demand.map(function (v) { return v === '' ? '0' : v; }).join(' / ')]]
  };
  if (p.cells) return { title: direction + ' · ' + p.rows + ' 行 × ' + p.cols + ' 列',
    preview: p.cells.map(function (row) { return '[' + row.join(', ') + ']'; }).join(' ') };
  var title = direction + ' · ' + p.c.length + ' 个变量 · ' + p.constraints.length + ' 条约束';
  var preview = 'c = [' + p.c.join(', ') + ']；b = ['
    + p.constraints.map(function (k) { return k.rhs; }).join(', ') + ']';
  if (p.vtypes) preview += '；' + p.vtypes.map(function (v) {
    return { cont: '连续', int: '整数', bin: '0-1' }[v];
  }).join(', ');
  if (p.scenario) title += ' · ' + { c: '改目标系数', a: '改技术系数', b: '改右端项',
    'add-con': '增加约束', 'add-var': '增加变量', param: '参数分析' }[p.scenario.kind];
  return { title: title, preview: preview };
}

function attach(cfg) {
  var history = createHistory(cfg.key, cfg.valid);
  function icon(path) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
  var removeIcon = icon('<path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/>');
  var restoreIcon = icon('<path d="M4 4v6h6M4.6 10a8 8 0 1 1 .8 7"/>');
  var details = document.createElement('details');
  details.className = 'problem-history';
  details.innerHTML = '<summary>' + icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')
    + '<span>历史记录</span><span class="history-count">0</span></summary>'
    + '<p class="guide-note" role="status" aria-live="polite"></p>'
    + '<div class="history-toolbar"><button type="button" class="btn" data-history-clear>' + removeIcon + '<span>清空记录</span></button></div>'
    + '<ol class="history-list"></ol>';
  cfg.mount.querySelector('.input-guide').appendChild(details);
  var summary = details.querySelector('summary');
  var count = details.querySelector('.history-count');
  var notice = details.querySelector('[role="status"]');
  var clear = details.querySelector('[data-history-clear]');
  var list = details.querySelector('.history-list');

  function render(message) {
    var loaded = history.load(), items = loaded.data || [];
    count.textContent = String(items.length);
    clear.disabled = !items.length && loaded.status !== 'invalid';
    notice.textContent = message || (loaded.status === 'unavailable' ? '当前浏览器无法读取历史记录。'
      : loaded.status === 'invalid' ? '历史记录无法读取，可清空后重新记录。'
      : items.length ? '' : '暂无历史记录。');
    list.innerHTML = '';
    items.forEach(function (item) {
      var row = document.createElement('li');
      row.innerHTML = '<div class="history-info"><div class="history-item-heading"><b></b><time></time></div><p></p><dl class="history-facts"></dl></div>'
        + '<div class="history-actions"><button type="button" class="btn history-restore" data-history-restore>' + restoreIcon + '<span>恢复</span></button>'
        + '<button type="button" class="btn history-delete" data-history-delete title="删除这条记录" aria-label="删除这条记录">' + removeIcon + '</button></div>';
      var description = describe(item.data);
      row.querySelector('b').textContent = description.title;
      var time = row.querySelector('time');
      time.dateTime = new Date(item.savedAt).toISOString();
      time.textContent = new Date(item.savedAt).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
      time.title = new Date(item.savedAt).toLocaleString();
      row.querySelector('p').textContent = description.preview;
      row.querySelector('p').title = description.preview;
      var facts = row.querySelector('.history-facts');
      facts.hidden = !description.facts;
      (description.facts || []).forEach(function (fact) {
        var pair = document.createElement('div'), label = document.createElement('dt'), value = document.createElement('dd');
        label.textContent = fact[0]; value.textContent = fact[1];
        pair.appendChild(label); pair.appendChild(value); facts.appendChild(pair);
      });
      row.querySelector('[data-history-restore]').addEventListener('click', function () {
        cfg.restore(JSON.parse(JSON.stringify(item.data)));
        details.open = false;
        summary.focus();
      });
      row.querySelector('[data-history-delete]').addEventListener('click', function () {
        var ok = history.remove(item.data);
        render(ok ? '已删除这条记录。' : '记录未能删除，请重试。');
        summary.focus();
      });
      list.appendChild(row);
    });
  }
  clear.addEventListener('click', function () {
    if (!window.confirm('清空本模块的全部历史记录？当前题目会保留。')) return;
    render(history.clear() ? '历史记录已清空。' : '历史记录未能清空，请重试。');
    summary.focus();
  });
  /* 历史操作不应触发输入区的草稿保存状态；恢复由调用方显式落盘。 */
  details.addEventListener('click', function (event) { event.stopPropagation(); });
  window.addEventListener('storage', function (event) {
    if (event.key === null || event.key === 'or-simplex-history:' + cfg.key) render();
  });
  render();
  return {
    record: function (data) {
      var ok = history.add(data);
      render(ok ? '' : '本次历史记录未能保存，已有记录仍保留。');
      if (!ok) details.open = true;
      return ok;
    }
  };
}

module.exports = { createHistory: createHistory, attach: attach };
