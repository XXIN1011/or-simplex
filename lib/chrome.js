/* =========================================================================
   无头 Chrome / CDP 启动器 —— 所有 UI 扫描脚本共用这一份
   -------------------------------------------------------------------------
   背景：以前 test/ui/*.js 与 tools/{visual,screenshots}/*.js 各自复制了一份
   「找 Chrome → 起进程 → 等调试端口 → 连 WebSocket → 开 target → 模拟手机
   视口 → Runtime.evaluate → 截图 → 收尾」，共 7 份。改一次 Chrome 参数要改
   7 处，而且路径写死 Windows，CI（Linux）根本跑不起来。这里收敛成一份。

   用法：
     const chrome = require('../../../lib/chrome.js');   // 按自己的层级调整
     const sess = await chrome.launch({ url: chrome.resolveTarget('index.html').pageUrl,
                                        captureErrors: true });
     const v = await sess.evl('1+1');
     await sess.close();

   ★ 这一份是**开发工具**，不进单文件产物（bundler 只打 src/core + src/web），
     所以可以用现代语法；产品码那边的 ES5 纪律与它无关。
   ========================================================================= */
'use strict';
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 页面里装一个错误收集器（所有脚本都靠 window.__errors 断言「无 JS 报错」） */
const ERROR_HOOK =
  'window.__errors=[];window.addEventListener("error",function(e){window.__errors.push(String(e.message))});';

function firstExisting(list) {
  for (const p of list) {
    if (!p) continue;
    try { if (fs.existsSync(p)) return p; } catch (e) { /* 忽略权限等异常 */ }
  }
  return null;
}

/* ---------------------------------- 找浏览器 ----------------------------------
   ① 环境变量 CHROME / CHROME_PATH / CHROME_BIN（CI 与自定义安装用）
   ② 各平台常见安装路径（Windows 上 Chrome 装不到就退到 Edge）
   ③ Linux 上再用 command -v 找一遍 PATH 里的名字 */
function findChrome() {
  const env = process.env.CHROME || process.env.CHROME_PATH || process.env.CHROME_BIN;
  if (env && fs.existsSync(env)) return env;

  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push(
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
      try {
        const p = execSync('command -v ' + name, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        if (p) candidates.push(p);
      } catch (e) { /* 这个发行版没有这个名字，继续 */ }
    }
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/snap/bin/chromium');
  }
  return firstExisting(candidates);
}

/* ------------------------------- 解析页面目标 -------------------------------
   'index.html' / 'index.html#/sens' / 'https://…' 三形态统一处理。
   返回 pageUrl 时补上默认 hash —— 应用有首页，模块元素在首页是隐藏的，
   不先切到模块里就量不到尺寸（这是历史上踩过的坑）。 */
function resolveTarget(target, defaultHash) {
  const raw = target || 'index.html';
  const hashAt = raw.indexOf('#');
  const pageFile = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const wantHash = hashAt >= 0 ? raw.slice(hashAt) : '';
  const isRemote = /^https?:\/\//i.test(pageFile);
  const url = isRemote ? pageFile : 'file:///' + path.resolve(ROOT, pageFile).replace(/\\/g, '/');
  const pageUrl = url.indexOf('#') === -1 ? url + (wantHash || defaultHash || '') : url;
  return { raw, pageFile, wantHash, isRemote, url, pageUrl };
}

/* --------------------------------- CDP 客户端 -------------------------------- */
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

/**
 * launch —— 起一个无头浏览器、开好 target、模拟手机视口，返回会话对象。
 * @param {object} [o]
 * @param {string} [o.url]            直接导航到的地址（不给就只开 target，由调用方 navigate）
 * @param {number} [o.waitMs=1200]    导航后等待渲染的毫秒数（远程页面要放宽）
 * @param {number} [o.width=390] @param {number} [o.height=844]
 * @param {number} [o.deviceScaleFactor=2] @param {boolean} [o.mobile=true]
 * @param {string} [o.chrome]         直接指定浏览器可执行文件
 * @param {number} [o.port]           固定调试端口（默认随机，避免并发撞车）
 * @param {string[]} [o.extraArgs]    追加的 Chrome 命令行参数
 * @param {boolean} [o.captureErrors] 注入 window.__errors 收集器
 * @param {boolean} [o.enableLog]     打开 Log 域（shot.js 抓控制台错误用）
 * @param {'light'|'dark'} [o.media]  模拟系统配色（项目主题走 data-theme，但初始解析读系统偏好）
 * @returns {Promise<object>} 会话：{ cdp, sessionId, url, evl, evlRaw, navigate,
 *                                   setMedia, clearMedia, screenshot, saveShot, events, close }
 */
