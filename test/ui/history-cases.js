'use strict';
const { sleep } = require('../../lib/chrome.js');

module.exports = async function historyCases(sess, check, url) {
  async function reload() {
    await sess.navigate('about:blank', 0);
    await sess.navigate(url + '#/simplex', 250);
  }
  async function checks(code) {
    const rows = await sess.evl(`(function(){
      var rows=[];
      function expect(ok,label){rows.push({ok:!!ok,label:label})}
      function q(s){return document.querySelector(s)}
      function click(id){document.getElementById(id).click()}
      function sample(id){q('#'+id+' [data-guide=sample]').click()}
      function clear(id){q('#'+id+' [data-draft-clear]').click()}
      function set(s,v,event){var e=q(s);e.value=v;e.dispatchEvent(new Event(event||'input',{bubbles:true}))}
      function items(key){var raw=localStorage.getItem('or-simplex-history:'+key);return raw?JSON.parse(raw).data:[]}
      ${code}
      return rows;
    })()`);
    rows.forEach(r => check(r.ok, r.label));
  }
  await sess.evl(`['simplex','sens','ip','assign'].forEach(function(key){localStorage.removeItem('or-simplex-history:'+key)})`);
  await reload();
  await checks(`
    ['simplexPanel','sensPanel','ipPanel','asPanel'].forEach(clear);
    expect(document.querySelectorAll('.problem-history').length===4,'四模块输入区分别提供历史记录');
    expect(Array.prototype.every.call(document.querySelectorAll('.history-count'),function(e){return e.textContent==='0'}),
      '没有历史时显示零条记录');
    sample('simplexPanel');set('#inTbl [data-k=c][data-j="0"]','1e');click('solveBtn');
    expect(items('simplex').length===0,'输入校验失败不会写入历史');
    set('#inTbl [data-k=c][data-j="0"]','4/2');click('solveBtn');
    expect(items('simplex').length===1 && items('simplex')[0].data.c[0]==='4/2','有效求解记录原始分数');
    expect(q('#simplexPanel .history-count').textContent==='1','求解后历史条数立即更新');
    set('#inTbl [data-k=c][data-j="0"]','4');click('solveBtn');click('solveBtn');
    expect(items('simplex').length===2 && items('simplex')[0].data.c[0]==='4','重复求解去重并置顶');
    set('#inTbl [data-k=c][data-j="0"]','9');
    expect(items('simplex')[0].data.c[0]==='4','继续编辑不会改写已保存快照');
    q('#simplexPanel .problem-history').open=true;
    q('#simplexPanel .history-list li:nth-child(2) [data-history-restore]').click();
    expect(q('#inTbl [data-k=c][data-j="0"]').value==='4/2' && !q('#result').textContent,
      '恢复历史替换输入并清除旧结果');
    expect(JSON.parse(localStorage.getItem('or-simplex-draft:simplex')).data.c[0]==='4/2',
      '恢复的题目立即写入当前题目自动保存');
    expect(items('simplex').length===2 && !q('#simplexPanel .problem-history').open,
      '恢复动作不新增历史，且收起历史列表');
    expect(document.activeElement===q('#simplexPanel .problem-history summary'),'恢复后焦点回到可见的历史入口');
    expect(/请重新求解/.test(q('#simplexPanel [role=status]').textContent),'恢复后提示重新求解');
  `);
  await reload();
  await checks(`
    expect(q('#inTbl [data-k=c][data-j="0"]').value==='4/2' && items('simplex').length===2,
      '刷新后当前题目与多条历史均保留');
    expect(!q('#result').textContent,'历史不持久化计算结果');
    sample('ipPanel');q('#ipTypes [data-vt="0"] [data-t=bin]').click();
    q('#ipTypes [data-vt="1"] [data-t=cont]').click();click('ipSolveBtn');
    expect(items('ip').length===1 && items('ip')[0].data.vtypes.join(',')==='bin,cont','整数历史保存混合变量类型');
    sample('asPanel');set('#asInTbl [data-i="0"][data-j="0"]','×');
    set('#asInTbl [data-i="0"][data-j="1"]','9/2');click('asSolveBtn');
    expect(items('assign').length===1 && items('assign')[0].data.cells[0][0]==='×'
      && items('assign')[0].data.cells[0][1]==='9/2','指派历史保存禁止标记和分数');
    sample('sensPanel');click('sSolveBtn');
    q('#sensTabs [data-t=b]').click();set('#sensForm [data-f=b][data-i="0"]','7/2');click('sensGo');
    expect(items('sens').length===2 && items('sens')[0].data.scenario.kind==='b'
      && items('sens')[0].data.scenario.values[0]==='7/2','灵敏度变化分析成功后保存场景条件');
    q('#sensTabs [data-t=param]').click();set('#sensForm [data-f=pd][data-j="0"]','1/2');click('sensGo');
    expect(items('sens').length===3 && items('sens')[0].data.scenario.kind==='param','参数分析保存对应历史');
    ['simplexPanel','sensPanel','ipPanel','asPanel'].forEach(clear);
    expect(items('simplex').length===2 && items('ip').length===1 && items('assign').length===1 && items('sens').length===3,
      '清空当前题目不会清空任一模块历史');
    ['ipPanel','asPanel','sensPanel'].forEach(function(id){q('#'+id+' [data-history-restore]').click()});
    expect(q('#ipTypes [data-vt="0"] .on').dataset.t==='bin' && q('#ipTypes [data-vt="1"] .on').dataset.t==='cont',
      '历史恢复整数变量类型');
    expect(q('#asInTbl [data-i="0"][data-j="0"]').value==='×'
      && q('#asInTbl [data-i="0"][data-j="1"]').value==='9/2','历史恢复指派禁止标记和分数');
    expect(!q('#sensForm') && !q('#sBase').textContent && !q('#asOut').textContent && !q('#ipOut').textContent,
      '四模块恢复均清理旧结果，灵敏度等待重算基准');
    click('sSolveBtn');
    expect(q('#sensTabs .on').dataset.t==='param' && q('#sensForm [data-f=pd][data-j="0"]').value==='1/2',
      '重算基准后还原历史中的参数分析与原始分数');
    q('#simplexPanel [data-history-restore]').click();
    var draft=localStorage.getItem('or-simplex-draft:simplex'),theme=localStorage.getItem('or-theme');
    q('#simplexPanel [data-history-delete]').click();
    expect(items('simplex').length===1 && localStorage.getItem('or-simplex-draft:simplex')===draft,
      '删除一条历史不改当前题目');
    var confirm=window.confirm;window.confirm=function(){return false};
    q('#simplexPanel [data-history-clear]').click();
    expect(items('simplex').length===1,'取消清空保留历史');
    window.confirm=function(){return true};q('#simplexPanel [data-history-clear]').click();window.confirm=confirm;
    expect(items('simplex').length===0 && q('#simplexPanel .history-count').textContent==='0','确认清空移除本模块全部记录');
    expect(items('ip').length===1 && items('assign').length===1 && items('sens').length===3
      && localStorage.getItem('or-simplex-draft:simplex')===draft && localStorage.getItem('or-theme')===theme,
      '清空历史不影响其他模块、当前题目与主题');
    click('solveBtn');set('#inTbl [data-k=c][data-j="0"]','4/2');click('solveBtn');
    q('#simplexPanel .problem-history').open=true;
    expect(window.__errors.length===0,'记录、恢复、删除与清空全程无JS错误');
  `);
  // 截图前展开真实数据，检查历史列表、按钮与原首页在手机和桌面上的布局。
  for (const width of [320, 390, 1280]) {
    await sess.cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }, sess.sessionId);
    await sess.evl(`location.hash='#/simplex';document.querySelector('#themeSeg [data-mode=light]').click();window.scrollTo({top:0,behavior:'instant'})`);
    await sleep(200);
    await checks(`
      expect(document.documentElement.scrollWidth<=innerWidth+1,'历史列表无页面横向溢出 ${width}px');
      var detail=q('#simplexPanel .problem-history'),box=detail.getBoundingClientRect();
      expect(Array.prototype.every.call(detail.querySelectorAll('button'),function(b){var r=b.getBoundingClientRect();
        return r.width>=44 && r.height>=44 && r.left>=box.left-1 && r.right<=box.right+1}),
        '历史操作按钮可触摸且位于输入区内 ${width}px');
    `);
    await sess.saveShot('preview/history-light-' + width + '.png', { captureBeyondViewport: false });
    await sess.evl(`location.hash='#/';window.scrollTo({top:0,behavior:'instant'})`);
    await sleep(150);
    await checks(`
      var ip=q('.m-ip');
      expect(ip.querySelector('.mb').children.length===2
        && ip.querySelector('.md').textContent==='指定整数或 0-1 变量，对比分枝定界等求解过程。'
        && !/自动判定/.test(ip.textContent),'首页整数规划与其他模块保持一致的标题和单行简介结构 ${width}px');
      expect(document.documentElement.scrollWidth<=innerWidth+1,'首页无横向溢出 ${width}px');
    `);
    if (width === 1280) await checks(`
      var heights=Array.prototype.map.call(document.querySelectorAll('.modcard'),function(e){return e.getBoundingClientRect().height});
      expect(Math.max.apply(null,heights)-Math.min.apply(null,heights)<1,'桌面首页四个模块高度一致');
    `);
    await sess.saveShot('preview/history-home-' + width + '.png', { captureBeyondViewport: false });
  }
  await sess.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sess.sessionId);
  await sess.evl(`location.hash='#/simplex';document.querySelector('#themeSeg [data-mode=dark]').click();window.scrollTo({top:0,behavior:'instant'})`);
  await sleep(150);
  await sess.saveShot('preview/history-dark-390.png', { captureBeyondViewport: false });
  await checks(`
    window.__historyBeforeQuota=localStorage.getItem('or-simplex-history:simplex');
    window.__historySetItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key.indexOf('or-simplex-history:')===0)throw new Error('quota');
      return window.__historySetItem.call(this,key,value)};
    set('#inTbl [data-k=c][data-j="0"]','5');click('solveBtn');
    expect(!!q('#result .zv'),'历史写入配额不足时仍正常求解');
    expect(localStorage.getItem('or-simplex-history:simplex')===window.__historyBeforeQuota,'历史写入失败保留已有记录');
    expect(q('#simplexPanel .problem-history').open
      && /未能保存/.test(q('#simplexPanel .problem-history [role=status]').textContent),'历史写入失败展开并显示真实状态');
    Storage.prototype.setItem=window.__historySetItem;
    localStorage.setItem('or-simplex-history:simplex','{broken');
  `);
  await reload();
  await checks(`
    expect(/无法读取/.test(q('#simplexPanel .problem-history [role=status]').textContent),'历史损坏时提示并忽略坏数据');
    sample('simplexPanel');click('solveBtn');
    expect(items('simplex').length===1 && !!q('#result .zv'),'坏历史不影响求解且可重新记录');
    var p=items('simplex')[0].data;p.c[0]='<img src=x onerror=alert(1)>';
    localStorage.setItem('or-simplex-history:simplex',JSON.stringify({version:1,data:[{savedAt:1,data:p}]}));
  `);
  await reload();
  await checks(`
    expect(!q('.history-list img') && /<img/.test(q('#simplexPanel .history-info p').textContent),'历史预览以文本渲染外部数据');
    expect(window.__errors.length===0,'损坏和特殊文本的历史不引发JS错误');
  `);
  const hook = await sess.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "Object.defineProperty(window,'localStorage',{get:function(){throw new Error('storage disabled')}});"
  }, sess.sessionId);
  try {
    await reload();
    await checks(`
      sample('simplexPanel');click('solveBtn');
      expect(!!q('#result .zv') && /未能保存/.test(q('#simplexPanel .problem-history [role=status]').textContent),
        '禁用存储后仍能求解且历史不会假报成功');
      expect(window.__errors.length===0,'历史存储不可用时不引发JS错误');
    `);
  } finally {
    await sess.cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hook.identifier }, sess.sessionId);
  }
};
