/* 可访问性 / 移动端体验审查：触摸目标尺寸、文字对比度、表单标注、字号、横向溢出
   用法: node audit.js [页面文件或URL] [dark] */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

/* 允许在文件名后带模块 hash，例如 `node audit.js "index.html#/sens"` */
const rawTarget = process.argv[2] || 'index.html';
const hashAt = rawTarget.indexOf('#');
const pageFile = hashAt >= 0 ? rawTarget.slice(0, hashAt) : rawTarget;
const wantHash = hashAt >= 0 ? rawTarget.slice(hashAt) : '';
const dark = (process.argv[3] || '') === 'dark';
const WIDTH = 390;

const PORT = 9200 + Math.floor(Math.random() * 700);
const url = /^https?:\/\//i.test(pageFile)
  ? pageFile
  : 'file:///' + path.resolve(__dirname, pageFile).replace(/\\/g, '/');
/* 应用现在有首页：默认检查「单纯形法」模块，否则元素隐藏、量不到尺寸。
   想查其它模块就带上 hash，例如 "index.html#/sens" */
const pageUrl = url.indexOf('#') === -1 ? url + (wantHash || '#/simplex') : url;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oraudit-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
      } else if (m.method) this.events.push(m);
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

/* 先搭一道有代表性的题（2 变量 3 约束，含 = 与 ≥、负数），再求解，
   这样审查能覆盖迭代表、标准化、图解法、结论、对偶解全部区块 */
const SETUP = `(function(){
  function fire(el, ev){ el.dispatchEvent(new Event(ev, {bubbles:true})); }
  function q(s){ return document.querySelector(s); }
  function set(sel, v){ var el = q(sel); if(!el) return; el.value = v; fire(el,'input'); }
  function setRel(i,r){ var el = q('#inTbl select[data-i="'+i+'"]'); if(el){ el.value = r; fire(el,'change'); } }
  q('#dirSeg button[data-dir="min"]').click();
  q('#addVar').click(); q('#addVar').click();
  q('#addCon').click(); q('#addCon').click(); q('#addCon').click();
  set('#inTbl input[data-k="c"][data-j="0"]', '4');
  set('#inTbl input[data-k="c"][data-j="1"]', '1');
  set('#inTbl input[data-k="a"][data-i="0"][data-j="0"]', '3');
  set('#inTbl input[data-k="a"][data-i="0"][data-j="1"]', '1');
  set('#inTbl input[data-k="b"][data-i="0"]', '3');
  setRel(0, '=');
  set('#inTbl input[data-k="a"][data-i="1"][data-j="0"]', '4');
  set('#inTbl input[data-k="a"][data-i="1"][data-j="1"]', '3');
  set('#inTbl input[data-k="b"][data-i="1"]', '6');
  setRel(1, '>=');
  set('#inTbl input[data-k="a"][data-i="2"][data-j="0"]', '1');
  set('#inTbl input[data-k="a"][data-i="2"][data-j="1"]', '2');
  set('#inTbl input[data-k="b"][data-i="2"]', '4');
  setRel(2, '<=');
  q('#solveBtn').click();
  return 'setup-done';
})()`;

/* 灵敏度分析模块的布置：填基准题 → 求基准解 → 选「增加一个约束」→ 填参数 → 分析。
   走的是教材那道考研题，能把判断推导、对偶单纯形迭代表、结论都渲染出来。 */
const SENS_SETUP = `(function(){
  function q(s){ return document.querySelector(s); }
  function fire(el, ev){ el.dispatchEvent(new Event(ev, {bubbles:true})); }
  function click(id){ document.getElementById(id).click(); }
  function set(sel, v){ var el = q(sel); if(el){ el.value = v; fire(el,'input'); } }

  click('sAddVar'); click('sAddVar'); click('sAddVar');
  click('sAddCon'); click('sAddCon');
  set('#sInTbl input[data-k="c"][data-j="0"]', '2');
  set('#sInTbl input[data-k="c"][data-j="1"]', '-7');
  set('#sInTbl input[data-k="c"][data-j="2"]', '1');
  set('#sInTbl input[data-k="a"][data-i="0"][data-j="0"]', '1');
  set('#sInTbl input[data-k="a"][data-i="0"][data-j="1"]', '1');
  set('#sInTbl input[data-k="a"][data-i="0"][data-j="2"]', '1');
  set('#sInTbl input[data-k="b"][data-i="0"]', '6');
  set('#sInTbl input[data-k="a"][data-i="1"][data-j="0"]', '-1');
  set('#sInTbl input[data-k="a"][data-i="1"][data-j="1"]', '2');
  set('#sInTbl input[data-k="b"][data-i="1"]', '4');
  click('sSolveBtn');

  q('#sensTabs button[data-t="add-con"]').click();
  set('[data-f="ac-a"][data-j="0"]', '-1');
  set('[data-f="ac-a"][data-j="2"]', '2');
  q('[data-f="ac-rel"]').value = '>=';
  fire(q('[data-f="ac-rel"]'), 'change');
  set('[data-f="ac-b"]', '2');
  click('sensGo');
  return 'sens-setup-done';
})()`;

