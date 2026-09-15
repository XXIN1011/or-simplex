/* UI 层回归验证
   1) 5 个例题的渲染结论
   2) 例题下拉：点按钮不得改变当前输入（本次改动核心）
   3) 变量数 / 约束数可减到 0
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

const EXPECT = [
  { click: null, name: 'max 2x1+3x2（全 ≤）',        verdict: '最优解',   sol: 'x1 = 4　　x2 = 2' },
  { click: 1,    name: 'min 2x1+3x2（≥）',           verdict: '最优解',   sol: 'x1 = 2　　x2 = 1' },
  { click: 2,    name: 'min 4x1+x2（含 =，人工变量）', verdict: '最优解',   sol: 'x1 = 2/5　　x2 = 9/5' },
  { click: 3,    name: '无界解示例',                  verdict: '无界解',   sol: null },
  { click: 4,    name: '无可行解示例',                verdict: '无可行解', sol: null }
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

  const evl = async expr => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    return r.result.value;
  };
  const probeExpr = `JSON.stringify({
    errors: window.__errors.length ? window.__errors : [],
    cards: document.querySelectorAll('#result .card').length,
    verdict: (document.querySelector('.verdict .vtitle')||{}).textContent || null,
    sol: (document.querySelector('.verdict .sol')||{}).textContent || null
  })`;

  let pass = 0, fail = 0;
  const check = (ok, label, detail) => {
    ok ? pass++ : fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (detail) console.log('      ' + detail);
  };

  /* ---------- 1. 五个例题 ---------- */
  for (const c of EXPECT) {
    if (c.click === null) {
      await evl("document.getElementById('solveBtn').click()");
    } else {
      await evl(`document.querySelectorAll('#demoMenu button[data-i]')[${c.click}].click()`);
    }
    await sleep(420);
    const p = JSON.parse(await evl(probeExpr));
    const okVerdict = p.verdict === c.verdict;
    const okSol = (c.sol === null) || (p.sol === c.sol);
    check(okVerdict && okSol && p.errors.length === 0,
      c.name, `结论="${p.verdict}"  解="${p.sol}"  表数=${p.cards}`);
    if (!okVerdict) console.log(`      ✗ 期望结论 "${c.verdict}"`);
    if (!okSol) console.log(`      ✗ 期望解   "${c.sol}"`);
    if (p.errors.length) console.log('      ✗ JS 错误: ' + JSON.stringify(p.errors));
  }

  /* ---------- 2. 例题下拉：点按钮不得改变当前输入 ---------- */
  console.log('\n--- 例题下拉交互（核心改动）---');
  const menuRes = JSON.parse(await evl(`(function(){
    var res = {};
    var inp = document.querySelector('#inTbl input[data-k="c"][data-j="0"]');
    inp.value = '99';
    inp.dispatchEvent(new Event('input', {bubbles:true}));
    res.before = inp.value;
    document.getElementById('demoBtn').click();
    res.menuOpen = document.getElementById('demoMenu').classList.contains('open');
    res.afterClick = document.querySelector('#inTbl input[data-k="c"][data-j="0"]').value;
    res.items = document.querySelectorAll('#demoMenu button[data-i]').length;
    res.marked = (document.querySelector('#demoMenu button.on')||{}).textContent || null;
    document.querySelectorAll('#demoMenu button[data-i]')[2].click();
    res.menuClosed = !document.getElementById('demoMenu').classList.contains('open');
    res.afterPick = document.querySelector('#inTbl input[data-k="c"][data-j="0"]').value;
    res.dir = (document.querySelector('#dirSeg button.on')||{}).textContent || null;
    res.verdict = (document.querySelector('.verdict .vtitle')||{}).textContent || null;
    res.errors = window.__errors.length;
    return JSON.stringify(res);
  })()`));
  check(menuRes.afterClick === '99',
    '点「经典例题」按钮不会冲掉当前输入',
    `点击前=${menuRes.before}  点击后=${menuRes.afterClick}（应保持 99）`);
  check(menuRes.menuOpen === true && menuRes.items === 5,
    '按钮点击后展开例题列表', `展开=${menuRes.menuOpen}  条目数=${menuRes.items}`);
  check(menuRes.menuClosed === true && menuRes.afterPick === '4',
    '选中第 3 项才载入（本例 c1 应为 4）',
    `菜单关闭=${menuRes.menuClosed}  c1=${menuRes.afterPick}`);
  check(menuRes.dir === 'min',
    '载入 min 例题后 max/min 分段按钮同步',
    `方向按钮显示="${menuRes.dir}"（应为 min）`);
  check(menuRes.errors === 0, '下拉交互过程无 JS 错误');

  /* ---------- 3. 变量数 / 约束数可减到 0 ---------- */
  console.log('\n--- 变量 / 约束减到 0 ---');
  const zeroRes = JSON.parse(await evl(`(function(){
    var res = {};
    for (var i=0;i<12;i++) document.getElementById('delVar').click();
    res.n = document.querySelectorAll('#inTbl thead th.var').length;
    res.delVarDisabled = document.getElementById('delVar').disabled;
    res.tipWhenNoVar = !!document.querySelector('#inTbl td.empty-tip');
    for (var j=0;j<12;j++) document.getElementById('delCon').click();
    res.m = document.querySelectorAll('#inTbl input[data-k="b"]').length;
    res.delConDisabled = document.getElementById('delCon').disabled;
    res.tipWhenNoCon = !!document.querySelector('#inTbl td.empty-tip');
    document.getElementById('solveBtn').click();
    res.verdict = (document.querySelector('.verdict .vtitle')||{}).textContent || null;
    res.sol = (document.querySelector('.verdict .sol')||{}).textContent || null;
    res.errors = window.__errors.length;
    document.getElementById('addVar').click();
    document.getElementById('addCon').click();
    res.nBack = document.querySelectorAll('#inTbl thead th.var').length;
    res.mBack = document.querySelectorAll('#inTbl input[data-k="b"]').length;
    return JSON.stringify(res);
  })()`));
  check(zeroRes.n === 0 && zeroRes.delVarDisabled === true && zeroRes.tipWhenNoVar,
    '变量可减到 0，按钮置灰并给出提示',
    `变量数=${zeroRes.n} 删除按钮禁用=${zeroRes.delVarDisabled} 提示=${zeroRes.tipWhenNoVar}`);
  check(zeroRes.m === 0 && zeroRes.delConDisabled === true && zeroRes.tipWhenNoCon,
    '约束可减到 0，按钮置灰并给出提示',
    `约束数=${zeroRes.m} 删除按钮禁用=${zeroRes.delConDisabled} 提示=${zeroRes.tipWhenNoCon}`);
  check(zeroRes.errors === 0 && zeroRes.verdict !== null,
    '0 变量 0 约束下求解不报错',
    `结论="${zeroRes.verdict}"  解="${zeroRes.sol}"`);
  check(zeroRes.nBack === 1 && zeroRes.mBack === 1,
    '从 0 可以再加回来',
    `加回后 变量=${zeroRes.nBack} 约束=${zeroRes.mBack}`);

  /* ---------- 4. 极限尺寸（自适应加到 6 变量 8 约束）---------- */
  console.log('\n--- 极限尺寸（6 变量 / 8 约束）---');
  const lim = JSON.parse(await evl(`(function(){
    var n = document.querySelectorAll('#inTbl thead th.var').length;
    for (var i=n;i<6;i++) document.getElementById('addVar').click();
    var m = document.querySelectorAll('#inTbl tbody tr').length - 1;
    for (var j=m;j<8;j++) document.getElementById('addCon').click();
    document.getElementById('solveBtn').click();
    return JSON.stringify({
      errors: window.__errors,
      nVars: document.querySelectorAll('#inTbl thead th.var').length,
      nCons: document.querySelectorAll('#inTbl tbody tr').length - 1,
      tbScrollW: (document.querySelector('table.tb')||{scrollWidth:0}).scrollWidth,
      tbBoxW: (document.querySelector('#result .scroll')||{clientWidth:0}).clientWidth,
      verdict: (document.querySelector('.verdict .vtitle')||{}).textContent || null
    });
  })()`));
  check(lim.errors.length === 0 && lim.nVars === 6 && lim.nCons === 8,
    '极限尺寸下渲染与求解正常',
    `变量=${lim.nVars} 约束=${lim.nCons} 结论="${lim.verdict}"  迭代表 ${lim.tbScrollW}px / 容器 ${lim.tbBoxW}px`);

  console.log(`\n合计: ${pass} 通过 / ${fail} 失败`);
  ws.close(); child.kill();
  await sleep(300);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
