/* =========================================================================
   注册一致性静态自检 —— 「模板里的 id / 路由 / 模块接线」对不上就报错
   -------------------------------------------------------------------------
   为什么需要：界面是「模板写容器、JS 按 id 取元素」的松耦合结构，写错一个 id
   在浏览器里**不会报语法错**，只会静默失效（元素取不到 → 某个按钮点了没反应）。
   以前只有 UI 回归能覆盖到被断言的那几条路径，别的地方全靠人眼。

   本检查不看渲染结果，只看源码字符串，跑一次不到 0.1 秒：

     ① 模板里不能有重复 id（有的话 getElementById 取到的可能不是你想要那个）
     ② 输入区配置：
          · 配了 mount  → 挂载点必须在模板里；段控/表/按钮这些 id 由 JS 生成，
                        因此**不该**再静态写在模板里（写了就是重复 id）
          · 没配 mount  → 那些 id 必须静态存在于模板（旧的静态外壳写法）
     ③ JS 里 getElementById('字面量') 用到的 id，模板里必须有
     ④ 模板里 href="#/x" 的目标，必须有 <div class="mod" id="mod-x"> 容器
     ⑤ 底栏 <a data-m="x"> 的 x 必须在模块清单里
     ⑥ src/web/ 下的每个 *-ui.js 都必须被 boot.js require（加了界面文件忘了接线）
     ⑦ #mod-home 必须存在（路由找不到 hash 时要回落到首页）

   用法：node tools/check-registry.js          （发现问题退出码 1）
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'src', 'web');
const tpl = fs.readFileSync(path.join(ROOT, 'src', 'template.html'), 'utf8');

const problems = [];
const note = m => console.log('  ' + m);
const bad = m => problems.push(m);

/* ---------------- 模板事实 ---------------- */
const idCount = new Map();
for (const m of tpl.matchAll(/\bid="([^"]+)"/g)) idCount.set(m[1], (idCount.get(m[1]) || 0) + 1);
const tplIds = new Set(idCount.keys());
const mods = [...tplIds].filter(i => i.startsWith('mod-')).map(i => i.slice(4));

/* ---------------- JS 事实 ---------------- */
const jsFiles = fs.readdirSync(WEB).filter(f => f.endsWith('.js')).sort();
const sources = {};
for (const f of jsFiles) sources[f] = fs.readFileSync(path.join(WEB, f), 'utf8');

