/* =========================================================================
   全量回归编排：一条命令跑完「单元测试 + 算法回归」，并给出可读的汇总表
   -------------------------------------------------------------------------
     node test/run-all.js              单元测试 + 算法回归（默认）
     node test/run-all.js --algorithm  只跑算法回归（含题库重生，约 40 秒）
     node test/run-all.js --unit       只跑单元测试（约 0.3 秒）

   判定方式（两条同时满足才算 PASS）：
     · 进程退出码为 0
     · 输出里出现该套件自己的「结论标记」（每个套件的措辞不同，见下表）

   注意执行顺序：test-simplex.js 会重新生成 random-bank.json（固定种子的 LCG，
   可复现），后面几套算法回归都读这个题库 —— 所以它必须第一个跑。
   ========================================================================= */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const onlyAlgorithm = process.argv.includes('--algorithm');
const onlyUnit = process.argv.includes('--unit');

/* 算法回归套件：脚本 → 「通过」时输出里必然出现的标记 */
const SUITES = [
  { file: 'test/algorithm/test-simplex.js', name: '单纯形·题库生成', mark: '随机题库已生成' },
  { file: 'test/algorithm/edge-test.js', name: '单纯形·边界情形', mark: '0 失败' },
  { file: 'test/algorithm/dual-test.js', name: '对偶解题库', mark: '对偶题库已生成' },
  { file: 'test/algorithm/sens-test.js', name: '灵敏度·区间不多不少', mark: '全部通过' },
  { file: 'test/algorithm/scenario-test.js', name: '场景分析·建表一致性', mark: '建表一致性自检' },
  { file: 'test/algorithm/param-test.js', name: '参数线性规划', mark: '结论: PASS' },
  { file: 'test/algorithm/ip-test.js', name: '整数规划·四方法对拍', mark: '结论: PASS' },
  { file: 'test/algorithm/assignment-test.js', name: '指派问题·匈牙利法', mark: '结论: PASS' }
];

function runUnitTests() {
  const dir = path.join(ROOT, 'test', 'unit');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort()
    .map(f => path.join('test', 'unit', f));
  const r = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/# tests (\d+)[\s\S]*?# pass (\d+)[\s\S]*?# fail (\d+)/);
  const tests = m ? Number(m[1]) : null, pass = m ? Number(m[2]) : null, fail = m ? Number(m[3]) : null;
  return {
    name: '单元测试（' + files.length + ' 个文件）',
    ok: r.status === 0 && fail === 0,
    detail: tests === null ? '未解析到统计' : (pass + '/' + tests + ' 通过'),
    tail: out.trim().split('\n').slice(-1)[0] || '',
    output: out
  };
}

function runSuite(s) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [s.file], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const ms = Date.now() - t0;
  const out = (r.stdout || '') + (r.stderr || '');
  const marked = out.indexOf(s.mark) >= 0;
  /* FAIL / 失败 的显式排查：标记命中但输出里出现失败字样也要拦下 */
  const failHint = /(合计|通过)[^\n]*[1-9]\d* 失败|✗|\bFAIL\b/.test(out);
  return {
    name: s.name, ok: r.status === 0 && marked && !failHint, ms,
    detail: marked ? '标记命中：' + s.mark : '缺少标记：' + s.mark,
    output: out
  };
}

function main() {
  const rows = [];
  if (!onlyAlgorithm) rows.push(runUnitTests());
  if (!onlyUnit) SUITES.forEach(s => rows.push(runSuite(s)));

  console.log('\n================ 全量回归汇总 ================');
  console.log('套件'.padEnd(28) + '结论'.padEnd(8) + '耗时');
  console.log('-'.repeat(58));
  let bad = 0;
  for (const r of rows) {
    if (!r.ok) bad++;
    console.log(String(r.name).padEnd(26) + (r.ok ? '  PASS  ' : '  FAIL  ')
      + (r.ms === undefined ? '' : (r.ms + 'ms')));
    if (r.detail) console.log(''.padEnd(4) + r.detail);
  }
  console.log('-'.repeat(58));
  console.log('合计 ' + (rows.length - bad) + '/' + rows.length + ' 套件通过'
    + (bad ? '，失败 ' + bad + ' 套件' : ''));

  if (bad) {
    /* 失败时把现场打出来，别让用户自己再跑一遍 */
    for (const r of rows) {
      if (r.ok) continue;
      console.log('\n---- ' + r.name + ' 输出 ----');
      console.log((r.output || '').split('\n').slice(-40).join('\n'));
    }
    process.exit(1);
  }
}

main();
