'use strict';
module.exports = async function transportCases(sess, check, url) {
  async function run(code) {
    const rows = await sess.evl(`(function(){
      var results=[];function q(s){return document.querySelector(s)}
      function click(id){document.getElementById(id).click()}
      function set(s,v){var e=q(s);e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}))}
      function value(key,i,j,v){set('#tpPanel [data-key='+key+'][data-i="'+i+'"]'+(j===null?'':'[data-j="'+j+'"]'),v)}
      function size(m,n){set('#tpPanel [data-guide=n]',m);set('#tpPanel [data-guide=m]',n);q('#tpPanel [data-guide=apply]').click()}
      function expect(ok,label){results.push({ok:!!ok,label:'运输：'+label})}
      ${code}
      return results;
    })()`);
    rows.forEach(r => check(r.ok,r.label));
  }
  await sess.navigate('about:blank',0);
  await sess.navigate(url+'#/transport',350);
  await run(`
    q('#tpPanel [data-draft-clear]').click();
    expect(q('#mod-transport').classList.contains('on') && !q('#tpOut').textContent,'路由生效，默认空白题目');
    expect(document.querySelectorAll('.tabbar a').length===2,'保持首页与设置双入口底栏');
    click('tpSolveBtn');expect(q('#tpBanners').textContent.indexOf('产地')>=0,'空题给出规模提示');
    q('#tpPanel [data-guide=sample]').click();click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='360','示例最小费用360');
    expect(q('#tpOut').textContent.indexOf('初始可行方案')>=0 && q('#tpOut').textContent.indexOf('430')>=0,'初始费用430与最终360明确分开');
    expect(q('#tpInTbl tfoot [data-key=demand]') && q('#tpInTbl tbody [data-key=supply]'),'运输表右侧供应、底部需求');
    expect(q('#tpOut').textContent.indexOf('行位势')>=0 && q('#tpOut').textContent.indexOf('检验数')>=0 && q('#tpOut [data-kind=pivot]'),'展示位势、检验数与回路');
    var potStep=q('#tpOut .study-step[data-step-title^="位势法"]'),potTable=potStep&&potStep.querySelector('.transport-table');
    expect(potTable&&potTable.querySelectorAll('[data-tp-u]').length===potTable.querySelectorAll('tbody tr').length,'行位势放在表最右列');
    expect(potTable&&potTable.querySelectorAll('[data-tp-v]').length===potTable.querySelectorAll('thead th').length-2,'列位势放在表底行');
    expect(potTable&&potTable.querySelector('thead th:last-child').textContent.indexOf('行位势')>=0&&potTable.querySelector('tfoot th').textContent.indexOf('列位势')>=0,'位势行列有明确标题');
    var box=q('#tpOut [data-study]'),count=box.querySelectorAll('[data-study-step]').length;
    box.querySelector('[data-study-mode=single]').click();
    expect(count>3 && box.querySelectorAll('[data-study-step]:not([hidden])').length===1,'单步学习只显示当前步骤');
    box.querySelector('[data-study-next]').click();expect(!box.querySelector('[data-study-prev]').disabled,'下一步与上一步可导航');
    box.querySelector('[data-study-mode=all]').click();
    expect(box.querySelectorAll('[data-study-step]:not([hidden])').length===count && q('#tpOut .zv').textContent==='360','恢复完整过程不改变结论');
    value('supply',0,null,30);
    expect(!q('#tpOut').textContent && q('#tpBalance').textContent.indexOf('剩余 10')>=0,'编辑供应立即清除旧结果、更新剩余');
    expect(q('#tpVirtual').textContent.indexOf('虚拟销地')>=0 && q('#tpVirtual').textContent.indexOf('默认零费用')>=0,'求解前可见虚拟销地与零费解释');
    click('tpSolveBtn');expect(q('#tpOut').textContent.indexOf('剩余供应：产地1')>=0,'结果逐产地列剩余');
    value('surplusCost',0,null,'1/2');expect(!q('#tpOut').textContent,'修改处理费用立即使旧结果失效');
    click('tpSolveBtn');q('#tpDirSeg [data-dir=max]').click();expect(!q('#tpOut').textContent,'修改优化方向使结果失效');
    size(1,2);value('cells',0,0,10);value('cells',0,1,20);value('supply',0,null,5);
    value('demand',0,null,4);value('demand',1,null,4);value('shortageCost',0,null,2);value('shortageCost',1,null,3);
    expect(q('#tpBalance').textContent.indexOf('缺货 3')>=0 && q('#tpVirtual').textContent.indexOf('虚拟产地')>=0,'实时缺货与虚拟产地');
    click('tpSolveBtn');expect(q('#tpOut .zv').textContent==='84','最大净收益正确还原84');
    expect(q('#tpOut').textContent.indexOf('最大收益 R = 20')>=0 && q('#tpOut').textContent.indexOf('工作目标 76')>=0
      && q('#tpOut').textContent.indexOf('还原 z = R × Q − 工作目标 = 84')>=0,'最大收益减各格收益并按总运量还原');
    var workingTable=q('#tpOut table[aria-label^="进入最小化算法"]');
    expect(workingTable && workingTable.querySelector('[data-tp-cell="0-0"] .tp-value').textContent==='10'
      && workingTable.querySelector('[data-tp-cell="0-1"] .tp-value').textContent==='0'
      && workingTable.querySelector('[data-tp-cell="1-0"] .tp-value').textContent==='22'
      && workingTable.querySelector('[data-tp-cell="1-1"] .tp-value').textContent==='23','转换矩阵含统一转换后的虚拟格');
    expect(q('#tpOut').textContent.indexOf('缺货量：销地1：3；销地2：0')>=0 && q('#tpOut [data-tp-cell="1-0"] .tp-cost').textContent==='-2','逐销地缺货和虚拟负收益可见');
    value('shortageCost',1,null,'1/0');click('tpSolveBtn');
    expect(q('#tpBanners').textContent && !q('#tpOut').textContent && q('#tpPanel [data-key=shortageCost][data-i="1"]').getAttribute('aria-invalid')==='true','零分母罚金被拒绝且无旧结果');
    q('#tpDirSeg [data-dir=min]').click();size(1,1);value('cells',0,0,'1/2');value('supply',0,null,'3/4');value('demand',0,null,'3/4');
    value('surplusCost',0,null,'2/3');value('shortageCost',0,null,'1/3');click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='3/8','分数录入与目标显示');
    expect(JSON.parse(localStorage.getItem('or-simplex-draft:transport')).data.cells[0][0]==='1/2','草稿保留分数原文');
    expect(q('#tpPanel .history-count').textContent!=='0','成功求解记录题目历史');
    expect(window.__errors.length===0,'求解、编辑与学习无JS错误');
  `);
  await sess.navigate('about:blank',0);
  await sess.navigate(url+'#/transport',350);
  await run(`
    expect(q('#tpPanel [data-key=cells]').value==='1/2' && q('#tpPanel [data-key=supply]').value==='3/4'
      && q('#tpPanel [data-key=shortageCost]').value==='1/3','刷新恢复供需、费用及罚金原文');
    expect(!q('#tpOut').textContent,'恢复题目后不自动展示旧结果');
    value('cells',0,0,'1/');click('tpSolveBtn');expect(q('#tpBanners').textContent && !q('#tpOut').textContent,'不完整分数拒绝求解');
    q('#tpPanel [data-history-restore]').click();expect(q('#tpPanel [data-key=cells]').value==='1/2' && !q('#tpOut').textContent,'历史恢复原题并清除旧结果');
    q('#tpDirSeg [data-dir=min]').click();size(2,2);
    for(var i=0;i<2;i++){value('supply',i,null,1);value('demand',i,null,1);for(var j=0;j<2;j++)value('cells',i,j,1)}
    click('tpSolveBtn');expect(q('#tpOut').textContent.indexOf('存在多重最优')>=0 && q('#tpOut').textContent.indexOf('零值基')>=0,'退化与多重最优展示');
    value('supply',0,null,0);value('demand',0,null,0);click('tpSolveBtn');expect(q('#tpOut .zv').textContent==='1','零供需行列保留且可求解');
    value('supply',1,null,0);value('demand',1,null,0);click('tpSolveBtn');expect(q('#tpOut .zv').textContent==='0','全零供需可求解');
    value('supply',1,null,-1);click('tpSolveBtn');expect(q('#tpBanners').textContent && !q('#tpOut').textContent,'负供应拒绝且结果失效');
    q('#tpPanel [data-guide=sample]').click();click('tpSolveBtn');click('tpAddCol');expect(!q('#tpOut').textContent,'增减规模使旧结果失效');
    q('#tpPanel [data-guide=sample]').click();value('supply',0,null,30);click('tpSolveBtn');
  `);
  await run(`
    q('#tpPanel [data-transport-forbidden-sample]').click();
    expect(q('#tpPanel [data-key=cells][data-i="1"][data-j="1"]').value==='M','禁运示例可直接载入');
    expect(q('#tpPanel [data-key=cells][data-i="1"][data-j="1"]').getAttribute('aria-invalid')==='false'
      && q('#tpPanel [data-key=cells][data-i="1"][data-j="1"]').parentNode.classList.contains('tp-blocked'),'M 标记被识别为禁运格');
    value('cells',0,0,'X');
    expect(q('#tpBalance').textContent.indexOf('2 条禁运路线')>=0,'旧的 X 标记仍算禁运');
    value('cells',0,0,1);
    expect(q('#tpBalance').textContent.indexOf('总量平衡不代表路线可达')>=0,'平衡提示说明禁运可行性另行检查');
    click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='25','禁运示例最优费用25');
    expect(q('#tpOut').textContent.indexOf('可行性检查发现按上限分配会堵住后续路线')>=0,'逐步解释防堵路分配');
    expect(q('#tpOut .tp-blocked').textContent.indexOf('禁运')>=0 && q('#tpOut').textContent.indexOf('不参与检验')>=0,'结果、检验数及过程明确标记禁运');
    value('cells',1,1,1);expect(!q('#tpOut').textContent && !q('#tpPanel [data-key=cells][data-i="1"][data-j="1"]').parentNode.classList.contains('tp-blocked'),'数字恢复线路并立即清除旧结果');
    click('tpSolveBtn');expect(q('#tpOut .zv').textContent==='10','放开线路后重新优化');
    value('cells',0,1,'M');value('cells',1,1,'禁运');click('tpSolveBtn');
    expect(q('#tpOut').textContent.indexOf('禁运限制下无可行方案')>=0 && !q('#tpOut .zv'),'禁运无解不显示伪目标值');
    expect(q('#tpOut').textContent.indexOf('仍有 5')>=0 && q('#tpOut').textContent.indexOf('瓶颈产地集合')>=0,'无解展示缺额及路线瓶颈');
    value('cells',1,1,3);value('cells',1,0,'×');click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='20' && q('#tpOut').textContent.indexOf('2 个连通分量')>=0,'分区可运图使用基森林求解');
    expect(q('#tpPanel [data-key=cells][data-i="1"][data-j="0"]').getAttribute('aria-invalid')==='false','禁运别名为合法输入');
    expect(JSON.parse(localStorage.getItem('or-simplex-draft:transport')).data.cells[1][0]==='×','草稿保留禁运原文');
  `);
  await sess.navigate('about:blank',0);
  await sess.navigate(url+'#/transport',350);
  await run(`
    expect(q('#tpPanel [data-key=cells][data-i="1"][data-j="0"]').value==='×' && !q('#tpOut').textContent,'刷新恢复禁运且旧结果失效');
    click('tpSolveBtn');value('cells',1,0,1);q('#tpPanel [data-history-restore]').click();
    expect(q('#tpPanel [data-key=cells][data-i="1"][data-j="0"]').value==='×' && !q('#tpOut').textContent,'历史恢复禁运题目');
    q('#tpPanel [data-transport-forbidden-sample]').click();value('supply',0,null,6);value('supply',1,null,4);click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='23' && q('#tpOut').textContent.indexOf('实际分配')>=0,'分配量受可行性约束缩减后求最优');
    q('#tpDirSeg [data-dir=max]').click();value('cells',0,0,'M');value('cells',0,1,10);value('supply',0,null,3);
    size(1,2);value('demand',0,null,2);value('demand',1,null,3);value('shortageCost',0,null,4);click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='22' && q('#tpOut').textContent.indexOf('缺货量：销地1：2；销地2：0')>=0,'禁运最大净收益及虚拟缺货线路');
    value('cells',0,1,'M');value('supply',0,null,0);value('demand',0,null,0);value('demand',1,null,0);click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='0','全禁运零供需仍可行');
    q('#tpPanel [data-transport-forbidden-sample]').click();click('tpSolveBtn');
  `);
  await require('./transport-player-cases')(sess,run);
  for (const width of [320,390,1280]) {
    await sess.cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600},sess.sessionId);
    await run(`
      expect(document.documentElement.scrollWidth<=window.innerWidth+1,'无页面横向溢出 ${width}px');
      expect(q('#tpSolveBtn').getBoundingClientRect().height>=44,'求解按钮可触摸 ${width}px');
      expect(q('#tpInTbl').parentNode.classList.contains('scroll'),'宽表独立滚动 ${width}px');
      expect(q('#mod-transport').querySelectorAll('.scroll-hint').length<=1,'运输页最多保留一组滑动提示 ${width}px');
    `);
    if (width===390 && process.env.OR_TRANSPORT_SHOTS) {
      for (const mode of ['light','dark']) {
        await sess.evl(`document.querySelector('#themeSeg [data-mode=${mode}]').click();window.scrollTo(0,0)`);
        await sess.saveShot(`preview/transport-${mode}-input.png`,{captureBeyondViewport:false});
        await sess.evl(`document.getElementById('tpOut').scrollIntoView();`);
        await sess.saveShot(`preview/transport-${mode}-result.png`,{captureBeyondViewport:false});
      }
    }
  }
  await sess.cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true},sess.sessionId);
  await run(`
    q('#themeSeg [data-mode=system]').click();
    q('#tpPanel [data-draft-clear]').click();expect(!q('#tpOut').textContent && !q('#tpInTbl input'),'清空只清本题与结果');
    expect(localStorage.getItem('or-simplex-history:transport')!==null,'清空题目保留历史');
    expect(window.__errors.length===0,'全部运输界面回归无JS错误');
  `);
};
