/* 演示必须与算法快照一致；时间推进、减少动态效果和销毁也要可验证。
   最小元素分配只保留静态步骤表，播放控件只属于闭回路。 */
'use strict';
const {sleep} = require('../../lib/chrome');
module.exports = async function playerCases(sess, run) {
  async function waitFor(expression, ms) {
    const deadline=Date.now()+(ms||6000);
    while(Date.now()<deadline) {
      if(await sess.evl(expression)) return;
      await sleep(50);
    }
    // 由随后的功能断言报告失败，不用固定延时掩盖没有发生的状态变化。
  }
  await sess.cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]},sess.sessionId);
  await run(`
    q('#tpPanel [data-guide=sample]').click();
    var rewards=[[14,4,15,18],[11,18,15,12],[5,7,9,14]];
    for(var i=0;i<3;i++)for(var j=0;j<4;j++)value('cells',i,j,rewards[i][j]);
    q('#tpDirSeg [data-dir=max]').click();click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='1140','最大收益题最终还原1140');
    var steps=q('#tpOut [data-study]'),last=steps.querySelector('.study-step:last-child');
    var initial=q('#tpOut .study-step[data-step-title^="初始可行"]');
    expect(initial.querySelector('[data-tp-cell="0-0"] .tp-cost').textContent==='4'
      && initial.textContent.indexOf('最小化工作目标值 280')>=0,'初始方案角标和目标使用转换后费用');
    var alloc=q('#tpOut .study-step[data-step-title^="最小元素分配"]');
    expect(alloc.querySelector('[data-tp-cell="0-3"] .tp-cost').textContent==='0','最小元素分配表使用转换后费用');
    var p=q('#tpOut [data-kind=pivot]');
    expect(p.querySelector('[data-tp-cell="0-0"] .tp-cost').textContent==='4'
      && p.querySelector('.tp-player-objective').textContent.indexOf('最小化工作目标值 280')>=0,'闭回路首帧使用工作费用和工作目标');
    while(!p.querySelector('[data-tp-next]').disabled)p.querySelector('[data-tp-next]').click();
    expect(p.querySelector('[data-tp-cell="0-0"] .tp-cost').textContent==='4'
      && p.querySelector('.tp-player-objective').textContent.indexOf('280 → 230')>=0,'闭回路末帧仍显示最小化目标下降');
    p.querySelector('[data-tp-prev]').click();
    expect(p.querySelector('.tp-player-objective').textContent.indexOf('280')>=0,'回退演示恢复调整前工作目标');
    var pot=q('#tpOut .study-step[data-step-title="位势法：最优性检验"]');
    expect(pot.textContent.indexOf('最小化工作目标值 210')>=0,'最优性检验使用最终最小化工作目标');
    expect(last.getAttribute('data-step-title')==='最大收益还原'
      && last.querySelector('[data-tp-cell="0-0"] .tp-cost').textContent==='14'
      && last.textContent.indexOf('1140')>=0,'最后一步才切回原收益结算');
    expect(Array.prototype.every.call(steps.querySelectorAll('.study-step'),function(s){
      return s===last || s.textContent.indexOf('原目标')===-1;
    }),'分配、位势和闭回路过程不混用原目标');
  `);
  await run(`
    q('#tpDirSeg [data-dir=min]').click();q('#tpPanel [data-guide=sample]').click();click('tpSolveBtn');
    expect(!q('#tpOut [data-kind=allocation]'),'最小元素分配不再有逐帧演示');
    var alloc=q('#tpOut .study-step[data-step-title^="最小元素分配"]');
    expect(alloc && alloc.querySelector('[data-tp-cell="0-3"].tp-selected') && alloc.querySelectorAll('.tp-tie').length===1,'分配步骤用静态表标出所选格与并列候选');
    var p=q('[data-kind=pivot]');
    expect(p && p.getAttribute('data-frame')==='0','闭回路演示仍从首帧开始');
    expect(p.querySelectorAll('.tp-cycle').length===0 && p.querySelector('.tp-player-objective').textContent.indexOf('430')>=0,'回路首帧保留调整前目标430');
    for(var k=1;k<=4;k++){
      p.querySelector('[data-tp-next]').click();
      expect(p.querySelectorAll('.tp-cycle').length===k && p.querySelectorAll('.tp-route-visited').length===k,'按顺序揭示回路正负号 '+k);
    }
    expect(p.querySelector('.tp-scene').textContent.indexOf('路径已连通')>=0,'最后一格只连通路径，不提前闭合');
    expect(p.querySelectorAll('.tp-path .tp-line-new').length===1,'最后一格只给新增线段描边');
    var drawn=p.querySelector('.tp-path .tp-line:not(.tp-line-new)');
    expect(drawn && drawn.getAttribute('points').trim().split(' ').length===3,'已画好的三段保持静态，不整条重绘');
    p.querySelector('[data-tp-next]').click();
    expect(p.querySelector('.tp-scene').textContent.indexOf('θ = 负号格的最小运量 = 10')>=0 && p.querySelector('.tp-scene').textContent.indexOf('离基格')>=0,'从负号格确定theta及离基格');
    drawn=p.querySelector('.tp-path .tp-line:not(.tp-line-new)');
    var fresh=p.querySelector('.tp-path .tp-line-new');
    var startPoint=drawn.getAttribute('points').trim().split(' ')[0];
    var endPoint=fresh.getAttribute('points').trim().split(' ').slice(-1)[0];
    expect(startPoint===endPoint,'θ 帧的闭合边回到起点');
    p.querySelector('[data-tp-next]').click();
    expect(p.querySelector('[data-tp-cell="2-3"] .tp-value').textContent==='10' && p.querySelector('[data-tp-cell="0-3"] .tp-value').textContent==='10','回路正负号格同步更新运量');
    expect(p.querySelector('.tp-player-objective').textContent.indexOf('430 → 380')>=0 && p.querySelector('[data-tp-next]').disabled,'演示显示本轮费用变化并停止于末帧');
    expect(p.querySelectorAll('.tp-cycle.tp-blocked').length===0,'回路不跨禁运格');
    p.querySelector('[data-tp-prev]').click();
    expect(p.querySelector('[data-tp-cell="2-3"] .tp-value').textContent==='0','回退时准确恢复调整前快照');
    p.querySelector('[data-tp-reset]').click();
    var box=q('#tpOut [data-study]');box.querySelector('[data-study-mode=single]').click();
    var picker=q('#tpOut [data-study-select]');
    picker.value=p.getAttribute('data-transport-player');picker.dispatchEvent(new Event('change',{bubbles:true}));
    expect(box.querySelectorAll('[data-study-step]:not([hidden])').length===1 && q('[data-kind=pivot]'),'单步学习直接进入闭回路步骤');
    q('[data-kind=pivot]').scrollIntoView({block:'start',behavior:'instant'});
    q('[data-kind=pivot] [data-tp-speed]').value='600';
  `);
  // 让 IntersectionObserver 收到定位后的可见性，再模拟用户点击可见控件。
  await sleep(100);
  await run(`
    var p=q('[data-kind=pivot]');
    p.querySelector('[data-tp-play]').click();
    expect(p.getAttribute('data-playing')==='true' && p.querySelector('[data-tp-play]').textContent==='暂停','显式播放启动且可暂停');
  `);
  await waitFor("+document.querySelector('[data-kind=pivot]').getAttribute('data-frame')>=1");
  await run(`
    var p=q('[data-kind=pivot]');
    expect(+p.getAttribute('data-frame')>=1,'计时器推进演示帧');
    if(p.getAttribute('data-playing')==='true')p.querySelector('[data-tp-play]').click();
    window.__tpPausedFrame=p.getAttribute('data-frame');
    expect(p.getAttribute('data-playing')==='false','暂停停止播放状态');
  `);
  await sleep(750);
  await run(`
    var p=q('[data-kind=pivot]');
    expect(p.getAttribute('data-frame')===window.__tpPausedFrame,'暂停后计时器不继续推进');
    p.querySelector('[data-tp-play]').click();
  `);
  await waitFor("document.querySelector('[data-kind=pivot]').getAttribute('data-frame')==='6' && document.querySelector('[data-kind=pivot]').getAttribute('data-playing')==='false'",8000);
  await run(`
    var p=q('[data-kind=pivot]');
    expect(p.getAttribute('data-frame')==='6' && p.getAttribute('data-playing')==='false','自动播放到末帧后停止');
    p.querySelector('[data-tp-reset]').click();p.querySelector('[data-tp-play]').click();
    q('#tpOut [data-study-next]').click();
    expect(p.getAttribute('data-playing')==='false','切换学习步骤暂停被隐藏演示');
    q('#tpOut [data-study-prev]').click();p.scrollIntoView({block:'start',behavior:'instant'});p.querySelector('[data-tp-play]').click();
  `);
  await sess.evl("location.hash='#/'");
  await sleep(100);
  await run(`expect(q('[data-kind=pivot]').getAttribute('data-playing')==='false','离开运输模块暂停动画');`);
  await sess.evl("location.hash='#/transport'");
  await sleep(100);
  await sess.cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sess.sessionId);
  await sleep(100);
  await run(`
    var p=q('[data-kind=pivot]');
    expect(p.querySelector('[data-tp-play]').disabled && !p.querySelector('.tp-motion-note').hidden,'减少动态效果模式禁用计时播放并解释');
    p.querySelector('[data-tp-next]').click();
    expect(p.getAttribute('data-frame')==='1','减少动态效果模式仍可手动逐帧');
    value('cells',0,0,7);expect(!q('#tpOut').textContent,'编辑题目清除演示及旧结果');
  `);
  await sleep(750);
  await run(`expect(!q('#tpOut').textContent && window.__errors.length===0,'销毁后无延迟回写或JS错误');`);
  await sess.cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]},sess.sessionId);
  await run(`
    q('#tpPanel [data-transport-forbidden-sample]').click();click('tpSolveBtn');
    expect(q('#tpOut').textContent.indexOf('剩余网络将有 5')>=0,'防堵路解释留在静态分配步骤');
    var alloc=q('#tpOut .study-step[data-step-title^="最小元素分配"]');
    expect(alloc.querySelector('[data-tp-cell="0-0"] .tp-value').textContent==='0' && !alloc.querySelector('[data-tp-cell="0-0"] .tp-basis'),'禁运保护跳过零分配格且不伪造基身份');
    value('cells',0,1,'M');value('cells',1,1,'M');click('tpSolveBtn');
    expect(q('#tpOut .tp-cut-label') && !q('#tpOut [data-transport-player]'),'无解瓶颈在原表突出且不播放伪方案');
    size(1,1);value('cells',0,0,'1/2');value('supply',0,null,'3/4');value('demand',0,null,'3/4');click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='3/8','分数目标在最终结果中正确显示');
    expect(q('#tpOut [data-tp-cell="0-0"] .tp-value').textContent==='3/4','分数运量在结果表中正确显示');
    q('#tpDirSeg [data-dir=max]').click();click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='3/8','最大收益显示还原后的原目标');
    q('#tpDirSeg [data-dir=min]').click();size(2,3);
    var costs=[[5,1,3],[0,4,2]];
    for(var i=0;i<2;i++){value('supply',i,null,1);for(var j=0;j<3;j++)value('cells',i,j,costs[i][j])}
    for(var j=0;j<3;j++)value('demand',j,null,j===0?0:1);click('tpSolveBtn');
    var degenerate=q('[data-kind=pivot]');
    while(!degenerate.querySelector('[data-tp-next]').disabled)degenerate.querySelector('[data-tp-next]').click();
    expect(degenerate.querySelector('.tp-scene').textContent.indexOf('θ = 0')>=0 && degenerate.querySelector('[data-tp-cell="1-0"] .tp-basis') && !degenerate.querySelector('[data-tp-cell="0-0"] .tp-basis'),'退化闭回路零运量不变但基身份正确切换');
    /* θ=0 只换基：不再单独留一帧“同步调整”，帧数应比 θ>0 的回路少 1 */
    var degText=degenerate.querySelector('.tp-player-progress').textContent;
    var degFrames=parseInt(String(degText).split('/')[1],10);
    var degCycle=degenerate.querySelectorAll('.tp-cycle').length;
    expect(degFrames===degCycle+2,'退化换基不占空帧（帧数 '+degFrames+' = 回路 '+degCycle+' 格 + 2）');
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
      /* 命中测试只对视口内的点有效，先把演示区滚进视口 */
      p.scrollIntoView({block:'center',behavior:'instant'});
      var current=p.querySelector('.tp-active').getBoundingClientRect(),left=p.querySelector('tbody th').getBoundingClientRect(),right=p.querySelector('tbody td:last-child').getBoundingClientRect();
      var fits=current.left>=left.right-1 && current.right<=right.left+1;
      expect(fits,'自动定位当前格且不被固定列遮挡 ${width}px'+(fits?'':'；格宽 '+current.width+'，可视空间 '+(right.left-left.right)));
      expect(Math.abs(p.querySelector('thead th:last-child').getBoundingClientRect().left-right.left)<=1,'固定供应列标题与运量对齐 ${width}px');
      /* 固定行名列必须整块压住滚动内容：费用角标曾经和固定列同为 z-index:2，
         滚动后从列上透出来盖住行名。这里按命中测试守住「谁在上面」。 */
      var labelTh=p.querySelector('tbody th'),leaks=0;
      [].forEach.call(p.querySelectorAll('.tp-cost'),function(b){
        var r=b.getBoundingClientRect();
        if(!(r.right>left.left+1&&r.left<left.right-1&&r.bottom>left.top+1&&r.top<left.bottom-1))return;
        var x=Math.round((Math.max(r.left,left.left)+Math.min(r.right,left.right))/2);
        var y=Math.round((Math.max(r.top,left.top)+Math.min(r.bottom,left.bottom))/2);
        if(y<0||y>window.innerHeight-1)return;
        var hit=document.elementFromPoint(x,y);
        if(!hit||!(hit===labelTh||labelTh.contains(hit)))leaks++;
      });
      expect(leaks===0,'固定行名列压住滚动内容，费用角标不外溢 ${width}px'+(leaks?'；'+leaks+' 处外溢':''));
      /* 网格线：横竖两向必须同宽同色，且与表头底色至少 3:1。通用表
         table.tb td 的浅色底边权重比 .transport-table td 高，曾把横线压回
         --soft（只深了竖线），所以这里把颜色和宽度都比一遍。 */
      function lum(c){var v=c.match(/[\\d.]+/g).slice(0,3).map(function(x){x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)});return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]}
      var cellStyle=getComputedStyle(p.querySelector('tbody td')),thStyle=getComputedStyle(p.querySelector('thead th'));
      var lineLum=lum(cellStyle.borderRightColor),bgLum=lum(thStyle.backgroundColor);
      var lineRatio=(Math.max(lineLum,bgLum)+0.05)/(Math.min(lineLum,bgLum)+0.05);
      expect(cellStyle.borderRightStyle==='solid'&&cellStyle.borderBottomStyle==='solid'
        &&cellStyle.borderRightWidth===cellStyle.borderBottomWidth
        &&cellStyle.borderRightColor===cellStyle.borderBottomColor
        &&thStyle.borderBottomColor===cellStyle.borderRightColor
        &&parseFloat(cellStyle.borderRightWidth)>=2&&lineRatio>=3,
        '运输格横竖网格线同宽同色且清晰 ${width}px（'+cellStyle.borderRightWidth+'，对比 '+(+lineRatio.toFixed(2))+'）');
      var inCell=getComputedStyle(q('#tpInTbl tbody td'));
      expect(inCell.borderRightColor===inCell.borderBottomColor&&inCell.borderRightWidth===cellStyle.borderRightWidth,
        '产销平衡表横竖网格线与运输表一致 ${width}px（'+inCell.borderRightWidth+'）');
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
