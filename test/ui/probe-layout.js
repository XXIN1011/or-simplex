/* 针对性的布局探测：图解 SVG 实际显示尺寸、输入区高度、各区块位置
   用法: node test/ui/probe-layout.js [页面文件或URL] */
'use strict';
const chrome = require('../../lib/chrome.js');
const { sleep, resolveTarget } = chrome;
const quiet = require('../../lib/quiet.js');

/* 应用现在有首页：这些检查都针对「单纯形法」模块，先进去，否则元素隐藏、量不到尺寸 */
const pageUrl = resolveTarget(process.argv[2] || 'index.html', '#/simplex').pageUrl;

const SETUP = `(function(){
  function fire(el, ev){ el.dispatchEvent(new Event(ev, {bubbles:true})); }
  function q(s){ return document.querySelector(s); }
  function set(sel, v){ var el = q(sel); if(!el) return; el.value = v; fire(el,'input'); }
  q('#addVar').click(); q('#addVar').click();
  q('#addCon').click(); q('#addCon').click(); q('#addCon').click();
  set('#inTbl input[data-k="c"][data-j="0"]', '3'); set('#inTbl input[data-k="c"][data-j="1"]', '2');
  set('#inTbl input[data-k="a"][data-i="0"][data-j="0"]', '1'); set('#inTbl input[data-k="a"][data-i="0"][data-j="1"]', '2'); set('#inTbl input[data-k="b"][data-i="0"]', '8');
  set('#inTbl input[data-k="a"][data-i="1"][data-j="0"]', '4'); set('#inTbl input[data-k="a"][data-i="1"][data-j="1"]', ''); set('#inTbl input[data-k="b"][data-i="1"]', '16');
  set('#inTbl input[data-k="a"][data-i="2"][data-j="0"]', ''); set('#inTbl input[data-k="a"][data-i="2"][data-j="1"]', '4'); set('#inTbl input[data-k="b"][data-i="2"]', '12');
  q('#solveBtn').click();
  return 'ok';
})()`;

const PROBE = `(function(){
  function box(s){
    var el = document.querySelector(s);
    if(!el) return null;
    var r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), h: Math.round(r.height), w: Math.round(r.width) };
  }
  var out = {};
  out.solveBtn = box('#solveBtn');
  out.inTbl = box('#inTbl');
  out.inputSection = box('.card');
  var svg = document.querySelector('.graph svg');
  if(svg){
    var r = svg.getBoundingClientRect();
    out.svgViewBox = svg.getAttribute('viewBox');
    out.svgDisplayW = Math.round(r.width);
    /* SVG 内的字号是 viewBox 单位，换算成屏幕像素 */
    var vb = (svg.getAttribute('viewBox')||'0 0 1 1').split(/\\s+/).map(Number);
    out.svgScale = vb[2] ? Math.round((r.width / vb[2]) * 1000) / 1000 : null;
    var sizes = {};
    Array.prototype.forEach.call(svg.querySelectorAll('text'), function(t){
      var fs = parseFloat(getComputedStyle(t).fontSize);
      var eff = Math.round(fs * (out.svgScale||1) * 10) / 10;
      sizes[fs + '→' + eff + 'px屏'] = (sizes[fs + '→' + eff + 'px屏'] || 0) + 1;
    });
    out.svgTextSizes = sizes;
  }
  /* 从页面顶到"求解"按钮底部的距离：手机上要不要滚动才能点到 */
  out.needScrollToSolve = out.solveBtn ? out.solveBtn.top + out.solveBtn.h : null;
  out.viewportH = window.innerHeight;
  return JSON.stringify(out);
})()`;

(async () => {
  const q = quiet.begin('probe-layout');
  const sess = await chrome.launch({ url: pageUrl, waitMs: 1200 });
  const cdp = sess.cdp, sessionId = sess.sessionId;
  await cdp.send('Runtime.evaluate', { expression: SETUP }, sessionId);
  await sleep(900);
  const r = await cdp.send('Runtime.evaluate', { expression: PROBE, returnByValue: true }, sessionId);
  const d = JSON.parse(r.result.value);

  console.log('===== 布局探测（390x844 手机视口）=====\n');
  console.log(`输入区高度           : ${d.inputSection ? d.inputSection.h : '?'}px  (从页面顶部到 ${d.inputSection ? d.inputSection.top + d.inputSection.h : '?'})`);
  console.log(`"求解"按钮底部位置   : ${d.needScrollToSolve}px`);
  console.log(`首屏可见高度         : ${d.viewportH}px`);
  console.log(`   → 加完 3 条约束后，${d.needScrollToSolve > d.viewportH
    ? '需要滚动 ' + (d.needScrollToSolve - d.viewportH) + 'px 才能点到「求解」'
    : '「求解」按钮无需滚动即可点到 ✓'}`);
  if (d.svgViewBox) {
    console.log(`\n图解法 SVG           : viewBox=${d.svgViewBox}  显示宽=${d.svgDisplayW}px  缩放=${d.svgScale}`);
    console.log(`SVG 内文字换算到屏幕 :`);
    Object.keys(d.svgTextSizes).forEach(k => console.log(`   ${k}  × ${d.svgTextSizes[k]} 处`));
  } else {
    console.log('\n（本题无图解 SVG）');
  }

  q.end(true, `求解按钮底部 ${d.needScrollToSolve}px / 首屏 ${d.viewportH}px`);
  await sess.close();
  process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
