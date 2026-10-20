'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const chrome = require('../../lib/chrome');
const resizeInput = require('../lib/resize-input');

module.exports = async function simplexPivotCases(sess, check, url, options = {}) {
  const q = 'document.querySelector';
  async function run(code) {
    const results = await sess.evl(`(function(){
      var rows=[];function q(s){return document.querySelector(s)}
      function expect(ok,label){rows.push({ok:!!ok,label:label})}
      function set(s,v,ev){var e=q(s);e.value=v;e.dispatchEvent(new Event(ev||'input',{bubbles:true}))}
      ${resizeInput.toString()}
      ${code}
      return rows;
    })()`);
    results.forEach(r => check(r.ok, '换表：' + r.label));
  }
  async function key(key, code, vk) {
    for (const type of ['keyDown','keyUp']) await sess.cdp.send('Input.dispatchKeyEvent',
      {type,key,code,windowsVirtualKeyCode:vk,text:key==='Enter'&&type==='keyDown'?'\r':undefined},sess.sessionId);
  }
  async function open(k=0) {
    await sess.evl(`${q}('[data-simplex-pivot="${k}"] > summary').click()`);
    await chrome.sleep(40);
  }
  await sess.navigate('about:blank',0);
  await sess.navigate(url+'#/simplex',150);
  await run(`
    q('#simplexPanel [data-guide=sample]').click();q('#solveBtn').click();
    var study=q('#result [data-study]'),steps=study.querySelectorAll('[data-study-step]');
    window.__pivotSteps=steps.length;window.__pivotStored=JSON.stringify(localStorage);
    window.__pivotTables=Array.prototype.map.call(study.querySelectorAll('table.tb'),function(t){return t.outerHTML}).join('|');
    expect(steps.length>2 && q('[data-simplex-pivot]') && !q('[data-simplex-pivot]').open,'迭代表提供默认折叠入口');
    expect(!q('[data-simplex-pivot] table') && !q('[data-simplex-pivot] [data-study-step]'),'折叠时不创建对照表，不增加学习步骤');
    q('#result [data-study-mode=single]').click();
  `);
  await sess.evl(`${q}('[data-simplex-pivot="0"] > summary').focus()`);
  await key('Enter','Enter',13);await chrome.sleep(60);
  await run(`
    var d=q('[data-simplex-pivot="0"]');
    expect(d.open && d.getAttribute('data-pivot-phase')==='locate','键盘Enter展开并从定位枢轴开始');
    expect(d.querySelector('[data-pivot-prev]').disabled && !d.querySelector('[data-pivot-next]').disabled,'首环节不能后退');
    expect(d.querySelectorAll('table').length===2 && !d.querySelector('.enter,.leave,.pivot'),'两张真实表不沿用任何轮次的默认选择高亮');
    expect(Array.prototype.every.call(d.querySelectorAll('.simplex-pivot-col-mark'),function(c){return c.getAttribute('data-pivot-col')==='1'}),'本次高亮使用初始表x2列，不是后表x1列');
  `);
  await key('Tab','Tab',9);
  check(await sess.evl(`${q}('[data-simplex-pivot="0"] [data-pivot-next]')===document.activeElement && document.activeElement.matches(':focus-visible')`),
    '换表：Tab跳过禁用按钮且显示可见焦点');
  await key('Enter','Enter',13);
  await run(`
    var d=q('[data-simplex-pivot="0"]');
    expect(d.getAttribute('data-pivot-phase')==='normalize' && /12 ÷ \\(4\\) = 3/.test(d.querySelector('[data-pivot-explanation]').textContent),'键盘进入归一化，非1枢轴与右端算式正确');
    d.querySelector('[data-pivot-next]').click();
    expect(!d.querySelector('[data-pivot-row-picker]').hidden && /\\(8\\) − \\(2\\) × \\(3\\) = 2/.test(d.querySelector('[data-pivot-explanation]').textContent),'消元使用旧系数和新主行');
    var select=d.querySelector('[data-pivot-row-select]');select.value='1';select.dispatchEvent(new Event('change',{bubbles:true}));
    expect(/无需消元/.test(d.querySelector('[data-pivot-explanation]').textContent),'行选择器可查看零系数无需消元');
    d.querySelector('[data-pivot-next]').click();
    expect(!d.querySelector('[data-pivot-col-picker]').hidden && /目标行常数项/.test(d.querySelector('[data-pivot-explanation]').textContent),'目标行可选列且始终覆盖常数项');
    var col=d.querySelector('[data-pivot-col-select]');col.value='0';col.dispatchEvent(new Event('change',{bubbles:true}));
    expect(/x1 列/.test(d.querySelector('[data-pivot-explanation]').textContent),'目标列切换同步算式');
    d.querySelector('[data-pivot-next]').focus();d.querySelector('[data-pivot-next]').click();
    expect(d.querySelector('[data-pivot-next]').disabled && document.activeElement===d.querySelector('[data-pivot-prev]'),'末环节禁用前进并把键盘焦点留在可用按钮');
    expect(/整个求解尚未完成/.test(d.querySelector('[data-pivot-explanation]').textContent),'完成一次换表不宣称整个求解最优');
    d.querySelector('[data-pivot-next]').click();expect(d.getAttribute('data-pivot-phase')==='finish','末环节不会越界');
    d.querySelector('[data-pivot-prev]').click();expect(d.getAttribute('data-pivot-phase')==='objective','上一环节可以回看');
    q('#result [data-study-next]').click();
    expect(q('[data-simplex-pivot="0"]').closest('[data-study-step]').hidden && !q('[data-simplex-pivot="1"]').open,'切表隐藏原轮讲解，新轮保持默认折叠');
  `);
  await open(1);
  await run(`
    var second=q('[data-simplex-pivot="1"]');
    expect(second.getAttribute('data-pivot-phase')==='locate' && /x1 入基/.test(second.querySelector('[data-pivot-explanation]').textContent),'另一轮公式与枢轴独立关联');
    q('#result [data-study-prev]').click();
    expect(q('[data-simplex-pivot="0"]').open && q('[data-simplex-pivot="0"]').getAttribute('data-pivot-phase')==='objective','切回原表恢复原环节');
    q('#result [data-study-mode=all]').click();q('#result [data-study-mode=single]').click();
    expect(q('[data-simplex-pivot="0"]').getAttribute('data-pivot-phase')==='objective'
      && q('#result [data-study]').querySelectorAll('[data-study-step]').length===window.__pivotSteps,'完整/单步切换保留局部阅读状态且学习步数不变');
    expect(JSON.stringify(localStorage)===window.__pivotStored,'讲解操作不写localStorage');
    var oldTables=Array.prototype.map.call(q('#result [data-study]').querySelectorAll('[data-study-step] > .card > .scroll table'),function(t){return t.outerHTML}).join('|');
    expect(oldTables===window.__pivotTables,'全部操作后原有主表逐字保持');
    var old=q('[data-simplex-pivot="0"] [data-pivot-explanation]').textContent;
    set('#inTbl [data-k=c][data-j="0"]','99');
    expect(q('#result').classList.contains('stale') && getComputedStyle(q('.simplex-pivot-stale-note')).display!=='none'
      && q('[data-simplex-pivot="0"] [data-pivot-explanation]').textContent===old,'编辑后讲解仍属旧题且明确标注');
    expect(q('#result .result-extra').hidden && q('[data-jump=analysis]').disabled,'扩展分析保持既有失效策略');
    q('#solveBtn').click();
    expect(!q('#result').classList.contains('stale') && !q('[data-simplex-pivot]').open
      && !q('[data-pivot-progress]'),'重新求解清除旧展开状态和阅读环节');
    resizeInput('simplexPanel',1,1);set('#inTbl [data-k=c]','-1');set('#inTbl [data-k=a]','1');set('#inTbl [data-k=b]','1');q('#solveBtn').click();
    expect(!q('[data-simplex-pivot]') && q('#result table.tb'),'初始最优不显示可操作讲解');
    set('#inTbl [data-k=c]','1');set('#inTbl [data-k=a]','-1');q('#solveBtn').click();
    expect(!q('[data-simplex-pivot]') && /无界解/.test(q('#result .vtitle').textContent),'无出基行的终止表不显示操作');
    q('#ipPanel [data-guide=sample]').click();q('#ipSolveBtn').click();
    q('#sensPanel [data-guide=sample]').click();q('#sSolveBtn').click();
    expect(!q('#ipOut [data-simplex-pivot]') && !q('#sBase [data-simplex-pivot]'),'整数松弛和灵敏度不新增讲解');
  `);

  // 正式页面录入 min 大M算例，用于浅深主题与窄屏实际渲染验证。
  await run(`
    resizeInput('simplexPanel',2,3);q('#dirSeg [data-dir=min]').click();
    [4,1].forEach(function(v,j){set('#inTbl [data-k=c][data-j="'+j+'"]',v)});
    [[3,1],[4,3],[1,2]].forEach(function(row,i){row.forEach(function(v,j){set('#inTbl [data-k=a][data-i="'+i+'"][data-j="'+j+'"]',v)})});
    [3,6,4].forEach(function(v,i){set('#inTbl [data-k=b][data-i="'+i+'"]',v)});
    ['=','>=','<='].forEach(function(v,i){set('#inTbl select[data-i="'+i+'"]',v,'change')});
    q('#solveBtn').click();q('#result [data-study-mode=single]').click();
  `);
  await open();
  await run(`var d=q('[data-simplex-pivot="0"]');for(var i=0;i<3;i++)d.querySelector('[data-pivot-next]').click();
    expect(/M/.test(d.querySelector('[data-pivot-explanation]').textContent)
      && /\\(7M - 4\\)/.test(d.querySelector('[data-pivot-explanation]').textContent)
      && /17\\/5/.test(q('#result .zv').textContent),'大M保留符号数对，min原题目标值仍正确');`);

  async function capture(name) {
    await chrome.sleep(60);
    const probes=await sess.evl(`(function(){var out=[];
      document.querySelectorAll('.simplex-pivot[open] summary,.simplex-pivot[open] p,.simplex-pivot[open] button:not(:disabled),.simplex-pivot[open] select,.simplex-pivot[open] figcaption,.simplex-pivot[open] td,.simplex-pivot[open] th').forEach(function(el,i){
        var r=el.getBoundingClientRect(),cs=getComputedStyle(el),clip=el.closest('.scroll');
        if(!r.width||!r.height||r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth)return;
        if(clip){var c=clip.getBoundingClientRect();if(r.left<c.left||r.right>c.right)return;}
        out.push({sel:el.tagName+'-'+i,text:el.textContent,x:r.left,y:r.top,w:r.width,h:r.height,color:cs.color,fs:parseFloat(cs.fontSize),fw:cs.fontWeight,bw:0});
      });return out;
    })()`);
    const png='preview/simplex-pivot-'+name+'.png',json=png.replace('.png','.json');
    await sess.saveShot(png,{captureBeyondViewport:false});fs.writeFileSync(json,JSON.stringify(probes,null,2));
    check(probes.length>2,'换表：实际截图含可见文字 '+name);
    if(options.contrast) {
      const measured=spawnSync(process.env.PYTHON||'python',['tools/visual/measure-contrast.py',png,json,'1','0','900'],
        {encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}});
      fs.writeFileSync(png.replace('.png','-contrast.txt'),(measured.stdout||'')+(measured.stderr||'')+(measured.error||''));
      check(measured.status===0 && /OK/.test(measured.stdout),'换表：像素对比度 '+name);
    }
  }
  for(const theme of ['light','dark']) for(const width of [320,390,1280]) {
    await sess.cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600},sess.sessionId);
    await sess.evl(`${q}('#themeSeg [data-mode=${theme}]').click();document.documentElement.style.scrollBehavior='auto';
      ${q}('[data-simplex-pivot="0"]').scrollIntoView({behavior:'instant',block:'start'})`);
    await run(`
      var d=q('[data-simplex-pivot="0"]');
      expect(document.documentElement.scrollWidth<=innerWidth+1,'${theme} ${width}px整页无横向溢出');
      expect(Array.prototype.every.call(d.querySelectorAll('button,select,summary'),function(e){var r=e.getBoundingClientRect();return !r.width||(r.width>=44&&r.height>=44)}),'${theme} ${width}px控件至少44×44');
      expect(Array.prototype.every.call(d.querySelectorAll('select'),function(e){return !!e.closest('label')}),'${theme} ${width}px选择器有标签');
      var figures=d.querySelectorAll('figure'),a=figures[0].getBoundingClientRect(),b=figures[1].getBoundingClientRect();
      expect(${width}<1100 ? b.top>=a.bottom : Math.abs(a.top-b.top)<2,'${theme} ${width}px前后表按可用宽度排列');
    `);
    await capture(`${theme}-${width}`);
    await sess.evl(`${q}('[data-simplex-pivot="0"] .simplex-pivot-tables').scrollIntoView({behavior:'instant',block:'start'})`);
    await capture(`${theme}-${width}-tables`);
  }
  await sess.cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:900,deviceScaleFactor:1,mobile:true},sess.sessionId);
  await sess.evl(`${q}('[data-simplex-pivot="0"] .scroll').focus()`);
  const before=await sess.evl(`${q}('[data-simplex-pivot="0"] .scroll').scrollLeft`);
  await key('ArrowRight','ArrowRight',39);await chrome.sleep(120);
  check(await sess.evl(`${q}('[data-simplex-pivot="0"] .scroll').scrollLeft>${before} && document.activeElement.matches(':focus-visible')`),
    '换表：宽表可键盘横向滚动且焦点可见');
  await sess.cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sess.sessionId);
  await sess.evl(`${q}('[data-simplex-pivot="0"] [data-pivot-prev]').focus()`);
  await key('Enter','Enter',13);
  await run(`expect(q('[data-simplex-pivot="0"]').getAttribute('data-pivot-phase')==='eliminate','减少动态效果时手动环节完整可用');
    var r=document.activeElement.getBoundingClientRect();expect(r.top>=0&&r.bottom<innerHeight-100,'操作焦点避开固定底栏');`);
  await sess.evl(`${q}('[data-simplex-pivot="0"] > summary').focus()`);await key('Enter','Enter',13);
  check(await sess.evl(`!${q}('[data-simplex-pivot="0"]').open`),'换表：键盘收起');
  await key('Enter','Enter',13);await chrome.sleep(40);
  check(await sess.evl(`${q}('[data-simplex-pivot="0"]').getAttribute('data-pivot-phase')==='eliminate'`),'换表：重开保留本表环节');

  // 只在已忽略的开发夹具中暴露冻结结果；正式产物没有测试入口。
  const html=fs.readFileSync(path.join(chrome.ROOT,'index.html'),'utf8'),marker="__require__('src/web/boot.js');";
  const hook=`
    window.__pivotFixture=function(kind){
      var s=__require__('src/core/simplex.js'),v=__require__('src/web/simplex-pivot-view.js');
      var prob=__require__('src/web/examples.js').linear();
      var res=kind==='limit'?s.solveStandardForm(__require__('src/core/parse.js').parseProblem(prob).form,{maxIter:0}):s.simplexSolve(prob);
      if(kind==='mismatch')res.steps[1].iter+=2;
      function freeze(o){if(o&&typeof o==='object'){Object.keys(o).forEach(function(k){freeze(o[k])});Object.freeze(o)}return o}
      window.__pivotFrozen=freeze(res);var root=document.getElementById('result');
      root.innerHTML=v.render(res,0);root.className='show';v.wire(root,res);return JSON.stringify(res);
    };`;
  if(!html.includes(marker))throw new Error('单文件夹具插入点缺失');
  const fixture='preview/simplex-pivot-fixture.html';fs.writeFileSync(fixture,html.replace(marker,()=>marker+hook));
  await sess.navigate(chrome.resolveTarget(fixture+'#/simplex').pageUrl,150);
  const frozen=await sess.evl("window.__pivotFixture('normal')");await open();
  await run(`var d=q('[data-simplex-pivot]');for(var i=0;i<8;i++)d.querySelector('[data-pivot-next]').click();
    for(var j=0;j<8;j++)d.querySelector('[data-pivot-prev]').click();`);
  check(await sess.evl('JSON.stringify(window.__pivotFrozen)')===frozen,'换表：冻结真实结果渲染与全环节操作后逐字不变');
  await run(`window.__pivotFixture('limit');expect(!q('[data-simplex-pivot]')&&/缺少下一表快照/.test(q('#result').textContent),'迭代上限只提示无后表，不补算');
    window.__pivotFixture('mismatch');expect(!q('[data-simplex-pivot]')&&/关系不匹配/.test(q('#result').textContent),'关系不匹配只说明而不显示操作');
    expect(window.__errors.length===0,'全流程无JavaScript错误');`);
  await sess.cdp.send('Emulation.setEmulatedMedia',{features:[]},sess.sessionId);
  await sess.navigate('about:blank',0);await sess.navigate(url+'#/simplex',100);
  await sess.evl(`${q}('#themeSeg [data-mode=system]').click()`);
};

if(require.main===module)(async()=>{
  let pass=0,fail=0;const target=chrome.resolveTarget('index.html');
  const sess=await chrome.launch({url:target.url+'#/simplex',captureErrors:true});
  try{await module.exports(sess,(ok,label)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+label)},target.url,{contrast:process.argv.includes('--contrast')});
    console.log(`换表讲解：${pass} 通过 / ${fail} 失败`);
  }finally{await sess.close()}
  process.exitCode=fail?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
