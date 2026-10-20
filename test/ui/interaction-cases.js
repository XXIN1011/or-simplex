'use strict';
const {sleep} = require('../../lib/chrome');
module.exports = async function interactionCases(sess, check, url) {
  await sess.navigate(url + '#/simplex', 200);
  const modules = [
    ['simplex','simplexPanel','inTbl','solveBtn','result','banners'],
    ['sens','sensPanel','sInTbl','sSolveBtn','sBase','sBanners'],
    ['ip','ipPanel','ipInTbl','ipSolveBtn','ipOut','ipBanners'],
    ['assign','asPanel','asInTbl','asSolveBtn','asOut','asBanners'],
    ['transport','tpPanel','tpInTbl','tpSolveBtn','tpOut','tpBanners']
  ];
  for (const m of modules) {
    await sess.evl(`location.hash='#/${m[0]}'`);
    await sleep(60);
    const rows = await sess.evl(`(function(){
      var rows=[], m=${JSON.stringify(m)};
      function q(s){return document.querySelector(s)}
      function expect(ok,label){rows.push({ok:!!ok,label:m[0]+'：'+label})}
      function solve(){document.getElementById(m[3]).click()}
      function edit(v){var input=q('#'+m[2]+' input');input.value=v;input.dispatchEvent(new Event('input',{bubbles:true}));return input}
      q('#'+m[1]+' [data-draft-clear]').click();
      q('#'+m[1]+' [data-guide=sample]').click();solve();
      expect(!!q('#'+m[4]+' .zv'),'示例求解成功');
      var input=q('#'+m[2]+' input');input.focus();edit(input.value);
      expect(document.activeElement===input,'普通输入保留焦点');
      expect(m[0]==='simplex'?q('#result').classList.contains('stale'):!q('#'+m[4]).textContent,'旧结果立即失效');
      expect(/已修改/.test(q('#'+m[5]).textContent),'失效反馈可见');
      var notice=q('#'+m[5]).firstChild;edit(input.value);edit(input.value);
      expect(q('#'+m[5]).firstChild===notice,'重复输入保留同一提示节点');
      if(m[0]==='simplex')expect(/修改前/.test(q('#banners').textContent) && /修改前/.test(q('#result h2').textContent) && q('#result .result-extra').hidden && q('#result [data-jump=analysis]').disabled,'保留旧结果明确对应旧题并禁用扩展分析入口');
      solve();expect(!!q('#'+m[4]+' .zv') && !/已修改/.test(q('#'+m[5]).textContent),'重新求解解除失效');
      edit('1/0');solve();
      expect(document.activeElement===q('#'+m[2]+' [aria-invalid=true]'),'校验失败定位已标记错误');
      edit('2');solve();expect(!!q('#'+m[4]+' .zv'),'修正输入后成功求解');
      return rows;
    })()`);
    rows.forEach(r => check(r.ok,r.label));
  }
  await sess.evl("location.hash='#/simplex'"); await sleep(60);
  check(await sess.evl(`(function(){var b=document.querySelector('#inTbl button.delvar');b.focus();b.click();return document.activeElement===document.querySelector('#inTbl button.delvar')})()`), '删除约束后焦点移到相邻删除入口');
  await sess.evl(`document.querySelector('#inTbl input').focus();location.hash='#/settings'`); await sleep(80);
  check(await sess.evl(`document.activeElement===document.querySelector('#mod-settings h1')`), '切页后焦点不留在隐藏模块');
  check(await sess.evl(`Array.prototype.every.call(document.querySelectorAll('#ipTypes button'),function(b){return b.getAttribute('aria-pressed')===String(b.classList.contains('on'))})`), '整数变量类型选中状态可由读屏识别');
  const hook = await sess.cdp.send('Page.addScriptToEvaluateOnNewDocument', {source:"Object.defineProperty(window,'localStorage',{get:function(){throw new Error('disabled')}})"},sess.sessionId);
  try {
    await sess.navigate('about:blank',0);
    await sess.navigate(url+'#/settings',200);
    await sess.evl(`document.querySelector('#themeSeg [data-mode=dark]').click()`);
    await sess.setMedia('light');
    check(await sess.evl(`document.documentElement.dataset.theme==='dark' && /未能保存/.test(document.getElementById('themeSaveNote').textContent)`),'存储失败时主题本次生效且如实反馈');
    for (const m of modules) {
      check(await sess.evl(`(function(){document.querySelector('#${m[1]} [data-guide=sample]').click();document.getElementById('${m[3]}').click();return !!document.querySelector('#${m[4]} .zv')})()`),m[0]+'：存储不可用仍可求解');
    }
    check(await sess.evl('window.__errors.length===0'),'存储不可用操作链无运行错误');
  } finally {
    await sess.cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:hook.identifier},sess.sessionId);
    await sess.clearMedia();
  }
};
