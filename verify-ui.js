/* UI 层回归验证
   1) 初始空状态（0 变量 0 约束、例题已删净）
   2) 自行搭题求解：四类结论 + 对偶解
   3) 图解法：2 变量出现、3 变量不出现
   4) 退化提示
   5) 横向滚动提示
   6) 深色模式
   7) 0 变量 0 约束求解 + 极限尺寸
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
  tables: document.querySelectorAll('table.tb').length,
  resultVisible: document.getElementById('result').classList.contains('show'),
  verdict: (document.querySelector('.verdict .vtitle')||{}).textContent || null,
  sol: (document.querySelector('.verdict .sol')||{}).textContent || null,
  zline: (document.querySelectorAll('.verdict .sol')[1]||{}).textContent || null,
  dual: (document.querySelector('.dlist')||{}).textContent || null,
  hasGraph: !!document.querySelector('.graph svg'),
  degen: (document.getElementById('result').textContent||'').indexOf('退化') >= 0,
  hints: document.querySelectorAll('.scroll-hint').length
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
    if (r.exceptionDetails) throw new Error('页面执行异常: ' + JSON.stringify(r.exceptionDetails).slice(0, 220));
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
    hasHelp: !!document.querySelector('.help'),
    solveBtn: !!document.getElementById('solveBtn'),
    errors: window.__errors
  })`));
  check(init.vars === 0 && init.cons === 0, '打开时 0 个决策变量、0 个约束',
    `变量=${init.vars} 约束=${init.cons}`);
  check(init.tips === 2, '空状态给出两处提示', `提示块=${init.tips}`);
  check(init.dirOn === 'max', '默认方向为 max');
  check(init.resultVisible === false, '打开时不显示结果');
  check(init.hasDemoBtn === false && init.solveBtn === true, '例题已移除、求解按钮在位');
  check(init.hasHelp === true, '符号说明折叠块存在');
  check(init.errors.length === 0, '加载无 JS 错误');

  await evl(HELPERS);

  /* ---------- 2. 搭题求解 + 对偶解 ---------- */
  console.log('\n--- 搭题求解与对偶解 ---');
  const cases = [
    { name: 'max 2x1+3x2（3 个 ≤）', expectVerdict: '最优解',
      build: `__T.reset(2,3); __T.setDir('max'); __T.setC(0,2); __T.setC(1,3);
        __T.setA(0,0,1); __T.setA(0,1,2); __T.setB(0,8);
        __T.setA(1,0,4); __T.setA(1,1,0); __T.setB(1,16);
        __T.setA(2,0,0); __T.setA(2,1,4); __T.setB(2,12);`,
      sol: 'x1 = 4　　x2 = 2', z: 'z = 14', tables: 4, graph: true,
      dual: ['3/2', '1/8'] },
    { name: 'min 4x1+x2（含 = 与 ≥）', expectVerdict: '最优解',
      build: `__T.reset(2,3); __T.setDir('min'); __T.setC(0,4); __T.setC(1,1);
        __T.setA(0,0,3); __T.setA(0,1,1); __T.setB(0,3); __T.setRel(0,'=');
        __T.setA(1,0,4); __T.setA(1,1,3); __T.setB(1,6); __T.setRel(1,'>=');
        __T.setA(2,0,1); __T.setA(2,1,2); __T.setB(2,4); __T.setRel(2,'<=');`,
      sol: 'x1 = 2/5　　x2 = 9/5', z: 'z = 17/5', tables: 4, graph: true,
      dual: ['7/5'] },
    { name: '无界：max x1', expectVerdict: '无界解',
      build: `__T.reset(2,2); __T.setDir('max'); __T.setC(0,1); __T.setC(1,0);
        __T.setA(0,0,-1); __T.setA(0,1,1); __T.setB(0,0);
        __T.setA(1,0,0); __T.setA(1,1,1); __T.setB(1,3);`,
      sol: null, z: null, tables: 1, graph: true, dual: null },
    { name: '无可行解：x1≥5, x1≤2', expectVerdict: '无可行解',
      build: `__T.reset(1,2); __T.setDir('max'); __T.setC(0,1);
        __T.setA(0,0,1); __T.setB(0,5); __T.setRel(0,'>=');
        __T.setA(1,0,1); __T.setB(1,2); __T.setRel(1,'<=');`,
      sol: null, z: null, tables: 2, graph: false, dual: null }
  ];

  for (const c of cases) {
    await evl(c.build.replace(/__T\./g, 'window.__T.') + " document.getElementById('solveBtn').click(); 'ok'");
    await sleep(400);
    const p = JSON.parse(await evl(PROBE));
    const okV = p.verdict === c.expectVerdict;
    const okS = (c.sol === null) || (p.sol === c.sol);
    const okZ = (c.z === null) || (p.zline === c.z);
    const okT = p.tables === c.tables;
    const okG = p.hasGraph === c.graph;
    const okD = (c.dual === null) ? (p.dual === null) : (c.dual.every(s => p.dual && p.dual.indexOf(s) >= 0));
    check(okV && okS && okZ && okT && okG && okD && p.errors.length === 0, c.name,
      `结论=${p.verdict} 解=${p.sol} ${p.zline} 表=${p.tables} 图=${p.hasGraph} 对偶=${p.dual ? '有' : '无'}`);
    if (!okV) console.log(`      ✗ 期望结论 ${c.expectVerdict}`);
    if (!okS) console.log(`      ✗ 期望解 ${c.sol}`);
    if (!okZ) console.log(`      ✗ 期望 ${c.z}`);
    if (!okT) console.log(`      ✗ 期望迭代表数 ${c.tables}`);
    if (!okG) console.log(`      ✗ 期望图解 ${c.graph}`);
    if (!okD) console.log(`      ✗ 对偶解不符，实际 "${p.dual}"`);
    if (p.errors.length) console.log('      ✗ JS 错误: ' + JSON.stringify(p.errors));
  }

  /* ---------- 3. 图解法只在 2 变量时出现 ---------- */
  console.log('\n--- 图解法适用范围 ---');
  const g3 = JSON.parse(await evl(`(function(){
    window.__T.reset(3, 2);
    window.__T.setDir('max');
    window.__T.setC(0,2); window.__T.setC(1,3); window.__T.setC(2,1);
    window.__T.setA(0,0,1); window.__T.setA(0,1,2); window.__T.setA(0,2,0); window.__T.setB(0,8);
    window.__T.setA(1,0,4); window.__T.setA(1,1,0); window.__T.setA(1,2,0); window.__T.setB(1,16);
    document.getElementById('solveBtn').click();
    return JSON.stringify({ hasGraph: !!document.querySelector('.graph svg'),
                            nVars: document.querySelectorAll('#inTbl thead th.var').length });
  })()`));
  check(g3.hasGraph === false && g3.nVars === 3,
    '3 个变量时不显示图解法', `变量数=${g3.nVars} 有图=${g3.hasGraph}`);

  /* ---------- 4. 退化提示 ---------- */
  console.log('\n--- 退化提示 ---');
  const deg = JSON.parse(await evl(`(function(){
    __T.reset(2,2); __T.setDir('max'); __T.setC(0,3); __T.setC(1,9);
    __T.setA(0,0,1); __T.setA(0,1,4); __T.setB(0,8);
    __T.setA(1,0,1); __T.setA(1,1,2); __T.setB(1,4);
    document.getElementById('solveBtn').click();
    return JSON.stringify({
      degen: (document.getElementById('result').textContent||'').indexOf('退化') >= 0,
      verdict: (document.querySelector('.verdict .vtitle')||{}).textContent,
      sol: (document.querySelector('.verdict .sol')||{}).textContent,
      errors: window.__errors.length
    });
  })()`.replace(/__T\./g, 'window.__T.')));
  check(deg.degen === true && deg.errors === 0,
    'θ = 0 的退化迭代会给出文字提示',
    `结论=${deg.verdict} 解=${deg.sol} 出现"退化"字样=${deg.degen}`);

  /* ---------- 5. 横向滚动提示 ---------- */
  console.log('\n--- 横向滚动提示 ---');
  const sc = JSON.parse(await evl(`(function(){
    var n = document.querySelectorAll('#inTbl thead th.var').length;
    for (var i=n;i<6;i++) document.getElementById('addVar').click();
    document.getElementById('solveBtn').click();
    var boxes = document.querySelectorAll('.scroll');
    var over = 0;
    for (var j=0;j<boxes.length;j++) if (boxes[j].scrollWidth > boxes[j].clientWidth + 1) over++;
    return JSON.stringify({
      overflow: over,
      hints: document.querySelectorAll('.scroll-hint').length,
      errors: window.__errors.length
    });
  })()`));
  check(sc.hints >= sc.overflow && sc.overflow > 0 && sc.errors === 0,
    '宽表格溢出时插入「左右滑动」提示',
    `溢出的表格容器=${sc.overflow} 已插入提示=${sc.hints}`);

  /* ---------- 6. 深色模式 ---------- */
  console.log('\n--- 深色模式 ---');
  await cdp.send('Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sessionId);
  await sleep(300);
  const dk = JSON.parse(await evl(`JSON.stringify({
    bg: getComputedStyle(document.body).backgroundColor,
    fg: getComputedStyle(document.body).color,
    card: getComputedStyle(document.querySelector('.card')).backgroundColor,
    input: getComputedStyle(document.querySelector('#inTbl input.num')).backgroundColor
  })`));
  const lum = s => {
    const nums = s.substring(s.indexOf('(') + 1, s.indexOf(')')).split(',').map(parseFloat);
    return nums.length >= 3 ? (nums[0] * 0.299 + nums[1] * 0.587 + nums[2] * 0.114) : -1;
  };
  const bgL = lum(dk.bg), fgL = lum(dk.fg), cardL = lum(dk.card), inputL = lum(dk.input);
  check(bgL >= 0 && bgL < 60 && cardL < 80 && inputL < 90 && fgL > 180,
    '深色模式下背景/卡片/输入框变暗、文字变亮',
    `body=${dk.bg}(亮度${bgL.toFixed(0)}) 卡片=${dk.card} 输入框=${dk.input} 文字=${dk.fg}(亮度${fgL.toFixed(0)})`);
  await cdp.send('Emulation.setEmulatedMedia', { features: [] }, sessionId);
  await sleep(200);
  const lt = JSON.parse(await evl(`JSON.stringify({
    bg: getComputedStyle(document.body).backgroundColor })`));
  check(lum(lt.bg) > 200, '切回浅色后背景恢复为浅色', `body=${lt.bg}`);

  /* ---------- 6.5 标准化卡片 ---------- */
  console.log('\n--- 标准化卡片 ---');
  const std = JSON.parse(await evl(`(function(){
    window.__T.reset(2,3); window.__T.setDir('min');
    window.__T.setC(0,4); window.__T.setC(1,1);
    window.__T.setA(0,0,3); window.__T.setA(0,1,1); window.__T.setB(0,3); window.__T.setRel(0,'=');
    window.__T.setA(1,0,4); window.__T.setA(1,1,3); window.__T.setB(1,6); window.__T.setRel(1,'>=');
    window.__T.setA(2,0,1); window.__T.setA(2,1,2); window.__T.setB(2,4); window.__T.setRel(2,'<=');
    document.getElementById('solveBtn').click();
    var lines = Array.prototype.map.call(document.querySelectorAll('.std-line'), function(e){ return e.textContent; });
    return JSON.stringify({
      all: lines.join(' ~ '),
      note: (document.querySelector('.std-note')||{}).textContent || '',
      secs: Array.prototype.map.call(document.querySelectorAll('#result h2.sec'), function(e){ return e.textContent; }),
      errors: window.__errors.length
    });
  })()`));
  check(std.all.indexOf('min z = 4x1 + x2') >= 0, '① 原问题按输入的 min 型显示');
  check(std.all.indexOf('-4x1 - x2 + 0s2 + 0s3 - Ma1 - Ma2') >= 0,
    '② 标准型目标函数：取负转 max，并按「决策变量→松弛→人工」分组');
  check(std.all.indexOf('3x1 + x2 + a1 = 3') >= 0
     && std.all.indexOf('4x1 + 3x2 - s2 + a2 = 6') >= 0
     && std.all.indexOf('x1 + 2x2 + s3 = 4') >= 0,
    '② 约束化为等式：= 补人工变量、≥ 减剩余并补人工、≤ 加松弛');
  check(std.note.indexOf('min') >= 0 && std.note.indexOf('人工变量') >= 0 && std.note.indexOf('松弛') >= 0,
    '变换说明覆盖 min 转换 / 松弛变量 / 人工变量');
  const iStd = std.secs.indexOf('标准化');
  const iGraph = std.secs.indexOf('图解法');
  const iIter = std.secs.findIndex(function (s) { return s.indexOf('迭代过程') >= 0; });
  check(iStd >= 0 && iStd < iGraph && iGraph < iIter,
    '位置顺序：标准化 → 图解法 → 迭代过程',
    std.secs.join(' / '));
  check(std.errors === 0, '标准化渲染无 JS 错误');

  /* ---------- 6.6 输入框默认值交互 ---------- */
  console.log('\n--- 输入框默认值：留空即 0 ---');
  const ph = JSON.parse(await evl(`(function(){
    window.__T.reset(2, 2);
    window.__T.setDir('max');
    var ins = document.querySelectorAll('#inTbl input.num');
    var empty = 0, phOk = 0;
    for (var i = 0; i < ins.length; i++) {
      if (ins[i].value === '') empty++;
      if (ins[i].placeholder === '0') phOk++;
    }
    /* 只填非零系数、其余格子全部留空，等价于手机上「点进去直接打字」 */
    window.__T.setC(0, 3); window.__T.setC(1, 2);
    window.__T.setA(0, 0, 1); window.__T.setB(0, 4);
    window.__T.setA(1, 1, 1); window.__T.setB(1, 3);
    document.getElementById('solveBtn').click();
    var sol = (document.querySelector('.verdict .sol') || {}).textContent || '';
    var z   = (document.querySelectorAll('.verdict .sol')[1] || {}).textContent || '';
    /* 显式填 0 应当与留空完全等价 */
    window.__T.setA(0, 1, 0); window.__T.setA(1, 0, 0);
    document.getElementById('solveBtn').click();
    var sol0 = (document.querySelector('.verdict .sol') || {}).textContent || '';
    /* 重新渲染（加一条约束）后，已经填过的数字必须还在 */
    document.getElementById('addCon').click();
    var kept = document.querySelector('#inTbl input[data-k="c"][data-j="0"]').value;
    var newb = document.querySelector('#inTbl input[data-k="b"][data-i="2"]').value;
    return JSON.stringify({ total: ins.length, empty: empty, phOk: phOk,
      sol: sol, z: z, sol0: sol0, kept: kept, newb: newb,
      errors: window.__errors.length });
  })()`));
  check(ph.total > 0 && ph.empty === ph.total && ph.phOk === ph.total,
    '新增变量/约束后输入框是空的，只显示灰色 0 占位',
    `共 ${ph.total} 格：空白 ${ph.empty}，占位正确 ${ph.phOk}`);
  check(ph.sol === 'x1 = 4　　x2 = 3' && ph.z === 'z = 18',
    '留空的格子按 0 参与计算（只填非零系数即可求解）',
    `解=${ph.sol} ${ph.z}`);
  check(ph.sol0 === ph.sol, '显式填 0 与留空结果完全一致', `填 0 后=${ph.sol0}`);
  check(ph.kept === '3', '重新渲染后已填数字保留', `x1 系数="${ph.kept}"`);
  check(ph.newb === '', '新加的那一行同样是空白', `新行 b 格="${ph.newb}"`);
  check(ph.errors === 0, '输入交互过程无 JS 错误');

  /* 用 CDP 真敲键盘：聚焦后直接输入，不该得到 "02" 这种结果（旧版就是这个问题） */
  await evl(`(function(){
    window.__T.reset(1, 1);
    document.querySelector('#inTbl input[data-k="c"][data-j="0"]').focus();
    return 'focused';
  })()`);
  await cdp.send('Input.insertText', { text: '2' }, sessionId);
  await sleep(150);
  const typed = JSON.parse(await evl(`(function(){
    var el = document.querySelector('#inTbl input[data-k="c"][data-j="0"]');
    return JSON.stringify({ val: el.value, focused: document.activeElement === el });
  })()`));
  check(typed.val === '2' && typed.focused,
    '点一下格子直接打字就是干净数字（旧版会变成 "02"）',
    `键入 "2" 后实际值="${typed.val}"`);

  /* ---------- 7. 0 变量 0 约束 ---------- */
  console.log('\n--- 0 变量 0 约束 ---');
  const zero = JSON.parse(await evl(`(function(){
    for(var i=0;i<14;i++) document.getElementById('delVar').click();
    for(var j=0;j<14;j++) document.getElementById('delCon').click();
    document.getElementById('solveBtn').click();
    return JSON.stringify({
      vars: document.querySelectorAll('#inTbl thead th.var').length,
      cons: document.querySelectorAll('#inTbl input[data-k="b"]').length,
      verdict: (document.querySelector('.verdict .vtitle')||{}).textContent || null,
      sol: (document.querySelector('.verdict .sol')||{}).textContent || null,
      errors: window.__errors.length
    });
  })()`));
  check(zero.vars === 0 && zero.cons === 0 && zero.errors === 0 && zero.verdict === '最优解',
    '0 变量 0 约束下求解不报错',
    `结论=${zero.verdict} 解=${zero.sol}`);

  console.log(`\n合计: ${pass} 通过 / ${fail} 失败`);
  ws.close(); child.kill();
  await sleep(300);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
