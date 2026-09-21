/* =========================================================================
   构建：src/template.html + src/{core,web}/*.js  ->  index.html（仓库根）
   -------------------------------------------------------------------------
   ① 产物落在【仓库根】：GitHub Pages 以仓库根为发布目录，入口只能是
      /index.html；挪进子目录线上地址就会从 / 变成 /子目录/。所以这里读写
      路径是分开的：读 src/... ，写 ../index.html。
   ② 浏览器端只加载【一份】<script>：一个迷你 CommonJS 打包器把 src/core 与
      src/web 下的每个 .js 包成 __define__(id, factory) 注册进去，再按需求解
      './x.js' / '../y.js' 相对路径。零依赖、可离线：产物是纯静态 HTML，
      直接 file:// 双击打开即可运行，不用 ES module / fetch / import。

   为什么不直接用 <script src>：单文件站点只有这一个 HTML，源文件拆成模块
   是为了可读、可 node 测试（require('../core/simplex.js')），浏览器端再用
   这 30 行运行时把拆开的模块合回一个作用域。
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;                                  // src/
const OUT = path.join(root, '..', 'index.html');         // 仓库根

/* ---------- ① 文件清单：core/*.js + web/*.js（字典序，core 在前） ----------
   顺序只影响 __define__ 的注册顺序，不影响执行顺序 —— 每个模块都是在被
   require 的那一刻才执行，真正的执行入口是 src/web/boot.js。 */
const DIRS = ['core', 'web'];
const modules = [];
for (const dir of DIRS) {
  const abs = path.join(root, dir);
  const names = fs.readdirSync(abs).filter(f => f.endsWith('.js')).sort();
  if (dir === 'web' && names.indexOf('boot.js') === -1) {
    throw new Error('src/web/boot.js 不见了：它是浏览器端的唯一入口');
  }
  for (const name of names) {
    modules.push({
      id: 'src/' + dir + '/' + name,                     // 仓库相对路径 = 模块 id
      code: fs.readFileSync(path.join(abs, name), 'utf8')
    });
  }
}

/* ---------- ② 迷你 CJS 运行时（原生 JS，约 30 行） ----------
   __define__ 只登记；真正的执行发生在 __require__ 里，且每个模块只执行一次
   （__cache 缓存 exports，循环依赖也能拿到半成品 exports 而不死循环）。
   相对路径【按调用方所在目录】解析，所以模块内部写 require('../core/format.js')
   与它在 Node 里跑时的语义完全一致。 */
const RUNTIME = `
var __mods = Object.create(null);        /* id -> 工厂函数 */
var __cache = Object.create(null);       /* id -> module（已执行/执行中的模块）*/

function __define__(id, factory) { __mods[id] = factory; }

/* 'a/b/../c' -> 'a/c' */
function __norm(p) {
  var parts = p.split('/'), out = [];
  for (var i = 0; i < parts.length; i++) {
    if (parts[i] === '' || parts[i] === '.') continue;
    if (parts[i] === '..') out.pop(); else out.push(parts[i]);
  }
  return out.join('/');
}

/* 给某个模块生成它专属的 require：base = 它自己所在的目录 */
function __makeRequire(fromId) {
  var base = fromId.slice(0, fromId.lastIndexOf('/') + 1);
  return function (req) {
    var id = req.charAt(0) === '.' ? __norm(base + req) : __norm(req);
    if (__cache[id]) return __cache[id].exports;
    if (!__mods[id] && !/\\.js$/.test(id) && __mods[id + '.js']) id += '.js';
    var factory = __mods[id];
    if (!factory) throw new Error('找不到模块 ' + req + '（在 ' + fromId + ' 中）');
    var module = { id: id, exports: {} };
    __cache[id] = module;
    factory(module, module.exports, __makeRequire(id));
    return module.exports;
  };
}

var __require__ = __makeRequire('');
`;

/* ---------- ③ 拼接：每个文件源码一字不改地塞进工厂函数体 ---------- */
let bundle = '/* 本文件由 src/build.js 自动生成，请勿直接编辑 —— 源文件在 src/ 下 */\n';
bundle += '(function () {\n';
bundle += "'use strict';\n";                              /* 让所有模块（含嵌套 IIFE）都继承严格模式 */
bundle += RUNTIME;
for (const m of modules) {
  bundle += '\n__define__(' + JSON.stringify(m.id)
    + ', function (module, exports, require) {\n'
    + m.code.replace(/\s*$/, '') + '\n});\n';
}
bundle += "\n/* 启动 */\n__require__('src/web/boot.js');\n})();\n";

/* 产物要放进 <script> 里：源码中出现 </script> 会提前闭合标签（当前源码里没有，
   这里只是兜底，替换成等价写法 <\/script>） */
bundle = bundle.replace(/<\/script/gi, '<\\/script');

/* ---------- ④ 套模板，写仓库根 ---------- */
const tpl = fs.readFileSync(path.join(root, 'template.html'), 'utf8');
const SLOT = '/*__BUNDLE__*/';
if (tpl.indexOf(SLOT) === -1) throw new Error('template.html 缺少占位符 ' + SLOT);

/* 用函数作为替换值，避免 $& 等替换模式被解释 */
const out = tpl.replace(SLOT, () => bundle);

fs.writeFileSync(OUT, out, 'utf8');

console.log('构建完成 index.html :', (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1), 'KB'
  + '（' + modules.length + ' 个模块 ' + modules.map(m => m.id.slice(4)).join(', ') + '）');
