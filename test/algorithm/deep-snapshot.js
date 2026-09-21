/* =========================================================================
   深度行为快照 —— 重构的「一字不变」证据
   -------------------------------------------------------------------------
   对 test/algorithm/random-bank.json 里的每一道题，跑一遍单纯形，把**全量输出**
   规范化后取 sha256：

     · 结论层：ok / status / message / objective / solution / dual / altOptimal / basis
     · 迭代层：每一步的 iter / basis / entering / leaving / pivot / degenerate / note
               / ratios（含每个 θ）/ rows（整张表每个格子）/ obj（整张 σ 行，含 M 项）
     · 显示层：把上面所有数字用 fmtNum / fmtPair 渲染成界面里真正会显示的字符串，
               再哈希一次 —— 公式改了、分数显示变了、M 项写法变了都会被抓到

   用法：
     node test/algorithm/deep-snapshot.js            # 每条一行，供 diff 对拍
     node test/algorithm/deep-snapshot.js > a.txt    # 重构前
     node test/algorithm/deep-snapshot.js > b.txt    # 重构后，diff a.txt b.txt 必须为空
     node test/algorithm/deep-snapshot.js --full 17  # 打印第 17 题的完整原始输出

   前置：先跑 node test/algorithm/test-simplex.js 生成题库（固定种子，可复现）
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { simplexSolve } = require('../../src/core/simplex.js');
const { fmtNum, fmtPair } = require('../../src/core/format.js');

const BANK = path.join(__dirname, 'random-bank.json');

function hash(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

/* 数字本身 + 显示文本，两份都留：前者管数学，后者管「界面上看起来一模一样」 */
function canonNumber(res) {
  return {
    ok: res.ok,
    status: res.status,
    message: res.message === undefined ? null : res.message,
    objective: res.ok ? res.objective : null,
    solution: res.ok ? res.solution : null,
    dual: res.ok ? res.dual : null,
    altOptimal: res.ok ? res.altOptimal : null,
    basis: res.ok ? res.basis : null,
    vars: res.ok ? res.vars : null,
    nDecision: res.nDecision, mConstraints: res.mConstraints, swapped: res.swapped,
    sensitivity: res.ok ? res.sensitivity : null,
    steps: res.ok ? res.steps.map(s => ({
      iter: s.iter, basis: s.basis,
      entering: s.entering, leaving: s.leaving, pivot: s.pivot,
      degenerate: s.degenerate, note: s.note,
      ratios: s.ratios, rows: s.rows, obj: s.obj
    })) : null
  };
}

function canonText(res) {
  if (!res.ok) return { message: res.message };
  return {
    status: res.status,
    objective: fmtNum(res.objective),
    solution: res.solution.map(fmtNum),
    dual: res.dual ? res.dual.map(fmtNum) : null,
    vars: res.vars.map(v => v.name + ':' + v.kind),
    steps: res.steps.map(s => ({
      iter: s.iter, basis: s.basis.map(c => res.vars[c].name),
      entering: s.entering === null ? null : res.vars[s.entering].name,
      leaving: s.leaving,
      pivot: s.pivot === null ? null : fmtNum(s.pivot),
      degenerate: s.degenerate, note: s.note,
      /* 终止快照（最优/无界/无可行解）没有比值列，ratios 为 null，也要原样保留 */
      ratios: s.ratios ? s.ratios.map(r => r.ok ? fmtNum(r.theta) : '—') : null,
      rows: s.rows.map(row => row.map(fmtNum)),
      obj: s.obj.map(fmtPair)
    })),
    sensC: res.sensitivity ? res.sensitivity.c.map(e =>
      [e.name, e.basic, fmtNum(e.current), fmtNum(e.lo), fmtNum(e.hi), fmtNum(e.slope)].join('|')) : null,
    sensB: res.sensitivity ? res.sensitivity.b.map(e =>
      [e.i, fmtNum(e.current), fmtNum(e.lo), fmtNum(e.hi), fmtNum(e.shadow), e.pinned].join('|')) : null
  };
}

function main() {
  const argv = process.argv.slice(2);
  const fullIdx = argv.indexOf('--full');

  if (!fs.existsSync(BANK)) {
    console.error('缺少题库 ' + BANK + '，请先运行：node test/algorithm/test-simplex.js');
    process.exit(2);
  }
  const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));

  if (fullIdx >= 0) {
    const id = Number(argv[fullIdx + 1]);
    const c = bank.find(x => x.id === id) || bank[id];
    const res = simplexSolve({ direction: c.direction, c: c.c, constraints: c.constraints });
    console.log(JSON.stringify(canonNumber(res), null, 1));
    return;
  }

  const lines = [];
  const stat = {};
  for (const c of bank) {
    const res = simplexSolve({ direction: c.direction, c: c.c, constraints: c.constraints });
    const hn = hash(canonNumber(res));
    const ht = hash(canonText(res));
    stat[res.status] = (stat[res.status] || 0) + 1;
    lines.push(String(c.id).padStart(4, '0') + '  ' + String(res.status).padEnd(12)
      + '  steps=' + String(res.ok ? res.steps.length : 0).padEnd(3)
      + '  n=' + String(c.c.length) + ' m=' + String(c.constraints.length).padEnd(2)
      + '  num=' + hn + '  txt=' + ht);
  }
  console.log('# 深度行为快照  cases=' + bank.length + '  status=' + JSON.stringify(stat));
  console.log('# num = 数值与结构哈希（目标值/解/对偶/每一步整张表）  txt = 界面显示文本哈希');
  console.log(lines.join('\n'));
  console.log('# 合计 ' + lines.length + ' 条');
}

main();
