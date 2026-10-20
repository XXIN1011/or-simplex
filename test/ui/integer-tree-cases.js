'use strict';
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const chrome = require('../../lib/chrome');
const largeTree = require('../lib/integer-tree-fixture');
const python = process.env.PYTHON || 'python';

module.exports = async function integerTreeCases(sess, check, url, options = {}) {
  async function run(code) {
    const rows = await sess.evl(`(function(){
      var rows=[];function q(s){return document.querySelector(s)}
      function expect(ok,label){rows.push({ok:!!ok,label:label})}
      ${code}
      return rows;
    })()`);
    rows.forEach(r => check(r.ok, '分枝树：' + r.label));
  }
  // 上一套回归会禁用存储；先离开文档，避免 hash 导航沿用其故障注入。
  await sess.navigate('about:blank', 0);
  await sess.navigate(url + '#/ip', 150);
  await run(`
    q('#ipPanel [data-guide=sample]').click();q('#ipSolveBtn').click();
    var tree=q('[data-integer-tree]'), methods=q('#ipMethods');
    var before=methods.querySelectorAll('[data-study-step]').length;
    var target=q('[data-integer-node-title="4"]'), node=q('[data-integer-tree-node="4"]');
    var stored=JSON.stringify(localStorage), count=0, nativeScroll=target.scrollIntoView;
    target.scrollIntoView=function(){count++;nativeScroll.apply(this,arguments)};
    q('#ipOut .result-work').open=false;tree.closest('.meth').open=false;node.click();
    expect(document.activeElement===target && q('#ipOut .result-work').open && tree.closest('.meth').open,
      '点击结点展开全部祖先并将焦点定位到对应标题');
    expect(count===1 && q('[data-integer-tree]')===tree && q('#ipMethods')===methods,
      '一次点击只定位一次，保留同一份报告DOM');
    expect(node.getAttribute('aria-pressed')==='true' && tree.querySelectorAll('[aria-pressed=true]').length===1,'只标记当前选择');
    q('[data-integer-tree-return="4"]').click();
    expect(document.activeElement===node,'返回树图恢复刚才选择结点的焦点');
    expect(node.getBoundingClientRect().top>=0 && node.getBoundingClientRect().bottom<innerHeight-90,'返回焦点结点可见且避开固定底栏');
    expect(!tree.querySelector('[data-study-step]') && methods.querySelectorAll('[data-study-step]').length===before,'树图不进入原有学习步骤');
    var iteration=q('[data-integer-tree-return="4"]').closest('.judge').nextElementSibling;
    iteration.open=true;var study=iteration.querySelector('[data-study]'),total=study.querySelectorAll('[data-study-step]').length;
    study.querySelector('[data-study-mode=single]').click();
    expect(study.querySelectorAll('[data-study-step]:not([hidden])').length===1,'原结点单纯形迭代仍支持单步学习');
    if(total>1) study.querySelector('[data-study-next]').click();
    var step=study.querySelector('[data-study-select]').value;
    node.click();q('[data-integer-tree-return="4"]').click();
    expect(study.querySelector('[data-study-select]').value===step && study.querySelectorAll('[data-study-step]').length===total,
      '往返树图不改变单纯形学习位置或数量');
    expect(JSON.stringify(localStorage)===stored,'选择与定位不写入localStorage');
    var old=tree;q('#ipInTbl [data-k=c]').dispatchEvent(new Event('input',{bubbles:true}));
    expect(!q('[data-integer-tree]') && !q('#ipOut').textContent,'编辑题目立即移除旧树');
    q('#ipSolveBtn').click();
    expect(q('[data-integer-tree]')!==old && !q('[data-integer-tree] [aria-pressed=true]'),'重算建立新树并清除旧选择');
  `);
  await sess.evl("document.querySelector('[data-integer-tree-node]').focus()");
  for (const type of ['keyDown','keyUp']) await sess.cdp.send('Input.dispatchKeyEvent', {type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,
    text:type==='keyDown'?'\r':undefined}, sess.sessionId);
  check(await sess.evl("document.activeElement.hasAttribute('data-integer-node-title')"), '分枝树：键盘Enter定位原结点标题');
  await sess.evl("document.querySelector('[data-integer-tree-return]').click()");
  for (const type of ['keyDown','keyUp']) await sess.cdp.send('Input.dispatchKeyEvent', {type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9}, sess.sessionId);
  check(await sess.evl("document.activeElement.hasAttribute('data-integer-tree-node') && document.activeElement.matches(':focus-visible')"), '分枝树：Tab自然遍历结点且有可见焦点');

  async function capture(name) {
    await chrome.sleep(100);
    const probes = await sess.evl(`(function(){
      var clip=document.querySelector('.ip-tree-scroll').getBoundingClientRect(),out=[];
      document.querySelectorAll('.ip-tree-summary,.ip-tree-legend li,.ip-tree-controls output,.ip-tree-zoom-note,.ip-tree-node strong,.ip-tree-meta,.ip-tree-bound,.ip-tree-action,.ip-tree-best-label,.ip-tree-short-action,.ip-tree-short-best,.ip-tree-edge').forEach(function(el,i){
        var r=el.getBoundingClientRect(),inCanvas=el.closest('.ip-tree-canvas');
        if(r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth||!r.width||!r.height)return;
        if(inCanvas&&(r.top<clip.top||r.bottom>clip.bottom||r.left<clip.left||r.right>clip.right))return;
        var cs=getComputedStyle(el);
        out.push({sel:el.className+'-'+i,text:el.textContent,x:r.left,y:r.top,w:r.width,h:r.height,color:cs.color,fs:parseFloat(cs.fontSize),fw:cs.fontWeight,bw:0});
      });return out;
    })()`);
    const png = 'preview/integer-tree-' + name + '.png', json = png.replace('.png','.json');
    await sess.saveShot(png, {captureBeyondViewport:false});
    fs.writeFileSync(json, JSON.stringify(probes, null, 2));
    check(probes.length >= 3, '分枝树：截图含可见文字探针 ' + name);
    if (!options.contrast) return;
    const measured = spawnSync(python, ['tools/visual/measure-contrast.py',png,json,'1','0','900'], {encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}});
    fs.writeFileSync(png.replace('.png','-contrast.txt'), (measured.stdout || '') + (measured.stderr || '') + (measured.error || ''));
    check(measured.status === 0 && /OK/.test(measured.stdout), '分枝树：像素对比度 ' + name);
  }
  for (const theme of ['light','dark']) for (const width of [320,390,1280]) {
    await sess.cdp.send('Emulation.setDeviceMetricsOverride', {width,height:900,deviceScaleFactor:1,mobile:width<600},sess.sessionId);
    await sess.evl(`document.querySelector('#themeSeg [data-mode=${theme}]').click();
      var tree=document.querySelector('[data-integer-tree]'),scroll=tree.querySelector('.ip-tree-scroll'),node=tree.querySelector('[data-integer-tree-node]');
      tree.querySelector('[data-integer-tree-zoom=reset]').click();
      tree.scrollIntoView({behavior:'instant',block:'start'});document.documentElement.style.scrollBehavior='auto';`);
    await run(`
      var tree=q('[data-integer-tree]'),scroll=tree.querySelector('.ip-tree-scroll');
      expect(document.documentElement.scrollWidth<=innerWidth+1,'整页无横向溢出 ${theme}-${width}');
      expect(Array.prototype.every.call(tree.querySelectorAll('button'),function(b){var r=b.getBoundingClientRect();return r.width>=44&&r.height>=44}),
        '全部结点操作目标至少44×44 ${theme}-${width}');
      expect(scroll.clientHeight<=560 && scroll.clientHeight>156,'图容器高度受限且能读完整结点 ${theme}-${width}');
      expect(tree.querySelector('svg').getAttribute('aria-hidden')==='true'
        && Array.prototype.every.call(tree.querySelectorAll('[data-integer-tree-node]'),function(b){return !!b.getAttribute('aria-label')}),
        '图与按钮名称明确，连线不重复播报 ${theme}-${width}');
      expect(Array.prototype.every.call(tree.querySelectorAll('.ip-tree-node'),function(n){return n.scrollHeight<=n.clientHeight && n.scrollWidth<=n.clientWidth}),
        '结点文字未裁切 ${theme}-${width}');
      var nodes=Array.prototype.map.call(tree.querySelectorAll('.ip-tree-node'),function(n){return n.getBoundingClientRect()});
      expect(Array.prototype.every.call(tree.querySelectorAll('.ip-tree-edge'),function(e){var r=e.getBoundingClientRect();return nodes.every(function(n){return r.right<=n.left||r.left>=n.right||r.bottom<=n.top||r.top>=n.bottom})}),
        '边标签与结点不重叠 ${theme}-${width}');
    `);
    await capture(theme + '-' + width);
    await run(`
      q('[data-integer-tree-node="4"]').click();q('[data-integer-tree-return="4"]').click();
      var selected=q('[data-integer-tree-node="4"]'),r=selected.getBoundingClientRect(),clip=q('.ip-tree-scroll').getBoundingClientRect();
      expect(document.activeElement===selected && r.top>=Math.max(0,clip.top) && r.bottom<=Math.min(innerHeight-90,clip.bottom)
        && r.left>=clip.left && r.right<=clip.right,'返回最好结点后完整可见且避开固定底栏 ${theme}-${width}');
    `);
    if (theme==='dark' && width===390 || theme==='light' && width===320) await capture(theme + '-' + width + '-focus');
  }

  await require('./integer-tree-zoom-cases.js')(sess,run,capture,check);

  // 测试桥仅写入已忽略的 preview 夹具；正式单文件不增加全局入口或设置。
  const fixturePath = path.join(chrome.ROOT, 'preview/integer-tree-fixture.html');
  const hook = `
    var fixtureCore=__require__('src/core/integer.js'),fixtureReport=__require__('src/web/integer-report.js');
    var fixtureTree=__require__('src/web/integer-tree.js'),fixtureProb=__require__('src/web/examples.js').integer();
    window.__integerTreeFixture=function(kind){
      var p=fixtureProb,r;
      if(kind==='filter'){
        p={direction:'max',c:[3,2],constraints:p.constraints,vtypes:['bin','bin']};r=fixtureCore.ipSolve(p,{limit:1});
      }else if(kind==='large'){
        r=fixtureCore.ipSolve(p);r.methods=[(${largeTree.toString()})(r.methods[1].nodes[0])];
      }else r=fixtureCore.ipSolve(p,{maxNodes:kind==='candidate'?3:1});
      fixtureReport.render(p,r);fixtureTree.wire(document.getElementById('ipMethods'));return JSON.stringify(r);
    };
  `;
  const html = fs.readFileSync(path.join(chrome.ROOT,'index.html'),'utf8'), marker = "__require__('src/web/boot.js');";
  if (!html.includes(marker)) throw new Error('测试夹具未找到打包启动入口');
  fs.writeFileSync(fixturePath, html.replace(marker, () => marker + hook));
  await sess.navigate(chrome.resolveTarget('preview/integer-tree-fixture.html#/ip').pageUrl,150);
  await run(`
    window.__integerTreeFixture('filter');
    var old=q('[data-integer-tree]'),pick=q('#ipPick [value=bnb]');
    for(var z=0;z<10;z++)q('[data-integer-tree-zoom=in]').click();
    q('[data-integer-tree-node]').click();pick.checked=false;pick.dispatchEvent(new Event('change',{bubbles:true}));
    expect(!q('[data-integer-tree]'),'取消勾选分枝定界后移除树');
    pick.checked=true;pick.dispatchEvent(new Event('change',{bubbles:true}));
    var tree=q('[data-integer-tree]'),title=q('[data-integer-node-title]'),count=0;
    title.scrollIntoView=function(){count++};q('[data-integer-tree-node]').click();
    expect(tree!==old && tree.querySelectorAll('[aria-pressed=true]').length===1 && document.activeElement===title && count===1,
      '方法重新渲染后没有重复绑定或旧DOM定位');
    expect(tree.getAttribute('data-integer-tree-zoom')==='50','方法重新渲染后缩放回到当前屏幕默认值');
    q('[data-integer-tree-return]').click();
    expect(document.activeElement===tree.querySelector('[data-integer-tree-node]'),'重新渲染后的返回入口有效');
    window.__integerTreeFixture('limited');
    var node=q('[data-integer-tree-open]');node.focus();node.click();
    expect(document.activeElement===node && /未展开/.test(q('[data-integer-tree-feedback]').textContent),'未展开占位只显示说明，不跳到不存在的过程');
    expect(q('[data-integer-tree]').querySelectorAll('[data-integer-tree-open]').length===2,'真实限额输出保留两个占位');
    window.__integerTreeFixture('candidate');
    expect(/当前最好整数解，未确认最优/.test(q('.ip-tree-summary').textContent),'未完成搜索的当前解没有声称最优');
    window.__integerTreeFixture('large');
    var all=q('[data-integer-tree]'),scroll=q('.ip-tree-scroll');
    expect(all.querySelectorAll('[data-integer-tree-node]').length===601 && all.querySelectorAll('[data-integer-tree-open]').length===301,'大树601个结点全部展示，无300结点假上限');
    expect(scroll.scrollWidth>scroll.clientWidth && scroll.scrollHeight>scroll.clientHeight,'大树双向滚动限制在独立容器');
    expect(!q('[data-integer-node-title]').closest('details.help').open,'大树默认折叠原始过程');
    q('[data-integer-tree-node="300"]').click();
    expect(document.activeElement===q('[data-integer-node-title="300"]') && q('[data-integer-node-title="300"]').closest('details.help').open,'深层结点自动展开全部过程并定位');
    q('[data-integer-tree-return="300"]').click();
    expect(document.activeElement===q('[data-integer-tree-node="300"]') && scroll.scrollTop>10000,'返回深层结点恢复焦点并滚动图内位置');
    q('[data-integer-tree-details]').click();
    expect(document.activeElement===q('[data-integer-node-title]'),'大树始终提供查看全部原始过程入口');
    expect(window.__errors.length===0,'所有交互无JavaScript错误');
    var original=q('[data-integer-tree]'),firstNode=q('[data-integer-tree-node]');
    for(var z=0;z<12;z++)q('[data-integer-tree-zoom=out]').click();
    expect(original.getAttribute('data-integer-tree-zoom')==='40' && original.querySelectorAll('[data-integer-tree-node]').length===601,
      '601结点缩到40%仍保留全部数据');
    for(var z=0;z<12;z++)q('[data-integer-tree-zoom=in]').click();
    expect(original.getAttribute('data-integer-tree-zoom')==='200' && q('[data-integer-tree-node]')===firstNode
      && original.querySelectorAll('[data-integer-tree-open]').length===301,'601结点放到200%仍保留同一批DOM与全部占位');
    q('[data-integer-tree-zoom=reset]').click();
  `);
  for (const width of [390,1280]) {
    await sess.cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600},sess.sessionId);
    await sess.evl(`document.querySelector('#themeSeg [data-mode=${width===390?'dark':'light'}]').click();
      var scroll=document.querySelector('.ip-tree-scroll'),node=document.querySelector('[data-integer-tree-node="299"]');
      document.querySelector('[data-integer-tree]').scrollIntoView({behavior:'instant',block:'start'});
      scroll.scrollTop=node.offsetTop-20;scroll.scrollLeft=node.offsetLeft-20;`);
    check(await sess.evl('document.documentElement.scrollWidth<=innerWidth+1'), '分枝树：601结点无整页溢出 '+width);
    await capture('large-' + width);
  }
  await sess.cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sess.sessionId);
  await run(`q('[data-integer-tree-node="300"]').click();q('[data-integer-tree-return="300"]').click();
    expect(document.activeElement===q('[data-integer-tree-node="300"]'),'减少动态效果时定位往返完整可用');`);
  await sess.cdp.send('Emulation.setEmulatedMedia',{features:[]},sess.sessionId);
  await sess.navigate(url+'#/ip',150);
};

if (require.main === module) (async () => {
  let pass=0,fail=0;
  const sess=await chrome.launch({url:chrome.resolveTarget('index.html#/ip').pageUrl,captureErrors:true});
  try {
    await module.exports(sess,(ok,label)=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+label)},chrome.resolveTarget('index.html').url,{contrast:process.argv.includes('--contrast')});
    console.log(`分枝树：${pass} 通过 / ${fail} 失败`);
  } finally {await sess.close()}
  process.exitCode=fail?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
