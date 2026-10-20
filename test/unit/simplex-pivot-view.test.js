'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const simplex = require('../../src/core/simplex');
const parse = require('../../src/core/parse');
const view = require('../../src/web/simplex-pivot-view');
const table = require('../../src/web/table-render');
const { fmtNum, fmtPair } = require('../../src/core/format');
const clone = v => JSON.parse(JSON.stringify(v));
const lp = (c, rows, direction = 'max') => ({ direction, c,
  constraints: rows.map(([coef, rhs, rel = '<=']) => ({coef, rhs, rel})) });
const mixed = lp([3, 1], [[[2, 1], 3], [[1, 2], 5], [[-1, 1], 4], [[0, 1], 4]]);
const bigM = lp([4, 1], [[[3, 1], 3, '='], [[4, 3], 6, '>='], [[1, 2], 4]], 'min');
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function close(a, b) { assert.ok(Math.abs(a-b) <= 1e-9, `${a} != ${b}`); }

for (const [name, problem] of [['普通含正负零系数', mixed], ['min与大M', bigM],
  ['max与大M', lp([2, 1], [[[1, 1], 2, '='], [[2, 1], 5]])],
  ['退化', lp([1, 1], [[[1, 0], 0], [[1, 1], 1]])],
  ['并列', lp([1, 1], [[[1, 1], 2], [[1, 1], 2]])]]) {
  test(`${name}：真实前后快照与既有 core.pivot 逐项一致，讲解只读`, () => {
    const res = freeze(simplex.simplexSolve(problem)), json = JSON.stringify(res);
    let count = 0;
    for (let k = 0; k < res.steps.length - 1; k++) {
      const p = view.inspect(res, k);
      assert.equal(p.reason, ''); count++;
      const reference = {m:res.mConstraints, N:res.vars.length, ...clone(p.before)};
      assert.equal(simplex.pivot(reference, p.r, p.e), p.before.pivot);
      reference.rows.forEach((row, i) => row.forEach((v,j) => close(v, p.after.rows[i][j])));
      reference.obj.forEach((v,j) => {close(v.a,p.after.obj[j].a); close(v.b,p.after.obj[j].b)});
      assert.deepEqual(reference.basis,p.after.basis);
      for (const phase of view.phases(p)) {
        for (let row=0;row<p.m;row++) {
          if (phase==='eliminate' && row===p.r) continue;
          for (let col=0;col<p.n;col++) assert.ok(view.explanation(res,p,phase,row,col));
        }
      }
      assert.match(view.render(res,k),/这一步怎样换表/);
      assert.equal((view.content(res,p).match(/<table/g)||[]).length,2);
      assert.doesNotMatch(view.content(res,p),/data-study-step|class="cell (?:enter|leave|pivot)/);
    }
    assert.ok(count>0);
    assert.equal(JSON.stringify(res),json);
  });
}

test('非1枢轴归一化和正负零消元均引用旧系数、新主行和真实新右端项', () => {
  const res=simplex.simplexSolve(mixed),p=view.inspect(res,0);
  assert.equal(p.before.pivot,2);
  assert.match(view.explanation(res,p,'normalize',1,0),/3 ÷ \(2\) = 3\/2/);
  assert.match(view.explanation(res,p,'eliminate',1,0),/\(5\) − \(1\) × \(3\/2\) = 7\/2/);
  assert.match(view.explanation(res,p,'eliminate',2,0),/\(4\) − \(-1\) × \(3\/2\) = 11\/2/);
  assert.match(view.explanation(res,p,'eliminate',3,0),/无需消元/);
});

test('目标行每一列与常数项按 fmtPair 保留M和常数，并且带括号', () => {
  const res=simplex.simplexSolve(bigM),p=view.inspect(res,0),a=p.before,b=p.after;
  assert.ok(a.obj[p.e].a!==0 && a.obj[p.e].b!==0);
  for (let j=0;j<p.n;j++) {
    const h=view.explanation(res,p,'objective',0,j);
    assert.ok(h.includes(`(${fmtPair(a.obj[j])}) − (${fmtPair(a.obj[p.e])}) × (${fmtNum(b.rows[p.r][j])}) = (${fmtPair(b.obj[j])})`));
    assert.ok(h.includes(`(${fmtPair(a.obj[p.n])}) − (${fmtPair(a.obj[p.e])}) × (${fmtNum(b.rows[p.r][p.n])}) = (${fmtPair(b.obj[p.n])})`));
    assert.match(h,/原题 min 已取负/);
  }
  assert.ok(res.swapped);
  close(res.objective,17/5);
  assert.match(view.explanation(res,p,'finish',0,0),/整个求解尚未完成/);
});

test('枢轴1不假造变化，单约束不制造其他行环节', () => {
  const res=simplex.simplexSolve(lp([1],[[[1],3]])),p=view.inspect(res,0);
  assert.match(view.explanation(res,p,'normalize',0,0),/无需缩放/);
  assert.deepEqual(view.phases(p),['locate','normalize','objective','finish']);
  assert.doesNotMatch(view.content(res,p),/data-pivot-row-select/);
  assert.match(view.explanation(res,p,'finish',0,0),/记录了最优终止判定/);
});

test('退化θ=0仍讲解换基；并列直接沿用core选出的行列', () => {
  const res=simplex.simplexSolve(lp([1,1],[[[1,0],0],[[1,1],1]])),p=view.inspect(res,0);
  assert.ok(p.before.degenerate);
  assert.equal(p.before.rows[p.r][p.n],0);
  assert.match(view.explanation(res,p,'locate',1,0),/退化换基/);
  const tie=simplex.simplexSolve(lp([1,1],[[[1,1],2],[[1,1],2]])),t=view.inspect(tie,0);
  assert.equal(t.e,0);assert.equal(t.r,0);
  assert.equal(t.before.ratios[0].theta,t.before.ratios[1].theta);
});

test('终止表不提供操作；初始最优、无界、不可行都保留原表', () => {
  for (const prob of [lp([-1],[[[1],1]]),lp([1],[[[-1],0]]),lp([1],[[[1],5,'>='],[[1],2]])]) {
    const res=simplex.simplexSolve(prob),k=res.steps.length-1;
    assert.equal(view.inspect(res,k).reason,'terminal');
    assert.equal(view.render(res,k),'');
    assert.match(table.renderTable(res,res.steps[k]),/<table/);
  }
});

test('迭代上限：最后枢轴虽已执行但无后表，不从最终basis/solution重建', () => {
  const res=simplex.solveStandardForm(parse.parseProblem(mixed).form,{maxIter:0});
  assert.equal(res.status,'iteration-limit');assert.equal(res.steps.length,1);
  assert.notDeepEqual(res.basis,res.steps[0].basis);
  assert.equal(view.inspect(res,0).reason,'missing');
  assert.match(view.render(res,0),/缺少下一表快照/);
  assert.doesNotMatch(view.render(res,0),/<details|<table|data-simplex-pivot/);
});

test('丢失、损坏、乱序及基/单位列不匹配时保守降级', () => {
  const mutations=[r=>{r.steps[1]=null},r=>{r.steps[1].iter+=1},r=>{r.steps[1].rows.pop()},
    r=>{r.steps[1].rows[0].pop()},r=>{r.steps[1].obj[0].a=NaN},r=>{r.steps[1].basis[0]=r.steps[0].basis[0]},
    r=>{r.steps[1].rows[0][r.steps[0].entering]=2},r=>{r.steps[1].obj[r.steps[0].entering].b=1},
    r=>{r.steps[0].basis[1]=r.steps[0].basis[0]},r=>{r.steps[0].rows[0][0]=Infinity},
    r=>{r.vars[0]=null},r=>{r.steps[0].pivot=0},r=>{r.steps[0].entering=999}];
  for (const mutate of mutations) {
    const res=simplex.simplexSolve(mixed);mutate(res);
    assert.ok(view.inspect(res,0).reason);
    assert.doesNotMatch(view.render(res,0),/data-simplex-pivot|<table/);
  }
  assert.doesNotThrow(()=>view.render(null,0));
});

test('后表带下一轮标记时，对照表无默认高亮，原有默认渲染逐字保持', () => {
  const res=simplex.simplexSolve(bigM),p=view.inspect(res,0);
  assert.notEqual(p.before.entering,p.after.entering);
  const def=table.renderTable(res,p.after);
  assert.equal(def,table.renderTable(res,p.after,{}));
  assert.match(def,/class="cell enter/);
  const read=table.renderTable(res,p.after,{unmarked:true,positions:true});
  assert.doesNotMatch(read,/class="(?:cell )?(?:enter|leave|pivot)/);
  assert.match(read,/data-pivot-row="obj"/);
});

test('显示舍入不改变零系数和单位枢轴判断；生产模块无计算内核、解算或文字数字解析', () => {
  const res=simplex.simplexSolve(mixed),p=view.inspect(res,0);
  p.before.rows[3][p.e]=1e-12;
  assert.equal(fmtNum(p.before.rows[3][p.e]),'0');
  assert.doesNotMatch(view.explanation(res,p,'eliminate',3,0),/无需消元/);
  const source=fs.readFileSync(require.resolve('../../src/web/simplex-pivot-view'),'utf8');
  assert.doesNotMatch(source,/require\(['"].*(?:simplex\.js|parse\.js)|\b(?:pivot|simplexSolve|solveStandardForm|parseFloat)\s*\(/);
  assert.doesNotMatch(source,/localStorage|setInterval|setTimeout|data-study-step/);
});
