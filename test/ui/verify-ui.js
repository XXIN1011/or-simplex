/* UI 层回归验证
   1) 初始空状态（0 变量 0 约束、例题已删净）
   2) 自行搭题求解：四类结论 + 对偶解
   3) 图解法：2 变量出现、3 变量不出现
   4) 退化提示
   5) 横向滚动提示
   6) 深色模式（跟随系统）
   7) 0 变量 0 约束求解 + 极限尺寸
   8) 底部标签栏（只剩首页/设置 + 滑动指示器）
   9) 显示模式三档：跟随系统 / 浅色 / 深色
*/
'use strict';
const fs = require('fs');
const path = require('path');
const chrome = require('../../lib/chrome.js');
const { sleep, resolveTarget } = chrome;
const quiet = require('../../lib/quiet.js');

/* 应用现在有首页：回归测试要先进到「单纯形法」模块，否则元素是隐藏的、量不到尺寸 */
const T = resolveTarget(process.argv[2] || 'index.html', '#/simplex');
const url = T.url;
const pageUrl = T.pageUrl;

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

(async () => {
  const q = quiet.begin('verify-ui');
  const sess = await chrome.launch({ url: pageUrl, captureErrors: true, waitMs: 1100 });
  const cdp = sess.cdp, sessionId = sess.sessionId;

  const evl = sess.evl;
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
    /* ★ 取 html 而不是 body：玻璃主题为了放固定定位的极光层，把基质色移到了
       html、让 body 透明 —— z-index:-1 的伪元素绘制在 body 自身背景「之下」，
       body 只要还带实色底，极光就会被整块盖住（实测过）。 */
    bg: getComputedStyle(document.documentElement).backgroundColor,
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
    bg: getComputedStyle(document.documentElement).backgroundColor })`));
  check(lum(lt.bg) > 200, '切回浅色后背景恢复为浅色', `html=${lt.bg}`);

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
    boxCount: document.querySelectorAll('.mod').length
  })`));
  check(routeBefore.simp === true && routeBefore.home === false && routeBefore.cards === 4,
    '进 #/simplex 时只显示单纯形法模块，首页有 4 个模块入口',
    `home=${routeBefore.home} simplex=${routeBefore.simp} 卡片=${routeBefore.cards}`);
  check(routeBefore.boxCount === 6,
    '全站共 6 个页面容器（首页 / 单纯形法 / 灵敏度分析 / 整数规划 / 指派问题 / 设置）',
    `容器数=${routeBefore.boxCount}`);

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

  /* ---------- 9. 指派问题模块（匈牙利法） ---------- */
  console.log('\n--- 指派问题模块（匈牙利法）---');
  await evl(`location.hash='#/assign'; 'ok'`);
  await sleep(320);

  const asInit = JSON.parse(await evl(`JSON.stringify({
    route: document.getElementById('mod-assign').classList.contains('on'),
    home: document.getElementById('mod-home').classList.contains('on'),
    others: ['simplex','sens','ip'].filter(function(m){ return document.getElementById('mod-'+m).classList.contains('on'); }),
    dir: (document.querySelector('#asDirSeg button.on')||{}).textContent || null,
    inputs: document.querySelectorAll('#asInTbl input').length,
    tip: (document.querySelector('#asInTbl .empty-tip')||{}).textContent || '',
    btns: ['asAddRow','asDelRow','asAddCol','asDelCol','asSolveBtn'].filter(function(id){ return !!document.getElementById(id); }).length,
    out: document.getElementById('asOut').innerHTML.length,
    symbols: document.querySelectorAll('#mod-assign details.help li').length,
    errors: window.__errors.length
  })`));
  check(asInit.route === true && asInit.home === false && asInit.others.length === 0,
    '进 #/assign 时只显示指派问题模块',
    `others=${asInit.others.join('/')} home=${asInit.home}`);
  check(asInit.inputs === 0 && asInit.dir === 'min' && asInit.btns === 5,
    '打开时系数矩阵是空的、默认按 min（教材的常见口径）、五个按钮齐全',
    `输入框=${asInit.inputs} 方向=${asInit.dir} 按钮=${asInit.btns}`);
  check(asInit.tip.indexOf('还没有系数矩阵') >= 0,
    '空状态给出「+ 行 / + 列 搭矩阵」的提示（不是预填的例题）',
    `提示=${asInit.tip.slice(0, 24)}…`);
  check(asInit.out === 0, '打开时不显示结果');
  check(asInit.symbols >= 10,
    '符号说明是可折叠的一块，条目来自 core/assignment.js（界面不另写一份文案）',
    `条目数=${asInit.symbols}`);

  /* 空矩阵直接求解：必须给出确定结论，而不是「至少要有 1 行」这类拦截 */
  await evl(`document.getElementById('asSolveBtn').click()`);
  await sleep(240);
  const asEmpty = JSON.parse(await evl(`JSON.stringify({
    verdict: (document.querySelector('#asOut .vtitle')||{}).textContent || null,
    sol: (document.querySelector('#asOut .sol')||{}).textContent || null,
    banner: document.getElementById('asBanners').innerHTML.length,
    errors: window.__errors.length
  })`));
  check(asEmpty.verdict === '空问题' && /z = 0/.test(asEmpty.sol || '') && asEmpty.banner === 0,
    '0 行 0 列照样能求解：结论是「空问题，z = 0」，不弹错误横幅',
    `结论=${asEmpty.verdict} ${asEmpty.sol}`);

  /* 4×4 最小化：行归约 → 列归约 → 试指派 一次到位 */
  const asMin = JSON.parse(await evl(`(function(){
    window.__asFill(4, 4, [[2,15,13,4],[10,4,14,15],[9,14,16,13],[7,8,11,9]]);
    document.getElementById('asSolveBtn').click();
    var out = document.getElementById('asOut');
    var txt = out.textContent;
    return JSON.stringify({
      verdict: (out.querySelector('.vtitle')||{}).textContent || null,
      z: (out.querySelector('.sol')||{}).textContent || null,
      steps: Array.prototype.map.call(out.querySelectorAll('.iter-head .name'), function(n){ return n.textContent.trim(); }),
      rounds: out.querySelectorAll('details.meth').length,
      matrices: out.querySelectorAll('table.mtxout').length,
      circles: out.querySelectorAll('table.mtxout .circ').length,
      crossed: out.querySelectorAll('table.mtxout .cross').length,
      assigned: txt.indexOf('人员1 → 工作4') >= 0 && txt.indexOf('人员2 → 工作2') >= 0,
      hasTransform: txt.indexOf('b = M − c') >= 0,
      star: txt.indexOf('**') >= 0,
      firstRow: (function(){ var i = document.querySelector('#asInTbl input[data-i="0"][data-j="0"]'); return i ? i.value : null; })(),
      errors: window.__errors.length
    });
  })()`));
  check(asMin.steps.join('|') === '① 行归约|② 列归约|③ 试指派',
    '步骤编号与教材一致：① 行归约 → ② 列归约 → ③ 试指派（一步到位就不出现 ④⑤）',
    `步骤=${asMin.steps.join(' → ')}`);
  check(asMin.z.indexOf('z = 28') >= 0 && asMin.assigned,
    'min 4×4：最小总费用 28，并逐行列出派给谁', `结论=${asMin.z}`);
  check(asMin.circles === 4 && asMin.crossed > 0,
    '矩阵上圈出 4 个独立零元素（互不同行同列），同行同列的其它 0 被划掉',
    `圈=${asMin.circles} 划=${asMin.crossed}`);
  check(asMin.matrices >= 3 && asMin.rounds === 1,
    '每一步都画出了一张矩阵（行归约/列归约/试指派），并按轮次收纳',
    `矩阵数=${asMin.matrices} 轮数=${asMin.rounds}`);
  check(asMin.hasTransform === false && asMin.firstRow === '2',
    '最小化问题不做 b = M − c 转换；输入的矩阵原样进了迭代', `首格=${asMin.firstRow}`);
  check(asMin.star === false, '输出里没有残留 ** 加粗标记');
  check(asMin.errors === 0, '指派问题模块（最小化）无 JS 错误',
    `页面错误数=${asMin.errors}`);

  /* 4×4 最大化：先 b = M − c，两轮迭代，覆盖线与调整都要出现 */
  const asMax = JSON.parse(await evl(`(function(){
    var b = document.querySelector('#asDirSeg button[data-dir="max"]');
    if (b) b.click();
    window.__asFill(4, 4, [[38,42,31,45],[26,20,35,28],[40,33,29,37],[22,30,41,25]]);
    document.getElementById('asSolveBtn').click();
    var out = document.getElementById('asOut');
    var txt = out.textContent;
    return JSON.stringify({
      dir: (document.querySelector('#asDirSeg button.on')||{}).textContent || null,
      z: (out.querySelector('.sol')||{}).textContent || null,
      rounds: out.querySelectorAll('details.meth').length,
      steps: Array.prototype.map.call(out.querySelectorAll('.iter-head .name'), function(n){ return n.textContent.trim(); }),
      hLines: out.querySelectorAll('table.mtxout td.lr').length,
      vLines: out.querySelectorAll('table.mtxout td.lc').length,
      hasM: txt.indexOf('M = 45') >= 0 && txt.indexOf('b<sub>') === -1,
      hasCover: txt.indexOf('覆盖线') >= 0 && txt.indexOf('θ') >= 0,
      hasCheck: txt.indexOf('检验') >= 0 && txt.indexOf('Σb') >= 0,
      errors: window.__errors.length
    });
  })()`));
  check(asMax.dir === 'max' && asMax.z.indexOf('z = 151') >= 0,
    'max 4×4：最大总收益 151（= 42+28+40+41，与最小化口径的独立实现一致）',
    `方向=${asMax.dir} 结论=${asMax.z}`);
  check(asMax.hasM, '先讲清 b = M − c 的转换（M 取矩阵最大元素 45）');
  check(asMax.rounds === 2 && asMax.steps.indexOf('④ 覆盖线') >= 0 && asMax.steps.indexOf('⑤ 矩阵调整') >= 0,
    '这道题要迭代两轮：出现 ④ 覆盖线 与 ⑤ 矩阵调整',
    `轮数=${asMax.rounds} 步骤=${asMax.steps.join('/')}`);
  check(asMax.hLines > 0 && asMax.vLines > 0,
    '覆盖线真的画在矩阵上（横线 = 没打勾的行、竖线 = 打勾的列）',
    `横线格=${asMax.hLines} 竖线格=${asMax.vLines}`);
  check(asMax.hasCover && asMax.hasCheck,
    '覆盖线/θ 的讲解与「Σb = n·M − z」的检验都写出来了');
  check(asMax.errors === 0, '指派问题模块（最大化）无 JS 错误',
    `页面错误数=${asMax.errors}`);

  /* 非标准情形：人数与工作数不等 + 禁止指派（单元格里填 ×） */
  const asForbid = JSON.parse(await evl(`(function(){
    var b = document.querySelector('#asDirSeg button[data-dir="min"]');
    if (b) b.click();
    window.__asFill(2, 3, [[3, 8, null], [7, null, 5]]);
    document.getElementById('asSolveBtn').click();
    var out = document.getElementById('asOut');
    var txt = out.textContent;
    var cell = document.querySelector('#asInTbl input[data-i="0"][data-j="2"]');
    return JSON.stringify({
      cellText: cell ? cell.value : null,
      z: (out.querySelector('.sol')||{}).textContent || null,
      hasVirtual: txt.indexOf('虚拟人员') >= 0,
      virtualRow: out.textContent.indexOf('虚拟人员1 →') >= 0,
      hasX: out.querySelector('table.mtxout .forbid') !== null,
      converts: txt.indexOf('人数与工作数不等') >= 0,
      errors: window.__errors.length
    });
  })()`));
  check(asForbid.cellText === '×', '单元格里填的 × 原样显示（表示禁止指派）', `格内容=${asForbid.cellText}`);
  check(asForbid.converts && asForbid.hasVirtual,
    '人数与工作数不等时自动补虚拟人员并说明清楚');
  check(asForbid.z.indexOf('z = 8') >= 0 && asForbid.virtualRow && asForbid.hasX,
    'min 2 人 3 事 + 两处禁止指派：最优 3+5=8，矩阵上画出 ×，结果为虚拟人员接走多出来的工作',
    `结论=${asForbid.z}`);
  check(asForbid.errors === 0, '指派问题模块（禁止指派）无 JS 错误',
    `页面错误数=${asForbid.errors}`);

  /* ---------- 底部导航的滑动指示器 ---------- */
  console.log('\n--- 底部导航滑动指示器 ---');
  /* 高亮底由一个 .tb-pill 元素承担，切模块时用 transform 平移过去。
     断言六件事：① 底栏就是「首页」「设置」两个入口、顺序对；② 元素存在且对齐
     当前标签；③ 高亮不再由 .on 自己画背景（否则切换会「旧的瞬间消失 + 新的瞬间
     出现」）；④ 过渡挂在 transform 上；⑤ 切换后位置真的变了；⑥ 进到不在底栏里的
     算法模块时指示器整个隐去（而不是错误地亮着「首页」）；
     再单独验一条：开「减少动态效果」时不做动画。

     ★ 必须先显式声明 no-preference：无头 Chrome 默认就把 prefers-reduced-motion
     报成 reduce，而样式表末尾有一条 *{transition:none!important} 的兜底规则 ——
     不声明的话这里量到的过渡永远是 none，会误判成「动画没做」。 */
  await cdp.send('Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, sessionId);
  await sleep(250);
  const navTo = async (hash) => {
    await cdp.send('Runtime.evaluate', { expression: `location.hash='${hash}'` }, sessionId);
    await sleep(700);            /* 过渡 340ms，等它滑到位再量 */
    return JSON.parse(await evl(`JSON.stringify((function(){
      var bar = document.querySelector('.tabbar');
      var pill = bar && bar.querySelector('.tb-pill');
      var act = bar && bar.querySelector('a.on');
      var links = bar ? bar.querySelectorAll('a') : [];
      if(!pill) return { hasPill:false };
      var pr = pill.getBoundingClientRect();
      var ar = act ? act.getBoundingClientRect() : null;
      var ps = getComputedStyle(pill);
      return { hasPill:true, op:ps.opacity, tp:ps.transitionProperty,
               armed:pill.classList.contains('on'),
               pl:Math.round(pr.left), pw:Math.round(pr.width),
               label:act ? act.textContent.trim() : null,
               labels:Array.prototype.map.call(links, function(a){ return a.textContent.trim(); }),
               al:ar ? Math.round(ar.left) : null, aw:ar ? Math.round(ar.width) : null,
               onBg:act ? getComputedStyle(act).backgroundColor : null };
    })())`));
  };

  const n1 = await navTo('#/');
  check(n1.hasPill, '底部导航里存在滑动指示器元素 .tb-pill');
  check(n1.labels.join('/') === '首页/设置',
    '底栏只剩「首页」「设置」两个入口（三个算法模块改为从首页卡片进）',
    `底栏标签=${n1.labels.join('/')}`);
  check(n1.label === '首页' && Math.abs(n1.pl - n1.al) <= 1 && Math.abs(n1.pw - n1.aw) <= 2,
    '指示器与「首页」标签的位置和宽度都对齐',
    `指示器 left=${n1.pl} w=${n1.pw}；标签 left=${n1.al} w=${n1.aw}`);
  check(n1.onBg === 'rgba(0, 0, 0, 0)',
    '高亮底交给指示器承担，.on 自身不再画背景（避免「消失又出现」）',
    `a.on background=${n1.onBg}`);
  check(/transform/.test(n1.tp),
    '指示器的过渡挂在 transform 上（合成层，不触发布局重算）', `transitionProperty=${n1.tp}`);

  /* 反过来也要验：系统开了「减少动态效果」时必须真的不做动画 */
  await cdp.send('Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await sleep(250);
  const nRm = JSON.parse(await evl(`JSON.stringify((function(){
    var ps = getComputedStyle(document.querySelector('.tb-pill'));
    return { prop: ps.transitionProperty, dur: ps.transitionDuration };
  })())`));
  check(nRm.prop === 'none' || nRm.dur === '0s' || nRm.dur === '0s, 0s, 0s',
    '系统开启「减少动态效果」时指示器不做动画（尊重设置，不是硬编码动画）',
    `transitionProperty=${nRm.prop} duration=${nRm.dur}`);
  await cdp.send('Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, sessionId);
  await sleep(200);

  const n2 = await navTo('#/settings');
  check(n2.label === '设置' && n2.pl > n1.pl,
    '切到「设置」后指示器向右滑过去（位置变了，而不是原地消失又出现）',
    `left ${n1.pl} → ${n2.pl}`);

  /* ★ 三个算法模块不在底栏里 —— 进到这些页面时不该有任何标签亮着。
     指示器由 movePill() 在「找不到 a.on」时摘掉 .on 类，于是整块隐去；
     如果这里改成「亮着首页」就是错的：用户并不在首页。 */
  const n3 = await navTo('#/simplex');
  check(n3.armed === false && parseFloat(n3.op) === 0,
    '进到不在底栏的算法模块时指示器隐去，不会错误地亮着「首页」',
    `pill.on=${n3.armed} opacity=${n3.op}`);

  const n4 = await navTo('#/');
  check(n4.label === '首页' && n4.armed === true && n4.pl < n2.pl,
    '切回首页后指示器滑回去并重新高亮', `left ${n2.pl} → ${n4.pl}`);

  /* ---------- 显示模式（跟随系统 / 浅色 / 深色） ---------- */
  console.log('\n--- 显示模式 ---');
  /* 主题由 <html data-theme> 驱动（不再是 CSS 媒体查询），所以三档都要验：
     跟随系统要实时跟、显式选择的要压得住系统、换页/重载要记得住。
     ★ 第 3 条「系统是深色、用户选浅色」正是媒体查询做不到的用例 —— 媒体查询
     时代这一档根本无法实现，改属性驱动就是为了它。 */
  const modeState = async () => JSON.parse(await evl(`JSON.stringify((function(){
    var seg = document.getElementById('themeSeg');
    var on = seg ? seg.querySelector('button.on') : null;
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      mode: on ? on.getAttribute('data-mode') : null,
      label: on ? on.textContent.trim() : null,
      labels: seg ? Array.prototype.map.call(seg.querySelectorAll('button'), function(b){ return b.textContent.trim(); }) : [],
      pressed: on ? on.getAttribute('aria-pressed') : null,
      meta: (document.querySelector('meta[name=theme-color]') || {}).content,
      bg: getComputedStyle(document.documentElement).backgroundColor,
      stored: (function(){ try { return localStorage.getItem('or-theme'); } catch (e) { return 'ERR'; } })(),
      errors: window.__errors.length
    };
  })())`));

  await navTo('#/settings');
  const t0 = await modeState();
  check(t0.labels.join('/') === '跟随系统/浅色/深色' && t0.mode === 'system',
    '设置页有三档显示模式，默认是「跟随系统」',
    `档位=${t0.labels.join('/')} 当前=${t0.label} data-theme=${t0.theme}`);
  check(t0.theme === 'light' && t0.meta === '#f5f7fa',
    '「跟随系统」+ 系统浅色 → 渲染浅色，染色也是浅色',
    `data-theme=${t0.theme} 染色=${t0.meta}`);

  await cdp.send('Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sessionId);
  await sleep(300);
  const t1 = await modeState();
  check(t1.theme === 'dark' && lum(t1.bg) < 60,
    '系统转深色时「跟随系统」实时跟着变深（不用刷新）',
    `data-theme=${t1.theme} 背景=${t1.bg}`);

  await evl(`document.querySelector('#themeSeg button[data-mode="light"]').click()`);
  await sleep(250);
  const t2 = await modeState();
  check(t2.mode === 'light' && t2.theme === 'light' && lum(t2.bg) > 200,
    '系统是深色时显式选「浅色」仍然渲染浅色（媒体查询做不到的那一档）',
    `data-theme=${t2.theme} 背景=${t2.bg}`);

  await evl(`document.querySelector('#themeSeg button[data-mode="dark"]').click()`);
  await sleep(250);
  const t3 = await modeState();
  check(t3.mode === 'dark' && t3.theme === 'dark' && lum(t3.bg) < 60,
    '显式选「深色」后渲染深色', `data-theme=${t3.theme} 背景=${t3.bg}`);
  check(t3.pressed === 'true' && t3.stored === 'dark',
    '当前档位带 aria-pressed="true"，并把选择记进 localStorage',
    `aria-pressed=${t3.pressed} 存储=${t3.stored}`);
  check(t3.meta === '#0d1016',
    '深色下 <meta theme-color> 跟着改深（手机状态栏/地址栏染色不会和页面反着来）',
    `content=${t3.meta}`);

  await cdp.send('Emulation.setEmulatedMedia', { features: [] }, sessionId);
  await sleep(300);
  const t4 = await modeState();
  check(t4.theme === 'dark',
    '系统转回浅色后，显式选的「深色」不受影响（选择压得住系统）',
    `data-theme=${t4.theme}`);

  /* 重载：属性是 boot 时按 localStorage 落下的，刷新后必须是同一档 */
  await cdp.send('Page.navigate', { url: url + '#/settings' }, sessionId);
  await sleep(1400);
  const t5 = await modeState();
  check(t5.mode === 'dark' && t5.theme === 'dark' && t5.meta === '#0d1016',
    '刷新页面后仍记得「深色」（设置存在本机，不随会话丢失）',
    `当前=${t5.label} data-theme=${t5.theme} 染色=${t5.meta}`);

  /* 收尾：切回「跟随系统」，免得把状态留给后面的断言 */
  await evl(`document.querySelector('#themeSeg button[data-mode="system"]').click()`);
  await sleep(250);
  const t6 = await modeState();
  check(t6.mode === 'system' && t6.theme === 'light' && t6.meta === '#f5f7fa' && t6.errors === 0,
    '切回「跟随系统」后恢复随系统，全程无 JS 错误',
    `data-theme=${t6.theme} 染色=${t6.meta} 错误=${t6.errors}`);

  console.log(`\n合计: ${pass} 通过 / ${fail} 失败`);
  q.end(fail === 0, `合计 ${pass} 通过 / ${fail} 失败`);
  await sess.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
