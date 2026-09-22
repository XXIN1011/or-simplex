/* 量出「关键文字元素」在页面里的位置与颜色，供 measure-contrast.py 去做
 * 像素级对比度实测。
 * 用法: node tools/visual/probe-color.js <页面文件>[#hash] [dark]
 * 输出为 JSON（stdout），交给 measure-contrast.py 做像素级对比度实测。
 *
 * 为什么要有这个：audit.js 的对比度是「沿祖先链找第一个 alpha>0.9 的背景色」，
 * 它不做逐层合成 —— 一旦页面里出现半透明玻璃层，它就会跳过玻璃、拿页面底色
 * 去算，得出的数字与眼睛看到的无关。这个脚本改成直接量截图上的真实像素，
 * 无论背后叠了多少层 backdrop-filter / 渐变 / 噪点，量到的都是最终合成色。 */
'use strict';
const fs = require('fs');
const path = require('path');
const chrome = require('../../lib/chrome.js');
const { sleep, resolveTarget, ROOT } = chrome;

const T = resolveTarget(process.argv[2] || 'index.html', '#/');
const dark = (process.argv[3] || '') === 'dark';
const pageUrl = T.pageUrl;

/* 要实测的元素。覆盖三个模块里文字最密、最容易掉对比度的地方 */
const SELECTORS = [
  '.hero h1', '.hero p', '.hero .feats li',
  'a.modcard .mt', 'a.modcard .md', 'a.back',
  '.seg button.on', '.seg button:not(.on)',
  '.help summary', '.help li b', '.help li .d',
  'table.inp th', 'input.num', 'button.btn', 'button.btn.primary',
  'h2.sec', '.iter-head', '.explain',
  'table.tb th', 'table.tb td', 'table.tb td.rowlbl',
  '.verdict .vtitle', '.sol', '.vsum',
  /* 首页底部 */
  '.foottip', '.repolink', '.tabbar', '.tabbar a.on',
  /* 灵敏度分析模块 */
  '.scen-tabs button', '.scen-tabs button.on', '.judge', '.judge b',
  '.sens-h', '.sens-note', '.sens-warn', 'table.sens th', 'table.sens td.nm',
  '.btag', '.btag.on',
  /* 整数规划模块 */
  '.meth-n', '.meth-c', '.meth-body', '.pick', 'table.sens.en td',
  '.std-h', '.std-line', '.std-note',
  /* 设置页（显示模式的三段控件 + 说明文字） */
  '.muted', '#themeSeg button.on', '#themeSeg button:not(.on)',
  /* 模块页标题区：没有卡片背景，直接压在极光上 —— 这是最容易掉对比度的地方 */
  '.mod.on header h1', '.mod.on header p', '.mod.on a.back'
];

(async () => {
  const sess = await chrome.launch({
    url: pageUrl, waitMs: 1200, media: dark ? 'dark' : null
  });
  const cdp = sess.cdp, sessionId = sess.sessionId;
  /* ★ 本脚本不用 --quiet：它的**产物就是 stdout 上的 JSON**（交给
     measure-contrast.py 算像素级对比度），安静模式会把产物一起吞掉。 */
  /* 让首页点进单纯形法再求解一次，好把结果区的元素也量到 */
  const extra = process.env.PROBE_FILL || '';
  if (extra && fs.existsSync(path.join(ROOT, 'tools', 'screenshots', extra))) {
    await cdp.send('Runtime.evaluate',
      { expression: fs.readFileSync(path.join(ROOT, 'tools', 'screenshots', extra), 'utf8') }, sessionId);
    await sleep(600);
  }
  /* ★ 量测前把页面滚回顶部：填充脚本可能触发过滚动，而截图（shot-vp.js）
     是从顶部拍的。不统一基准就会出现坐标错位、取到别的元素底色的假象。 */
  await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)' }, sessionId);
  await sleep(300);

  const { result } = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      var out = [];
      ${JSON.stringify(SELECTORS)}.forEach(function(sel){
        var el = document.querySelector(sel);
        if(!el) return;
        var r = el.getBoundingClientRect();
        if(r.width < 4 || r.height < 4) return;
        var cs = getComputedStyle(el);
        var t = (el.textContent || '').trim();
        if(!t) return;
        out.push({ sel: sel, text: t.slice(0, 22),
                   x: Math.round(r.left), y: Math.round(r.top + window.scrollY),
                   w: Math.round(r.width), h: Math.round(r.height),
                   color: cs.color, fs: parseFloat(cs.fontSize), fw: cs.fontWeight,
                   fixed: cs.position === 'fixed',
                   /* 边框宽度也要带出来：量测取底色时必须跳过描边那几像素，
                      否则「均匀的描边色」会在众数上打败「渐变的底色」 */
                   bw: Math.max(parseFloat(cs.borderTopWidth) || 0,
                                parseFloat(cs.borderRightWidth) || 0,
                                parseFloat(cs.borderBottomWidth) || 0,
                                parseFloat(cs.borderLeftWidth) || 0),
                   vh: window.innerHeight, sh: document.documentElement.scrollHeight });
      });
      return out;
    })())`, returnByValue: true
  }, sessionId);

  console.log(result.value);
  await sess.close();
  process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
