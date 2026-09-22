/* =========================================================================
   现状卡 —— 一眼看清「这个仓库现在是什么样子」
   -------------------------------------------------------------------------
   为什么需要：HANDOFF.md 里原来手写着「单元测试 60/60」「UI 回归 110/110」这类
   数字，改完代码就过期（实测早就变成了 76/76 与 133/133，两边还互相矛盾）。
   文档里的数字必须由机器生成，才不会说谎。

   用法：
     node tools/status.js              打印现状（人读）
     node tools/status.js --card       只打印可粘贴的 markdown 现状卡
     node tools/status.js --write      把现状卡写回 HANDOFF.md 的标记块之间
     node tools/status.js --remote     顺带查一次远程 SHA（需要网络/代理）

   设计取舍：默认**不跑**算法回归（几秒到几十秒，太重），只跑 0.3 秒的单元测试
   与两个静态检查；算法与 UI 套件只列命令和期望值，由 `npm run verify` 负责跑。
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const sh = (cmd, args, opts) => spawnSync(cmd, args, Object.assign({ cwd: ROOT, encoding: 'utf8' }, opts));

/* ---------------- ① 仓库状态 ---------------- */
function git(args) {
  const r = sh('git', args);
  return (r.status === 0 ? (r.stdout || '').trim() : '');
}
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']) || '(未知)';
const head = git(['rev-parse', '--short', 'HEAD']) || '(未知)';
const headMsg = git(['log', '-1', '--pretty=%s']) || '';
/* 未提交文件数：**排除 HANDOFF.md 自己** —— 现状卡就写在它里面，生成卡片这件事
   本身会让它变脏，不排除的话卡片永远自报「有 1 个文件未提交」。 */
const dirty = git(['status', '--porcelain']).split('\n')
  .filter(Boolean).filter(l => !/HANDOFF\.md$/.test(l)).length;
const remoteUrl = git(['remote', 'get-url', 'origin']) || '(无 origin)';

/* ---------------- ② 构建产物与源码是否一致 ----------------
   直接重建一次（50ms），再用 git diff 判断产物是否需要提交 ——
   「改了 src 忘了 npm run build」是这类单文件项目最容易犯的错。 */
function buildFresh() {
  const file = path.join(ROOT, 'index.html');
  const before = fs.existsSync(file) ? fs.readFileSync(file) : null;
  const b = sh(process.execPath, ['src/build.js']);
  if (b.status !== 0) return { ok: false, size: 0, err: (b.stderr || '').trim() };
  const after = fs.readFileSync(file);
  /* 判定「产物是不是最新的」：重建一次，看文件有没有被改掉。
     不能用 git diff —— 改动还没提交时那必然有差异，会误报。 */
  return {
    ok: before !== null && before.equals(after),
    size: after.length,
    fresh: before === null ? false : before.equals(after)
  };
}

/* ---------------- ③ 规模与模块清单 ---------------- */
function countLines(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').length;
}
function dirStats(rel) {
  const files = fs.readdirSync(path.join(ROOT, rel)).filter(f => f.endsWith('.js'));
  let lines = 0;
  for (const f of files) lines += countLines(rel + '/' + f);
  return { files: files.length, lines: lines };
}
const coreStats = dirStats('src/core');
const webStats = dirStats('src/web');
const tpl = fs.readFileSync(path.join(ROOT, 'src/template.html'), 'utf8');
const modules = [...tpl.matchAll(/class="mod" id="mod-([A-Za-z0-9_-]+)"/g)].map(m => m[1]);
const mounts = [...tpl.matchAll(/id="([A-Za-z0-9_-]+Panel)"/g)].map(m => m[1]);