/* 取出 createInputPanel({...}) / buildChrome({...}) 的配置块（按花括号配对切） */
function cfgBlocks(src) {
  const out = [];
  for (const m of src.matchAll(/(createInputPanel|buildChrome)\(\s*\{/g)) {
    let i = m.index + m[0].length - 1, depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    out.push({ fn: m[1], body: src.slice(m.index, i + 1) });
  }
  return out;
}

const CHROME_KEYS = ['tbl', 'dirSeg', 'addVar', 'delVar', 'addCon', 'delCon'];
const KEY_NAMES = { mount: '挂载点', tbl: '输入表', dirSeg: '方向段控',
  addVar: '按钮1', delVar: '按钮2', addCon: '按钮3', delCon: '按钮4' };

console.log('注册一致性检查');

/* ① 模板重复 id */
const dup = [...idCount].filter(([, n]) => n > 1);
if (dup.length) {
  dup.forEach(([id, n]) => bad(`模板里 id="${id}" 出现了 ${n} 次（必须唯一）`));
}
note(`模板 id ${tplIds.size} 个${dup.length ? '（有重复）' : '，无重复'}`);

/* ② / ③ 输入区配置与 getElementById 引用 */
const cfgCount = { generated: 0, static: 0 };
for (const f of jsFiles) {
  for (const blk of cfgBlocks(sources[f])) {
    const cfg = {};
    for (const key of ['mount'].concat(CHROME_KEYS)) {
      const m = blk.body.match(new RegExp('\\b' + key + ":\\s*'([A-Za-z0-9_-]+)'"));
      if (m) cfg[key] = m[1];
    }
    const gen = !!cfg.mount;
    if (gen) cfgCount.generated++; else cfgCount.static++;

    if (gen && !tplIds.has(cfg.mount)) {
      bad(`${f} 的 ${blk.fn} 挂载点 '${cfg.mount}' 不在模板里（外壳没地方生成）`);
    }
    for (const key of CHROME_KEYS) {
      if (!cfg[key]) continue;
      if (gen && tplIds.has(cfg[key])) {
        bad(`${f} 的 ${blk.fn} 里 ${key}='${cfg[key]}' 已由 JS 生成，模板里不该再有静态副本`);
      }
      if (!gen && !tplIds.has(cfg[key])) {
        bad(`${f} 的 ${blk.fn} 没配 mount，${key}='${cfg[key]}' 必须静态写进模板`);
      }
    }
  }
}
note(`输入区配置：${cfgCount.generated} 处由 JS 生成外壳，${cfgCount.static} 处用模板静态外壳`);

/* 运行期由 JS 自己造出来的 id：写进 innerHTML 的 id="x"、赋值式 box.id = 'x'，
   以及输入区外壳（buildChrome/createInputPanel 配置里那几个）。这些不该出现在模板里，
   但被 $('x') 引用是合法的，所以先收集起来。 */
const dynamicIds = new Set();
for (const f of jsFiles) {
  for (const m of sources[f].matchAll(/\bid=["']([A-Za-z0-9_-]+)["']/g)) dynamicIds.add(m[1]);
  for (const m of sources[f].matchAll(/\.id\s*=\s*['"]([A-Za-z0-9_-]+)['"]/g)) dynamicIds.add(m[1]);
  for (const blk of cfgBlocks(sources[f])) {
    for (const key of CHROME_KEYS) {
      const m = blk.body.match(new RegExp('\\b' + key + ":\\s*'([A-Za-z0-9_-]+)'"));
      if (m) dynamicIds.add(m[1]);
    }
  }
}

const idRefs = new Map();
for (const f of jsFiles) {
  /* 两种写法都要认：dom.js 的 $('id') 是主流写法，getElementById('id') 也还在用。
     拼接出来的（$('mod-' + m)、$(cfg[k])）匹配不到引号，自动跳过。 */
  for (const m of sources[f].matchAll(/(?:\$|getElementById)\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (!idRefs.has(m[1])) idRefs.set(m[1], new Set());
    idRefs.get(m[1]).add(f);
  }
}
for (const [id, files] of idRefs) {
  if (!tplIds.has(id) && !dynamicIds.has(id)) {
    bad(`JS 取了模板里不存在、也不是自己渲染出来的 id：'${id}'（${[...files].join(', ')}）`);
  }
}
note(`JS 引用 ${idRefs.size} 个 id（模板 ${idRefs.size - [...idRefs.keys()].filter(i => dynamicIds.has(i) && !tplIds.has(i)).length} 个 + 运行期自产 `
  + `${[...idRefs.keys()].filter(i => dynamicIds.has(i) && !tplIds.has(i)).length} 个）`);

/* ④ 模板里的 hash 链接 */
const hashes = new Set();
for (const m of tpl.matchAll(/href="#\/([A-Za-z0-9_-]*)"/g)) hashes.add(m[1]);
for (const h of hashes) {
  if (h === '') continue;                                   // #/ 就是首页
  if (mods.indexOf(h) === -1) bad(`模板里有 href="#/${h}"，但没有 <div class="mod" id="mod-${h}"> 容器`);
}
note(`模板 hash 链接：${[...hashes].map(h => '#/' + h).join(' ')}`);

/* ⑤ 底栏 data-m */
for (const m of tpl.matchAll(/data-m="([^"]+)"/g)) {
  if (mods.indexOf(m[1]) === -1) bad(`底栏 <a data-m="${m[1]}"> 没有对应的模块容器`);
}

/* ⑥ 界面文件接线 */
const boot = sources['boot.js'] || '';
const uiFiles = jsFiles.filter(f => /-ui\.js$/.test(f));
for (const f of uiFiles) {
  if (!boot.includes("'./" + f + "'")) bad(`src/web/${f} 没有被 src/web/boot.js require（界面不会初始化）`);
}
note(`界面文件 ${uiFiles.length} 个，均已在 boot.js 接线`);

/* ⑦ 首页容器 */
if (mods.indexOf('home') === -1) bad('模板里缺 #mod-home：路由无法回落到首页');
note(`模块清单（读自模板）：${mods.map(m => 'mod-' + m).join(' ')}`);

/* ⑧ 文档里提到的文件路径必须真的存在（改文件名最容易忘的就是改文档） */
const mdFiles = ['README.md', 'HANDOFF.md'];
for (const f of fs.readdirSync(path.join(ROOT, 'docs')).filter(f => f.endsWith('.md'))) {
  mdFiles.push('docs/' + f);
}
const refRe = /`((?:docs|src|test|tools|lib)\/[A-Za-z0-9_./-]+\.(?:md|js|py|html|sh|css))`/g;
const seenRef = new Set();
let refChecked = 0;
for (const f of mdFiles) {
  const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of text.matchAll(refRe)) {
    const rel = m[1];
    if (/\b(xxx|yyy|zzz)/i.test(rel)) continue;            // 文档里的占位示例（src/core/xxx.js）
    if (seenRef.has(f + '|' + rel)) continue;
    seenRef.add(f + '|' + rel);
    refChecked++;
    if (!fs.existsSync(path.join(ROOT, rel))) bad(`${f} 里引用了不存在的文件：${rel}`);
  }
  /* docs/xxx.md 这种不带反引号的引用也查一遍 */
  for (const m of text.matchAll(/\((docs\/[A-Za-z0-9_-]+\.md)\)/g)) {
    refChecked++;
    if (!fs.existsSync(path.join(ROOT, m[1]))) bad(`${f} 里引用了不存在的文档：${m[1]}`);
  }
}
note(`文档里的文件引用 ${refChecked} 处，均可解析`);

/* 输出小提示（不算问题）：模板里既没有 getElementById 引用、也不是模块容器的 id，
   可能是遗留 —— 只提示不报错（有的 id 是给选择器或纯排版用的）。 */
const referenced = new Set([...idRefs.keys()]);
const likelyUnused = [...tplIds].filter(id =>
  !referenced.has(id) && !id.startsWith('mod-') && !hashes.has(id));
if (likelyUnused.length) {
  note(`提示：以下 id 没有 getElementById 引用（可能靠选择器或纯排版用）：${likelyUnused.join(', ')}`);
}

/* ---------------- 结论 ---------------- */
if (problems.length) {
  console.log('\n✗ 发现 ' + problems.length + ' 个问题：');
  problems.forEach(p => console.log('  · ' + p));
  process.exit(1);
}
console.log('\n✓ 注册一致性：全部通过');
