#!/usr/bin/env node
/* =========================================================================
   or-simplex 命令行入口
   -------------------------------------------------------------------------
   三种给题方式（任选）：

     node src/cli.js '{"direction":"max","c":[2,3],"constraints":[{"coef":[1,2],"rel":"<=","rhs":8}]}'
     node src/cli.js --file problem.json
     echo '{ … }' | node src/cli.js

   可选参数：
     --json        不渲染报告，直接打印求解结果的 JSON（脚本里接管道用）
     --no-tables   不打印每张迭代表，只要标准型 + 结论 + 对偶 + 灵敏度
     --integer     按整数规划求解（四种方法的适用性与过程）
     --assign      按指派问题求解（匈牙利法：逐步迭代 + 符号说明）
     --help        显示用法

   退出码：0 = 得到最优解；1 = 无界 / 无可行解 / 未收敛 / 输入非法（脚本里可直接判）
   ========================================================================= */
'use strict';

const fs = require('fs');
const or = require('./index.js');
const errors = or.errors;
const format = or.format;

function usage() {
  return [
    '用法：node src/cli.js <题目 JSON> [--json] [--no-tables] [--integer] [--assign] [--help]',
    '',
    '题目 JSON 形如：',
    '  { "direction": "max", "c": [2, 3],',
    '    "constraints": [ { "coef": [1, 2], "rel": "<=", "rhs": 8 } ] }',
    '',
    '  · direction：max | min',
    '  · rel：<= | >= | =',
    '  · 0 个变量或 0 个约束都是合法输入，会给出确定结论',
    '  · --integer 时另需 vtypes 数组，每项取值 int（整数）/ bin（0-1）/ cont（连续），例如：',
    '      { "direction":"max","c":[3,2],"vtypes":["int","int"],',
    '        "constraints":[{"coef":[2,1],"rel":"<=","rhs":5}] }',
    '  · --assign 时用的是成本/收益矩阵 cost（行 = 人员、列 = 工作；某格填 null 表示禁止指派），例如：',
    '      { "direction":"min","cost":[[2,15,13,4],[10,4,14,15],[9,14,16,13],[7,8,11,9]] }',
    '',
    '也可以：node src/cli.js --file 题目.json   或   cat 题目.json | node src/cli.js'
  ].join('\n');
}

/* 读题目：位置参数 > --file > 标准输入 */
function readProblem(argv) {
  const fileIdx = argv.indexOf('--file');
  if (fileIdx >= 0) {
    const p = argv[fileIdx + 1];
    if (!p) throw new Error('--file 后面要跟文件路径');
    return fs.readFileSync(p, 'utf8');
  }
  const positional = argv.find(a => a[0] !== '-' );
  if (positional) return positional;
  if (!process.stdin.isTTY) {
    try {
      const txt = fs.readFileSync(0, 'utf8').trim();
      if (txt) return txt;
    } catch (e) { /* 没有标准输入就落到帮助信息 */ }
  }
  return null;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    console.log(usage());
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const raw = readProblem(argv);
  if (raw === null) {
    console.error('没有读到题目。\n\n' + usage());
    process.exit(1);
  }

  let problem;
  try {
    problem = JSON.parse(raw);
  } catch (e) {
    console.error('题目不是合法 JSON：' + e.message);
    process.exit(1);
  }

  /* 指派问题走另一条路径（匈牙利法：逐步迭代 + 符号说明，不是只报一个答案） */
  if (argv.includes('--assign')) {
    const res = or.solveAssignment(problem, {});
    if (argv.includes('--json')) {
      console.log(JSON.stringify(res, null, 2));
      if (!res.ok || res.status !== 'optimal') process.exit(1);
      return;
    }
    console.log(format.assignReport(res, or.assignmentSymbols()));
    if (!res.ok || res.status !== 'optimal') process.exit(1);
    return;
  }

  /* 整数规划走另一条路径（四种方法各有适用性判定，不能只报一个答案） */
  if (argv.includes('--integer')) {
    const ip = or.solveInteger(problem, {});
    if (argv.includes('--json')) { console.log(JSON.stringify(ip, null, 2)); return; }
    if (!ip.ok) { console.error('输入有误：' + ip.message); process.exit(1); }

    console.log('松弛问题（先去掉整数要求）：z = ' + format.fmtNum(ip.relax.objective)
      + '，x = (' + ip.relax.solution.map(format.fmtNum).join(', ') + ')'
      + (ip.relaxIntegral ? '　—— 恰好全整数，松弛解就是整数最优解' : '　—— 含非整数分量，需下面四种方法之一'));
    if (ip.noOptimum) {
      console.log('松弛问题本身没有最优解，整数规划同样无解。');
      process.exit(1);
    }
    console.log('整数变量下标：' + (ip.intIdx.length ? ip.intIdx.join('、') : '无'));

    console.log('四种方法的适用性：');
    ip.methods.forEach(m => {
      console.log('  · ' + m.name + '：' + (m.applicable ? '可用' : '不适用 —— ' + m.reason));
    });

    const bnb = ip.methods.find(m => m.key === 'bnb');
    if (bnb && bnb.applicable && bnb.best) {
      console.log('分枝定界法：整数最优解 x = (' + bnb.best.map(format.fmtNum).join(', ') + ')，z = '
        + format.fmtNum(bnb.bestZ)
        + (bnb.complete ? '' : '　【节点数触顶，不能保证是全局最优】'));
    }
    const cut = ip.methods.find(m => m.key === 'cut');
    if (cut && cut.applicable) {
      console.log('割平面法：' + (cut.converged
        ? '收敛，x = (' + cut.solution.map(format.fmtNum).join(', ') + ')，z = ' + format.fmtNum(cut.objective)
        : '在 ' + cut.maxCuts + ' 个割内未收敛'));
    }
    const en = ip.methods.find(m => m.key === 'enum');
    if (en && en.applicable && en.best) {
      console.log('隐枚举法：最优 0-1 组合 x = (' + en.best.map(format.fmtNum).join(', ') + ')，z = ' + format.fmtNum(en.bestZ));
    }
    return;
  }

  const res = or.solve(problem);

  if (argv.includes('--json')) {
    console.log(JSON.stringify(res, null, 2));
    if (!res.ok || errors.isFailure(res.status)) process.exit(1);
    return;
  }

  console.log(format.report(res, problem, { tables: !argv.includes('--no-tables') }));

  /* 非最优（含输入非法）在命令行里是失败：给脚本一个能判的退出码 */
  if (!res.ok || errors.isFailure(res.status)) process.exit(1);
}

main();
