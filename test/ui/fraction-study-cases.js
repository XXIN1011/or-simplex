'use strict';
const resizeInput = require('../lib/resize-input');

module.exports = async function fractionStudyCases(sess, check, url) {
  async function reload() {
    await sess.navigate('about:blank', 0);
    await sess.navigate(url + '#/simplex', 250);
  }
  async function checks(code) {
    const rows = await sess.evl(`(function(){
      var rows=[];
      function q(s){return document.querySelector(s)}
      function click(id){document.getElementById(id).click()}
      function set(s,value,event){var el=q(s);el.value=value;el.dispatchEvent(new Event(event||'input',{bubbles:true}))}
      function sample(id){q('#'+id+' [data-guide=sample]').click()}
      ${resizeInput.toString()}
      function size(id,n,m){resizeInput(id,n,m)}
      function expect(ok,label){rows.push({ok:!!ok,label:label})}
      function visible(box){return box.querySelectorAll('[data-study-step]:not([hidden])').length}
      function single(box){box.querySelector('[data-study-mode=single]').click()}
      ${code}
      return rows;
    })()`);
    rows.forEach(r => check(r.ok, r.label));
  }
  await reload();
  await checks(`
    Array.prototype.forEach.call(document.querySelectorAll('[data-draft-clear]'),function(b){b.click()});
    size('simplexPanel',1,1);
    set('#inTbl [data-k=c]','1/2');set('#inTbl [data-k=a]','1/3');set('#inTbl [data-k=b]','1/2');click('solveBtn');
    expect(q('#result .zv').textContent==='3/4' && q('#result .sol .v').textContent==='3/2','单纯形目标、约束与右端项均按分数求解');
    expect(q('#inTbl [data-k=c]').value==='1/2' && q('#inTbl [data-k=c]').getAttribute('aria-invalid')==='false','合法分数保留原文且不标红');
    expect(q('#inTbl [data-k=c]').getAttribute('inputmode')==='text','手机输入允许键入分数除号');
    size('ipPanel',1,1);set('#ipInTbl [data-k=c]','3/2');set('#ipInTbl [data-k=a]','2/3');set('#ipInTbl [data-k=b]','5/3');click('ipSolveBtn');
    expect(q('#ipOut .zv').textContent==='3','整数规划分数输入得到整数最优解x=2、z=3');
    size('sensPanel',1,1);set('#sInTbl [data-k=c]','1/2');set('#sInTbl [data-k=a]','1/3');set('#sInTbl [data-k=b]','1/2');click('sSolveBtn');
    set('#sensForm [data-f=c]','3/4');click('sensGo');
    expect(q('#sBase .zv').textContent==='3/4' && q('#sensOut .zv').textContent==='9/8','灵敏度基准题和变化条件均接受分数');
    size('asPanel',1,1);set('#asInTbl input','−3/4');click('asSolveBtn');
    expect(q('#asOut .zv').textContent==='-3/4','指派矩阵接受带数学负号的分数');
    set('#asInTbl input','1/0');click('asSolveBtn');
    expect(q('#asInTbl input').getAttribute('aria-invalid')==='true' && !q('#asOut').textContent,'指派分母为零仍拒绝求解');
    set('#asInTbl input','−3/4');click('asSolveBtn');
    expect(window.__errors.length===0,'四模块分数录题与求解无JS错误');
  `);
  await reload();
  await checks(`
    expect(q('#inTbl [data-k=c]').value==='1/2' && q('#ipInTbl [data-k=c]').value==='3/2'
      && q('#sInTbl [data-k=a]').value==='1/3' && q('#asInTbl input').value==='−3/4','刷新后四模块恢复分数原文');
    click('sSolveBtn');expect(q('#sensForm [data-f=c]').value==='3/4','重新求基准解后恢复分数变化条件');
    click('sensGo');var sens=q('#sensOut [data-study]');single(sens);
    expect(visible(sens)===1 && sens.querySelector('[data-study-prev]').disabled && sens.querySelector('[data-study-next]').disabled,
      '灵敏度无需换基时单步模式只有终点，两端按钮均禁用');
    expect(q('#sensOut .zv').textContent==='9/8','切换学习方式不改变分析结论');
    set('#inTbl [data-k=c]','1/');click('solveBtn');
    expect(q('#inTbl [data-k=c]').value==='1/' && q('#inTbl [data-k=c]').getAttribute('aria-invalid')==='true'
      && !q('#result').classList.contains('show'),'尚未填完的分数不被截断或当成零');
  `);
  await reload();
  await checks(`
    expect(q('#inTbl [data-k=c]').value==='1/' && q('#inTbl [data-k=c]').getAttribute('aria-invalid')==='true','刷新保留未完成分数及错误标注');
    sample('simplexPanel');click('solveBtn');var box=q('#result [data-study]');
    var count=box.querySelectorAll('[data-study-step]').length;
    var tables=Array.prototype.map.call(box.querySelectorAll('table.tb'),function(t){return t.textContent}).join('|');
    var saved=localStorage.getItem('or-simplex-draft:simplex');
    expect(count>1 && visible(box)===count && box.querySelector('.study-controls').hidden,'默认展示完整过程，单步导航不占位');
    single(box);
    expect(visible(box)===1 && box.querySelector('[data-study-prev]').disabled && !box.querySelector('[data-study-next]').disabled,
      '进入单步模式从初始表开始，首步不能后退');
    expect(box.querySelector('[data-study-step]:not([hidden]) .pivot')
      && box.querySelector('[data-study-step]:not([hidden]) .explain'),'单步模式保留枢轴高亮与本步讲解');
    box.querySelector('[data-study-next]').click();
    expect(box.querySelector('[data-study-select]').value==='1' && /第 2/.test(box.querySelector('.study-progress').textContent),'下一步同步进度和表格');
    box.querySelector('[data-study-prev]').click();expect(box.querySelector('[data-study-select]').value==='0','上一步可以回看初始表');
    var picker=box.querySelector('[data-study-select]');picker.value=String(count-1);picker.dispatchEvent(new Event('change',{bubbles:true}));
    expect(box.querySelector('[data-study-next]').disabled && visible(box)===1
      && !!box.querySelector('[data-study-step]:not([hidden]) .tag.done'),'跳到末步显示最优表并禁用下一步');
    box.querySelector('[data-study-next]').click();expect(picker.value===String(count-1),'末步不会越界');
    box.querySelector('[data-study-mode=all]').click();expect(visible(box)===count,'切回完整过程恢复全部步骤');
    single(box);expect(picker.value===String(count-1),'来回切换阅读方式保留当前学习位置');
    expect(Array.prototype.map.call(box.querySelectorAll('table.tb'),function(t){return t.textContent}).join('|')===tables
      && q('#result .zv').textContent==='14' && localStorage.getItem('or-simplex-draft:simplex')===saved,
      '学习模式不改动迭代表、最优解或已保存题目');
    click('solveBtn');box=q('#result [data-study]');single(box);
    expect(box.querySelector('[data-study-select]').value==='0','重新求解从新结果的第一步开始');
    size('simplexPanel',1,1);set('#inTbl [data-k=c]','-1/2');set('#inTbl [data-k=a]','1');set('#inTbl [data-k=b]','1');click('solveBtn');
    box=q('#result [data-study]');single(box);
    expect(box.querySelectorAll('[data-study-step]').length===1 && box.querySelector('[data-study-next]').disabled
      && box.querySelector('[data-study-prev]').disabled,'初始表即最优时单步模式可正常显示唯一一步');
    size('simplexPanel',1,0);set('#inTbl [data-k=c]','1/2');click('solveBtn');box=q('#result [data-study]');single(box);
    expect(/无界解/.test(q('#result .vtitle').textContent) && visible(box)===1,'无界终止也保留结论与可查看的终止表');
    click('ipSolveBtn');var relax=q('#ipOut [data-section=ip-relaxation] details.help');relax.open=true;
    var ip=relax.querySelector('[data-study]');single(ip);
    expect(visible(ip)===1 && ip.querySelectorAll('[data-study-step]').length>1,'整数规划松弛迭代支持单步查看');
    size('asPanel',4,4);q('#asDirSeg [data-dir=max]').click();
    [[38,42,31,45],[26,20,35,28],[40,33,29,37],[22,30,41,25]].forEach(function(row,i){
      row.forEach(function(value,j){set('#asInTbl [data-i="'+i+'"][data-j="'+j+'"]',String(value))});
    });
    click('asSolveBtn');
    var assignment=q('#asOut [data-study]'),parts=assignment.querySelectorAll('[data-study-part]');
    parts[0].open=false;single(assignment);
    expect(parts.length>1 && visible(assignment)===1 && parts[0].open
      && assignment.querySelectorAll('[data-study-part]:not([hidden])').length===1,'指派单步查看自动展开当前轮且只显示一个矩阵步骤');
    var steps=Array.prototype.slice.call(assignment.querySelectorAll('[data-study-step]'));
    var second=steps.findIndex(function(s){return /第 2 轮/.test(s.getAttribute('data-step-title'))});
    var ap=assignment.querySelector('[data-study-select]');ap.value=String(second);ap.dispatchEvent(new Event('change',{bubbles:true}));
    expect(parts[0].hidden && !parts[1].hidden && parts[1].open && visible(assignment)===1,'指派步骤可跨轮次跳转并展开正确轮次');
    assignment.querySelector('[data-study-mode=all]').click();
    expect(!parts[0].hidden && !parts[0].open && parts[1].open && q('#asOut .zv').textContent==='151',
      '切回完整指派过程恢复原折叠状态，最优值不变');
    expect(window.__errors.length===0,'完整/单步切换与边界操作全程无JS错误');
    sample('simplexPanel');click('solveBtn');single(q('#result [data-study]'));
  `);
  for (const width of [320, 390, 1280]) {
    await sess.cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 600 }, sess.sessionId);
    await sess.evl("location.hash='#/simplex';document.documentElement.style.scrollBehavior='auto'");
    await require('../../lib/chrome.js').sleep(100);
    await sess.evl("document.querySelector('#result .study-toolbar').scrollIntoView({behavior:'instant',block:'start'})");
    check(await sess.evl('document.documentElement.scrollWidth<=innerWidth+1'), '单步学习布局无横向溢出 ' + width + 'px');
    await sess.saveShot('preview/study-simplex-' + width + '.png', { captureBeyondViewport: false });
  }
  await sess.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sess.sessionId);
  await sess.evl("document.querySelector('#themeSeg [data-mode=dark]').click();document.querySelector('#result .study-toolbar').scrollIntoView({behavior:'instant',block:'start'})");
  await sess.saveShot('preview/study-simplex-dark.png', { captureBeyondViewport: false });
  await sess.evl("document.querySelector('#themeSeg [data-mode=system]').click()");
};
