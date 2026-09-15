/* UI 层回归验证（例题功能已移除，题目由脚本直接搭建）
   1) 初始必须是空状态：0 变量 0 约束、有提示、结果区隐藏、例题控件已删净
   2) 自行搭题求解：标准 max / 含 ≥ 与 = 的 min / 无界 / 无可行解
   3) 0 变量 0 约束下求解不报错
   4) 6 变量 8 约束极限尺寸
*/
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const PORT = 9100 + Math.floor(Math.random() * 800);
const target = process.argv[2] || 'index.html';
const url = /^https?:\/\//i.test(target)
  ? target
  : 'file:///' + path.resolve(__dirname, target).replace(/\\/g, '/');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orverify-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 注入到页面里的表单操作助手 */
const HELPERS = `(function(){
  function q(s){ return document.querySelector(s); }
  function fire(el, ev){ el.dispatchEvent(new Event(ev, {bubbles:true})); }
  function setC(j,v){ var el=q('#inTbl input[data-k="c"][data-j="'+j+'"]'); el.value=v; fire(el,'input'); }
  function setA(i,j,v){ var el=q('#inTbl input[data-k="a"][data-i="'+i+'"][data-j="'+j+'"]'); el.value=v; fire(el,'input'); }
  function setB(i,v){ var el=q('#inTbl input[data-k="b"][data-i="'+i+'"]'); el.value=v; fire(el,'input'); }
  function setRel(i,r){ var el=q('#inTbl select[data-i="'+i+'"]'); el.value=r; fire(el,'change'); }
  function setDir(d){ q('#dirSeg button[data-dir="'+d+'"]').click(); }
  function reset(n,m){
    for(var k=0;k<12;k++) document.getElementById('delVar').click();
    for(var k=0;k<12;k++) document.getElementById('delCon').click();
    for(var k=0;k<n;k++) document.getElementById('addVar').click();
    for(var k=0;k<m;k++) document.getElementById('addCon').click();
  }
  window.__T = {setC:setC,setA:setA,setB:setB,setRel:setRel,setDir:setDir,reset:reset};
  return 'helpers-ready';
})()`;

