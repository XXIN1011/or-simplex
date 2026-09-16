/* 构建：template.html + simplex-core.js + graph.js + ui.js  ->  index.html（单文件、零依赖） */
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const tpl = read('template.html');
const core = read('simplex-core.js');
const graph = read('graph.js');
const ui = read('ui.js');

if (tpl.indexOf('/*__CORE__*/') === -1 || tpl.indexOf('/*__UI__*/') === -1 ||
    tpl.indexOf('/*__GRAPH__*/') === -1) {
  throw new Error('template.html 缺少占位符');
}

// 用函数作为替换值，避免 $& 等替换模式被解释
let out = tpl.replace('/*__CORE__*/', () => core);
out = out.replace('/*__GRAPH__*/', () => graph);
out = out.replace('/*__UI__*/', () => ui);

/* 只产出根目录这一个 index.html：GitHub Pages 以仓库根为发布目录（main / /），
   推送即上线，不限次也不计量。不再产出 deploy/ 副本（那是给 Netlify 用的，已弃用）。 */
fs.writeFileSync(path.join(root, 'index.html'), out, 'utf8');

console.log('构建完成 index.html :', (out.length / 1024).toFixed(1), 'KB');
