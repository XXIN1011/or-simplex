/* 开发样板：复用构建后的 CSS / 模块，不执行 boot，不加载真实存储。 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = source.match(/<style>([\s\S]*?)<\/style>/)[1];
const scripts = Array.from(source.matchAll(/<script>([\s\S]*?)<\/script>/g));
const bundle = scripts.find(m => m[1].includes("__require__('src/web/boot.js')"))[1];
const transport = require('../../src/core/transport.js');
const example = require('../../src/web/examples.js').transport();
const fixed = transport.transportSolve(example);
const player = require('../../src/web/transport-player.js');
const index = fixed.steps.findIndex(s => s.type === 'pivot');
if (index < 0) throw new Error('固定样例缺少闭回路快照');
const study = require('../../src/web/study-view.js');
const studyHtml = study.group([{ title: '固定样例：初始表', html: '<p>σ₁ = 2；基变量 x₂ = 4。</p>' },
  { title: '固定样例：终止表', html: '<p>z = 12；这里只演示阅读控件状态。</p>' }], '固定数学样例');
const states = ['暂无历史记录。', '历史记录无法读取，可清空后重新记录。', '当前浏览器无法读取历史记录。'];
const history = states.map(text => '<details class="problem-history" open><summary><span>历史记录</span><span class="history-count">0</span></summary><p class="guide-note">' + text + '</p></details>').join('');
const markup = `
<header><h1>组件状态样板</h1><p>仅用于开发验证。所有数学内容均为固定样例，页面不执行求解，不读写草稿、历史或偏好。</p></header>
<section class="card" id="theme"><h2 class="sec">主题与按钮</h2>
<div class="seg" role="group" aria-label="样板主题"><button type="button" data-demo-theme="light" class="on" aria-pressed="true">浅色</button><button type="button" data-demo-theme="dark" aria-pressed="false">深色</button></div>
<div class="ctrls"><button type="button" class="btn primary">求解</button><button type="button" class="btn">载入示例</button><button type="button" class="btn" disabled>已达上限</button></div>
<div class="history-actions"><button type="button" class="btn history-restore">恢复</button><button type="button" class="btn history-delete" aria-label="删除固定样例">删除</button></div>
<p class="guide-note">用鼠标检查悬停，Tab 检查焦点，空格或回车操作按钮。危险操作依赖明确文字；正式历史清空保留确认。</p></section>
<section class="card"><h2 class="sec">数字与关系选择器</h2><div class="scroll"><table class="inp"><thead><tr><th>空白输入</th><th>有效输入</th><th>错误输入</th><th>关系</th></tr></thead><tbody><tr>
<td><input class="num" type="text" placeholder="0" aria-label="空白样例"></td><td><input class="num" type="text" value="1/2" aria-label="分数样例" aria-invalid="false"></td><td><input class="num" type="text" value="1/0" aria-label="错误样例" aria-invalid="true"></td><td><select class="rel" aria-label="关系样例"><option>≤</option><option>≥</option><option>=</option></select></td></tr></tbody></table></div>
<p class="guide-note">错误：分母不能为 0。输入按原文保留，计算使用数值。</p>
<div class="draft-tools"><p class="guide-note">当前题目会自动保存在此浏览器。（状态示意）</p><p class="guide-note">题目未能保存，请保持页面打开。（失败示意）</p></div>${history}
<details class="problem-history" open><summary><span>历史记录</span><span class="history-count">1</span></summary><ol class="history-list"><li><div class="history-info"><div class="history-item-heading"><b>固定样例 · 2 个变量</b><time>示例时间</time></div><p>c = [2, 3]；b = [8, 12]</p></div><div class="history-actions"><button type="button" class="btn history-restore">恢复</button><button type="button" class="btn history-delete" aria-label="删除样例记录">删除</button></div></li></ol></details></section>
<section class="card"><h2 class="sec">结果与失效</h2><div class="verdict opt"><div class="vtitle">最优解（固定样例）</div><div class="sol">z = 12</div></div><div class="verdict no"><div class="vtitle">无可行解（固定样例）</div></div><div class="verdict unb"><div class="vtitle">无界 / 未确认最优（两种状态的警告样式）</div><p>正式页面分别显示对应状态。</p></div><div class="banner err">输入有误：请修正已标记的字段。</div><div class="banner">输入已修改，请重新求解。下方旧结果对应修改前的题目。</div><div id="result" class="show stale"><div class="verdict opt"><div class="vtitle">修改前的固定样例</div><p>z = 12</p></div></div></section>
<details class="result-work" open><summary>学习控件与折叠区</summary>${studyHtml}</details>
<details class="result-work"><summary>折叠状态</summary><p>可用键盘展开。</p></details>
<div id="mod-transport" class="on"><section class="card" id="tpOut"><h2 class="sec">运输播放控件（固定快照）</h2>${player.render(fixed.model, fixed.steps[index], index)}</section></div>
<nav class="tabbar" aria-label="样板底栏"><a href="#top" class="on" aria-current="page">首页</a><a href="#theme">设置</a></nav>`;
// 只替换启动入口，其余模块原样注册；不 require boot/settings/draft/history。
const entry = `__require__('src/web/study-view.js').wire(document.body);
__require__('src/web/input-panel.js').addScrollHints(document.body);
__require__('src/web/transport-player.js').wire(document.getElementById('tpOut'), ${JSON.stringify(fixed)});
Array.prototype.forEach.call(document.querySelectorAll('[data-demo-theme]'), function(button) {
  button.addEventListener('click', function() {
    document.documentElement.setAttribute('data-theme', button.getAttribute('data-demo-theme'));
    Array.prototype.forEach.call(document.querySelectorAll('[data-demo-theme]'), function(b) {
      b.classList.toggle('on', b === button); b.setAttribute('aria-pressed', String(b === button));
    });
  });
});`;
const runtime = bundle.replace("__require__('src/web/boot.js');", () => entry);
const html = '<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>组件状态样板</title><style>' + css + '</style></head><body><main class="wrap" id="top">' + markup + '</main><script>' + runtime + '</script></body></html>';
const out = path.join(root, 'preview/component-states.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('已生成 preview/component-states.html（忽略的开发产物）');