const PROBE = `JSON.stringify({
  errors: window.__errors.length ? window.__errors : [],
  cards: document.querySelectorAll('#result .card').length,
  resultVisible: document.getElementById('result').classList.contains('show'),
  verdict: (document.querySelector('.verdict .vtitle')||{}).textContent || null,
  sol: (document.querySelector('.verdict .sol')||{}).textContent || null,
  zline: (document.querySelectorAll('.verdict .sol')[1]||{}).textContent || null
})`;

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

  const evl = async expr => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error('页面执行异常: ' + JSON.stringify(r.exceptionDetails).slice(0, 200));
    return r.result.value;
  };
  let pass = 0, fail = 0;
  const check = (ok, label, detail) => {
    ok ? pass++ : fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (detail) console.log('      ' + detail);
  };

  /* ---------- 1. 初始空状态 ---------- */
  console.log('--- 初始空状态 ---');
  const init = JSON.parse(await evl(`JSON.stringify({
    vars: document.querySelectorAll('#inTbl thead th.var').length,
    cons: document.querySelectorAll('#inTbl input[data-k="b"]').length,
    tips: document.querySelectorAll('#inTbl td.empty-tip').length,
    dirOn: (document.querySelector('#dirSeg button.on')||{}).textContent || null,
    resultVisible: document.getElementById('result').classList.contains('show'),
    hasDemoBtn: !!document.getElementById('demoBtn'),
    hasDemoMenu: !!document.getElementById('demoMenu'),
    solveBtn: !!document.getElementById('solveBtn'),
    errors: window.__errors
  })`));
  check(init.vars === 0 && init.cons === 0, '打开时 0 个决策变量、0 个约束',
    `变量=${init.vars} 约束=${init.cons}`);
  check(init.tips === 2, '空状态给出两处提示（变量 / 约束）', `提示块数=${init.tips}`);
  check(init.dirOn === 'max', '默认方向为 max', `方向按钮="${init.dirOn}"`);
  check(init.resultVisible === false, '打开时不显示任何结果（结果区隐藏）');
  check(init.hasDemoBtn === false && init.hasDemoMenu === false && init.solveBtn === true,
    '例题按钮与菜单已彻底移除，求解按钮保留');
  check(init.errors.length === 0, '加载无 JS 错误');

  await evl(HELPERS);

  /* ---------- 2. 自行搭题求解 ---------- */
  console.log('\n--- 自行搭题求解 ---');
  const cases = [
    { name: 'max 2x1+3x2, 3 个 ≤ 约束',
      build: `__T.reset(2,3); __T.setDir('max');
        __T.setC(0,2); __T.setC(1,3);
        __T.setA(0,0,1); __T.setA(0,1,2); __T.setB(0,8);
        __T.setA(1,0,4); __T.setA(1,1,0); __T.setB(1,16);
        __T.setA(2,0,0); __T.setA(2,1,4); __T.setB(2,12);`,
      verdict: '最优解', sol: 'x1 = 4　　x2 = 2', z: 'z = 14', cards: 4 },
    { name: 'min 4x1+x2, 含 = 与 ≥（人工变量）',
      build: `__T.reset(2,3); __T.setDir('min');
        __T.setC(0,4); __T.setC(1,1);
        __T.setA(0,0,3); __T.setA(0,1,1); __T.setB(0,3); __T.setRel(0,'=');
        __T.setA(1,0,4); __T.setA(1,1,3); __T.setB(1,6); __T.setRel(1,'>=');
        __T.setA(2,0,1); __T.setA(2,1,2); __T.setB(2,4); __T.setRel(2,'<=');`,
      verdict: '最优解', sol: 'x1 = 2/5　　x2 = 9/5', z: 'z = 17/5', cards: 4 },
    { name: '无界：max x1, -x1+x2≤0, x2≤3',
      build: `__T.reset(2,2); __T.setDir('max');
        __T.setC(0,1); __T.setC(1,0);
        __T.setA(0,0,-1); __T.setA(0,1,1); __T.setB(0,0);
        __T.setA(1,0,0); __T.setA(1,1,1); __T.setB(1,3);`,
      verdict: '无界解', sol: null, z: null, cards: 1 },
    { name: '无可行解：max x1, x1≥5, x1≤2',
      build: `__T.reset(1,2); __T.setDir('max');
        __T.setC(0,1);
        __T.setA(0,0,1); __T.setB(0,5); __T.setRel(0,'>=');
        __T.setA(1,0,1); __T.setB(1,2); __T.setRel(1,'<=');`,
      verdict: '无可行解', sol: null, z: null, cards: 2 }
  ];

  for (const c of cases) {
    await evl(c.build.replace(/__T\./g, 'window.__T.') + " document.getElementById('solveBtn').click(); 'ok'");
    await sleep(380);
    const p = JSON.parse(await evl(PROBE));
    const okV = p.verdict === c.verdict;
    const okS = (c.sol === null) || (p.sol === c.sol);
    const okZ = (c.z === null) || (p.zline === c.z);
    const okC = (c.cards === undefined) || (p.cards === c.cards);
    check(okV && okS && okZ && okC && p.errors.length === 0, c.name,
      `结论="${p.verdict}"  解="${p.sol}"  ${p.zline}  表数=${p.cards}`);
    if (!okV) console.log(`      ✗ 期望结论 "${c.verdict}"`);
    if (!okS) console.log(`      ✗ 期望解   "${c.sol}"`);
    if (!okZ) console.log(`      ✗ 期望      "${c.z}"`);
    if (!okC) console.log(`      ✗ 期望表数 ${c.cards}`);
    if (p.errors.length) console.log('      ✗ JS 错误: ' + JSON.stringify(p.errors));
  }

  /* ---------- 3. 0 变量 0 约束下求解 ---------- */
  console.log('\n--- 0 变量 0 约束求解 ---');
  const zero = JSON.parse(await evl(`(function(){
    for(var i=0;i<14;i++) document.getElementById('delVar').click();
    for(var j=0;j<14;j++) document.getElementById('delCon').click();
    document.getElementById('solveBtn').click();
    var r = {
      vars: document.querySelectorAll('#inTbl thead th.var').length,
      cons: document.querySelectorAll('#inTbl input[data-k="b"]').length,
      delVarDisabled: document.getElementById('delVar').disabled,
      delConDisabled: document.getElementById('delCon').disabled,
      verdict: (document.querySelector('.verdict .vtitle')||{}).textContent || null,
      sol: (document.querySelector('.verdict .sol')||{}).textContent || null,
      errors: window.__errors.length
    };
    document.getElementById('addVar').click();
    document.getElementById('addCon').click();
    r.nBack = document.querySelectorAll('#inTbl thead th.var').length;
    r.mBack = document.querySelectorAll('#inTbl input[data-k="b"]').length;
    return JSON.stringify(r);
  })()`));
  check(zero.vars === 0 && zero.cons === 0 && zero.delVarDisabled && zero.delConDisabled,
    '可以减到 0 变量 0 约束，减号按钮置灰',
    `变量=${zero.vars} 约束=${zero.cons}`);
  check(zero.errors === 0 && zero.verdict === '最优解',
    '0 变量 0 约束下求解不报错', `结论="${zero.verdict}"  解="${zero.sol}"`);
  check(zero.nBack === 1 && zero.mBack === 1, '从 0 能再加回来',
    `加回后 变量=${zero.nBack} 约束=${zero.mBack}`);

  /* ---------- 4. 极限尺寸 ---------- */
  console.log('\n--- 极限尺寸（6 变量 / 8 约束）---');
  const lim = JSON.parse(await evl(`(function(){
    var n = document.querySelectorAll('#inTbl thead th.var').length;
    for (var i=n;i<6;i++) document.getElementById('addVar').click();
    var m = document.querySelectorAll('#inTbl input[data-k="b"]').length;
    for (var j=m;j<8;j++) document.getElementById('addCon').click();
    document.getElementById('solveBtn').click();
    return JSON.stringify({
      errors: window.__errors,
      nVars: document.querySelectorAll('#inTbl thead th.var').length,
      nCons: document.querySelectorAll('#inTbl input[data-k="b"]').length,
      verdict: (document.querySelector('.verdict .vtitle')||{}).textContent || null
    });
  })()`));
  check(lim.errors.length === 0 && lim.nVars === 6 && lim.nCons === 8,
    '极限尺寸下渲染与求解正常',
    `变量=${lim.nVars} 约束=${lim.nCons} 结论="${lim.verdict}"`);

  console.log(`\n合计: ${pass} 通过 / ${fail} 失败`);
  ws.close(); child.kill();
  await sleep(300);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
