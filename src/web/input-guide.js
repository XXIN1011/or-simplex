'use strict';

/* 各模块共用首次输入提示；题目行列由表格下方的增减按钮编辑。 */
function markup(matrix) {
  var transport = matrix === 'transport';
  return '<div class="input-guide">'
    + '<div class="guide-intro"><div><b>从一道题开始</b><p>载入示例，或用下方按钮逐项增减' + (transport ? '产地和销地' : matrix ? '行和列' : '变量和约束') + '。</p></div>'
    + '<button type="button" class="btn" data-guide="sample" title="载入示例会替换当前输入">载入示例</button></div>'
    + '<p class="guide-note">' + (transport ? '中间填单位运费或收益，右侧填供应量，底部填需求量。供需量须非负。' : matrix ? '行是人员，列是工作；填 × 表示禁止指派。' : '先选 max / min，再填写目标系数和各条约束。')
    + ' 空白按 0；支持小数、1e3 和分数（如 1/2、-3/4），分母不能为 0。</p></div>';
}

function attach(mount, cfg) {
  var root = mount.querySelector('.input-guide');
  root.querySelector('[data-guide="sample"]').addEventListener('click', cfg.sample);
  return { sync: function (a, b) {
    root.classList.toggle('has-model', a > 0 || b > 0);
    root.querySelector('.guide-intro b').textContent = a > 0 || b > 0 ? '题目输入' : '从一道题开始';
  } };
}

module.exports = { markup: markup, attach: attach };
