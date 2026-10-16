'use strict';

/* 四个模块共用同一条首次输入路径；选择规模仍允许 0，保持空题目的数学语义。 */
function markup(matrix, maxN, maxM) {
  function options(max) {
    var out = '';
    for (var i = 0; i <= max; i++) out += '<option value="' + i + '">' + i + '</option>';
    return out;
  }
  return '<div class="input-guide">'
    + '<div class="guide-intro"><div><b>从一道题开始</b><p>载入示例，或按题目设置' + (matrix ? '行列数' : '变量和约束数') + '。</p></div>'
    + '<button type="button" class="btn" data-guide="sample" title="载入示例会替换当前输入">载入示例</button></div>'
    + '<details class="guide-size"><summary>自定义题目规模</summary><div class="guide-fields">'
    + '<label>' + (matrix ? '人员（行）' : '变量数') + '<select data-guide="n">' + options(maxN) + '</select></label>'
    + '<label>' + (matrix ? '工作（列）' : '约束数') + '<select data-guide="m">' + options(maxM) + '</select></label>'
    + '<button type="button" class="btn" data-guide="apply">设置规模</button></div>'
    + '<p class="guide-note">缩小规模会移除末尾数据；载入示例会替换当前输入。</p></details>'
    + '<p class="guide-note">' + (matrix ? '行是人员，列是工作；填 × 表示禁止指派。' : '先选 max / min，再填写目标系数和各条约束。')
    + ' 空白按 0；支持小数、1e3 和分数（如 1/2、-3/4），分母不能为 0。</p></div>';
}

function attach(mount, cfg) {
  var root = mount.querySelector('.input-guide');
  var n = root.querySelector('[data-guide="n"]');
  var m = root.querySelector('[data-guide="m"]');
  root.querySelector('[data-guide="apply"]').addEventListener('click', function () {
    cfg.resize(+n.value, +m.value);
  });
  root.querySelector('[data-guide="sample"]').addEventListener('click', cfg.sample);
  return { sync: function (a, b) {
    n.value = String(a); m.value = String(b);
    root.classList.toggle('has-model', a > 0 || b > 0);
    root.querySelector('.guide-intro b').textContent = a > 0 || b > 0 ? '题目输入' : '从一道题开始';
  } };
}

module.exports = { markup: markup, attach: attach };
