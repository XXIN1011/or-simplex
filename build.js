/* 构建：template.html + simplex-core.js + ui.js  ->  index.html（单文件、零依赖） */
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

fs.writeFileSync(path.join(root, 'index.html'), out, 'utf8');

// 部署副本（可直接拖到 Netlify Drop：index.html + netlify.toml）
const dep = path.join(root, 'deploy');
fs.mkdirSync(dep, { recursive: true });
fs.writeFileSync(path.join(dep, 'index.html'), out, 'utf8');
const ntl = path.join(root, 'netlify.toml');
if (fs.existsSync(ntl)) fs.copyFileSync(ntl, path.join(dep, 'netlify.toml'));

console.log('构建完成 index.html :', (out.length / 1024).toFixed(1), 'KB');
console.log('部署副本 deploy/index.html');
