'use strict';

/* 每组从真实初始页开始，既检查显示，也核对输入实际求出的目标值。 */
module.exports = async function reliabilityCases(sess, check, url) {
  // 先离开文档，避免仅 hash 变化保留前一套件的输入状态。
  await sess.navigate('about:blank', 0);
  await sess.navigate(url + '#/simplex', 200);
  const results = await sess.evl(`(function () {
    var results = [];
    function expect(ok, label) { results.push({ok:!!ok,label:label}); }
    function q(sel) { return document.querySelector(sel); }
    function click(id) { document.getElementById(id).click(); }
    function set(sel, value, ev) { var e=q(sel);e.value=value;e.dispatchEvent(new Event(ev||'input',{bubbles:true})); }
    function one(prefix) {
      click(prefix+'AddVar');click(prefix+'AddCon');
      set('#'+prefix+'InTbl [data-k=c]', '2');
      set('#'+prefix+'InTbl [data-k=a]', '1');
      set('#'+prefix+'InTbl [data-k=b]', '4');
    }
    // 单纯形：坏输入必须保留、标红且拒绝求解；好输入必须按原意计算。
    click('addVar');click('addCon');
    set('#inTbl [data-k=a]', '1');set('#inTbl [data-k=b]', '1');
    ['1/2','1,5','abc','-','.','1e','1e999'].forEach(function(raw) {
      set('#inTbl [data-k=c]',raw);click('addCon');click('delCon');
      expect(q('#inTbl [data-k=c]').value===raw,'非法输入重绘后保留原文：'+raw);
      expect(q('#inTbl [data-k=c]').getAttribute('aria-invalid')==='true','非法输入标注：'+raw);
      click('solveBtn');
      expect(!q('#result').classList.contains('show') && /输入有误/.test(q('#banners').textContent),'非法输入禁止求解：'+raw);
    });
    [['1e3','1000'],['−2','-2'],['','0']].forEach(function(pair) {
      set('#inTbl [data-k=c]',pair[0]);q('#dirSeg [data-dir=min]').click();
      set('#inTbl select','=', 'change');click('solveBtn');
      expect(q('#inTbl [data-k=c]').getAttribute('aria-invalid')==='false' && q('#result .zv').textContent===pair[1], '正确解析并求解：'+pair[0]);
    });
    set('#inTbl [data-k=c]','2');set('#inTbl select','<=','change');
    var edits=[
      function(){q('#dirSeg [data-dir=max]').click()},
      function(){click('addVar')},function(){click('delVar')},
      function(){click('addCon')},function(){click('delCon')},
      function(){click('addCon');click('solveBtn');q('#inTbl button.delvar').click()},
      function(){set('#inTbl [data-k=c]','3')},
      function(){set('#inTbl select','>=','change')}
    ];
    edits.forEach(function(edit,i){click('solveBtn');edit();expect(q('#result').classList.contains('stale'),'单纯形修改后结果失效 '+i)});
    // 整数规划：输入和方向/规模/变量类型修改均清理旧结果。
    one('ip');click('ipSolveBtn');
    expect(!!q('#ipOut .verdict'),'整数题基准求解成功');
    [function(){set('#ipInTbl [data-k=c]','3')},function(){q('#ipDirSeg [data-dir=min]').click()},
      function(){click('ipAddVar')},function(){click('ipDelVar')},function(){click('ipAddCon')},function(){click('ipDelCon')},
      function(){set('#ipInTbl select','>=','change')},function(){q('#ipInTbl button.delvar').click()}
    ].forEach(function(edit,i){click('ipSolveBtn');edit();expect(!q('#ipOut').textContent,'整数题修改清理旧结果 '+i)});
    click('ipAddCon');set('#ipInTbl [data-k=a]','1');set('#ipInTbl [data-k=b]','1');
    set('#ipInTbl [data-k=c]','abc');click('ipSolveBtn');
    expect(!q('#ipOut').textContent && /不是有效数字/.test(q('#ipBanners').textContent),'整数非法数字拒绝求解');
    set('#ipInTbl [data-k=c]','0');set('#ipInTbl [data-k=b]','0.5');set('#ipInTbl select','=','change');
    q('#ipDirSeg [data-dir=max]').click();
    click('ipAddVar');set('#ipInTbl [data-k=c][data-j="1"]','1');click('ipSolveBtn');
    expect(/整数问题结论未确定/.test(q('#ipOut').textContent) && !/必然也无界/.test(q('#ipOut').textContent),'整数 UI 区分松弛无界和整数结论');
    // 灵敏度：基准题变化后必须重新求解；场景变化不能继续展示上一场景。
    one('s');click('sSolveBtn');
    expect(!!q('#sBase .verdict'),'灵敏度基准求解成功');
    function analyze(){set('#sensForm [data-f=c]','3');click('sensGo')}
    analyze();expect(!!q('#sensOut'),'灵敏度场景求解成功');
    set('#sensForm [data-f=c]','1/2');
    expect(!q('#sensOut'),'场景输入修改清除旧分析');click('sensGo');
    expect(!q('#sensOut') && q('#sensForm input').getAttribute('aria-invalid')==='true','场景非法数字拒绝分析');
    analyze();q('#sensTabs [data-t=b]').click();expect(!q('#sensOut'),'切换场景清除旧分析');
    [function(){set('#sInTbl [data-k=c]','3')},function(){q('#sDirSeg [data-dir=min]').click()},
      function(){click('sAddVar')},function(){click('sDelVar')},function(){click('sAddCon')},function(){click('sDelCon')},
      function(){set('#sInTbl select','>=','change')},function(){q('#sInTbl button.delvar').click()}
    ].forEach(function(edit,i){click('sSolveBtn');edit();expect(!q('#sBase').textContent && !q('#sScenario').textContent && !q('#sensOut'),'基准变化清除全部分析 '+i)});
    // 指派：同一解析规则，但保留禁止指派符号；行列变化也须清除旧结果。
    click('asAddRow');set('#asInTbl input','1e3');click('asSolveBtn');
    expect(/1000/.test(q('#asOut').textContent),'指派科学计数法正确');
    ['1/2','abc','1e999'].forEach(function(raw){set('#asInTbl input',raw);click('asSolveBtn');expect(!q('#asOut').textContent && q('#asInTbl input').getAttribute('aria-invalid')==='true' && /不是有效数字/.test(q('#asBanners').textContent),'指派非法数字拒绝：'+raw)});
    set('#asInTbl input','−2');click('asSolveBtn');expect(/-2/.test(q('#asOut').textContent),'指派数学负号正确');
    set('#asInTbl input','×');click('asSolveBtn');expect(/无可行解/.test(q('#asOut').textContent),'禁止指派仍有效');
    set('#asInTbl input','2');
    [function(){click('asAddRow')},function(){click('asDelRow')},function(){click('asAddCol')},function(){click('asDelCol')},function(){q('#asDirSeg [data-dir=max]').click()}].forEach(function(edit,i){click('asSolveBtn');edit();expect(!q('#asOut').textContent,'指派规模或方向变化清除旧结果 '+i)});
    expect(window.__errors.length===0,'可靠性回归全程无 JS 错误');
    return results;
  })()`);
  results.forEach(r => check(r.ok, r.label));
  await require('../../lib/chrome.js').sleep(50);
  check(await sess.evl(`(function(){document.getElementById('ipSolveBtn').click();var b=document.querySelector('#ipTypes [data-vt="0"] [data-t=cont]');b.click();return !document.getElementById('ipOut').textContent})()`), '整数变量类型变化清除旧结果');
};
