/* 用 Chrome headless + CDP 在"手机视口"下渲染页面、点击求解、截全页图，并抓运行时错误
   用法: node shot.js [页面文件] [输出png] [宽] [是否点求解] */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const pageFile = process.argv[2] || 'index.html';
const outPng   = process.argv[3] || 'shot.png';
const width    = parseInt(process.argv[4] || '390', 10);
const doClick  = (process.argv[5] || '1') === '1';
const demoClicks = parseInt(process.argv[6] || '0', 10);

const PORT = 9000 + Math.floor(Math.random() * 900);
// 参数是 http(s) 开头就直接当线上地址用，否则当作本地文件
const url = /^https?:\/\//i.test(pageFile)
  ? pageFile
  : 'file:///' + path.resolve(__dirname, pageFile).replace(/\\/g, '/');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orchrome-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
      } else if (m.method) {
        this.events.push(m);
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

(async () => {
  const child = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + tmp,
    'about:blank'
  ], { stdio: 'ignore' });

  let ver = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      ver = await r.json(); break;
    } catch (e) { await sleep(250); }
  }
  if (!ver) { child.kill(); throw new Error('Chrome 调试端口未就绪'); }

  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cdp = new CDP(ws);

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Log.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);

  // 页面加载前注入错误收集
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.__errors=[];window.addEventListener("error",function(e){window.__errors.push(String(e.message))});' +
            'window.addEventListener("unhandledrejection",function(e){window.__errors.push("promise:"+e.reason)});'
  }, sessionId);

  await cdp.send('Page.navigate', { url }, sessionId);
  await sleep(1000);

  if (demoClicks > 0) {
    for (let i = 0; i < demoClicks; i++) {
      await cdp.send('Runtime.evaluate',
        { expression: "document.getElementById('demoBtn').click()" }, sessionId);
      await sleep(280);
    }
  } else if (doClick) {
    await cdp.send('Runtime.evaluate',
      { expression: "document.getElementById('solveBtn').click()" }, sessionId);
  }
  await sleep(700);

  const probe = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      errors: window.__errors,
      iterCards: document.querySelectorAll('#result .card').length,
      tables: document.querySelectorAll('table.tb').length,
      verdict: (document.querySelector('.verdict .vtitle')||{}).textContent || null,
      sol: (document.querySelector('.verdict .sol')||{}).textContent || null,
      resultVisible: document.getElementById('result').classList.contains('show'),
      inputRows: document.querySelectorAll('#inTbl tbody tr').length,
      bodyH: document.body.scrollHeight
    })`, returnByValue: true
  }, sessionId);

  const shot = await cdp.send('Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: true, fromSurface: true }, sessionId);
  fs.writeFileSync(path.join(__dirname, outPng), Buffer.from(shot.data, 'base64'));

  const cdpErrors = cdp.events
    .filter(e => e.method === 'Runtime.exceptionThrown' || e.method === 'Log.entryAdded')
    .map(e => e.method + ':' + JSON.stringify(e.params).slice(0, 300));

  console.log('=== 探针 ===');
  console.log(probe.result.value);
  if (cdpErrors.length) { console.log('=== CDP 错误 ==='); cdpErrors.forEach(e => console.log(e)); }
  console.log('截图 ->', outPng);

  ws.close(); child.kill();
  await sleep(300);
  process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
