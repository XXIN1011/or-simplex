/* 针对性的布局探测：图解 SVG 实际显示尺寸、输入区高度、各区块位置
   用法: node probe-layout.js [页面文件或URL] */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const pageFile = process.argv[2] || 'index.html';
const PORT = 9300 + Math.floor(Math.random() * 600);
const url = /^https?:\/\//i.test(pageFile)
  ? pageFile
  : 'file:///' + path.resolve(__dirname, pageFile).replace(/\\/g, '/');
/* 应用现在有首页：这些检查都针对「单纯形法」模块，先进去，否则元素隐藏、量不到尺寸 */
const pageUrl = url.indexOf('#') === -1 ? url + '#/simplex' : url;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orprobe-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
      }
    };
  }
  send(method, params, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
    });
  }
}

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
  const child = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp, 'about:blank'
  ], { stdio: 'ignore' });

  let ver = null;
  for (let i = 0; i < 60; i++) {
    try { ver = await (await fetch('http://127.0.0.1:' + PORT + '/json/version')).json(); break; }
    catch (e) { await sleep(250); }
  }
  if (!ver) { child.kill(); throw new Error('Chrome 调试端口未就绪'); }

  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
  await cdp.send('Page.navigate', { url: pageUrl }, sessionId);
  await sleep(1200);
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

  ws.close(); child.kill();
  await sleep(300);
  process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
