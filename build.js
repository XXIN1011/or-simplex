/* 构建：template.html + 各模块 -> index.html（单文件、零依赖） */
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const tpl = read('template.html');

/* 占位符 -> 源文件，顺序即脚本插入顺序（后者可以调用前者定义的全局函数） */
const SLOTS = {
  '/*__CORE__*/': 'simplex-core.js',        // 单纯形法核心
  '/*__SENS_CORE__*/': 'sens-core.js',      // 场景式灵敏度分析核心
  '/*__PANEL__*/': 'input-panel.js',        // 可复用输入表组件
  '/*__GRAPH__*/': 'graph.js',              // 图解法
  '/*__UI__*/': 'ui.js',                    // 单纯形法界面
  '/*__SENS_UI__*/': 'sens-ui.js',          // 灵敏度分析界面
  '/*__DP_CORE__*/': 'dp-core.js',          // 动态规划核心（通用引擎 + 五种题型）
  '/*__DP_UI__*/': 'dp-ui.js',              // 动态规划界面
  '/*__IP_CORE__*/': 'ip-core.js',          // 整数规划核心（四种方法 + 适用性判定）
  '/*__IP_UI__*/': 'ip-ui.js',              // 整数规划界面
  '/*__INV_CORE__*/': 'inv-core.js',        // 库存论核心（教材第 9 章 9.2~9.6）
  '/*__INV_UI__*/': 'inv-ui.js',            // 库存论界面
  '/*__ROUTER__*/': 'router.js'             // 首页/模块路由
};

let out = tpl;
for (const key of Object.keys(SLOTS)) {
  if (tpl.indexOf(key) === -1) throw new Error('template.html 缺少占位符 ' + key);
  const src = read(SLOTS[key]);
  // 用函数作为替换值，避免 $& 等替换模式被解释
  out = out.replace(key, () => src);
}

/* 只产出根目录这一个 index.html：GitHub Pages 以仓库根为发布目录（main / /），
   推送即上线，不限次也不计量。不再产出 deploy/ 副本（那是给 Netlify 用的，已弃用）。 */
fs.writeFileSync(path.join(root, 'index.html'), out, 'utf8');

console.log('构建完成 index.html :', (out.length / 1024).toFixed(1), 'KB');
