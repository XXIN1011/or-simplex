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
/* 应用现在有首页：回归测试要先进到「单纯形法」模块，否则元素是隐藏的、量不到尺寸 */
const pageUrl = url.indexOf('#') === -1 ? url + '#/simplex' : url;
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
  await cdp.send('Page.navigate', { url: pageUrl }, sessionId);
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

  /* ---------- 6.7 结论块与对偶解块之间必须有间距 ---------- */
  console.log('\n--- 结论区两块之间的间距 ---');
  const gap = JSON.parse(await evl(`(function(){
    window.__T.reset(2, 2); window.__T.setDir('max');
    window.__T.setC(0, 3); window.__T.setC(1, 2);
    window.__T.setA(0, 0, 1); window.__T.setB(0, 4);
    window.__T.setA(1, 1, 1); window.__T.setB(1, 3);
    document.getElementById('solveBtn').click();
    var v = document.querySelector('.verdict');
    var nx = v ? v.nextElementSibling : null;
    return JSON.stringify({
      mb: v ? parseFloat(getComputedStyle(v).marginBottom) : -1,
      gap: (v && nx) ? Math.round(nx.getBoundingClientRect().top - v.getBoundingClientRect().bottom) : -1,
      next: nx ? (nx.className || '') : '',
      errors: window.__errors.length
    });
  })()`));
  check(gap.gap >= 8 && gap.next.indexOf('card') >= 0,
    '结论块与对偶解块之间留有可见间距（不再贴成一整块）',
    `实时间距=${gap.gap}px（margin-bottom=${gap.mb}px，下一块="${gap.next}"）`);
  check(gap.errors === 0, '结论区渲染无 JS 错误');

  /* ---------- 6.8 灵敏度分析 ---------- */
  console.log('\n--- 灵敏度分析 ---');
  const sens = JSON.parse(await evl(`(function(){
    window.__T.reset(2, 3); window.__T.setDir('max');
    window.__T.setC(0, 2); window.__T.setC(1, 3);
    window.__T.setA(0,0,1); window.__T.setA(0,1,2); window.__T.setB(0,8);
    window.__T.setA(1,0,4); window.__T.setA(1,1,0); window.__T.setB(1,16);
    window.__T.setA(2,0,0); window.__T.setA(2,1,4); window.__T.setB(2,12);
    document.getElementById('solveBtn').click();
    var secs = Array.prototype.map.call(document.querySelectorAll('#result h2.sec'),
                 function(e){ return e.textContent; });
    return JSON.stringify({
      all: (document.getElementById('result').textContent||'').replace(/\\s+/g,' '),
      secs: secs,
      tables: document.querySelectorAll('table.sens').length,
      rows: document.querySelectorAll('table.sens tr').length,
      errors: window.__errors.length
    });
  })()`));
  check(sens.tables === 2 && sens.rows === 5,
    '灵敏度卡片渲染出 c 与 b 两张表共 5 行', `表=${sens.tables} 行=${sens.rows}`);
  check(sens.all.indexOf('c1 ≥ 3/2') >= 0, '基变量 x1：c1 ≥ 3/2');
  check(sens.all.indexOf('0 ≤ c2 ≤ 4') >= 0, '基变量 x2：0 ≤ c2 ≤ 4');
  check(sens.all.indexOf('4 ≤ b1 ≤ 10') >= 0, '约束 1：4 ≤ b1 ≤ 10');
  check(sens.all.indexOf('8 ≤ b2 ≤ 32') >= 0, '约束 2：8 ≤ b2 ≤ 32');
  check(sens.all.indexOf('b3 ≥ 8') >= 0, '约束 3：b3 ≥ 8');
  check(sens.all.indexOf('每 +1 → z* +4') >= 0, '基变量给出斜率提示「每 +1 → z* +4」');
  check(sens.secs.indexOf('灵敏度分析') > sens.secs.indexOf('结论'),
    '灵敏度分析排在结论区之后', sens.secs.join(' / '));
  check(sens.errors === 0, '灵敏度卡片渲染无 JS 错误');

  /* 非基变量应当只有单侧区间 */
  const sensNB = JSON.parse(await evl(`(function(){
    window.__T.reset(2, 1); window.__T.setDir('max');
    window.__T.setC(0, 2); window.__T.setC(1, 3);
    window.__T.setA(0,0,1); window.__T.setA(0,1,1); window.__T.setB(0,4);
    document.getElementById('solveBtn').click();
    return JSON.stringify({
      all: (document.getElementById('result').textContent||'').replace(/\\s+/g,' '),
      errors: window.__errors.length
    });
  })()`));
  check(sensNB.all.indexOf('c1 ≤ 3') >= 0 && sensNB.all.indexOf('非基') >= 0
        && sensNB.all.indexOf('不改变 z*') >= 0,
    '非基变量显示单侧区间（c1 ≤ 3）并标注「非基」「不改变 z*」');
  check(sensNB.errors === 0, '非基变量情形渲染无 JS 错误');

  /* 退化情形：最优基里残留取 0 的人工变量，必须给出提示 */
  const sensDG = JSON.parse(await evl(`(function(){
    window.__T.reset(4, 5); window.__T.setDir('min');
    var c = [2,8,4,-2];
    var cons = [
      {a:[3,5,-3,0],   r:'>=', b:1},
      {a:[-2,3,2,6],   r:'<=', b:-11},
      {a:[2,-3,4,3],   r:'<=', b:16},
      {a:[1,-3,5,2],   r:'<=', b:15},
      {a:[1,-3,0,-3],  r:'>=', b:8}
    ];
    c.forEach(function(v, j){ window.__T.setC(j, v); });
    cons.forEach(function(k, i){
      k.a.forEach(function(v, j){ window.__T.setA(i, j, v); });
      window.__T.setB(i, k.b);
      window.__T.setRel(i, k.r);
    });
    document.getElementById('solveBtn').click();
    return JSON.stringify({
      all: (document.getElementById('result').textContent||'').replace(/\\s+/g,' '),
      errors: window.__errors.length
    });
  })()`));
  check(sensDG.all.indexOf('人工变量') >= 0 && sensDG.all.indexOf('退化') >= 0,
    '退化情形（基中残留取 0 人工变量）给出提示');
  check(sensDG.all.indexOf('b3 = 16') >= 0 && sensDG.all.indexOf('b5 = 8') >= 0,
    '退化时被钉住的区间用等号表示（b3 = 16、b5 = 8）');
  check(sensDG.errors === 0, '退化情形渲染无 JS 错误');

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

  /* ---------- 8. 灵敏度分析模块 ---------- */
  console.log('\n--- 灵敏度分析模块（含路由）---');
  const routeBefore = JSON.parse(await evl(`JSON.stringify({
    home: document.getElementById('mod-home').classList.contains('on'),
    simp: document.getElementById('mod-simplex').classList.contains('on'),
    sens: document.getElementById('mod-sens').classList.contains('on'),
    cards: document.querySelectorAll('#mod-home a.modcard').length,
    /* 动态规划模块刻意不从首页露出（形式与其它模块不一致），只保留路由与源码 */
    dpCards: document.querySelectorAll('#mod-home a.modcard[href="#/dp"]').length,
    dpBoxes: document.querySelectorAll('#mod-dp').length
  })`));
  check(routeBefore.simp === true && routeBefore.home === false && routeBefore.cards === 4,
    '进 #/simplex 时只显示单纯形法模块，首页有 4 个模块入口',
    `home=${routeBefore.home} simplex=${routeBefore.simp} 卡片=${routeBefore.cards}`);
  check(routeBefore.dpCards === 0 && routeBefore.dpBoxes === 1,
    '首页没有动态规划入口，但它的页面容器还保留着（代码没删）',
    `首页 dp 卡片=${routeBefore.dpCards} 容器=${routeBefore.dpBoxes}`);

  await evl(`location.hash = '#/sens'; 'ok'`);
  await sleep(300);
  const routeAfter = JSON.parse(await evl(`JSON.stringify({
    home: document.getElementById('mod-home').classList.contains('on'),
    simp: document.getElementById('mod-simplex').classList.contains('on'),
    sens: document.getElementById('mod-sens').classList.contains('on')
  })`));
  check(routeAfter.sens === true && routeAfter.home === false && routeAfter.simp === false,
    '切到 #/sens 后只显示灵敏度分析模块',
    `home=${routeAfter.home} simplex=${routeAfter.simp} sens=${routeAfter.sens}`);

  const sf = JSON.parse(await evl(`(function(){
    function q(s){ return document.querySelector(s); }
    function fire(el, ev){ el.dispatchEvent(new Event(ev, {bubbles:true})); }
    function click(id){ document.getElementById(id).click(); }
    function set(sel, v){ var el = q(sel); if(el){ el.value = v; fire(el,'input'); } }

    /* 教材那道考研题：max 2x1-7x2+x3 ; x1+x2+x3<=6, -x1+2x2<=4 */
    click('sAddVar'); click('sAddVar'); click('sAddVar');
    click('sAddCon'); click('sAddCon');
    set('#sInTbl input[data-k="c"][data-j="0"]','2');
    set('#sInTbl input[data-k="c"][data-j="1"]','-7');
    set('#sInTbl input[data-k="c"][data-j="2"]','1');
    set('#sInTbl input[data-k="a"][data-i="0"][data-j="0"]','1');
    set('#sInTbl input[data-k="a"][data-i="0"][data-j="1"]','1');
    set('#sInTbl input[data-k="a"][data-i="0"][data-j="2"]','1');
    set('#sInTbl input[data-k="b"][data-i="0"]','6');
    set('#sInTbl input[data-k="a"][data-i="1"][data-j="0"]','-1');
    set('#sInTbl input[data-k="a"][data-i="1"][data-j="1"]','2');
    set('#sInTbl input[data-k="b"][data-i="1"]','4');
    click('sSolveBtn');

    var base = (document.getElementById('sBase').textContent||'').replace(/\\s+/g,' ');
    var tabs = document.querySelectorAll('#sensTabs button').length;

    q('#sensTabs button[data-t="c"]').click();
    set('[data-f="c"][data-j="0"]','2');
    set('[data-f="c"][data-j="1"]','3');
    set('[data-f="c"][data-j="2"]','1');
    click('sensGo');
    var out = ((document.getElementById('sensOut')||{}).textContent||'').replace(/\\s+/g,' ');
    return JSON.stringify({
      base: base, tabs: tabs, out: out,
      tables: document.querySelectorAll('#sensOut table').length,
      errors: window.__errors.length
    });
  })()`));
  check(sf.tabs === 6, '六个分析场景都能选', `标签数=${sf.tabs}`);
  check(sf.base.indexOf('x1 = 6') >= 0 && sf.base.indexOf('z = 12') >= 0,
    '基准题求出最优解 x1=6、z=12');
  /* 教材把「改系数」按非基变量(2.5.2) / 基变量(2.5.4)拆成两小节，这里 x2 是非基变量 */
  check(sf.out.indexOf('非基变量的系数') >= 0 && sf.out.indexOf('σ′₂') >= 0
        && sf.out.indexOf('能进基') >= 0,
    '改目标系数后按教材 2.5.2 给出判断：σ′₂ = c′₂ − z₂ = 1 > 0');
  check(sf.tables >= 1, '变化后的表接着在原最优表上迭代', `迭代表数=${sf.tables}`);
  check(sf.out.indexOf('x1 = 8/3') >= 0 && sf.out.indexOf('z = 46/3') >= 0,
    '结论与新最优解 x1=8/3、x2=10/3、z=46/3 一致');
  check(sf.errors === 0, '灵敏度分析模块无 JS 错误');

  /* ---- 新增的两个场景：技术系数 a_ij（2.5 的列系数）与参数线性规划（2.6） ---- */
  const nx = JSON.parse(await evl(`(function(){
    function q(s){ return document.querySelector(s); }
    function fire(el, ev){ el.dispatchEvent(new Event(ev, {bubbles:true})); }
    function click(id){ document.getElementById(id).click(); }
    function set(sel, v){ var el = q(sel); if(el){ el.value = v; fire(el,'input'); } }
    var r = {};

    /* ① 改技术系数：x1 在最优基里，所以走「基变量列」那条分支（整张表重算） */
    q('#sensTabs button[data-t="a"]').click();
    var con = q('[data-f="a-con"]'), vr = q('[data-f="a-var"]');
    con.value = '0'; fire(con,'change');
    vr.value = '0'; fire(vr,'change');
    r.aDefault = q('[data-f="a-val"]').value;
    var opts = document.querySelectorAll('[data-f="a-con"] option').length
             + document.querySelectorAll('[data-f="a-var"] option').length;
    r.aOpts = opts;
    set('[data-f="a-val"]','3');
    click('sensGo');
    r.aOut = ((document.getElementById('sensOut')||{}).textContent||'').replace(/\\\\s+/g,' ');
    r.aTables = document.querySelectorAll('#sensOut table').length;

    /* ② 参数线性规划 2.6.1：给 c1 加 λ 系数 1，即 c1(λ) = 2 + λ */
    q('#sensTabs button[data-t="param"]').click();
    r.pKindBtns = document.querySelectorAll('#pKind button').length;
    set('[data-f="pd"][data-j="0"]','1');
    click('sensGo');
    r.pOut = ((document.getElementById('sensOut')||{}).textContent||'').replace(/\\\\s+/g,' ');
    r.pRows = document.querySelectorAll('#sensOut table.sens tbody tr').length;

    /* ③ 2.6.2 右边系数：切到 b 那一边，确认输入表跟着换 */
    q('#pKind button[data-k="b"]').click();
    r.pInputsB = document.querySelectorAll('[data-f="pe"]').length;
    r.pInputsC = document.querySelectorAll('[data-f="pd"]').length;

    r.errors = window.__errors.length;
    return JSON.stringify(r);
  })()`));
  check(nx.aDefault === '1', '改技术系数时自动带出当前系数值', `a11 初值=${nx.aDefault}`);
  check(nx.aOpts === 2 + 3, '约束与变量下拉项的个数与题目一致', `选项数=${nx.aOpts}`);
  check(nx.aOut.indexOf('基变量') >= 0 && nx.aOut.indexOf('都要重算') >= 0,
    '改基变量列的系数时说明「整张表都要重算」（而不是只看一列）');
  check(nx.aOut.indexOf('a₁₁') >= 0, '推导里点明改的是哪个系数');
  check(nx.aTables >= 1, '改技术系数后接上迭代表', `表数=${nx.aTables}`);
  check(nx.pKindBtns === 2, '参数线性规划分变量系数 / 右边系数两种');
  check(nx.pOut.indexOf('12 + 6λ') >= 0 && nx.pOut.indexOf('λ ≥') >= 0,
    '参数线性规划给出 λ 分段与 x(λ)、z(λ)＝12+6λ');
  check(nx.pRows >= 2, '参数线性规划切出多段 λ 区间', `分段行数=${nx.pRows}`);
  check(nx.pInputsB === 2 && nx.pInputsC === 0,
    '切到右边系数后输入表换成 b_i 的 λ 系数', `b 输入=${nx.pInputsB} c 输入=${nx.pInputsC}`);
  check(nx.errors === 0, '新场景无 JS 错误');

  /* ---------- 6.6 动态规划模块 ---------- */
  console.log('\n--- 动态规划模块 ---');
  await evl(`location.hash = '#/dp'; 'ok'`);
  await sleep(220);

  const dp = JSON.parse(await evl(`(function(){
    function q(s){ return document.querySelector(s); }
    function text(el){ return ((el||{}).textContent||'').replace(/\\\\s+/g,' '); }
    var r = {};
    r.route = { dp: document.getElementById('mod-dp').classList.contains('on'),
                home: document.getElementById('mod-home').classList.contains('on') };
    r.tabs = document.querySelectorAll('#dpTabs button').length;

    /* 默认那一题就是最短路线例题，直接求解 */
    document.getElementById('dpSolveBtn').click();
    r.out = text(document.getElementById('dpOut'));
    r.stages = document.querySelectorAll('#dpOut table.sens.dpt').length;
    r.policy = text(document.querySelector('#dpOut .verdict .sol'));

    /* 换成背包 */
    q('#dpTabs button[data-t="knapsack"]').click();
    r.kItems = document.querySelectorAll('[data-kw]').length;
    document.getElementById('dpSolveBtn').click();
    r.kOut = text(document.getElementById('dpOut'));
    r.kPolicy = text(document.querySelector('#dpOut .verdict .sol'));

    /* 换成资源分配 */
    q('#dpTabs button[data-t="resource"]').click();
    document.getElementById('dpSolveBtn').click();
    r.rOut = text(document.getElementById('dpOut'));

    /* 换成生产与存储、设备更新，确认这两种也能出结果 */
    q('#dpTabs button[data-t="prodinv"]').click();
    document.getElementById('dpSolveBtn').click();
    r.pOut = text(document.getElementById('dpOut'));
    q('#dpTabs button[data-t="replace"]').click();
    document.getElementById('dpSolveBtn').click();
    r.vOut = text(document.getElementById('dpOut'));

    r.errors = window.__errors.length;
    return JSON.stringify(r);
  })()`));
  check(dp.route.dp === true && dp.route.home === false, '进 #/dp 时只显示动态规划模块');
  check(dp.tabs === 5, '动态规划有五个题型标签', `标签数=${dp.tabs}`);
  check(dp.out.indexOf('14') >= 0 && dp.policy.indexOf('B1') >= 0
        && dp.policy.indexOf('C2') >= 0 && dp.policy.indexOf('D1') >= 0,
    '最短路线例题：最优值 14、策略 B1→C2→D1→E');
  check(dp.stages >= 8, '逆序与顺序两套递推表都渲染出来', `表数=${dp.stages}`);
  check(dp.out.indexOf('顺序解法') >= 0 && dp.out.indexOf('一致') >= 0,
    '给出顺序解法对照并确认两种解法结论一致');
  check(dp.out.indexOf('f₁') >= 0 && dp.out.indexOf('s₁') >= 0,
    '递推表表头用了真下标（f₁、s₁）而不是 f_1');
  check([dp.out, dp.kOut, dp.rOut, dp.pOut, dp.vOut].every(function (x) {
    return x.indexOf('**') < 0;
  }), '五种题型渲染后的正文里都没有残留 ** 加粗标记');
  check(dp.kItems === 3, '切到背包问题后输入表换成物品表', `物品行=${dp.kItems}`);
  check(dp.kPolicy.length > 0 && dp.kOut.indexOf('背包') >= 0, '背包问题能求解并给出策略', dp.kPolicy);
  check(dp.rOut.indexOf('资源分配') >= 0 && dp.rOut.indexOf('最优策略') >= 0, '资源分配能求解');
  check(dp.pOut.indexOf('生产与存储') >= 0 && dp.pOut.indexOf('最优策略') >= 0, '生产与存储能求解');
  check(dp.vOut.indexOf('设备更新') >= 0 && dp.vOut.indexOf('最优策略') >= 0, '设备更新能求解');
  check(dp.errors === 0, '动态规划模块无 JS 错误');

  /* ---------- 6.7 整数规划模块 ---------- */
  console.log('\n--- 整数规划模块 ---');
  await evl(`location.hash = '#/ip'; 'ok'`);
  await sleep(220);

  const ip = JSON.parse(await evl(`(function(){
    function q(s){ return document.querySelector(s); }
    function text(el){ return ((el||{}).textContent||'').replace(/\\\\s+/g,' '); }
    function click(id){ document.getElementById(id).click(); }
    function set(sel, v){ var el = q(sel); if(el){ el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); } }
    var r = {};
    r.route = { ip: document.getElementById('mod-ip').classList.contains('on'),
                home: document.getElementById('mod-home').classList.contains('on') };

    /* 搭经典例题：max 3x1+2x2，2x1+3x2≤14，2x1+x2≤9，两个变量都取整 */
    click('ipAddVar'); click('ipAddVar');
    click('ipAddCon'); click('ipAddCon');
    if (window.__ipRenderTypes) window.__ipRenderTypes();
    r.typeBoxes = document.querySelectorAll('[data-vt]').length;
    set('#ipInTbl input[data-k="c"][data-j="0"]', '3');
    set('#ipInTbl input[data-k="c"][data-j="1"]', '2');
    [[0,[2,3],14],[1,[2,1],9]].forEach(function(cfg){
      var i = cfg[0];
      cfg[1].forEach(function(v, j){
        set('#ipInTbl input[data-k="a"][data-i="'+i+'"][data-j="'+j+'"]', String(v));
      });
      set('#ipInTbl input[data-k="b"][data-i="'+i+'"]', String(cfg[2]));
    });
    /* 两个变量都用默认的「整数」 */
    click('ipSolveBtn');
    r.out = text(document.getElementById('ipOut'));
    r.tables = document.querySelectorAll('#ipOut table').length;
    r.graphs = document.querySelectorAll('#ipOut .graph svg').length;
    r.latticeDots = document.querySelectorAll('#ipOut .g-int').length;
    r.ipOptDots = document.querySelectorAll('#ipOut .g-ipopt').length;

    /* 算法收纳卡：数量、编号、名称、结论标签、默认是否展开、字号是否比正文大 */
    r.meths = document.querySelectorAll('#ipMethods details.meth').length;
    r.methIdx = Array.prototype.slice.call(document.querySelectorAll('#ipMethods .meth-i'))
      .map(function (el){ return el.textContent.trim(); });
    r.methNames = Array.prototype.slice.call(document.querySelectorAll('#ipMethods .meth-n'))
      .map(function (el){ return el.textContent.trim(); });
    r.methChips = Array.prototype.slice.call(document.querySelectorAll('#ipMethods .meth-c'))
      .map(function (el){ return el.textContent.trim(); });
    r.methAllOpen = Array.prototype.slice.call(document.querySelectorAll('#ipMethods details.meth'))
      .every(function (d){ return d.open; });
    var nameEl = document.querySelector('#ipMethods .meth-n');
    var noteEl = document.querySelector('#ipMethods .sens-note');
    r.namePx = nameEl ? parseFloat(getComputedStyle(nameEl).fontSize) : 0;
    r.notePx = noteEl ? parseFloat(getComputedStyle(noteEl).fontSize) : 0;
    r.nameWeight = nameEl ? String(getComputedStyle(nameEl).fontWeight) : '';
    /* 点标题栏应收起，再点应展开 */
    var firstMeth = document.querySelector('#ipMethods details.meth');
    if (firstMeth) {
      firstMeth.querySelector('summary').click();
      r.openAfterFirstClick = firstMeth.open;
      firstMeth.querySelector('summary').click();
      r.openAfterSecondClick = firstMeth.open;
    }

    /* 把两个变量都改成 0-1，隐枚举就应当变成可用（只改一个是没用的：
       隐枚举要求**所有**变量都是 0-1） */
    q('[data-vt="0"] button[data-t="bin"]').click();
    q('[data-vt="1"] button[data-t="bin"]').click();
    click('ipSolveBtn');
    r.outBin = text(document.getElementById('ipOut'));

    /* ★ 最小化 + 0-1：隐枚举曾经在 min 方向上把「挑最好解」的比较符号写反
       （标准形永远是求最大），报出来的最优值直接是错的；而且枚举表的 z 列
       显示的是取负后的值，跟题目对不上。这两个都要盯住。 */
    q('#ipDirSeg button[data-dir="min"]').click();
    set('#ipInTbl input[data-k="c"][data-j="0"]', '4');
    set('#ipInTbl input[data-k="c"][data-j="1"]', '3');
    set('#ipInTbl input[data-k="a"][data-i="0"][data-j="0"]', '1');
    set('#ipInTbl input[data-k="a"][data-i="0"][data-j="1"]', '1');
    var sel0 = q('#ipInTbl select[data-i="0"]');
    if (sel0) { sel0.value = '>='; sel0.dispatchEvent(new Event('change', {bubbles:true})); }
    set('#ipInTbl input[data-k="b"][data-i="0"]', '1');
    click('ipSolveBtn');
    r.outMin = text(document.getElementById('ipOut'));
    r.minRowZ = Array.prototype.slice.call(document.querySelectorAll('#ipOut table.sens.en tbody tr'))
      .map(function (tr){ return tr.children[2] ? tr.children[2].textContent.trim() : ''; });

    r.errors = window.__errors.length;
    return JSON.stringify(r);
  })()`));
  check(ip.route.ip === true && ip.route.home === false, '进 #/ip 时只显示整数规划模块');
  check(ip.typeBoxes === 2, '每个变量各有一组 连续/整数/0-1 选择器', `组数=${ip.typeBoxes}`);
  check(ip.out.indexOf('13/4') >= 0 && ip.out.indexOf('5/2') >= 0,
    '先给出松弛问题的最优解（x1=13/4、x2=5/2）');
  check(ip.out.indexOf('解里有非整数分量') >= 0, '明确指出松弛解不满足整数要求');
  /* 适用性判定：全整数 2 变量题 → 图解/分枝定界/割平面可用，隐枚举不可用 */
  check(ip.out.indexOf('✓ 图解法') >= 0 && ip.out.indexOf('✓ 分枝定界法') >= 0
        && ip.out.indexOf('✓ 割平面法') >= 0 && ip.out.indexOf('✗ 隐枚举法') >= 0,
    '适用性一览：图解法/分枝定界/割平面打勾、隐枚举打叉');
  check(ip.out.indexOf('符合教材里割平面法要求的标准形式') >= 0,
    '割平面法给出了「为什么适用」的理由');
  check(ip.out.indexOf('要求所有变量都是 0-1 变量') >= 0,
    '隐枚举法给出了「为什么不能用」的理由');
  /* 结果本身 */
  check(ip.out.indexOf('x₁ = 4') >= 0 || ip.out.indexOf('x1 = 4') >= 0, '算出最优整数解 x1=4');
  check(ip.out.indexOf('14') >= 0, '最优值 z=14');
  check(ip.graphs === 1 && ip.latticeDots > 0 && ip.ipOptDots === 1,
    '图解法画出了可行域、整数格点与最优整数解',
    `图=${ip.graphs} 格点=${ip.latticeDots} 整数最优点=${ip.ipOptDots}`);
  check(ip.out.indexOf('分枝定界法') >= 0 && ip.out.indexOf('结点 1') >= 0,
    '分枝定界法输出了逐结点的过程');
  check(ip.out.indexOf('第 1 刀') >= 0 && ip.out.indexOf('Gomory 割') >= 0,
    '割平面法输出了割的推导与每一刀');
  check(ip.tables >= 8, '各方法的迭代表都渲染出来了', `表数=${ip.tables}`);
  /* 算法收纳卡 */
  check(ip.meths === 3 && ip.methNames.join('|') === '图解法|分枝定界法|割平面法',
    '三个适用的算法各有一张收纳卡，顺序与名称正确',
    `卡片=${ip.meths} 名称=${ip.methNames.join('/')}`);
  check(ip.methIdx.join('|') === '1|2|3', '每张卡左侧有编号徽章', `编号=${ip.methIdx.join('/')}`);
  check(ip.methChips.length === 3 && ip.methChips.every(function (c) {
    return c.indexOf('z = 14') >= 0;
  }), '每张卡右侧都有结论标签（收起时也能看到结果）', `标签=${ip.methChips.join(' / ')}`);
  check(ip.methAllOpen === true, '算法卡默认全部展开（不会突然藏起内容）');
  check(ip.openAfterFirstClick === false && ip.openAfterSecondClick === true,
    '点标题栏能收起、再点能展开',
    `点一次 open=${ip.openAfterFirstClick}，点两次 open=${ip.openAfterSecondClick}`);
  check(ip.namePx >= ip.notePx * 1.2 && /^(700|bold)$/.test(ip.nameWeight),
    '算法名称明显比正文突出（字号更大且加粗）',
    `名称 ${ip.namePx}px/${ip.nameWeight} vs 正文 ${ip.notePx}px`);
  check(ip.out.indexOf('**') < 0, '算法输出里没有残留 ** 加粗标记');
  /* 把 x2 改成 0-1 后隐枚举应变为可用 */
  check(ip.outBin.indexOf('✓ 隐枚举法') >= 0 && ip.outBin.indexOf('隐枚举') >= 0,
    '把变量改成 0-1 后，隐枚举法自动变成可用并输出');
  /* 最小化方向 */
  check(ip.outMin.indexOf('✓ 隐枚举法') >= 0, '最小化 0-1 题也判出隐枚举法可用');
  check(ip.outMin.indexOf('整体取负') >= 0 && ip.outMin.indexOf('z（本题）') >= 0,
    '最小化时说明「先把目标系数整体取负化成求最大」，且表头标明 z 是本题口径');
  check(ip.outMin.indexOf('z = 3') >= 0,
    '最小化 0-1 题：最优值 z = 3（曾因比较符号写反而报错）');
  /* 枚举表里的 z 必须是原题口径（不是取负后的值）——本题所有点的 z 都非负 */
  check(ip.minRowZ.length > 0 && ip.minRowZ.every(function (v) {
    return v !== '' && parseFloat(v) >= 0;
  }), '最小化题枚举表里的 z 都是原题口径（非取负后的负数）',
    `表内 z 列=${ip.minRowZ.join('/')}`);
  check(ip.errors === 0, '整数规划模块无 JS 错误');

  /* ---------- 9. 库存论模块（教材第 9 章 9.2~9.6） ---------- */
  console.log('\n--- 库存论模块（教材第 9 章 9.2~9.6）---');
  await evl(`location.hash = '#/inv'; 'ok'`);
  await sleep(300);
  const inv = JSON.parse(await evl(`(function(){
    function q(s){ return document.querySelector(s); }
    function click(id){ document.getElementById(id).click(); }
    function set(id, v){ var el = document.getElementById(id); if(el){ el.value = v; el.dispatchEvent(new Event('input',{bubbles:true})); } }
    function setSel(sel, v){ var el = q(sel); if(el){ el.value = v; el.dispatchEvent(new Event('input',{bubbles:true})); } }
    function text(el){ return ((el||{}).textContent||'').replace(/\\s+/g,' '); }
    function tab(k){ q('#invTabs button[data-k="'+k+'"]').click(); }
    var r = {};

    r.route = {
      inv: document.getElementById('mod-inv').classList.contains('on'),
      home: document.getElementById('mod-home').classList.contains('on'),
      cards: document.querySelectorAll('#mod-home a.modcard').length,
      invCard: document.querySelectorAll('#mod-home a.modcard[href="#/inv"]').length
    };
    r.subtitle = text(q('#mod-home .hero p'));
    r.tabs = document.querySelectorAll('#invTabs button').length;
    r.tabNames = Array.prototype.slice.call(document.querySelectorAll('#invTabs button'))
      .map(function(e){ return e.textContent.trim(); });

    /* 9.2 EOQ（进模块默认就是它，且已预填算例） */
    click('invSolveBtn');
    r.eoq = text(document.getElementById('invOut'));
    r.eoqVerdict = text(q('#invOut .verdict .vtitle'));
    r.eoqSteps = Array.prototype.slice.call(document.querySelectorAll('#invOut .meth-n'))
      .map(function(e){ return e.textContent.trim(); });
    r.eoqMethCount = document.querySelectorAll('#invOut details.meth').length;
    r.allOpen = Array.prototype.slice.call(document.querySelectorAll('#invOut details.meth'))
      .every(function(d){ return d.open; });
    r.eqboxSub = document.querySelectorAll('#invOut .eqbox sub').length;

    /* 9.3 允许缺货 */
    tab('short'); click('invSolveBtn');
    r.short = text(document.getElementById('invOut'));

    /* 9.4 陆续到货 */
    tab('epq'); click('invSolveBtn');
    r.epq = text(document.getElementById('invOut'));
    set('if_p', '30'); click('invSolveBtn');
    r.epqBad = text(document.getElementById('invBanners'));
    set('if_p', '100');

    /* 9.5 批量折扣 */
    tab('disc');
    r.discTierInputs = document.querySelectorAll('#invDiscTbl input[data-f="lo"]').length;
    r.discHasRate = document.querySelectorAll('#if_rate').length;
    click('invSolveBtn');
    r.disc = text(document.getElementById('invOut'));
    r.discBestRow = (function(){
      var tr = q('#invOut table.inv tr.best');
      return tr ? tr.textContent.replace(/\\s+/g,' ').trim() : '';
    })();
    click('invDiscAdd');
    r.discTiersAfterAdd = document.querySelectorAll('#invDiscTbl input[data-f="lo"]').length;
    click('invDiscDel');
    r.discTiersAfterDel = document.querySelectorAll('#invDiscTbl input[data-f="lo"]').length;
    /* 切到「绝对存贮费」口径：只应渲染 c1 一个框，且还能算出结果 */
    q('#if_mode button[data-k="abs"]').click();
    r.discAbsHasC1 = document.querySelectorAll('#if_c1a').length;
    r.discAbsHasRate = document.querySelectorAll('#if_rate').length;
    click('invSolveBtn');
    r.discAbs = text(document.getElementById('invOut'));
    /* 切回去，rate 的值不该被清掉 */
    q('#if_mode button[data-k="rate"]').click();
    r.rateAfterRoundTrip = (document.getElementById('if_rate')||{}).value;

    /* 参数校验：第一档下限不是 0 必须被拦下 */
    setSel('#invDiscTbl input[data-f="lo"]', '100');
    click('invSolveBtn');
    r.discBad = text(document.getElementById('invBanners'));
    setSel('#invDiscTbl input[data-f="lo"]', '0');

    /* 9.6 多产品约束 */
    tab('multi');
    r.multiCols = document.querySelectorAll('#invMultiTbl tr:first-child th').length;
    r.multiRows = document.querySelectorAll('#invMultiTbl input[data-f="D"]').length;
    click('invSolveBtn');
    r.multi = text(document.getElementById('invOut'));
    click('invMultiAdd');
    r.multiRowsAfterAdd = document.querySelectorAll('#invMultiTbl input[data-f="D"]').length;
    click('invMultiDel');
    r.multiRowsAfterDel = document.querySelectorAll('#invMultiTbl input[data-f="D"]').length;
    set('if_limit', ''); click('invSolveBtn');
    r.multiBad = text(document.getElementById('invBanners'));

    r.errors = window.__errors.length;
    return JSON.stringify(r);
  })()`));
  check(inv.route.inv === true && inv.route.home === false, '进 #/inv 时只显示库存论模块');
  check(inv.route.cards === 4 && inv.route.invCard === 1,
    '首页有 4 个模块入口，其中一个是库存论',
    `卡片=${inv.route.cards} 库存论卡=${inv.route.invCard}`);
  check(inv.subtitle.indexOf('库存论') >= 0, '首页副标题已加上「库存论」', inv.subtitle);
  check(inv.tabs === 5 && inv.tabNames[0].indexOf('9.2') >= 0
        && inv.tabNames[4].indexOf('9.6') >= 0,
    '5 个模型选择按钮，按教材章节顺序 9.2→9.6', inv.tabNames.join(' / '));

  /* --- 9.2 EOQ --- */
  check(inv.eoqVerdict.indexOf('Q* = 1,000 件') >= 0,
    'EOQ：结论给出 Q* = 1,000 件（与已验证的算例一致）', inv.eoqVerdict);
  check(inv.eoq.indexOf('4,000') >= 0 && inv.eoq.indexOf('10,000') >= 0,
    'EOQ：给出最小总费用 4,000 与公式里的 D = 10,000');
  check(inv.eoq.indexOf('104,000') >= 0 && inv.eoq.indexOf('100,000') >= 0,
    'EOQ：费用构成含采购成本 100,000 与年总费用 104,000');
  check(inv.eoqMethCount === 4 && inv.eoqSteps[0].indexOf('目标函数与求导') === 0,
    'EOQ：4 张步骤卡，首张是「目标函数与求导」', inv.eoqSteps.join(' / '));
  check(inv.allOpen === true, '步骤卡默认全部展开（不会把推导藏起来）');
  check(inv.eqboxSub > 0, '公式里的下标渲染成了真正的 <sub>', `sub 数=${inv.eqboxSub}`);

  /* --- 9.3 允许缺货 --- */
  check(inv.short.indexOf('1,732.0508') >= 0 && inv.short.indexOf('1,154.7005') >= 0,
    '允许缺货：Q* = 1,732.0508、B* = 1,154.7005（与对拍值一致）');
  check(inv.short.indexOf('2,309.4011') >= 0, '允许缺货：最小总费用 2,309.4011');
  check(inv.short.indexOf('与不允许缺货') >= 0, '允许缺货：给出了与 9.2 EOQ 的对照');

  /* --- 9.4 陆续到货 --- */
  check(inv.epq.indexOf('1,290.9944') >= 0 && inv.epq.indexOf('774.5967') >= 0,
    '陆续到货：Q* = 1,290.9944、S* = 774.5967（与对拍值一致）');
  check(inv.epq.indexOf('单位口径') >= 0 && inv.epq.indexOf('3,098.3867') >= 0,
    '陆续到货：既做了单位口径校验、也给出 C* = 3,098.3867');
  check(inv.epqBad.indexOf('必须大于需求率') >= 0,
    '陆续到货：p ≤ d 被拦下并给出中文提示', inv.epqBad);

  /* --- 9.5 批量折扣 --- */
  check(inv.discTierInputs === 4, '批量折扣：默认 4 档价格可输入', `档数=${inv.discTierInputs}`);
  check(inv.discHasRate === 1, '批量折扣：费率口径下只渲染一个存贮费输入框');
  check(inv.disc.indexOf('44,450') >= 0 && inv.disc.indexOf('2,000') >= 0,
    '批量折扣：全局最优 Q* = 2,000、总费用 44,450（与对拍值一致）');
  check(inv.discBestRow.indexOf('第 4 档') >= 0 && inv.discBestRow.indexOf('44,450') >= 0,
    '批量折扣：最优那一行被高亮标出（第 4 档 44,450）', inv.discBestRow);
  check(inv.disc.indexOf('必须计入采购费') >= 0,
    '批量折扣：明确提示必须计入采购费 D·K');
  check(inv.discTiersAfterAdd === 5 && inv.discTiersAfterDel === 4,
    '批量折扣：能加档也能减档', `加后=${inv.discTiersAfterAdd} 减后=${inv.discTiersAfterDel}`);
  check(inv.discAbsHasC1 === 1 && inv.discAbsHasRate === 0,
    '批量折扣：切到「绝对存贮费」口径后只渲染 c1 一个框',
    `c1=${inv.discAbsHasC1} rate=${inv.discAbsHasRate}`);
  check(inv.discAbs.indexOf('44,750') >= 0,
    '批量折扣：绝对存贮费口径下算出 44,750（各档 Qᵢ* 相同，最优批量仍被顶到 2,000）');
  check(inv.rateAfterRoundTrip === '0.2',
    '批量折扣：来回切换口径不会把费率的值清空', `rate=${inv.rateAfterRoundTrip}`);
  check(inv.discBad.indexOf('第一档的分界点下限必须是 0') >= 0,
    '批量折扣：第一档下限不为 0 被拦下', inv.discBad);

  /* --- 9.6 多产品约束 --- */
  check(inv.multiCols === 6 && inv.multiRows === 2,
    '多产品：输入表 6 列（产品/D/c₁/c₃/K/v）、默认 2 个产品',
    `列=${inv.multiCols} 行=${inv.multiRows}`);
  check(inv.multi.indexOf('0.12199254') >= 0, '多产品：λ* = 0.12199254（与对拍值一致）');
  check(inv.multi.indexOf('788.1195') >= 0 && inv.multi.indexOf('474.587') >= 0,
    '多产品：各产品 Qᵢ* = 788.1195 / 474.587（与对拍值一致）');
  check(inv.multi.indexOf('6,406.1271') >= 0 && inv.multi.indexOf('15,000') >= 0,
    '多产品：总费用 6,406.1271、资源占用 15,000');
  check(inv.multi.indexOf('拉格朗日') >= 0 && inv.multi.indexOf('影子价格') >= 0
        && inv.multi.indexOf('二分法') >= 0,
    '多产品：输出了拉格朗日一阶条件、二分法迭代与影子价格解读');
  check(inv.multiRowsAfterAdd === 3 && inv.multiRowsAfterDel === 2,
    '多产品：能加产品也能减产品',
    `加后=${inv.multiRowsAfterAdd} 减后=${inv.multiRowsAfterDel}`);
  check(inv.multiBad.indexOf('不能为空') >= 0,
    '多产品：必填项留空被拦下并给出中文提示', inv.multiBad);

  /* --- 通用 --- */
  check([inv.eoq, inv.short, inv.epq, inv.disc, inv.multi].every(function (t) {
    return t.indexOf('**') < 0;
  }), '五个模型的输出里都没有残留 ** 加粗标记');
  check(inv.errors === 0, '库存论模块无 JS 错误');

  console.log(`\n合计: ${pass} 通过 / ${fail} 失败`);
  ws.close(); child.kill();
  await sleep(300);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
