/* 演示必须与算法快照一致；时间推进、减少动态效果和销毁也要可验证。 */
'use strict';
const {sleep} = require('../../lib/chrome');
module.exports = async function playerCases(sess, run) {
  async function waitFor(expression) {
    const deadline=Date.now()+4000;
    while(Date.now()<deadline) {
      if(await sess.evl(expression)) return;
      await sleep(50);
    }
    // 由随后的功能断言报告失败，不用固定延时掩盖没有发生的状态变化。
  }
  await sess.cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]},sess.sessionId);
  await run(`
    q('#tpDirSeg [data-dir=min]').click();q('#tpPanel [data-guide=sample]').click();click('tpSolveBtn');
    var a=q('[data-kind=allocation]');
    expect(a && a.getAttribute('data-frame')==='0' && a.querySelector('.tp-selected').getAttribute('data-tp-cell')==='0-3','分配演示初始帧选中最小费用格');
    expect(a.querySelectorAll('.tp-tie').length===1,'并列费用候选有文字及边框标识');
    expect(a.querySelector('[data-tp-supply="0"]').textContent==='20' && a.querySelector('[data-tp-demand="3"]').textContent==='20','分配前显示剩余供需20');
    expect(a.querySelector('[data-tp-cell="0-3"] .tp-value').textContent==='0','演示开始尚未分配');
    a.querySelector('[data-tp-next]').click();
    expect(a.getAttribute('data-frame')==='1' && a.querySelector('.tp-scene').textContent.indexOf('实际分配量 20')>=0,'下一帧确定分配量');
    a.querySelector('[data-tp-next]').click();
    expect(a.querySelector('[data-tp-cell="0-3"] .tp-value').textContent==='20' && a.querySelector('[data-tp-supply="0"]').textContent==='0' && a.querySelector('[data-tp-demand="3"]').textContent==='0','运量与行列剩余量同步更新');
    expect(a.querySelector('.tp-player-objective').textContent.indexOf('40')>=0 && q('#tpOut .zv').textContent==='360','演示目标40与最终目标360独立');
    a.querySelector('[data-tp-prev]').click();a.querySelector('[data-tp-reset]').click();
    expect(a.getAttribute('data-frame')==='0' && a.querySelector('[data-tp-prev]').disabled && !a.querySelector('[data-tp-next]').disabled,'重播恢复首帧及按钮边界');
    var p=q('[data-kind=pivot]');
    expect(p.querySelectorAll('.tp-cycle').length===0 && p.querySelector('.tp-player-objective').textContent.indexOf('430')>=0,'回路首帧保留调整前目标430');
    for(var k=1;k<=4;k++){
      p.querySelector('[data-tp-next]').click();
      expect(p.querySelectorAll('.tp-cycle').length===k && p.querySelectorAll('.tp-route-visited').length===k,'按顺序揭示回路正负号 '+k);
    }
    expect(p.querySelector('.tp-path polyline').getAttribute('points').trim().split(' ').length===5,'四格回路路径闭合回起点');
    expect(p.querySelector('.tp-scene').textContent.indexOf('路径已闭合')>=0,'闭合状态有文字说明');
    p.querySelector('[data-tp-next]').click();
    expect(p.querySelector('.tp-scene').textContent.indexOf('θ = 负号格的最小运量 = 10')>=0 && p.querySelector('.tp-scene').textContent.indexOf('离基格')>=0,'从负号格确定theta及离基格');
    p.querySelector('[data-tp-next]').click();
    expect(p.querySelector('[data-tp-cell="2-3"] .tp-value').textContent==='10' && p.querySelector('[data-tp-cell="0-3"] .tp-value').textContent==='10','回路正负号格同步更新运量');
    expect(p.querySelector('.tp-player-objective').textContent.indexOf('430 → 380')>=0 && p.querySelector('[data-tp-next]').disabled,'演示显示本轮费用变化并停止于末帧');
    expect(p.querySelectorAll('.tp-cycle.tp-blocked').length===0,'回路不跨禁运格');
    p.querySelector('[data-tp-prev]').click();
    expect(p.querySelector('[data-tp-cell="2-3"] .tp-value').textContent==='0','回退时准确恢复调整前快照');
    p.querySelector('[data-tp-reset]').click();
    var box=q('#tpOut [data-study]');box.querySelector('[data-study-mode=single]').click();
    expect(box.querySelectorAll('[data-study-step]:not([hidden])').length===1,'分配演示与单步学习共存');
    a=q('[data-kind=allocation]');a.scrollIntoView({block:'start',behavior:'instant'});
    a.querySelector('[data-tp-speed]').value='600';
  `);
  // 让 IntersectionObserver 收到定位后的可见性，再模拟用户点击可见控件。
  await sleep(100);
  await run(`
    var a=q('[data-kind=allocation]');a.querySelector('[data-tp-play]').click();
    expect(a.getAttribute('data-playing')==='true' && a.querySelector('[data-tp-play]').textContent==='暂停','显式播放启动且可暂停');
  `);
  await waitFor("+document.querySelector('[data-kind=allocation]').getAttribute('data-frame')>=1");
  await run(`
    var a=q('[data-kind=allocation]');
    expect(+a.getAttribute('data-frame')>=1,'计时器推进演示帧');
    if(a.getAttribute('data-playing')==='true')a.querySelector('[data-tp-play]').click();
    window.__tpPausedFrame=a.getAttribute('data-frame');
    expect(a.getAttribute('data-playing')==='false','暂停停止播放状态');
  `);
  await sleep(750);
  await run(`
    var a=q('[data-kind=allocation]');
    expect(a.getAttribute('data-frame')===window.__tpPausedFrame,'暂停后计时器不继续推进');
    a.querySelector('[data-tp-play]').click();
  `);
  await waitFor("document.querySelector('[data-kind=allocation]').getAttribute('data-frame')==='2' && document.querySelector('[data-kind=allocation]').getAttribute('data-playing')==='false'");
  await run(`
    var a=q('[data-kind=allocation]');
    expect(a.getAttribute('data-frame')==='2' && a.getAttribute('data-playing')==='false','自动播放到末帧后停止');
    a.querySelector('[data-tp-reset]').click();a.querySelector('[data-tp-play]').click();
    q('#tpOut [data-study-next]').click();
    expect(a.getAttribute('data-playing')==='false','切换学习步骤暂停被隐藏演示');
    q('#tpOut [data-study-prev]').click();a.scrollIntoView({block:'start',behavior:'instant'});a.querySelector('[data-tp-play]').click();
  `);
  await sess.evl("location.hash='#/'");
  await sleep(100);
  await run(`expect(q('[data-kind=allocation]').getAttribute('data-playing')==='false','离开运输模块暂停动画');`);
  await sess.evl("location.hash='#/transport'");
  await sleep(100);
  await sess.cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sess.sessionId);
  await sleep(100);
  await run(`
    var a=q('[data-kind=allocation]');
    expect(a.querySelector('[data-tp-play]').disabled && !a.querySelector('.tp-motion-note').hidden,'减少动态效果模式禁用计时播放并解释');
    a.querySelector('[data-tp-next]').click();
    expect(a.getAttribute('data-frame')==='1','减少动态效果模式仍可手动逐帧');
    value('cells',0,0,7);expect(!q('#tpOut').textContent,'编辑题目清除演示及旧结果');
  `);
  await sleep(750);
  await run(`expect(!q('#tpOut').textContent && window.__errors.length===0,'销毁后无延迟回写或JS错误');`);
  await sess.cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]},sess.sessionId);
  await run(`
    q('#tpPanel [data-transport-forbidden-sample]').click();click('tpSolveBtn');
    var a=q('[data-kind=allocation]');a.querySelector('[data-tp-next]').click();
    expect(a.querySelectorAll('.tp-cut-label').length>=1 && a.querySelector('.tp-scene').textContent.indexOf('后续将有 5')>=0,'禁运保护帧突出瓶颈与无法匹配量');
    a.querySelector('[data-tp-next]').click();
    expect(a.querySelector('[data-tp-cell="0-0"] .tp-value').textContent==='0' && !a.querySelector('[data-tp-cell="0-0"] .tp-basis'),'禁运保护跳过零分配格且不伪造基身份');
    value('cells',0,1,'X');value('cells',1,1,'X');click('tpSolveBtn');
    expect(q('#tpOut .tp-cut-label') && !q('#tpOut [data-transport-player]'),'无解瓶颈在原表突出且不播放伪方案');
    size(1,1);value('cells',0,0,'1/2');value('supply',0,null,'3/4');value('demand',0,null,'3/4');click('tpSolveBtn');
    a=q('[data-kind=allocation]');a.querySelector('[data-tp-next]').click();a.querySelector('[data-tp-next]').click();
    expect(a.querySelector('[data-tp-cell="0-0"] .tp-value').textContent==='3/4' && a.querySelector('.tp-player-objective').textContent.indexOf('3/8')>=0,'分数运量和目标在演示中正确显示');
    q('#tpDirSeg [data-dir=max]').click();click('tpSolveBtn');
    a=q('[data-kind=allocation]');a.querySelector('[data-tp-next]').click();a.querySelector('[data-tp-next]').click();
    expect(a.querySelector('.tp-player-objective').textContent.indexOf('3/8')>=0,'最大收益演示使用原目标而非取负后的工作目标');
    q('#tpDirSeg [data-dir=min]').click();size(2,3);
    var costs=[[5,1,3],[0,4,2]];
    for(var i=0;i<2;i++){value('supply',i,null,1);for(var j=0;j<3;j++)value('cells',i,j,costs[i][j])}
    for(var j=0;j<3;j++)value('demand',j,null,j===0?0:1);click('tpSolveBtn');
    var degenerate=q('[data-kind=pivot]');
    while(!degenerate.querySelector('[data-tp-next]').disabled)degenerate.querySelector('[data-tp-next]').click();
    expect(degenerate.querySelector('.tp-scene').textContent.indexOf('θ = 0')>=0 && degenerate.querySelector('[data-tp-cell="1-0"] .tp-basis') && !degenerate.querySelector('[data-tp-cell="0-0"] .tp-basis'),'退化闭回路零运量不变但基身份正确切换');
    q('#tpPanel [data-guide=sample]').click();click('tpSolveBtn');
    q('#tpOut [data-study-mode=single]').click();
    var p=q('[data-kind=pivot]'),picker=q('#tpOut [data-study-select]');
    picker.value=p.getAttribute('data-transport-player');picker.dispatchEvent(new Event('change',{bubbles:true}));
    p.querySelector('[data-tp-next]').click();p.querySelector('[data-tp-next]').click();
  `);
  for (const width of [320,390,1280]) {
    await sess.cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600},sess.sessionId);
    await sleep(80); // 等待浏览器派发 resize 并重绘 SVG 与横向定位。
    await run(`
      var p=q('[data-kind=pivot]');
      expect(document.documentElement.scrollWidth<=window.innerWidth+1,'演示表无页面横向溢出 ${width}px');
      expect(p.querySelector('[data-tp-play]').getBoundingClientRect().height>=44,'演示控制触摸目标 ${width}px');
      var current=p.querySelector('.tp-active').getBoundingClientRect(),left=p.querySelector('tbody th').getBoundingClientRect(),right=p.querySelector('tbody td:last-child').getBoundingClientRect();
      var fits=current.left>=left.right-1 && current.right<=right.left+1;
      expect(fits,'自动定位当前格且不被固定列遮挡 ${width}px'+(fits?'':'；格宽 '+current.width+'，可视空间 '+(right.left-left.right)));
      expect(Math.abs(p.querySelector('thead th:last-child').getBoundingClientRect().left-right.left)<=1,'固定供应列标题与运量对齐 ${width}px');
      var stage=p.querySelector('.tp-stage'),line=p.querySelector('.tp-path polyline'),r=stage.getBoundingClientRect();
      expect(line && line.getAttribute('points').split(' ').every(function(point){var a=point.split(',').map(Number);return a[0]>=0 && a[0]<=r.width+1 && a[1]>=0 && a[1]<=r.height+1}),'回路路径位于运输表内 ${width}px');
    `);
  }
  await sess.cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true},sess.sessionId);
  if(process.env.OR_TRANSPORT_SHOTS) {
    for(const mode of ['light','dark']) {
      await sess.evl(`document.querySelector('#themeSeg [data-mode=${mode}]').click();document.querySelector('[data-kind=pivot]').scrollIntoView({block:'start',behavior:'instant'})`);
      await sleep(250);
      await sess.saveShot(`preview/transport-player-${mode}.png`,{captureBeyondViewport:false});
    }
  }
  await sess.evl("location.hash='#/'");await sleep(100);
  await run(`
    var cards=document.querySelectorAll('.module-list .modcard'),a=getComputedStyle(cards[3]),b=getComputedStyle(cards[4]);
    expect(cards.length===5 && a.borderBottomLeftRadius==='0px' && b.borderBottomLeftRadius!=='0px','首页按实际首尾统一圆角，运输为最后一项');
    expect(a.borderBottomColor!=='rgba(0, 0, 0, 0)' && b.borderBottomColor==='rgba(0, 0, 0, 0)','指派与运输之间保留分隔线，运输末尾收口');
    expect(q('.hero p').textContent.indexOf('运输问题')>=0,'首页介绍包含运输模块');
  `);
  if(process.env.OR_TRANSPORT_SHOTS) {await sess.evl('window.scrollTo(0,300)');await sess.saveShot('preview/home-transport-after.png',{captureBeyondViewport:false});}
  await sess.evl("location.hash='#/transport'");await sleep(100);
  await run(`q('#tpOut [data-study-mode=all]').click();q('#tpPanel [data-transport-forbidden-sample]').click();click('tpSolveBtn');delete window.__tpPausedFrame;`);
};
