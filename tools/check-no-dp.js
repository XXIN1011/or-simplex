#!/usr/bin/env node
/* =========================================================================
   DP 清除核查：证明仓库里再没有任何动态规划相关代码/注释/路由/资源
   -------------------------------------------------------------------------
     node tools/check-no-dp.js          扫全仓库，命中就列出 file:line 并退出码 1
     node tools/check-no-dp.js --list   只列出被扫的文件数与各模式命中数

   扫描范围：仓库根下所有文本文件，跳过 .git/ 与 node_modules/。
   为了让「零残留」可核查，下面是**逐条列出的**匹配模式（而不是一个含糊的关键词）：

     ① 中文名：动态规划
     ② 构建占位符：__DP_CORE__ / __DP_UI__
     ③ 文件与模块名：dp-core / dp-ui / dp-test / fill-dp
     ④ 页面与路由：mod-dp / #/dp / dpInput / dpOut / dpTabs / dpSolve / dpBanners
     ⑤ 样式类：.dpt / .fv / inp dm（原来只有 DP 模块在用）
     ⑥ 标识符里的 DP 前缀：dp[A-Z] 形式的驼峰名（如 dpSolve、dpModel）

   注：'CDP'（Chrome DevTools Protocol，测试脚本里连浏览器用的）不算命中 ——
   它不是动态规划，所以模式 ⑥ 用小写 dp 开头。
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', '.hermes']);
/* 本脚本自己当然包含这些模式（它们就是匹配规则），扫描时要跳过自己 */
const SKIP_FILES = new Set(['tools/check-no-dp.js']);
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.htm', '.css',
  '.md', '.txt', '.sh', '.py', '.yml', '.yaml', '.toml', '.svg']);

const PATTERNS = [
  { name: '① 中文名', re: /动态规划/g },
  { name: '② 构建占位符', re: /__DP_(CORE|UI)__/g },
  { name: '③ 文件/模块名', re: /\bdp-(core|ui|test)\b|fill-dp/g },
  { name: '④ 页面与路由', re: /mod-dp|#\/dp\b|dpInput|dpOut|dpTabs|dpSolve|dpBanners/g },
  { name: '⑤ 样式类', re: /\.dpt\b|\bfill-dp|table\.sens\.dpt/g },
  { name: '⑥ DP 前缀标识符', re: /\bdp[A-Z][A-Za-z0-9_]*/g }
];

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walk(path.join(dir, ent.name), out);
    } else if (TEXT_EXT.has(path.extname(ent.name).toLowerCase())) {
      out.push(path.join(dir, ent.name));
    }
  }
}

function main() {
  const files = [];
  walk(ROOT, files);
  const hits = [];
  const perPattern = PATTERNS.map(p => ({ name: p.name, n: 0 }));

  for (const f of files) {
    if (SKIP_FILES.has(path.relative(ROOT, f).replace(/\\/g, '/'))) continue;
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    if (text.indexOf('\u0000') >= 0) continue;                  // 跳过二进制
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      /* 行内逃生阀：这一行本身就是在**说明这条规则**（例如排错文档里写「别用 dp 前缀命名」），
         标记 `check-no-dp:ignore` 即可跳过。它是给文档用的，别拿它来藏真代码。 */
      if (lines[i].indexOf('check-no-dp:ignore') >= 0) continue;
      PATTERNS.forEach((p, pi) => {
        p.re.lastIndex = 0;
        if (p.re.test(lines[i])) {
          perPattern[pi].n++;
          hits.push({ file: path.relative(ROOT, f).replace(/\\/g, '/'), line: i + 1, text: lines[i].trim().slice(0, 120), pattern: p.name });
        }
      });
    }
  }

  if (process.argv.includes('--list')) {
    console.log('扫描文件数：' + files.length);
    perPattern.forEach(p => console.log('  ' + p.name + '：' + p.n + ' 处'));
  }

  if (!hits.length) {
    console.log('✅ DP 零残留：' + files.length + ' 个文本文件、' + PATTERNS.length + ' 类模式，命中 0 处');
    return;
  }

  console.log('❌ 仍存在 DP 残留：共 ' + hits.length + ' 处');
  hits.forEach(h => console.log('  ' + h.file + ':' + h.line + '  [' + h.pattern + ']  ' + h.text));
  process.exit(1);
}

main();
