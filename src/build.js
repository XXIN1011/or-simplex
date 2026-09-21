/* 构建：src/template.html + src/{core,ui}/*.js  ->  index.html（仓库根，单文件、零依赖）
   -------------------------------------------------------------------------
   源文件全部在 src/ 下，但产物必须落在【仓库根】—— GitHub Pages 以仓库根为发布
   目录，入口只能是 /index.html；把它挪进子目录，线上地址就会从 / 变成 /子目录/。
   所以这里读写路径是分开的：读 src/... ，写 ../index.html。 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;                                 // src/
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const OUT = path.join(root, '..', 'index.html');        // 仓库根

const tpl = read('template.html');

/* 占位符 -> 源文件（相对 src/），顺序即脚本插入顺序（后者可以调用前者定义的全局函数） */
const SLOTS = {
  '/*__CORE__*/': 'core/simplex-core.js',        // 单纯形法核心
  '/*__SENS_CORE__*/': 'core/sens-core.js',      // 场景式灵敏度分析核心
  '/*__PANEL__*/': 'ui/input-panel.js',          // 可复用输入表组件
  '/*__GRAPH__*/': 'ui/graph.js',                // 图解法
  '/*__UI__*/': 'ui/ui.js',                      // 单纯形法界面
  '/*__SENS_UI__*/': 'ui/sens-ui.js',            // 灵敏度分析界面
  '/*__IP_CORE__*/': 'core/ip-core.js',          // 整数规划核心（四种方法 + 适用性判定）
  '/*__IP_UI__*/': 'ui/ip-ui.js',                // 整数规划界面
  '/*__ROUTER__*/': 'ui/router.js'               // 首页/模块路由
};

let out = tpl;
for (const key of Object.keys(SLOTS)) {
  if (tpl.indexOf(key) === -1) throw new Error('template.html 缺少占位符 ' + key);
  const src = read(SLOTS[key]);
  // 用函数作为替换值，避免 $& 等替换模式被解释
  out = out.replace(key, () => src);
}

fs.writeFileSync(OUT, out, 'utf8');

console.log('构建完成 index.html :', (out.length / 1024).toFixed(1), 'KB');
