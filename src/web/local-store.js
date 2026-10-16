/* 草稿与历史记录共用版本化存储，访问失败或坏数据不能影响求解。 */
'use strict';
function createStore(key, valid, storage, prefix) {
  var access = storage || function () { return window.localStorage; };
  var name = (prefix || 'or-simplex-draft:') + key;
  return {
    load: function () {
      var raw;
      try { raw = access().getItem(name); }
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
        var raw = JSON.stringify({ version: 1, data: data });
        if (raw.length > 1048576) return false;
        access().setItem(name, raw);
        return true;
      } catch (e) { return false; }
    },
    clear: function () {
      try { access().removeItem(name); return true; }
      catch (e) { return false; }
    }
  };
}
module.exports = { createStore: createStore };
