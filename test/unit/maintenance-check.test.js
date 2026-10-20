'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { checkSources } = require('../../tools/check-maintenance.js');

const CORE = 'src/core/model.js';
const WEB = 'src/web/boot.js';
const CLI = path.resolve(__dirname, '../../tools/check-maintenance.js');
function fixture(changes = {}) {
  return Object.assign({ [CORE]: 'module.exports = {};', [WEB]: "require('../core/model');" }, changes);
}
function rules(sources) { return checkSources(sources).issues.map(issue => issue.rule); }

test('允许 ES5、相对 CommonJS 依赖、无后缀路径和 web → core', () => {
  const result = checkSources(fixture());
  assert.deepEqual(result.issues, []);
  assert.equal(result.files, 2);
  assert.equal(result.dependencies, 1);
});

test('遵循 CommonJS 工厂环境，允许模块顶层 return', () => {
  assert.deepEqual(checkSources(fixture({ [CORE]: 'module.exports = {}; return;' })).issues, []);
});

for (const source of [
  'let value = 1;', 'const value = 1;', 'var fn = () => 1;',
  'var text = `template`;', 'class Model {}', 'var {value} = obj;',
  'function run(value = 1) {}', 'async function run() {}',
  'var value = obj?.value;', 'var value = 2 ** 3;', 'var value = {...obj};',
  'var value = 1_000;', 'var re = /value/u;', 'for (var value of values) {}',
  "import value from './model.js';", 'function run(a, a) {}', 'with (obj) {}'
]) {
  test('严格 ES5 拦截：' + source, () => {
    assert.ok(rules(fixture({ [WEB]: source })).includes('ES5'));
  });
}

test('扫描不执行应用源码，注释、字符串、正则和属性名不产生误报', () => {
  const source = [
    '// const arrow = () => window.document; require("fs");',
    'var text = "window document require(\'fs\') => class";',
    'var pattern = /window|document|require/;',
    'var record = {window: 1, document: 2, const: 3}; record.document;',
    'window: for (;;) { break window; }',
    'module.exports = function () { throw new Error("must not execute"); };'
  ].join('\n');
  assert.deepEqual(checkSources(fixture({ [CORE]: source })).issues, []);
});

for (const source of [
  'window.document;', 'document.createElement("div");', 'typeof navigator;',
  'globalThis["document"];', 'self["document"];', 'global.process;',
  'process.cwd();', 'console.log("output");', 'localStorage.getItem("value");',
  'fetch("/model");', 'new XMLHttpRequest();', 'setTimeout(function () {}, 0);'
]) {
  test('算法层拦截宿主 API：' + source, () => {
    assert.ok(rules(fixture({ [CORE]: source })).includes('CORE_HOST'));
  });
}

test('局部参数、提升声明、函数名和 catch 绑定不误判为宿主全局', () => {
  const source = [
    'function read(document) { return document.value; }',
    'function hoisted() { return window; var window = 1; }',
    'function navigator() { return navigator; }',
    'var fn = function location() { return location; };',
    'try {} catch (document) { read(document); }',
    'function caught() { try {} catch (error) { var document = 1; } return document; }'
  ].join('\n');
  assert.deepEqual(checkSources(fixture({ [CORE]: source })).issues, []);
});

test('嵌套局部绑定不能掩盖外层的真实全局引用', () => {
  const source = [
    'function nested(document) { return document; }',
    'try {} catch (window) { window.value; }',
    'document.title; window.location;'
  ].join('\n');
  const result = checkSources(fixture({ [CORE]: source }));
  assert.equal(result.issues.length, 2);
  assert.ok(result.issues.every(issue => issue.rule === 'CORE_HOST' && issue.line === 3));
});

test('属性名允许，计算属性中的真实全局引用仍拦截；web 可使用 DOM', () => {
  assert.ok(rules(fixture({ [CORE]: 'record[document];' })).includes('CORE_HOST'));
  assert.deepEqual(checkSources(fixture({ [WEB]: 'window.document.title; localStorage.getItem("x");' })).issues, []);
});

for (const request of ['fs', 'node:fs', 'http', 'third-party', '/absolute/model.js', '.\\model.js']) {
  test('浏览器模块拒绝内置、外部和非打包器路径：' + request, () => {
    for (const file of [CORE, WEB]) {
      assert.ok(rules(fixture({ [file]: 'require(' + JSON.stringify(request) + ');' })).includes('DEPENDENCY'));
    }
  });
}

