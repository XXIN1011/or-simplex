'use strict';

module.exports = async function workflowCases(sess, check, url) {
  await sess.navigate('about:blank',0);
  await sess.navigate(url+'#/simplex',200);
  const results = await sess.evl(`(function(){
    var rows=[];
    function expect(ok,label){rows.push({ok:!!ok,label:label})}
    function q(s){return document.querySelector(s)}
    function click(id){document.getElementById(id).click()}
    function sample(mount){q('#'+mount+' [data-guide=sample]').click()}
    function size(mount,n,m){q('#'+mount+' [data-guide=n]').value=n;q('#'+mount+' [data-guide=m]').value=m;q('#'+mount+' [data-guide=apply]').click()}
    sample('simplexPanel');click('solveBtn');
    expect(q('#result .zv').textContent==='14','单纯形示例可直接求解 z=14');
    expect(!!(q('#result .verdict').compareDocumentPosition(q('#result [data-section=iterations]'))&4),'单纯形结论位于迭代之前');
    var fold=q('#result details.result-work');fold.open=false;
    q('#result [data-jump=iterations]').click();
    expect(fold.open && location.hash==='#/simplex','章节跳转展开推导且不破坏路由');
    size('simplexPanel',4,2);
    expect(q('#inTbl').querySelectorAll('thead th.var').length===4 && q('#inTbl').querySelectorAll('[data-k=b]').length===2,'一键设置变量与约束规模');
    expect(q('#inTbl [data-k=c]').value==='2','调整规模保留已有系数');
    expect(q('#result').classList.contains('stale'),'快捷规模设置使旧结果失效');
    click('delVar');expect(q('#simplexPanel [data-guide=n]').value==='3','增减按钮同步规模选择器');
    sample('sensPanel');click('sSolveBtn');expect(q('#sBase .zv').textContent==='14','灵敏度示例可求基准解');
    click('sensGo');
    expect(!!q('#sensOut .verdict') && !!(q('#sensOut .verdict').compareDocumentPosition(q('#sensOut table'))&4),'灵敏度结论位于继续迭代表之前');
    sample('ipPanel');click('ipSolveBtn');
    expect(/求解摘要/.test(q('#ipOut').textContent) && !!q('#ipOut [data-jump=ip-methods]'),'整数规划提供摘要和方法跳转');
    size('ipPanel',4,2);expect(q('#ipTypes').querySelectorAll('[data-vt]').length===4,'快捷规模设置立即同步整数变量类型');
    sample('asPanel');click('asSolveBtn');
    expect(q('#asOut .zv').textContent==='28','指派示例可直接求解 z=28');
    expect(!!(q('#asOut .verdict').compareDocumentPosition(q('#asOut table.mtxout'))&4),'指派结论位于矩阵过程之前');
    size('asPanel',2,3);expect(q('#asInTbl').querySelectorAll('input').length===6,'指派支持快捷设置行列规模');
    expect(!q('#asOut').textContent,'快捷行列设置清除旧结果');
    expect(q('#asPanel [data-guide=n]').value==='2' && q('#asPanel [data-guide=m]').value==='3','指派规模选择器与实际矩阵一致');
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
