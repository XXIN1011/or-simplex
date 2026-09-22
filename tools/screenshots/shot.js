/* 用 Chrome headless + CDP 在"手机视口"下渲染页面、点击求解、截全页图，并抓运行时错误
   用法: node tools/screenshots/shot.js [页面文件] [输出png] [宽] [是否点求解] */
'use strict';
const fs = require('fs');
const path = require('path');
const chrome = require('../../lib/chrome.js');
const { sleep, resolveTarget } = chrome;
const quiet = require('../../lib/quiet.js');

/* 允许在文件名后带模块 hash，例如 `node tools/screenshots/shot.js "index.html#/sens" ...` */
const T = resolveTarget(process.argv[2] || 'index.html');
const wantHash = T.wantHash;
const outPng   = process.argv[3] || 'shot.png';
const width    = parseInt(process.argv[4] || '390', 10);
const doClick  = (process.argv[5] || '1') === '1';
/* 应用现在有首页：默认进「单纯形法」模块，否则元素是隐藏的、量不到尺寸。
   想截其它模块就在文件名后带上 hash，例如 index.html#/sens */
const pageUrl = T.pageUrl.indexOf('#') === -1 ? T.pageUrl + (wantHash || '#/simplex') : T.pageUrl;

(async () => {
  const q = quiet.begin('shot');
  const sess = await chrome.launch({
    url: pageUrl, width: width, captureErrors: true, enableLog: true, waitMs: 1000,
    /* 本脚本额外把「未处理的 Promise 拒绝」也算进 window.__errors */
    errorHookExtra: 'window.addEventListener("unhandledrejection",function(e){window.__errors.push("promise:"+e.reason)});'
  });
  const cdp = sess.cdp, sessionId = sess.sessionId;
  const events = sess.events;

  if (doClick) {
    await cdp.send('Runtime.evaluate',
      { expression: "document.getElementById('solveBtn').click()" }, sessionId);
  }
  await sleep(700);

  // 可选的额外动作（第 6 个参数）：直接给 JS，或用 @文件名 从文件读取
  const extraArg = process.argv[6] || '';
  const extraJs = extraArg.startsWith('@')
    ? fs.readFileSync(path.join(__dirname, extraArg.slice(1)), 'utf8')
    : extraArg;
  // 第 7 个参数若为 dark，则模拟系统深色模式
  if ((process.argv[7] || '') === 'dark') {
    await sess.setMedia('dark');
  }
  if (extraJs) {
    await cdp.send('Runtime.evaluate', { expression: extraJs }, sessionId);
    await sleep(450);
  }

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
  fs.writeFileSync(path.join(__dirname, '..', '..', outPng), Buffer.from(shot.data, 'base64'));

  const cdpErrors = cdp.events
    .filter(e => e.method === 'Runtime.exceptionThrown' || e.method === 'Log.entryAdded')
    .map(e => e.method + ':' + JSON.stringify(e.params).slice(0, 300));

  console.log('=== 探针 ===');
  console.log(probe.result.value);
  if (cdpErrors.length) { console.log('=== CDP 错误 ==='); cdpErrors.forEach(e => console.log(e)); }
  console.log('截图 ->', outPng);

  q.end(probe.result.value.indexOf('"errors":[]') >= 0, '探针已打印，' + outPng);
  await sess.close();
  process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
