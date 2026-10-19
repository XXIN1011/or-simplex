'use strict';
const resizeInput = require('../lib/resize-input');
module.exports = async function transportCases(sess, check, url) {
  async function run(code) {
    const rows = await sess.evl(`(function(){
      var results=[];function q(s){return document.querySelector(s)}
      function click(id){document.getElementById(id).click()}
      function set(s,v){var e=q(s);e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}))}
      function value(key,i,j,v){set('#tpPanel [data-key='+key+'][data-i="'+i+'"]'+(j===null?'':'[data-j="'+j+'"]'),v)}
      ${resizeInput.toString()}
      function size(m,n){resizeInput('tpPanel',m,n)}
      function forbiddenProblem(){
        q('#tpDirSeg [data-dir=min]').click();size(2,2);
        for(var i=0;i<2;i++){
          value('supply',i,null,5);value('demand',i,null,5);
        }
        value('cells',0,0,1);value('cells',0,1,2);value('cells',1,0,3);value('cells',1,1,'M');
      }
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
    click('tpAddRow');
    expect(q('#tpInTbl [data-key=supply]') && !q('#tpInTbl [data-key=demand]'),'只添加产地也显示供应量表格');
    value('supply',0,null,'7/2'); click('tpSolveBtn');
    expect(q('#tpBanners').textContent && !q('#tpOut').textContent,'缺少销地时保留输入并阻止求解');
    click('tpAddCol');
    expect(q('#tpInTbl [data-key=supply]').value==='7/2' && q('#tpInTbl [data-key=cells]'),'后加销地保留先填供应量');
    click('tpDelRow');
    expect(q('#tpInTbl [data-key=demand]') && !q('#tpInTbl [data-key=supply]'),'只剩销地时仍显示需求量表格');
    value('demand',0,null,'5/2'); click('tpAddRow');
    expect(q('#tpInTbl [data-key=demand]').value==='5/2','后加产地保留先填需求量');
    click('tpDelRow'); click('tpDelCol'); click('tpAddCol');
    expect(q('#tpInTbl [data-key=demand]') && !q('#tpInTbl [data-key=supply]'),'从空题先添加销地立即显示需求量');
    click('tpDelCol');
    expect(!q('#tpInTbl input') && q('#tpInTbl .empty-tip'),'删空两侧回到空题提示');
    q('#tpPanel [data-guide=sample]').click();
    var raw=q('#tpInTbl [data-key=cells]'),rawStyle=getComputedStyle(raw);
    expect(rawStyle.borderTopWidth==='0px' && rawStyle.boxShadow==='none','原始表数字无独立输入方框');
    raw.focus();
    expect(getComputedStyle(raw).outlineWidth==='2px','无边框输入仍有清晰焦点');
    var focusColor=getComputedStyle(raw).outlineColor;
    value('cells',0,0,'1/0');
    expect(raw.getAttribute('aria-invalid')==='true' && getComputedStyle(raw).outlineWidth==='2px'
      && getComputedStyle(raw).outlineColor!==focusColor,'无边框输入仍以错误色标出非法数值');
    value('cells',0,0,6);raw.blur();click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='360','示例最小费用360');
    expect(q('#tpOut').textContent.indexOf('初始可行方案')>=0 && q('#tpOut').textContent.indexOf('430')>=0,'初始费用430与最终360明确分开');
    expect(q('#tpInTbl tfoot [data-key=demand]') && q('#tpInTbl tbody [data-key=supply]'),'运输表右侧供应、底部需求');
    var demandStyle=getComputedStyle(q('#tpInTbl [data-key=demand]')),supplyStyle=getComputedStyle(q('#tpInTbl [data-key=supply]'));
    expect(['fontFamily','fontSize','fontWeight','lineHeight'].every(function(k){return demandStyle[k]===supplyStyle[k]}),'需求量与供应量字体一致');
    var checkNotes=q('#tpOut .tp-check-notes');
    expect(checkNotes && [].some.call(q('#tpOut').querySelectorAll('.tp-check-verdict'),function(p){return p.textContent.indexOf('Δ ≥ 0')>=0})
      && q('#tpOut').textContent.indexOf('−容差')<0,'最优性结论使用非负检验数');
    expect(checkNotes.querySelector('.tp-check-verdict').nextElementSibling.classList.contains('sens-note'),'检验结论与禁运说明分行');
    expect(q('#tpOut').textContent.indexOf('行位势')>=0 && q('#tpOut').textContent.indexOf('检验数')>=0 && q('#tpOut [data-kind=pivot]'),'展示位势、检验数与回路');
    var potStep=q('#tpOut .study-step[data-step-title^="位势法"]'),potTable=potStep&&potStep.querySelector('.transport-table');
    expect(potTable&&potTable.querySelectorAll('[data-tp-u]').length===potTable.querySelectorAll('tbody tr').length,'行位势放在表最右列');
    expect(potTable&&potTable.querySelectorAll('[data-tp-v]').length===potTable.querySelectorAll('thead th').length-2,'列位势放在表底行');
    expect(potTable&&potTable.querySelector('thead th:last-child').textContent.indexOf('行位势')>=0&&potTable.querySelector('tfoot th').textContent.indexOf('列位势')>=0,'位势行列有明确标题');
    expect(potTable.querySelectorAll('.tp-cost').length===12
      && potTable.querySelector('[data-tp-cell="0-3"] .tp-cost').textContent==='2','位势表保留每个可运格左上角的运费');
    expect(potTable.querySelector('[data-tp-cell="0-3"].tp-has-base .tp-value').textContent==='20'
      && potTable.querySelector('[data-tp-cell="0-0"].tp-has-base .tp-value').textContent==='0','位势表基格显示带框运量，包含零值基');
    expect(potTable.querySelector('[data-tp-cell="2-3"] .tp-value').textContent==='-5'
      && !potTable.querySelector('[data-tp-cell="2-3"] .tp-basis'),'位势表非基格显示检验数且不套基框');
    expect(q('#tpOut').textContent.indexOf('θΔ')<0
      && q('#tpOut [data-kind=pivot]').parentNode.querySelector('.tp-step-lead').textContent.indexOf('θ = min{20, 10} = 10')>=0,'闭回路列出theta的min计算且移除theta乘检验数');
    var box=q('#tpOut [data-study]'),count=box.querySelectorAll('[data-study-step]').length;
    box.querySelector('[data-study-mode=single]').click();
    expect(count>3 && box.querySelectorAll('[data-study-step]:not([hidden])').length===1,'单步学习只显示当前步骤');
    box.querySelector('[data-study-next]').click();expect(!box.querySelector('[data-study-prev]').disabled,'下一步与上一步可导航');
    box.querySelector('[data-study-mode=all]').click();
    expect(box.querySelectorAll('[data-study-step]:not([hidden])').length===count && q('#tpOut .zv').textContent==='360','恢复完整过程不改变结论');
    value('supply',0,null,30);
    expect(!q('#tpOut').textContent && q('#tpBalance').textContent.indexOf('剩余 10')>=0,'编辑供应立即清除旧结果、更新剩余');
    expect(q('#tpVirtual').textContent.indexOf('虚拟销地')>=0 && q('#tpVirtual').textContent.indexOf('零费用')>=0,'求解前可见虚拟销地与零费解释');
    click('tpSolveBtn');expect(q('#tpOut').textContent.indexOf('剩余供应：产地1')>=0,'结果逐产地列剩余');
    expect(!q('#tpFees') && !q('#tpPanel [data-key=shortageCost]') && !q('#tpPanel [data-key=surplusCost]')
      && q('#mod-transport').textContent.indexOf('罚金')<0,'移除处理费、罚金输入与结果说明');
    q('#tpDirSeg [data-dir=max]').click();expect(!q('#tpOut').textContent,'修改优化方向使结果失效');
    size(1,2);value('cells',0,0,10);value('cells',0,1,20);value('supply',0,null,5);
    value('demand',0,null,4);value('demand',1,null,4);
    expect(q('#tpBalance').textContent.indexOf('缺货 3')>=0 && q('#tpVirtual').textContent.indexOf('虚拟产地')>=0,'实时缺货与虚拟产地');
    click('tpSolveBtn');expect(q('#tpOut .zv').textContent==='90','零费用虚拟线路下最大总收益90');
    expect(q('#tpOut').textContent.indexOf('最大收益 R = 20')>=0 && q('#tpOut').textContent.indexOf('工作目标 70')>=0
      && q('#tpOut').textContent.indexOf('还原 z = R × Q − 工作目标 = 90')>=0,'最大收益减各格收益并按总运量还原');
    var workingTable=q('#tpOut table[aria-label^="进入最小化算法"]');
    expect(workingTable && workingTable.querySelector('[data-tp-cell="0-0"] .tp-value').textContent==='10'
      && workingTable.querySelector('[data-tp-cell="0-1"] .tp-value').textContent==='0'
      && workingTable.querySelector('[data-tp-cell="1-0"] .tp-value').textContent==='20'
      && workingTable.querySelector('[data-tp-cell="1-1"] .tp-value').textContent==='20','转换矩阵含统一转换后的零收益虚拟格');
    expect(q('#tpOut').textContent.indexOf('缺货量：销地1：3；销地2：0')>=0 && q('#tpOut [data-tp-cell="1-0"] .tp-cost').textContent==='0','逐销地缺货和虚拟零收益可见');
    value('cells',0,1,'1/0');click('tpSolveBtn');
    expect(q('#tpBanners').textContent && !q('#tpOut').textContent && q('#tpPanel [data-key=cells][data-i="0"][data-j="1"]').getAttribute('aria-invalid')==='true','零分母费用被拒绝且无旧结果');
    q('#tpDirSeg [data-dir=min]').click();size(1,1);value('cells',0,0,'1/2');value('supply',0,null,'3/4');value('demand',0,null,'3/4');
    click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='3/8','分数录入与目标显示');
    expect(JSON.parse(localStorage.getItem('or-simplex-draft:transport')).data.cells[0][0]==='1/2','草稿保留分数原文');
    expect(q('#tpPanel .history-count').textContent!=='0','成功求解记录题目历史');
    var historyRow=q('#tpPanel .history-list li');
    expect(historyRow.querySelector('b').textContent.indexOf('最小运费')>=0
      && historyRow.querySelectorAll('.history-facts>div').length===2,'运输历史以题型标题和独立供需摘要展示');
    expect(historyRow.querySelector('.history-facts dd').textContent==='3/4'
      && historyRow.querySelector('[data-history-delete] svg'),'历史摘要保留分数原文，删除使用独立图标按钮');
    expect(window.__errors.length===0,'求解、编辑与学习无JS错误');
  `);
  await sess.navigate('about:blank',0);
  await sess.navigate(url+'#/transport',350);
  await run(`
    expect(q('#tpPanel [data-key=cells]').value==='1/2' && q('#tpPanel [data-key=supply]').value==='3/4'
      && !q('#tpPanel [data-key=shortageCost]'),'刷新恢复供需与费用原文，无旧罚金输入');
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
    forbiddenProblem();
    expect(!q('#tpPanel [data-transport-forbidden-sample]'),'移除禁运示例入口');
    expect(q('#tpPanel [data-key=cells][data-i="1"][data-j="1"]').getAttribute('aria-invalid')==='false'
      && q('#tpPanel [data-key=cells][data-i="1"][data-j="1"]').parentNode.classList.contains('tp-blocked'),'M 标记被识别为禁运格');
    value('cells',0,0,'X');
    expect(q('#tpBalance').textContent.indexOf('2 条禁运路线')>=0,'旧的 X 标记仍算禁运');
    value('cells',0,0,1);
    expect(q('#tpBalance').textContent.indexOf('需另验可行性')>=0,'平衡提示说明禁运可行性另行检查');
    click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='25','禁运题目最优费用25');
    expect(q('#tpOut .tp-step-guard').textContent.indexOf('防堵路')>=0 && q('#tpOut .tp-step-guard').textContent.indexOf('单位无法匹配')>=0,'逐步解释防堵路分配');
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
    forbiddenProblem();value('supply',0,null,6);value('supply',1,null,4);click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='23' && q('#tpOut').textContent.indexOf('实际分配')>=0,'分配量受可行性约束缩减后求最优');
    q('#tpDirSeg [data-dir=max]').click();value('cells',0,0,'M');value('cells',0,1,10);value('supply',0,null,3);
    size(1,2);value('demand',0,null,2);value('demand',1,null,3);click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='30' && q('#tpOut').textContent.indexOf('缺货量：销地1：2；销地2：0')>=0,'禁运最大总收益及虚拟缺货线路');
    value('cells',0,1,'M');value('supply',0,null,0);value('demand',0,null,0);value('demand',1,null,0);click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='0','全禁运零供需仍可行');
    forbiddenProblem();click('tpSolveBtn');
  `);
  await require('./transport-player-cases')(sess,run);
  for (const width of [320,390,1280]) {
    await sess.cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600},sess.sessionId);
    await run(`
      expect(document.documentElement.scrollWidth<=window.innerWidth+1,'无页面横向溢出 ${width}px');
      expect(q('#tpSolveBtn').getBoundingClientRect().height>=44,'求解按钮可触摸 ${width}px');
      expect(q('#tpInTbl').parentNode.classList.contains('scroll'),'宽表独立滚动 ${width}px');
      expect(q('#mod-transport').querySelectorAll('.scroll-hint').length<=1,'运输页最多保留一组滑动提示 ${width}px');
      var finalTable=q('#tpOut table[aria-label="最终最优运输方案"]'),mainStyle=getComputedStyle(finalTable.querySelector('[data-tp-cell] .tp-value'));
      expect([].every.call(finalTable.querySelectorAll('[data-tp-supply] .tp-value,[data-tp-demand] .tp-value'),function(el){
        var style=getComputedStyle(el);return style.fontSize===mainStyle.fontSize && style.fontWeight===mainStyle.fontWeight && style.fontFamily===mainStyle.fontFamily;
      }),'结果表供需与格内主数字字号字重一致 ${width}px');
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
  await run(`
    var legacy=JSON.parse(localStorage.getItem('or-simplex-draft:transport'));
    legacy.data={direction:'max',rows:1,cols:2,cells:[['M','10']],supply:['3'],demand:['2','3'],surplusCost:['100'],shortageCost:['100','100']};
    localStorage.setItem('or-simplex-draft:transport',JSON.stringify(legacy));
  `);
  await sess.navigate('about:blank',0);
  await sess.navigate(url+'#/transport',350);
  await run(`
    click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='30' && !q('#tpFees'),'旧草稿中的处理费和罚金不再影响网页求解');
    var history=JSON.parse(localStorage.getItem('or-simplex-history:transport'));
    history.data[0].data.surplusCost=['100'];history.data[0].data.shortageCost=['100','100'];
    localStorage.setItem('or-simplex-history:transport',JSON.stringify(history));
  `);
  await sess.navigate('about:blank',0);
  await sess.navigate(url+'#/transport',350);
  await run(`
    q('#tpPanel [data-history-restore]').click();click('tpSolveBtn');
    expect(q('#tpOut .zv').textContent==='30' && q('#tpPanel').textContent.indexOf('罚金')<0,'旧历史恢复后忽略收费设置且不显示收费摘要');
  `);
  await sess.cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true},sess.sessionId);
  await run(`
    q('#themeSeg [data-mode=system]').click();
    q('#tpPanel [data-draft-clear]').click();expect(!q('#tpOut').textContent && !q('#tpInTbl input'),'清空只清本题与结果');
    expect(localStorage.getItem('or-simplex-history:transport')!==null,'清空题目保留历史');
    expect(window.__errors.length===0,'全部运输界面回归无JS错误');
  `);
};
