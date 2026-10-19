'use strict';
const resizeInput = require('../lib/resize-input');

module.exports = async function workflowCases(sess, check, url) {
  await sess.navigate('about:blank',0);
  await sess.navigate(url+'#/simplex',200);
  const results = await sess.evl(`(function(){
    var rows=[];
    function expect(ok,label){rows.push({ok:!!ok,label:label})}
    function q(s){return document.querySelector(s)}
    function click(id){document.getElementById(id).click()}
    function sample(mount){q('#'+mount+' [data-guide=sample]').click()}
    ${resizeInput.toString()}
    function size(mount,n,m){resizeInput(mount,n,m)}
    expect(!document.querySelector('.guide-size,[data-guide=n],[data-guide=m],[data-guide=apply]'),'所有模块移除自定义题目规模控件');
    sample('simplexPanel');click('solveBtn');
    expect(q('#result .zv').textContent==='14','单纯形示例可直接求解 z=14');
    expect(!!(q('#result .verdict').compareDocumentPosition(q('#result [data-section=iterations]'))&4),'单纯形结论位于迭代之前');
    expect(!!(q('#result [data-section=iterations]').compareDocumentPosition(q('#result [data-section=analysis]'))&4),'单纯形计算过程位于扩展分析之前');
    var extra=q('#result details.result-extra');
    expect(!extra.open && q('#result details.result-work').open,'计算过程默认展开，扩展分析默认收起');
    q('#result [data-jump=analysis]').click();
    expect(extra.open && document.activeElement===q('#result [data-section=analysis]'),'扩展分析跳转自动展开并定位焦点');
    extra.open=false;
    var fold=q('#result details.result-work');fold.open=false;
    q('#result [data-jump=iterations]').click();
    expect(fold.open && location.hash==='#/simplex','章节跳转展开推导且不破坏路由');
    size('simplexPanel',4,2);
    expect(q('#inTbl').querySelectorAll('thead th.var').length===4 && q('#inTbl').querySelectorAll('[data-k=b]').length===2,'用增减按钮编辑变量与约束');
    expect(q('#inTbl [data-k=c]').value==='2','调整规模保留已有系数');
    expect(q('#result').classList.contains('stale'),'增减变量使旧结果失效');
    click('delVar');expect(q('#inTbl').querySelectorAll('[data-k=c]').length===3,'减变量立即更新输入表');
    sample('sensPanel');click('sSolveBtn');expect(q('#sBase .zv').textContent==='14','灵敏度示例可求基准解');
    click('sensGo');
    expect(!!q('#sensOut .verdict') && !!(q('#sensOut .verdict').compareDocumentPosition(q('#sensOut table'))&4),'灵敏度结论位于继续迭代表之前');
    sample('ipPanel');click('ipSolveBtn');
    expect(/求解摘要/.test(q('#ipOut').textContent) && !!q('#ipOut [data-jump=ip-methods]'),'整数规划提供摘要和方法跳转');
    size('ipPanel',4,2);expect(q('#ipTypes').querySelectorAll('[data-vt]').length===4,'增减变量立即同步整数变量类型');
    sample('asPanel');click('asSolveBtn');
    expect(q('#asOut .zv').textContent==='28','指派示例可直接求解 z=28');
    expect(!!(q('#asOut .verdict').compareDocumentPosition(q('#asOut table.mtxout'))&4),'指派结论位于矩阵过程之前');
    size('asPanel',2,3);expect(q('#asInTbl').querySelectorAll('input').length===6,'指派用增减按钮编辑行列');
    expect(!q('#asOut').textContent,'增减行列清除旧结果');
    expect(q('#asInTbl').querySelectorAll('tbody th').length===2 && q('#asInTbl').querySelectorAll('thead th.colh').length===3,'指派行列与输入矩阵一致');
    expect(window.__errors.length===0,'新输入与结果流程全程无 JS 错误');
    return rows;
  })()`);
  results.forEach(r=>check(r.ok,r.label));
  await sess.evl("document.querySelector('#simplexPanel [data-guide=sample]').click();document.getElementById('solveBtn').click()");
  for (const width of [320,390,1280]) {
    await sess.cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600},sess.sessionId);
    await sess.evl("location.hash='#/simplex';document.documentElement.style.scrollBehavior='auto';window.scrollTo({top:0,behavior:'instant'})");
    await require('../../lib/chrome.js').sleep(150);
    check(await sess.evl('document.documentElement.scrollWidth<=window.innerWidth+1'),'输入与结果布局无横向溢出 '+width+'px');
    await sess.saveShot('preview/workflow-input-'+width+'.png',{captureBeyondViewport:false});
    await sess.evl("document.getElementById('result').scrollIntoView({behavior:'instant',block:'start'})");
    await sess.saveShot('preview/workflow-result-'+width+'.png',{captureBeyondViewport:false});
    if (width===1280) {
      await sess.evl("location.hash='#/'");
      await require('../../lib/chrome.js').sleep(100);
      check(await sess.evl("getComputedStyle(document.getElementById('mod-simplex')).display==='none'"),'桌面双栏结果切回首页后正确隐藏');
    }
  }
  await sess.cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true},sess.sessionId);
  await sess.evl("location.hash='#/simplex';document.querySelector('#themeSeg [data-mode=dark]').click();window.scrollTo({top:0,behavior:'instant'})");
  await require('../../lib/chrome.js').sleep(100);
  await sess.saveShot('preview/workflow-dark.png',{captureBeyondViewport:false});
};
