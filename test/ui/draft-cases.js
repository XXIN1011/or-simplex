'use strict';
const HELPERS = `(function(){
  function q(s){return document.querySelector(s)}
  function click(id){document.getElementById(id).click()}
  function set(s,value,event){var e=q(s);e.value=value;e.dispatchEvent(new Event(event||'input',{bubbles:true}))}
  function sample(id){q('#'+id+' [data-guide=sample]').click()}
  function clear(id){q('#'+id+' [data-draft-clear]').click()}
  window.__D={q:q,click:click,set:set,sample:sample,clear:clear};
})()`;

module.exports = async function draftCases(sess, check, url) {
  async function reload() {
    await sess.navigate('about:blank', 0);
    await sess.navigate(url + '#/simplex', 250);
    await sess.evl(HELPERS);
  }
  async function checks(code) {
    const rows = await sess.evl(`(function(){
      var rows=[],q=__D.q,click=__D.click,set=__D.set,sample=__D.sample,clear=__D.clear;
      function expect(ok,label){rows.push({ok:!!ok,label:label})}
      ${code}
      return rows;
    })()`);
    rows.forEach(r => check(r.ok, r.label));
  }
  await reload();
  await checks(`
    ['simplexPanel','sensPanel','ipPanel','asPanel'].forEach(clear);
    sample('simplexPanel');q('#dirSeg [data-dir=min]').click();click('addVar');click('addCon');
    set('#inTbl [data-k=c][data-j="0"]','1e');
    set('#inTbl [data-k=a][data-i="3"][data-j="2"]','−2');
    set('#inTbl select[data-i="3"]','>=','change');set('#inTbl [data-k=b][data-i="3"]','4');
    sample('ipPanel');click('ipAddVar');q('#ipTypes [data-vt="0"] [data-t=bin]').click();
    q('#ipTypes [data-vt="1"] [data-t=cont]').click();set('#ipInTbl [data-k=c][data-j="2"]','5');
    sample('asPanel');q('#asDirSeg [data-dir=max]').click();click('asAddCol');
    set('#asInTbl [data-i="0"][data-j="0"]','×');set('#asInTbl [data-i="1"][data-j="1"]','1e3');
    sample('sensPanel');click('sSolveBtn');q('#sensTabs [data-t=a]').click();
    set('#sensForm [data-f=a-con]','1','change');set('#sensForm [data-f=a-var]','1','change');
    set('#sensForm [data-f=a-val]','1e');
    expect(Object.keys(localStorage).filter(function(k){return k.indexOf('or-simplex-draft:')===0}).length===4,
      '四个模块分别覆盖保存一道当前题目');
  `);
  // 最后一格输入后直接重载，没有防抖等待或额外的求解动作。
  await reload();
  await checks(`
    expect(q('#inTbl').querySelectorAll('thead th.var').length===3
      && q('#inTbl').querySelectorAll('[data-k=b]').length===4,'刷新恢复变量数与约束数');
    expect(q('#dirSeg [data-dir=min]').getAttribute('aria-pressed')==='true','刷新恢复优化方向');
    expect(q('#inTbl [data-k=c][data-j="0"]').value==='1e'
      && q('#inTbl [data-k=c][data-j="0"]').getAttribute('aria-invalid')==='true','刷新保留未完成数字并继续标注错误');
    expect(q('#inTbl [data-k=a][data-i="3"][data-j="2"]').value==='−2'
      && q('#inTbl select[data-i="3"]').value==='>=' && q('#inTbl [data-k=b][data-i="3"]').value==='4',
      '刷新恢复约束系数、关系符和最后一次右端项输入');
    expect(!q('#result').textContent && !q('#sBase').textContent && !q('#ipOut').textContent && !q('#asOut').textContent,
      '只恢复题目，不显示上次计算结果');
    expect(/已恢复/.test(q('#simplexPanel [role=status]').textContent),'界面明确提示已恢复且需重新求解');
    expect(q('#ipInTbl').querySelectorAll('thead th.var').length===3
      && q('#ipInTbl [data-k=c][data-j="2"]').value==='5','整数题恢复新增变量及其系数');
    expect(q('#ipTypes [data-vt="0"] .on').dataset.t==='bin'
      && q('#ipTypes [data-vt="1"] .on').dataset.t==='cont'
      && q('#ipTypes [data-vt="2"] .on').dataset.t==='int','整数题恢复0-1、连续、整数三种变量类型');
    expect(q('#asInTbl').querySelectorAll('input').length===20
      && q('#asInTbl [data-i="0"][data-j="0"]').value==='×'
      && q('#asInTbl [data-i="1"][data-j="1"]').value==='1e3'
      && q('#asDirSeg [data-dir=max]').getAttribute('aria-pressed')==='true','指派题恢复矩阵规模、方向和禁止指派原文');
    click('asSolveBtn');expect(!!q('#asOut .zv'),'恢复的指派矩阵可直接求解');
    click('ipSolveBtn');expect(!!q('#ipOut .verdict'),'恢复的整数题可直接求解');
    expect(!q('#sensForm'),'灵敏度恢复后先等待重新求基准解');
    click('sSolveBtn');
    expect(q('#sBase .zv').textContent==='14' && q('#sensTabs .on').dataset.t==='a'
      && q('#sensForm [data-f=a-con]').value==='1' && q('#sensForm [data-f=a-var]').value==='1'
      && q('#sensForm [data-f=a-val]').value==='1e','基准重新求解后恢复技术系数场景及未完成输入');
    expect(q('#sensForm [data-f=a-val]').getAttribute('aria-invalid')==='true','恢复的非法场景输入仍标注错误');
    set('#sensForm [data-f=a-val]','2');click('sensGo');expect(!!q('#sensOut .verdict'),'恢复的场景修正后可以分析');
    q('#sensTabs [data-t=param]').click();q('#pKind [data-k=b]').click();set('#sensForm [data-f=pe][data-i="2"]','−3');
    sample('simplexPanel');click('solveBtn');expect(q('#result .zv').textContent==='14','恢复后可载入另一题并求解');
    var theme=localStorage.getItem('or-theme');clear('simplexPanel');
    expect(!q('#result').textContent && !q('#inTbl [data-k=c]')
      && !q('#inTbl [data-k=b]'),'清空当前题目同时清除旧结果');
    expect(localStorage.getItem('or-simplex-draft:simplex')===null
      && !!localStorage.getItem('or-simplex-draft:ip') && localStorage.getItem('or-theme')===theme,
      '清空只删除本模块草稿，其他模块与主题保持各自状态');
    expect(window.__errors.length===0,'保存、恢复与重新求解全程无JS错误');
  `);
  await reload();
  await checks(`
    expect(!q('#inTbl [data-k=c]') && !q('#inTbl [data-k=b]'),'清空后刷新不会重新出现旧题');
    click('sSolveBtn');expect(q('#sensTabs .on').dataset.t==='param'
      && q('#pKind .on').dataset.k==='b' && q('#sensForm [data-f=pe][data-i="2"]').value==='−3',
      '参数分析恢复右端项方向和参数系数');
    set('#sInTbl [data-k=c][data-j="0"]','4');click('sSolveBtn');
    expect(q('#sensTabs .on').dataset.t==='c','修改基准题后清除不再适用的旧场景');
    localStorage.setItem('or-simplex-draft:simplex','{broken');
    localStorage.setItem('or-simplex-draft:sens',JSON.stringify({version:2,data:{}}));
    localStorage.setItem('or-simplex-draft:ip',JSON.stringify({version:1,data:{direction:'max',c:[1],constraints:[],vtypes:['bad']}}));
    localStorage.setItem('or-simplex-draft:assign',JSON.stringify({version:1,data:{direction:'min',rows:9,cols:1,cells:[]}}));
  `);
  await reload();
  await checks(`
    expect(['simplexPanel','sensPanel','ipPanel','asPanel'].every(function(id){return /无法读取/.test(q('#'+id+' [role=status]').textContent)}),
      '损坏、旧版本和非法结构的草稿被安全忽略并提示');
    sample('simplexPanel');click('solveBtn');expect(q('#result .zv').textContent==='14','坏草稿不妨碍重新输入和求解');
    expect(window.__errors.length===0,'坏草稿不会引发页面启动错误');
  `);
  const hook = await sess.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "Object.defineProperty(window,'localStorage',{get:function(){throw new Error('storage disabled')}});"
  }, sess.sessionId);
  try {
    await reload();
    await checks(`
      expect(/无法保存/.test(q('#simplexPanel [role=status]').textContent),'浏览器禁止存储时明确显示无法保存');
      sample('simplexPanel');click('solveBtn');expect(q('#result .zv').textContent==='14','浏览器禁止存储时仍可正常录题和求解');
      expect(/未能保存/.test(q('#simplexPanel [role=status]').textContent),'保存失败不会显示已保存');
      expect(window.__errors.length===0,'存储不可用时全程无JS错误');
    `);
  } finally {
    await sess.cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hook.identifier }, sess.sessionId);
  }
};
