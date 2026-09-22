/* =========================================================================
   DOM 快照 —— 「界面一个字没变」的机器证据
   -------------------------------------------------------------------------
   用途：改界面结构（例如把四段重复的输入区 HTML 收成一份由 JS 生成）时，
   先存一份改动前的 DOM，改完再存一份，两份逐行对比必须为空。

     node tools/dom-snapshot.js index.html             preview/dom-before.txt
     node tools/dom-snapshot.js index.html             preview/dom-after.txt
     node tools/dom-snapshot.js --compare preview/dom-before.txt preview/dom-after.txt

   与 deep-snapshot.js 的分工：那个管**算法输出**逐字节不变，这个管**最终的
   页面结构**逐字节不变（含由 JS 生成出来的节点）。

   规范化规则（否则每次跑都对不上）：
     · 去掉标签之间的空白与换行，属性顺序保持原样
     · 去掉底栏滑动指示器的内联 style（位置依赖像素宽度，与结构无关）
     · 去掉 <input> 的 value=""（空值属性在两种渲染路径下写法可能不同）
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const chrome = require('../lib/chrome.js');
const { resolveTarget } = chrome;

/* 每个 hash 下要抓的容器（模块页 + 常驻的底栏） */
const TARGETS = [
  { hash: '#/',        sel: '#mod-home' },
  { hash: '#/simplex', sel: '#mod-simplex' },
  { hash: '#/sens',    sel: '#mod-sens' },
  { hash: '#/ip',      sel: '#mod-ip' },
  { hash: '#/assign',  sel: '#mod-assign' },
  { hash: '#/settings', sel: '#mod-settings' },
  { hash: '#/',        sel: '.tabbar', name: 'tabbar' }
];

/* 页面里跑的序列化器：把选中容器的 HTML 规范化成一行一行的「可控文本」 */
const DUMP = `(function(){
  var sel = %SEL%;
  var root = document.querySelector(sel);
  if (!root) return 'MISSING ' + sel;
  var html = root.innerHTML;
  /* ① 注释是模板里的说明文字，不属于「结构」，去掉（否则改注释都会报差异） */
  html = html.replace(/<!--[\\s\\S]*?-->/g, '');
  /* ② 底栏滑动指示器带内联 style（像素位置），与结构无关，抹掉 */
  html = html.replace(/(<[^>]*class="tb-pill"[^>]*?)style="[^"]*"/g, '$1');
  /* ③ 空 value 属性在不同渲染路径下写法可能不同 */
  html = html.replace(/\\s+value=""/g, '');
  /* ④ 去掉标签间空白 */
  html = html.replace(/>\\s+</g, '><').replace(/^\\s+|\\s+$/g, '');
  /* ⑤ 一个标签一行，便于 diff */
  html = html.replace(/></g, '>\\n<');
  return html;
})()`;

async function snapshot(file, outPath) {
  const { pageUrl, url } = resolveTarget(file, '#/');
  const sess = await chrome.launch({ url: pageUrl, waitMs: 1400 });
  const parts = [];
  for (const t of TARGETS) {
    await sess.navigate(url.split('#')[0] + t.hash, 900);
    const dump = await sess.evl(DUMPSEL(t.sel));
    parts.push('===== ' + (t.name || t.hash + ' ' + t.sel) + ' =====\n' + dump);
  }
  await sess.close();
  const text = parts.join('\n\n') + '\n';
  fs.writeFileSync(outPath, text, 'utf8');
  const lines = text.split('\n').length;
  console.log('DOM 快照 ->', outPath, '(' + lines + ' 行)');
  return text;
}

function DUMPSEL(sel) { return DUMP.replace('%SEL%', JSON.stringify(sel)); }

/* 对比两份快照：LCS 逐行 diff。
   为什么不能用「同下标逐行比」：插入一行会让后面全部错位，报告里几百行「不同」
   其实只有一处插入。这里按最长公共子序列对齐，只报真正的增删。 */
function compare(aPath, bPath) {
  const a = fs.readFileSync(aPath, 'utf8').split('\n');
  const b = fs.readFileSync(bPath, 'utf8').split('\n');
  const n = a.length, m = b.length;

  const dp = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(['-', a[i++]]); }
    else { ops.push(['+', b[j++]]); }
  }
  while (i < n) ops.push(['-', a[i++]]);
  while (j < m) ops.push(['+', b[j++]]);

  const minus = ops.filter(o => o[0] === '-').length;
  const plus = ops.filter(o => o[0] === '+').length;
  ops.slice(0, 60).forEach(o => console.log(o[0] + ' ' + (o[1] || '(空行)').slice(0, 200)));
  if (ops.length > 60) console.log(`… 还有 ${ops.length - 60} 行差异未列出`);
  console.log(`\n结构差异：删除 ${minus} 行 / 新增 ${plus} 行（A ${n} 行 / B ${m} 行）`);
  process.exit(ops.length ? 1 : 0);
}

(async () => {
  const argv = process.argv.slice(2);
  if (argv[0] === '--compare') {
    if (argv.length < 3) throw new Error('用法：--compare A.txt B.txt');
    compare(argv[1], argv[2]);
    return;
  }
  const file = argv[0] || 'index.html';
  const out = argv[1] || 'preview/dom-snapshot.txt';
  fs.mkdirSync(path.dirname(path.resolve(chrome.ROOT, out)), { recursive: true });
  await snapshot(file, out);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