/* ---------------- ④ 单元测试条数（0.3 秒，值得跑） ---------------- */
function unitTests() {
  const dir = path.join(ROOT, 'test', 'unit');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort()
    .map(f => path.join('test', 'unit', f));
  const r = sh(process.execPath, ['--test'].concat(files), { maxBuffer: 32 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/# tests (\d+)[\s\S]*?# pass (\d+)[\s\S]*?# fail (\d+)/);
  return m ? { files: files.length, total: Number(m[1]), pass: Number(m[2]), fail: Number(m[3]) } : null;
}

/* ---------------- ⑤ 两个静态检查 ---------------- */
function check(script) {
  const r = sh(process.execPath, ['tools/' + script]);
  return r.status === 0;
}

const build = buildFresh();
const unit = unitTests();
const registryOk = check('check-registry.js');
const noDpOk = check('check-no-dp.js');
const algorithmSuites = fs.readFileSync(path.join(ROOT, 'test', 'run-all.js'), 'utf8')
  .match(/const SUITES = \[([\s\S]*?)\];/)[1].split('name:').length - 1;

const data = {
  branch, head, headMsg, dirty, remoteUrl, build, coreStats, webStats,
  modules, mounts, unit, registryOk, noDpOk, algorithmSuites
};

function card(d) {
  const L = [];
  L.push('| 项 | 值 |');
  L.push('|---|---|');
  L.push(`| 分支 / HEAD | \`${d.branch}\` · \`${d.head}\` ${d.dirty ? '（**有 ' + d.dirty + ' 个文件未提交**）' : '（工作区干净）'} |`);
  L.push(`| 构建产物 | \`index.html\` ${(d.build.size / 1024).toFixed(1)} KB，`
    + (d.build.ok ? '已是最新（重建无差异）' : '**与源码不一致：需要 `npm run build` 并提交**') + ' |');
  L.push(`| 算法层 | \`src/core/\` ${d.coreStats.files} 个模块 / ${d.coreStats.lines} 行 |`);
  L.push(`| 表现层 | \`src/web/\` ${d.webStats.files} 个模块 / ${d.webStats.lines} 行 |`);
  L.push(`| 模块（读自模板） | ${d.modules.map(m => '`#/' + (m === 'home' ? '' : m) + '`').join(' · ')} |`);
  L.push(`| 单元测试 | ${d.unit ? d.unit.files + ' 个文件 / ' + d.unit.total + ' 条，当前 ' + d.unit.pass + ' 通过' : '（本轮未跑）'} |`);
  L.push(`| 算法回归 | ${d.algorithmSuites} 套 + 单元测试，见 \`npm test\` |`);
  L.push(`| 静态检查 | 注册一致性 ${d.registryOk ? '✓' : '✗'} · 无历史模块残留 ${d.noDpOk ? '✓' : '✗'} |`);
  return L.join('\n');
}

(async () => {
  const argv = process.argv.slice(2);
  if (argv.includes('--remote')) {
    const r = sh('git', ['ls-remote', 'origin', 'main']);
    data.remote = r.status === 0 ? (r.stdout || '').trim().split(/\s+/)[0].slice(0, 7) : '（查不到：代理没开？）';
  }

  if (argv.includes('--card')) {
    process.stdout.write(card(data) + '\n');
    return;
  }

  if (argv.includes('--write')) {
    const file = path.join(ROOT, 'HANDOFF.md');
    const src = fs.readFileSync(file, 'utf8');
    const BEGIN = '<!-- STATUS:BEGIN（本区块由 node tools/status.js --write 生成，不要手改） -->';
    const END = '<!-- STATUS:END -->';
    const i = src.indexOf(BEGIN), j = src.indexOf(END);
    if (i < 0 || j < 0) {
      console.error('✗ HANDOFF.md 里找不到 STATUS 标记块，未写入');
      process.exit(1);
    }
    const out = src.slice(0, i + BEGIN.length) + '\n' + card(data) + '\n' + src.slice(j);
    fs.writeFileSync(file, out, 'utf8');
    console.log('已更新 HANDOFF.md 的现状卡');
    return;
  }

  console.log('仓库        :', data.remoteUrl);
  console.log('分支 / HEAD :', data.branch, '/', data.head, data.dirty ? `（未提交 ${data.dirty} 个文件）` : '（干净）');
  console.log('最近提交    :', data.headMsg);
  if (data.remote) console.log('远程 SHA    :', data.remote);
  console.log('构建产物    : index.html', (data.build.size / 1024).toFixed(1) + 'KB',
    data.build.ok ? '已是最新 ✓（重建无差异）' : '与源码不一致 ✗（要重新构建并提交）');
  console.log('源码规模    : core', data.coreStats.files + ' 文件/' + data.coreStats.lines + ' 行',
    '· web', data.webStats.files + ' 文件/' + data.webStats.lines + ' 行');
  console.log('模块清单    :', data.modules.map(m => '#' + (m === 'home' ? '/' : '/' + m)).join(' '));
  console.log('输入区挂载点:', data.mounts.join(' '));
  console.log('单元测试    :', data.unit ? `${data.unit.pass}/${data.unit.total} 通过（${data.unit.files} 个文件）` : '（未跑）');
  console.log('静态检查    : 注册一致性', data.registryOk ? '✓' : '✗', '· 历史模块残留', data.noDpOk ? '✓' : '✗');
  console.log('\n算法与 UI 回归请用：npm run verify');
})();
