/* 视口截图（默认 390x844 @2x），可选滚动位置 / 深色模式 / 注入填充脚本。
 * 用法: node tools/visual/shot-vp.js <页面文件>[#hash] <输出png> [scrollY] [dark] [@填充脚本]
 *
 * 为什么需要它：shot.js 用的是 captureBeyondViewport（整页长图），
 * 而整页长图里 position:fixed 元素的渲染位置不可靠 —— 本页的极光底就是
 * 一张 fixed 层，整页截图时它可能落在文档的别处，导致「文字背后的颜色」
 * 量到的根本不是真实渲染结果（实测同一个标题区在不同模块页量出 #f4f4f8
 * 和 #bcd0f4 两个完全不同的值，就是这个问题）。
 * 只截视口就与真实浏览一致，fixed 层落在正确位置。
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

/* 本脚本在 tools/visual/ 下，仓库根要退两级 */
const ROOT = path.resolve(__dirname, '..', '..');
const GITBASH = null;

const rawTarget = process.argv[2] || 'index.html';
const hashAt = rawTarget.indexOf('#');
const pageFile = hashAt >= 0 ? rawTarget.slice(0, hashAt) : rawTarget;
const wantHash = hashAt >= 0 ? rawTarget.slice(hashAt) : '';
const outPng = process.argv[3] || 'vp.png';
const scrollY = parseInt(process.argv[4] || '0', 10);
const dark = (process.argv[5] || '') === 'dark';
const fillArg = process.argv[6] || '';

const WIDTH = 390, HEIGHT = 844;
const PORT = 9200 + Math.floor(Math.random() * 700);
const url = /^https?:\/\//i.test(pageFile)
  ? pageFile
  : 'file:///' + path.resolve(ROOT, pageFile).replace(/\\/g, '/');
const pageUrl = url + (url.indexOf('#') === -1 ? (wantHash || '#/') : '');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orvp-'));
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

(async () => {
  const child = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + tmp, 'about:blank'
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
    { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true }, sessionId);
  if (dark) {
    await cdp.send('Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sessionId);
  }
  await cdp.send('Page.navigate', { url: pageUrl }, sessionId);
  await sleep(1200);

  if (fillArg) {
    const f = fillArg.replace(/^@/, '');
    const p = path.join(ROOT, 'tools', 'screenshots', f);
    if (fs.existsSync(p)) {
      await cdp.send('Runtime.evaluate', { expression: fs.readFileSync(p, 'utf8') }, sessionId);
      await sleep(700);
    }
  }
  if (scrollY >= 0) {
    /* ★ 必须无条件滚到目标位置（包括 0）：注入的填充脚本可能已经滚动过页面
       （点按钮、切 tab 都可能触发），不滚回去就会造成「截图位置」与
       「量测用的文档坐标」错位，量出来的颜色完全不是那个元素的底色。 */
    await cdp.send('Runtime.evaluate',
      { expression: 'window.scrollTo(0,' + scrollY + ')' }, sessionId);
    await sleep(500);
  }
  const shot = await cdp.send('Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: false, fromSurface: true }, sessionId);
  fs.writeFileSync(path.join(ROOT, outPng), Buffer.from(shot.data, 'base64'));
  console.log('视口截图 ->', outPng, 'scrollY=' + scrollY, dark ? 'dark' : 'light');
  ws.close(); child.kill();
  await sleep(200);
  process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