/* 动态规划：把五种题型各跑一遍，让递推表、策略卡、顺序解法对照都出现在页面上，
   这样审查到的才是真实渲染出来的内容，而不只是空表单。 */
const DP_SETUP = `(function(){
  function q(s){ return document.querySelector(s); }
  ['shortest','resource','knapsack','prodinv','replace'].forEach(function(t){
    var tab = q('#dpTabs button[data-t="' + t + '"]');
    if (tab) tab.click();
    document.getElementById('dpSolveBtn').click();
  });
  var tab = q('#dpTabs button[data-t="shortest"]');
  if (tab) tab.click();
  document.getElementById('dpSolveBtn').click();
  return 'dp-setup-done';
})()`;

const AUDIT = `(function(){
  function rgb(s){
    if(!s) return null;
    var m = String(s).match(/[\\d.]+/g);
    if(!m || m.length < 3) return null;
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  function lum(c){
    var f = c.map(function(v){ v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*f[0] + 0.7152*f[1] + 0.0722*f[2];
  }
  function ratio(a, b){
    if(!a || !b) return null;
    var l1 = lum(a), l2 = lum(b);
    if(l1 < l2){ var t = l1; l1 = l2; l2 = t; }
    return Math.round(((l1+0.05)/(l2+0.05)) * 100) / 100;
  }
  /* 向上找第一个不透明的背景色 */
  function effBg(el){
    var n = el;
    while(n && n.nodeType === 1){
      var bc = getComputedStyle(n).backgroundColor;
      var c = rgb(bc);
      if(c){
        var isRgba = /rgba/.test(bc);
        var a = isRgba ? parseFloat(String(bc).split(',')[3]) : 1;
        if(a > 0.9) return c;
      }
      n = n.parentElement;
    }
    return rgb(getComputedStyle(document.body).backgroundColor);
  }

  var out = {};

  /* 1) 触摸目标：手机推荐 >= 44x44 CSS px */
  var small = [];
  Array.prototype.forEach.call(document.querySelectorAll('button, select, a, input'), function(el){
    var r = el.getBoundingClientRect();
    if(r.width < 1 && r.height < 1) return;
    if(r.width < 44 || r.height < 44){
      small.push({ tag: el.tagName.toLowerCase(), cls: String(el.className||'').slice(0,26),
                   id: el.id||'', w: Math.round(r.width), h: Math.round(r.height) });
    }
  });
  out.smallTargets = small;

  /* 2) 文字对比度：正文需 >= 4.5，大字号 >= 3 */
  var sels = ['.sol','.vsum','.explain','.dlist','.std-note','.std-line','.std-h',
              '.graph','.help','.empty-tip','.scroll-hint','.iter-head','.hint','header p',
              /* 灵敏度分析模块与首页新增的部分 */
              '.judge','.sens-note','.sens-warn','.sens-h','a.modcard .md','a.back','.fl','.fe','.fx',
              /* 动态规划模块新增的部分 */
              '.fv','.muted','table.inp.dm th','table.sens.dpt td','.verdict .vtitle'];
  var lows = [], seen = {};
  sels.forEach(function(s){
    var el = document.querySelector(s);
    if(!el || seen[s]) return;
    seen[s] = 1;
    var cs = getComputedStyle(el);
    var fs = parseFloat(cs.fontSize);
    var big = fs >= 18.66 || (fs >= 14 && parseInt(cs.fontWeight,10) >= 700);
    var need = big ? 3 : 4.5;
    var r = ratio(rgb(cs.color), effBg(el));
    if(r !== null && r < need)
      lows.push({ sel: s, ratio: r, need: need, fs: fs, color: cs.color });
  });
  out.lowContrast = lows;

  /* 3) 表单标注 */
  var total = 0, unlabeled = 0;
  Array.prototype.forEach.call(document.querySelectorAll('input, select'), function(el){
    total++;
    var has = el.getAttribute('aria-label') || el.getAttribute('title') ||
              (el.labels && el.labels.length) || el.getAttribute('placeholder');
    if(!has) unlabeled++;
  });
  out.forms = { total: total, unlabeled: unlabeled };

  /* 4) 过小字号 */
  var tiny = [];
  Array.prototype.forEach.call(document.querySelectorAll('body *'), function(el){
    if(el.children.length) return;
    var t = (el.textContent||'').trim();
    if(!t) return;
    var fs = parseFloat(getComputedStyle(el).fontSize);
    if(fs < 12) tiny.push({ cls: String(el.className||el.tagName).slice(0,24), fs: fs, txt: t.slice(0,18) });
  });
  out.tinyFonts = tiny.slice(0, 10);

  /* 5) 页面结构 & 溢出 */
  var vm = document.querySelector('meta[name="viewport"]');
  out.viewport = vm ? vm.getAttribute('content') : null;
  out.lang = document.documentElement.lang || '(未设置)';
  out.title = document.title;
  out.hOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
  out.scrollW = document.documentElement.scrollWidth;
  out.innerW = window.innerWidth;

  /* 6) 结果区里仍然可点的小控件数量（手机上最容易误触的地方） */
  out.resultButtons = document.querySelectorAll('#result button').length;

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
    { width: WIDTH, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.__errors=[];window.addEventListener("error",function(e){window.__errors.push(String(e.message))});'
  }, sessionId);

  if (dark) {
    await cdp.send('Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sessionId);
  }

  await cdp.send('Page.navigate', { url: pageUrl }, sessionId);
  await sleep(1200);
  await cdp.send('Runtime.evaluate',
    { expression: wantHash === '#/sens' ? SENS_SETUP
                : (wantHash === '#/dp' ? DP_SETUP : SETUP) }, sessionId);
  await sleep(900);

  const r = await cdp.send('Runtime.evaluate', { expression: AUDIT, returnByValue: true }, sessionId);
  const data = JSON.parse(r.result.value);

  const mode = dark ? '深色' : '浅色';
  console.log(`===== 审查报告（${mode}模式 / 视口 ${WIDTH}px）=====\n`);

  console.log(`【触摸目标 < 44px】共 ${data.smallTargets.length} 个`);
  const byH = {};
  data.smallTargets.forEach(t => { byH[t.h] = (byH[t.h] || 0) + 1; });
  Object.keys(byH).sort((a, b) => a - b).forEach(h => {
    const ex = data.smallTargets.filter(t => t.h == h).slice(0, 4)
      .map(t => `${t.tag}.${t.cls.split(' ')[0]}${t.id ? '#' + t.id : ''}(${t.w}x${t.h})`).join(' ');
    console.log(`   高 ${h}px: ${byH[h]} 个  → ${ex}`);
  });
  if (!data.smallTargets.length) console.log('   （无）');

  console.log(`\n【对比度不足】（正文需 4.5:1）共 ${data.lowContrast.length} 个`);
  data.lowContrast.forEach(c =>
    console.log(`   ${c.sel}  比值 ${c.ratio} < ${c.need}  (${c.fs}px, ${c.color})`));
  if (!data.lowContrast.length) console.log('   （无）');

  console.log(`\n【表单标注】共 ${data.forms.total} 个控件，无任何标注/占位 ${data.forms.unlabeled} 个`);

  console.log(`\n【字号 < 12px】共 ${data.tinyFonts.length} 处（最多列 10）`);
  data.tinyFonts.forEach(t => console.log(`   ${t.fs}px  ${t.cls}  "${t.txt}"`));
  if (!data.tinyFonts.length) console.log('   （无）');

  console.log(`\n【结构】lang=${data.lang}  title=${data.title}`);
  console.log(`       viewport=${data.viewport}`);
  console.log(`       横向溢出=${data.hOverflow ? '是（' + data.scrollW + ' > ' + data.innerW + '）' : '否'}`);

  ws.close(); child.kill();
  await sleep(300);
  process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
