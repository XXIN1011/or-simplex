/* 检查图解法 SVG 的内容有没有超出 viewBox（放大字号后最容易出的问题）
   做法：对多道题分别求解，读取 svg.getBBox() 与 viewBox 比较
   用法: node graph-bounds.js [页面文件或URL] */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const pageFile = process.argv[2] || 'index.html';
const PORT = 9400 + Math.floor(Math.random() * 500);
const url = /^https?:\/\//i.test(pageFile)
  ? pageFile
  : 'file:///' + path.resolve(__dirname, pageFile).replace(/\\/g, '/');
/* 应用现在有首页：这些检查都针对「单纯形法」模块，先进去，否则元素隐藏、量不到尺寸 */
const pageUrl = url.indexOf('#') === -1 ? url + '#/simplex' : url;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbounds-'));
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

/* 几道有代表性的题：顶点贴右边缘、顶点在坐标轴上、大数值、小数值 */
const CASES = [
  { name: 'max 2x1+3x2, 4x1≤16, 4x2≤12, x1+2x2≤8（顶点 4,2）',
    js: `__T.reset(2,3); __T.setDir('max'); __T.setC(0,2); __T.setC(1,3);
         __T.setA(0,0,1); __T.setA(0,1,2); __T.setB(0,8);
         __T.setA(1,0,4); __T.setB(1,16);
         __T.setA(2,1,4); __T.setB(2,12);` },
  { name: '顶点落在 x 轴最右端：max 5x1+x2, x1≤10, x2≤2',
    js: `__T.reset(2,2); __T.setDir('max'); __T.setC(0,5); __T.setC(1,0);
         __T.setA(0,0,1); __T.setB(0,10);
         __T.setA(1,1,1); __T.setB(1,2);` },
  { name: '顶点贴右上角：max x1+x2, x1≤9, x2≤9',
    js: `__T.reset(2,2); __T.setDir('max'); __T.setC(0,1); __T.setC(1,1);
         __T.setA(0,0,1); __T.setB(0,9);
         __T.setA(1,1,1); __T.setB(1,9);` },
  { name: '大数值：max x1+x2, x1≤120, x2≤80',
    js: `__T.reset(2,2); __T.setDir('max'); __T.setC(0,1); __T.setC(1,1);
         __T.setA(0,0,1); __T.setB(0,120);
         __T.setA(1,1,1); __T.setB(1,80);` },
  { name: '小数值：max x1+x2, x1≤0.4, x2≤0.3',
    js: `__T.reset(2,2); __T.setDir('max'); __T.setC(0,1); __T.setC(1,1);
         __T.setA(0,0,1); __T.setB(0,0.4);
         __T.setA(1,1,1); __T.setB(1,0.3);` },
  { name: '分数最优解：max x1+2x2, x1+x2≤1, 2x1+x2≤1.5（顶点 1/2,1/2）',
    js: `__T.reset(2,2); __T.setDir('max'); __T.setC(0,1); __T.setC(1,2);
         __T.setA(0,0,1); __T.setA(0,1,1); __T.setB(0,1);
         __T.setA(1,0,2); __T.setA(1,1,1); __T.setB(1,1.5);` }
];

const HELPERS = `(function(){
  function q(s){ return document.querySelector(s); }
  function fire(el, ev){ el.dispatchEvent(new Event(ev, {bubbles:true})); }
  function setA(i,j,v){ var el=q('#inTbl input[data-k="a"][data-i="'+i+'"][data-j="'+j+'"]'); if(el){el.value=v; fire(el,'input');} }
  function setB(i,v){ var el=q('#inTbl input[data-k="b"][data-i="'+i+'"]'); if(el){el.value=v; fire(el,'input');} }
  function setC(j,v){ var el=q('#inTbl input[data-k="c"][data-j="'+j+'"]'); if(el){el.value=v; fire(el,'input');} }
  function setDir(d){ q('#dirSeg button[data-dir="'+d+'"]').click(); }
  function reset(n,m){
    for(var k=0;k<12;k++) document.getElementById('delVar').click();
    for(var k=0;k<12;k++) document.getElementById('delCon').click();
    for(var k=0;k<n;k++) document.getElementById('addVar').click();
    for(var k=0;k<m;k++) document.getElementById('addCon').click();
  }
  window.__T = {setA:setA,setB:setB,setC:setC,setDir:setDir,reset:reset};
  return 'ok';
})()`;