test('core 反向依赖 web、依赖开发工具，以及 web 越出运行时层均失败', () => {
  assert.ok(rules(fixture({ [CORE]: "require('../web/boot.js');" })).includes('LAYER'));
  assert.ok(rules(fixture({ [CORE]: "require('../../lib/chrome.js');" })).includes('LAYER'));
  assert.ok(rules(fixture({ [WEB]: "require('../build.js');" })).includes('LAYER'));
});

test('依赖缺失或大小写错误必须失败', () => {
  assert.ok(rules(fixture({ [WEB]: "require('../core/missing.js');" })).includes('MISSING'));
  assert.ok(rules(fixture({ [WEB]: "require('../core/Model.js');" })).includes('MISSING'));
});

for (const source of [
  'require(variable);', 'require("./" + variable);', 'var loader = require;',
  'require.call(null, "./model");', 'require = loader;',
  'function run(require) { require("fs"); }', 'var require = loader;',
  'module.require("fs");', 'module["require"]("fs");'
]) {
  test('阻止绕过静态依赖检查的加载方式：' + source, () => {
    assert.ok(rules(fixture({ [CORE]: source })).includes('REQUIRE'));
  });
}

test('多结点循环输出完整闭环，包含未从 boot 引用的模块', () => {
  const sources = fixture({
    'src/core/a.js': "require('./b.js');",
    'src/core/b.js': "require('./c.js');",
    'src/core/c.js': "require('./a.js');"
  });
  const result = checkSources(sources);
  const cycles = result.issues.filter(issue => issue.rule === 'CYCLE');
  assert.equal(cycles.length, 1);
  assert.match(cycles[0].message, /a\.js → src\/core\/b\.js → src\/core\/c\.js → src\/core\/a\.js/);
  assert.equal(cycles[0].file, 'src/core/c.js');
  assert.equal(cycles[0].line, 1);
});

test('自依赖失败，共享同一依赖的无环图通过', () => {
  assert.ok(rules(fixture({ [CORE]: "require('./model.js');" })).includes('CYCLE'));
  assert.deepEqual(checkSources(fixture({
    'src/web/a.js': "require('../core/model');",
    [WEB]: "require('./a'); require('../core/model');"
  })).issues, []);
});

test('空输入、非打包目录和打包器不支持的嵌套源码均拒绝', () => {
  assert.ok(rules({}).includes('SOURCE'));
  assert.ok(rules({ 'tools/dev.js': 'const value = 1;' }).includes('SOURCE'));
  assert.ok(rules(fixture({ 'src/core/nested/extra.js': 'var value = 1;' })).includes('BUNDLE'));
});

test('语法错误位置映射回原文件，不受严格模式前置行影响', () => {
  const result = checkSources(fixture({ [CORE]: '// first line\n  const value = 1;' }));
  assert.equal(result.issues[0].file, CORE);
  assert.equal(result.issues[0].line, 2);
  assert.equal(result.issues[0].column, 3);
});

test('CLI 从任意工作目录检查；成功为 0，违规、空项目、缺目录和参数错误均非零', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'or-maintenance-'));
  t.after(() => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('or-maintenance-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  function run(args = ['--root', root]) {
    return spawnSync(process.execPath, [CLI, ...args], { cwd: os.tmpdir(), encoding: 'utf8' });
  }
  assert.notEqual(run().status, 0);
  fs.mkdirSync(path.join(root, 'src/core'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/web'), { recursive: true });
  assert.notEqual(run().status, 0);
  for (const [file, source] of Object.entries(fixture())) fs.writeFileSync(path.join(root, file), source);
  fs.mkdirSync(path.join(root, 'tools'));
  fs.writeFileSync(path.join(root, 'tools/dev.js'), 'const modern = () => {};');
  assert.equal(run().status, 0);
  fs.writeFileSync(path.join(root, CORE), '\nwindow.document;');
  const failed = run();
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /src\/core\/model\.js:2:1 \[CORE_HOST\]/);
  fs.writeFileSync(path.join(root, CORE), 'module.exports = {};');
  fs.mkdirSync(path.join(root, 'src/core/nested'));
  fs.writeFileSync(path.join(root, 'src/core/nested/extra.js'), 'var value = 1;');
  assert.notEqual(run().status, 0);
  assert.notEqual(run(['--root']).status, 0);
  assert.notEqual(run(['--unknown']).status, 0);
});
