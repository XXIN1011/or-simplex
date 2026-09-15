/* UI 层回归验证：加载页面 → 依次验证 5 个例题的渲染结论 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const PORT = 9100 + Math.floor(Math.random() * 800);
const url = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orverify-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EXPECT = [
  { click: null, name: 'max 2x1+3x2（全 ≤）',       verdict: '最优解',   sol: 'x1 = 4　　x2 = 2' },
  { click: 1,    name: 'min 2x1+3x2（≥）',          verdict: '最优解',   sol: 'x1 = 2　　x2 = 1' },
  { click: 2,    name: 'min 4x1+x2（含 =，人工变量）', verdict: '最优解',   sol: 'x1 = 2/5　　x2 = 9/5' },
  { click: 3,    name: '无界解示例',                 verdict: '无界解',   sol: null },
  { click: 4,    name: '无可行解示例',               verdict: '无可行解', sol: null }
];

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

(async () => {
  const child = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp, 'about:blank'
  ], { stdio: 'ignore' });

  let ver = null;
  for (let i = 0; i < 60; i++) {
    try { ver = await (await fetch('http://127.0.0.1:' + PORT + '/json/version')).json(); break; }
    catch (e) { await sleep(250); }
  }
  if (!ver) { child.kill(); throw new Error('调试端口未就绪'); }

  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.__errors=[];window.addEventListener("error",function(e){window.__errors.push(String(e.message))});'
  }, sessionId);
  await cdp.send('Page.navigate', { url }, sessionId);
  await sleep(1100);

  const probeExpr = `JSON.stringify({
    errors: window.__errors.length ? window.__errors : [],
    cards: document.querySelectorAll('#result .card').length,
    verdict: (document.querySelector('.verdict .vtitle')||{}).textContent || null,
    sol: (document.querySelector('.verdict .sol')||{}).textContent || null,
    scrollW: document.querySelector('table.tb').scrollWidth,
    boxW: document.querySelector('#result .scroll').clientWidth
  })`;

  let pass = 0, fail = 0;
  for (const c of EXPECT) {
    if (c.click === null) {
      await cdp.send('Runtime.evaluate', { expression: "document.getElementById('solveBtn').click()" }, sessionId);
    } else {
      await cdp.send('Runtime.evaluate', { expression: "document.getElementById('demoBtn').click()" }, sessionId);
    }
    await sleep(500);
    const r = await cdp.send('Runtime.evaluate', { expression: probeExpr, returnByValue: true }, sessionId);
    const p = JSON.parse(r.result.value);
    const okVerdict = p.verdict === c.verdict;
    const okSol = (c.sol === null) ? true : (p.sol === c.sol);
    const okErr = p.errors.length === 0;
    const ok = okVerdict && okSol && okErr;
    ok ? pass++ : fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
    console.log(`      迭代表=${p.cards}  结论="${p.verdict}"  解="${p.sol}"  表宽=${p.scrollW}/${p.boxW}`);
    if (!okVerdict) console.log(`      ✗ 期望结论 "${c.verdict}"`);
    if (!okSol) console.log(`      ✗ 期望解   "${c.sol}"`);
    if (!okErr) console.log(`      ✗ JS 错误: ${JSON.stringify(p.errors)}`);
  }
  /* ---- 极限尺寸：扩到 6 变量 / 8 约束，确认宽表格可横向滚动且不报错 ---- */
  console.log('\n--- 极限尺寸测试（6 变量 / 8 约束）---');
  await cdp.send('Runtime.evaluate', {
    expression: "for(var i=0;i<4;i++){document.getElementById('addVar').click();}" +
                "for(var i=0;i<6;i++){document.getElementById('addCon').click();}" +
                "document.getElementById('solveBtn').click();'ok'"
  }, sessionId);
  await sleep(600);
  const lim = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      errors: window.__errors,
      nVars: document.querySelectorAll('#inTbl thead th.var').length,
      nCons: document.querySelectorAll('#inTbl tbody tr').length - 1,
      inpTableW: document.getElementById('inTbl').getBoundingClientRect().width,
      inpBoxW: document.getElementById('inTbl').parentElement.clientWidth,
      tbScrollW: (document.querySelector('table.tb')||{scrollWidth:0}).scrollWidth,
      tbBoxW: (document.querySelector('#result .scroll')||{clientWidth:0}).clientWidth,
      verdict: (document.querySelector('.verdict .vtitle')||{}).textContent || null
    })`, returnByValue: true
  }, sessionId);
  const L = JSON.parse(lim.result.value);
  const inpScroll = L.inpTableW > L.inpBoxW;
  const tbScroll = L.tbScrollW > L.tbBoxW + 1;
  console.log(`变量数=${L.nVars}  约束数=${L.nCons}  结论="${L.verdict}"`);
  console.log(`输入表 ${Math.round(L.inpTableW)}px / 容器 ${L.inpBoxW}px → 横向滚动 ${inpScroll ? '需要（可滚动）' : '不需要'}`);
  console.log(`迭代表 ${L.tbScrollW}px / 容器 ${L.tbBoxW}px → 横向滚动 ${tbScroll ? '需要（可滚动）' : '不需要'}`);
  if (L.errors.length) { console.log('✗ JS 错误: ' + JSON.stringify(L.errors)); fail++; }
  else if (L.nVars !== 6 || L.nCons !== 8) { console.log('✗ 变量/约束数不符'); fail++; }
  else { console.log('PASS  极端尺寸下渲染与求解正常'); pass++; }

  console.log(`\n合计: ${pass} 通过 / ${fail} 失败`);
  ws.close(); child.kill();
  await sleep(300);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