async function launch(o = {}) {
  const chrome = o.chrome || findChrome();
  if (!chrome) throw new Error('找不到 Chrome / Edge：请设 CHROME 环境变量，或安装 Google Chrome');
  const port = o.port || (9000 + Math.floor(Math.random() * 900));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orchrome-'));

  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars',
    '--remote-debugging-port=' + port, '--user-data-dir=' + tmp, 'about:blank'
  ].concat(o.extraArgs || []), { stdio: 'ignore' });

  let ver = null;
  for (let i = 0; i < 60; i++) {
    try { ver = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json(); break; }
    catch (e) { await sleep(250); }
  }
  if (!ver) { child.kill(); throw new Error('Chrome 调试端口未就绪（' + port + '）'); }

  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cdp = new CDP(ws);

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  if (o.enableLog) await cdp.send('Log.enable', {}, sessionId);
  if (o.captureErrors) {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',
      { source: ERROR_HOOK + (o.errorHookExtra || '') }, sessionId);
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: o.width || 390, height: o.height || 844,
    deviceScaleFactor: o.deviceScaleFactor || 2, mobile: o.mobile !== false
  }, sessionId);
  if (o.media) {
    await cdp.send('Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-color-scheme', value: o.media }] }, sessionId);
  }

  const defaultWait = o.waitMs === undefined ? 1200 : o.waitMs;

  /* 页面执行取值的两种查法：evl 会在页面抛异常时直接报错（断言里要的），
     evlRaw 保留完整的 result（如取 { result: { value } } 结构）。 */
  const evlRaw = expr => cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
  const evl = async expr => {
    const r = await evlRaw(expr);
    if (r.exceptionDetails) {
      throw new Error('页面执行异常: ' + JSON.stringify(r.exceptionDetails).slice(0, 220));
    }
    return r.result.value;
  };

  const session = {
    cdp, sessionId, url: o.url || null, tmp,
    evl, evlRaw,
    events: cdp.events,
    async navigate(url, waitMs) {
      await cdp.send('Page.navigate', { url }, sessionId);
      await sleep(waitMs === undefined ? defaultWait : waitMs);
    },
    async setMedia(mode) {
      await cdp.send('Emulation.setEmulatedMedia',
        { features: [{ name: 'prefers-color-scheme', value: mode }] }, sessionId);
      await sleep(250);
    },
    async clearMedia() {
      await cdp.send('Emulation.setEmulatedMedia', { features: [] }, sessionId);
      await sleep(200);
    },
    screenshot(params) {
      return cdp.send('Page.captureScreenshot',
        Object.assign({ format: 'png', captureBeyondViewport: true, fromSurface: true }, params), sessionId);
    },
    async saveShot(file, params) {
      const shot = await session.screenshot(params);
      fs.writeFileSync(path.resolve(ROOT, file), Buffer.from(shot.data, 'base64'));
      return file;
    },
    async close() {
      try { ws.close(); } catch (e) { /* 已断开 */ }
      try { child.kill(); } catch (e) { /* 已退出 */ }
      await sleep(300);
      /* 临时 profile 目录会一直堆在系统 tmp 里，收尾时清掉；Chrome 还占着就留给系统 */
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* Windows 上可能仍被占用 */ }
    }
  };

  if (o.url) await session.navigate(o.url, defaultWait);
  return session;
}

module.exports = {
  ROOT, sleep, findChrome, resolveTarget, launch, CDP, ERROR_HOOK,
  CHROME: findChrome()
};