const CHECK = `(function(){
  var svg = document.querySelector('.graph svg');
  if(!svg) return JSON.stringify({ none: true });
  var vb = (svg.getAttribute('viewBox')||'').split(/\\s+/).map(Number);
  var bb = svg.getBBox();
  var off = [];
  Array.prototype.forEach.call(svg.querySelectorAll('text'), function(el){
    var b = el.getBBox();
    var right = b.x + b.width - (vb[0] + vb[2]);
    var top = vb[1] - b.y;
    var bottom = b.y + b.height - (vb[1] + vb[3]);
    var left = vb[0] - b.x;
    var worst = Math.max(left, top, right, bottom);
    if(worst > 0.5){
      off.push({ cls: String(el.getAttribute('class')||'(刻度)'), txt: (el.textContent||'').slice(0,12),
                 anchor: el.getAttribute('text-anchor')||'', x: Math.round(b.x*10)/10,
                 right: Math.round(right*10)/10, top: Math.round(top*10)/10,
                 bottom: Math.round(bottom*10)/10 });
    }
  });
  return JSON.stringify({
    viewBox: vb,
    content: { x: Math.round(bb.x*10)/10, y: Math.round(bb.y*10)/10,
               w: Math.round(bb.width*10)/10, h: Math.round(bb.height*10)/10 },
    overflow: {
      left:   Math.round((vb[0] - bb.x) * 10) / 10,
      top:    Math.round((vb[1] - bb.y) * 10) / 10,
      right:  Math.round((bb.x + bb.width - (vb[0] + vb[2])) * 10) / 10,
      bottom: Math.round((bb.y + bb.height - (vb[1] + vb[3])) * 10) / 10
    },
    offenders: off
  });
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
  await cdp.send('Runtime.evaluate', { expression: HELPERS }, sessionId);

  console.log('===== 图解法内容是否超出画布 =====\n');
  let bad = 0;
  for (const c of CASES) {
    await cdp.send('Runtime.evaluate',
      { expression: c.js.replace(/__T\./g, 'window.__T.') + " document.getElementById('solveBtn').click(); 'ok'" },
      sessionId);
    await sleep(600);
    const r = await cdp.send('Runtime.evaluate', { expression: CHECK, returnByValue: true }, sessionId);
    const d = JSON.parse(r.result.value);
    if (d.none) { console.log(`—  ${c.name}\n     （该题无图解）\n`); continue; }
    const o = d.overflow;
    const worst = Math.max(o.left, o.top, o.right, o.bottom);
    const ok = worst <= 0.5;
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'}  ${c.name}`);
    console.log(`     viewBox ${d.viewBox.join(' ')} | 内容 x=${d.content.x} y=${d.content.y} w=${d.content.w} h=${d.content.h}`);
    console.log(`     越界量  左${o.left} 上${o.top} 右${o.right} 下${o.bottom}${ok ? '  → 未越界' : '  → 有内容被裁掉'}`);
    if (!ok && d.offenders.length) {
      d.offenders.forEach(f => console.log(
        `     · 越界元素 ${f.cls} "${f.txt}" anchor=${f.anchor || '默认'} x=${f.x} 右溢${f.right} 上溢${f.top} 下溢${f.bottom}`));
    }
    console.log('');
  }
  console.log(`合计: ${CASES.length - bad} 通过 / ${bad} 越界`);

  ws.close(); child.kill();
  await sleep(300);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
