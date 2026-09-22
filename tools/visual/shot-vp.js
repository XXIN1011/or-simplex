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
const fs = require('fs');
const path = require('path');
const chrome = require('../../lib/chrome.js');
const { sleep, resolveTarget, ROOT } = chrome;
const quiet = require('../../lib/quiet.js');

const T = resolveTarget(process.argv[2] || 'index.html');
const wantHash = T.wantHash;
const outPng = process.argv[3] || 'vp.png';
const scrollY = parseInt(process.argv[4] || '0', 10);
const dark = (process.argv[5] || '') === 'dark';
const fillArg = process.argv[6] || '';

const WIDTH = 390, HEIGHT = 844;
const pageUrl = T.pageUrl + (T.pageUrl.indexOf('#') === -1 ? (wantHash || '#/') : '');

(async () => {
  const q = quiet.begin('shot-vp');
  const sess = await chrome.launch({
    url: pageUrl, width: WIDTH, height: HEIGHT, waitMs: 1200,
    media: dark ? 'dark' : null
  });
  const cdp = sess.cdp, sessionId = sess.sessionId;

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
  const shot = await sess.screenshot({ captureBeyondViewport: false });
  fs.writeFileSync(path.join(ROOT, outPng), Buffer.from(shot.data, 'base64'));
  console.log('视口截图 ->', outPng, 'scrollY=' + scrollY, dark ? 'dark' : 'light');
  q.end(true, '视口截图 ' + outPng);
  await sess.close();
  process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
