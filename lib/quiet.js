/* =========================================================================
   安静模式（--quiet）—— 让回归脚本只吐一行结论
   -------------------------------------------------------------------------
   为什么需要：UI 回归（verify-ui.js）一次要打印 243 行 / 约 12 KB 的逐条
   PASS 明细，审计与布局探测也是几百行。每次改动都要跑本地 + 线上两遍，
   这些明细会成片地灌进对话上下文，真正有用的只有最后那行「合计 N 通过」。

   用法：
     node test/ui/verify-ui.js --quiet          # 明细落盘，stdout 只有一行
     node test/ui/verify-ui.js                 # 老行为，逐条打印（人要读时用）

   ★ --quiet 会在模块加载时就把它自己从 process.argv 里摘掉，
     所以脚本里照旧用 process.argv[2] / [3] 取参数，不会把 '--quiet' 当文件名。
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = require('./chrome.js').ROOT;

/* 摘掉自己：必须发生在各脚本解析 argv 之前（它都在文件顶部 require 本模块） */
const QUIET = process.argv.indexOf('--quiet') >= 0;
if (QUIET) process.argv.splice(process.argv.indexOf('--quiet'), 1);

/**
 * begin —— 进入安静模式：拦下 console.log / console.error，收尾时落盘。
 * @param {string} name 脚本名（用作日志文件名前缀）
 * @returns {{enabled:boolean, log:string|null, end:function(boolean,string):void}}
 */
function begin(name) {
  if (!QUIET) {
    /* 不安静时零副作用：原样交给脚本自己打印 */
    return { enabled: false, log: null, end: function () {} };
  }

  const lines = [];
  const origLog = console.log;
  const origErr = console.error;
  const push = args => lines.push(args.map(String).join(' '));
  console.log = function () { push(Array.prototype.slice.call(arguments)); };
  console.error = function () { push(Array.prototype.slice.call(arguments)); };

  const dir = path.join(ROOT, 'preview', 'logs');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const log = path.join(dir, name + '-' + stamp + '.log');

  let flushed = false;
  function flush(ok, summary) {
    if (flushed) return;
    flushed = true;
    console.log = origLog;
    console.error = origErr;
    try { fs.writeFileSync(log, lines.join('\n') + '\n', 'utf8'); } catch (e) { /* 落盘失败也要把结论打出来 */ }
    const rel = path.relative(ROOT, log).replace(/\\/g, '/');
    origLog('[' + name + '] ' + (ok ? 'PASS' : 'FAIL') + '  ' + (summary || '') + '  日志: ' + rel);
  }

  /* 兜底：脚本半路抛异常退出时，至少把攒下的明细留档 */
  process.on('exit', function () { flush(false, '脚本异常退出（未走到收尾）'); });

  return { enabled: true, log, end: flush };
}

module.exports = { begin, QUIET };
