'use strict';
const chrome = require('../../lib/chrome');

module.exports = async function zoomCases(sess,run,capture,check) {
  for (const theme of ['light','dark']) for (const width of [320,390,1280]) {
    await sess.cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600},sess.sessionId);
    const initial=width<=360?40:width<=600?50:100;
    await run(`
      q('#themeSeg [data-mode=${theme}]').click();q('[data-integer-tree-zoom=reset]').click();
      var tree=q('[data-integer-tree]'),first=q('[data-integer-tree-node]'),stored=JSON.stringify(localStorage);
      window.__treeZoomSnapshot={tree:tree,first:first,stored:stored,study:q('#ipMethods').querySelectorAll('[data-study-step]').length};
      expect(tree.getAttribute('data-integer-tree-zoom')==='${initial}','默认缩放适合当前屏幕 ${theme}-${width}');
      expect(Array.prototype.every.call(tree.querySelectorAll('.ip-tree-controls button'),function(b){var r=b.getBoundingClientRect();return r.width>=44&&r.height>=44}),
        '缩放控件至少44×44 ${theme}-${width}');
    `);
    for (const zoom of [40,50,60,75,100,125,150,175,200]) {
      const mode=zoom<=60?'structure':zoom<100?'summary':'detail';
      await run(`
        var tree=q('[data-integer-tree]'),guard=0;
        while(+tree.getAttribute('data-integer-tree-zoom')!==${zoom} && guard++<12)
          tree.querySelector('[data-integer-tree-zoom='+ (+tree.getAttribute('data-integer-tree-zoom')<${zoom}?'in':'out') +']').click();
        function shown(sel){var el=tree.querySelector(sel);return !!el && getComputedStyle(el).display!=='none'}
        expect(tree.getAttribute('data-integer-tree-density')==='${mode}' && tree.querySelector('output').textContent.indexOf('${zoom}%')===0,
          '缩放比例及信息档位同步 ${theme}-${width}-${zoom}');
        expect(shown('.ip-tree-bound')===${zoom>=100} && shown('.ip-tree-meta')===${zoom>=75}
          && shown('.ip-tree-edge')===${zoom>=75},'按缩放档位显示界值、访问序号和分枝条件 ${theme}-${width}-${zoom}');
        expect(Array.prototype.every.call(tree.querySelectorAll('.ip-tree-node'),function(n){return n.scrollHeight<=n.clientHeight && n.scrollWidth<=n.clientWidth
          && parseFloat(getComputedStyle(n).fontSize)>=12 && n.getBoundingClientRect().width>=44 && n.getBoundingClientRect().height>=44}),
          '结点文字可读且未裁切 ${theme}-${width}-${zoom}');
        var nodes=Array.prototype.map.call(tree.querySelectorAll('.ip-tree-node'),function(n){return n.getBoundingClientRect()});
        expect(Array.prototype.every.call(tree.querySelectorAll('.ip-tree-edge'),function(e){if(getComputedStyle(e).display==='none')return true;
          var r=e.getBoundingClientRect();return nodes.every(function(n){return r.right<=n.left||r.left>=n.right||r.bottom<=n.top||r.top>=n.bottom})}),
          '重排后分枝标签不压住结点 ${theme}-${width}-${zoom}');
        expect(q('[data-integer-tree]')===window.__treeZoomSnapshot.tree && q('[data-integer-tree-node]')===window.__treeZoomSnapshot.first
          && q('#ipMethods').querySelectorAll('[data-study-step]').length===window.__treeZoomSnapshot.study
          && JSON.stringify(localStorage)===window.__treeZoomSnapshot.stored,'缩放不重建报告、不改学习步骤或存储 ${theme}-${width}-${zoom}');
        expect(document.documentElement.scrollWidth<=innerWidth+1,'缩放后整页无横向溢出 ${theme}-${width}-${zoom}');
      `);
      if (width===390 && [50,75,100,150].includes(zoom) || width===320 && zoom===40 || width===1280 && zoom===100) {
        await sess.evl("var tree=document.querySelector('[data-integer-tree]');tree.querySelector('[data-integer-tree-node=\"4\"]').click();document.querySelector('[data-integer-tree-return=\"4\"]').click();tree.scrollIntoView({behavior:'instant',block:'start'})");
        await capture('zoom-' + theme + '-' + width + '-' + zoom);
      }
    }
    await run(`
      var tree=q('[data-integer-tree]');expect(q('[data-integer-tree-zoom=in]').disabled,'200%禁用继续放大 ${theme}-${width}');
      q('[data-integer-tree-zoom=in]').click();expect(tree.getAttribute('data-integer-tree-zoom')==='200','放大不越界 ${theme}-${width}');
      for(var i=0;i<12;i++)q('[data-integer-tree-zoom=out]').click();
      expect(q('[data-integer-tree-zoom=out]').disabled && tree.getAttribute('data-integer-tree-zoom')==='40','40%禁用继续缩小 ${theme}-${width}');
      q('[data-integer-tree-node="4"]').click();q('[data-integer-tree-return="4"]').click();
      expect(document.activeElement===q('[data-integer-tree-node="4"]'),'缩小后推导往返仍恢复正确焦点 ${theme}-${width}');
    `);
  }

  await sess.cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true},sess.sessionId);
  await sess.evl("document.querySelector('[data-integer-tree-zoom=reset]').click();document.querySelector('[data-integer-tree-zoom=in]').focus()");
  for(const type of ['keyDown','keyUp']) await sess.cdp.send('Input.dispatchKeyEvent',
    {type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:type==='keyDown'?'\r':undefined},sess.sessionId);
  check(await sess.evl("document.querySelector('[data-integer-tree]').getAttribute('data-integer-tree-zoom')==='60' && document.activeElement===document.querySelector('[data-integer-tree-zoom=in]')"),
    '分枝树：缩放按钮可用键盘Enter操作，保留控件焦点');
  await run(`
    var out=q('[data-integer-tree-zoom=out]');out.focus();out.click();out.click();
    expect(out.disabled && document.activeElement===q('[data-integer-tree-zoom=in]'),'到缩小边界时焦点转到可用缩放按钮');
  `);
  // 用原生触摸事件触发浏览器滚动，验证缩放没有抢走图内滑动。
  await sess.cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true},sess.sessionId);
  await sess.cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1},sess.sessionId);
  await sess.evl(`var tree=document.querySelector('[data-integer-tree]');
    while(+tree.getAttribute('data-integer-tree-zoom')<150)tree.querySelector('[data-integer-tree-zoom=in]').click();
    tree.scrollIntoView({behavior:'instant',block:'start'});
    var box=tree.querySelector('.ip-tree-scroll');box.scrollLeft=0;box.scrollTop=0;`);
  const target=await sess.evl(`(function(){var r=document.querySelector('.ip-tree-scroll').getBoundingClientRect();return {x:r.left+r.width*0.65,y:Math.min(r.top+150,700),left:window.scrollX,top:window.scrollY}})()`);
  await sess.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:target.x,y:target.y,id:1}]},sess.sessionId);
  for(let i=1;i<=6;i++) {
    await sess.cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:target.x-i*15,y:target.y-i*15,id:1}]},sess.sessionId);
    await chrome.sleep(30);
  }
  await sess.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},sess.sessionId);
  await chrome.sleep(150);
  const moved=await sess.evl('(function(){var box=document.querySelector(".ip-tree-scroll");return {left:box.scrollLeft,top:box.scrollTop,page:scrollY}})()');
  check(moved.left>20 && moved.top>20,
    '分枝树：放大后手机触摸手势仍可在图内双向滑动');
  if (!(moved.left>20 && moved.top>20)) console.log('触摸滚动诊断',JSON.stringify({target,moved}));
  await sess.cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false},sess.sessionId);
  await run(`
    var tree=q('[data-integer-tree]'),node=q('[data-integer-tree-node="3"]');
    node.click();q('[data-integer-tree-return="3"]').click();
    var before=node.getBoundingClientRect();q('[data-integer-tree-zoom=in]').click();var after=node.getBoundingClientRect(),clip=q('.ip-tree-scroll').getBoundingClientRect();
    expect(Math.abs((after.left+after.right-before.left-before.right)/2)<80 && after.bottom>clip.top && after.top<clip.bottom,
      '放大保留当前视野附近的结点，不跳回根');
    var title=q('[data-integer-node-title="3"]'),nativeScroll=title.scrollIntoView,count=0;title.scrollIntoView=function(){count++;nativeScroll.apply(this,arguments)};
    node.click();expect(count===1 && document.activeElement===q('[data-integer-node-title="3"]'),'缩放多次后一次点击只定位一次');
    q('[data-integer-tree-return="3"]').click();expect(document.activeElement===node,'放大后返回仍聚焦原结点');
    expect(window.__errors.length===0,'缩放和滑动全程无JavaScript错误');
    delete window.__treeZoomSnapshot;
  `);
};
