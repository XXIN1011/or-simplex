/* 开发期保护：按单文件打包边界检查严格 ES5、静态依赖与循环依赖。 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('./vendor/acorn/acorn.js');

const LAYERS = ['src/core/', 'src/web/'];
const HOST_GLOBALS = new Set([
  'window', 'document', 'navigator', 'location', 'history', 'screen',
  'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest', 'WebSocket',
  'Worker', 'self', 'globalThis', 'global', 'process', 'Buffer', 'console',
  'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance',
  'alert', 'confirm', 'prompt'
]);

function scope(parent, functionScope) {
  const value = { parent, bindings: new Map() };
  value.functionScope = functionScope || value;
  return value;
}

/* 先收集引用及声明，再解析作用域，正确处理 var/函数提升、参数和 catch。 */
function references(ast) {
  const root = scope(null);
  ['require', 'module', 'exports'].forEach(name => root.bindings.set(name, 'commonjs'));
  const refs = [], requireBindings = [];
  function declare(target, id) {
    if (!id) return;
    target.bindings.set(id.name, 'local');
    if (id.name === 'require') requireBindings.push(id);
  }
  function walk(node, current, parent, key) {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
      if (node.type === 'FunctionDeclaration') declare(current.functionScope, node.id);
      const inner = scope(current);
      if (node.type === 'FunctionExpression') declare(inner, node.id);
      node.params.forEach(id => declare(inner, id));
      walk(node.body, inner, node, 'body');
      return;
    }
    if (node.type === 'VariableDeclarator') {
      declare(current.functionScope, node.id);
      walk(node.init, current, node, 'init');
      return;
    }
    if (node.type === 'CatchClause') {
      const inner = scope(current, current.functionScope);
      declare(inner, node.param);
      walk(node.body, inner, node, 'body');
      return;
    }
    if (node.type === 'Identifier') {
      const property = parent && ((parent.type === 'MemberExpression' && key === 'property' && !parent.computed)
        || (parent.type === 'Property' && key === 'key' && !parent.computed));
      const label = parent && key === 'label';
      if (!property && !label) refs.push({ node, scope: current, parent, key });
      return;
    }
    for (const name of Object.keys(node)) {
      if (name === 'loc') continue;
      const value = node[name];
      if (Array.isArray(value)) value.forEach(child => walk(child, current, node, name));
      else if (value && typeof value.type === 'string') walk(value, current, node, name);
    }
  }
  walk(ast, root, null, '');
  return { refs, requireBindings };
}

function binding(ref) {
  for (let current = ref.scope; current; current = current.parent) {
    if (current.bindings.has(ref.node.name)) return current.bindings.get(ref.node.name);
  }
  return null;
}

function checkSources(sources) {
  const files = Object.keys(sources).sort();
  const graph = new Map(files.map(file => [file, new Map()]));
  const issues = [];
  function add(file, node, rule, message) {
    const at = node && node.loc ? node.loc.start : { line: 2, column: 0 };
    issues.push({ file, line: Math.max(1, at.line - 1), column: at.column + 1, rule, message });
  }
  if (!files.length) add('src/', null, 'SOURCE', '没有待检查的浏览器源码，拒绝空检查通过');
  for (const file of files) {
    if (!LAYERS.some(layer => file.startsWith(layer))) {
      add(file, null, 'SOURCE', '只接受 src/core/ 与 src/web/ 中的源码');
      continue;
    }
    if (!LAYERS.some(layer => path.posix.dirname(file) + '/' === layer)) {
      add(file, null, 'BUNDLE', '当前打包器只收录 core/web 的一级 .js 文件，不支持嵌套目录');
    }
    let ast;
    try {
      // 构建产物统一处于严格模式；前置一行指令，报错位置再映射回原文件。
      ast = acorn.parse("'use strict';\n" + sources[file], {
        ecmaVersion: 5, sourceType: 'script', locations: true, allowReturnOutsideFunction: true
      });
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      add(file, { loc: { start: error.loc } }, 'ES5', error.message.replace(/ \(\d+:\d+\)$/, ''));
      continue;
    }
    const analysis = references(ast);
    analysis.requireBindings.forEach(node => add(file, node, 'REQUIRE', '不能声明或遮蔽打包器提供的 require'));
    for (const ref of analysis.refs) {
      const name = ref.node.name, found = binding(ref);
      if (file.startsWith('src/core/') && !found && HOST_GLOBALS.has(name)) {
        add(file, ref.node, 'CORE_HOST', '算法层不能直接使用宿主 API：' + name);
      }
      if (name === 'module' && found === 'commonjs' && ref.parent.type === 'MemberExpression') {
        const member = ref.parent;
        const property = member.computed ? member.property.value : member.property.name;
        if (property === 'require') add(file, member, 'REQUIRE', '打包器不支持 module.require，请使用静态 require');
      }
      if (name !== 'require' || found !== 'commonjs') continue;
      const call = ref.parent;
      if (!call || call.type !== 'CallExpression' || call.callee !== ref.node
        || call.arguments.length !== 1 || call.arguments[0].type !== 'Literal'
        || typeof call.arguments[0].value !== 'string') {
        add(file, ref.node, 'REQUIRE', 'require 必须以单个字符串字面量直接调用，不支持动态路径、别名或重赋值');
        continue;
      }
      const request = call.arguments[0].value;
      if ((!request.startsWith('./') && !request.startsWith('../')) || request.includes('\\')) {
        add(file, call, 'DEPENDENCY', '浏览器源码只允许相对路径依赖，不支持 Node 内置模块或外部包：' + request);
        continue;
      }
      let target = path.posix.normalize(path.posix.join(path.posix.dirname(file), request));
      if (!target.endsWith('.js')) target += '.js';
      const allowed = file.startsWith('src/core/') ? ['src/core/'] : LAYERS;
      if (!allowed.some(layer => target.startsWith(layer))) {
        add(file, call, 'LAYER', '依赖越界：' + file + ' → ' + target);
      } else if (!graph.has(target)) {
        add(file, call, 'MISSING', '依赖文件未被打包或不存在（路径区分大小写）：' + request + ' → ' + target);
      } else if (!graph.get(file).has(target)) {
        graph.get(file).set(target, call);
      }
    }
  }
  const visited = new Set(), active = new Set(), stack = [];
  function visit(file) {
    visited.add(file); active.add(file); stack.push(file);
    for (const [target, node] of graph.get(file)) {
      if (active.has(target)) {
        const cycle = stack.slice(stack.indexOf(target)).concat(target);
        add(file, node, 'CYCLE', '循环依赖：' + cycle.join(' → '));
      } else if (!visited.has(target)) visit(target);
    }
    stack.pop(); active.delete(file);
  }
  files.forEach(file => { if (!visited.has(file)) visit(file); });
  return { files: files.length, dependencies: [...graph.values()].reduce((sum, edges) => sum + edges.size, 0), issues };
}

function checkProject(root) {
  const sources = Object.create(null);
  function read(directory, relative) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name), file = relative + entry.name;
      if (entry.isDirectory()) read(absolute, file + '/');
      else if (entry.name.endsWith('.js')) sources[file] = fs.readFileSync(absolute, 'utf8');
    }
  }
  LAYERS.forEach(layer => read(path.join(root, layer), layer));
  return checkSources(sources);
}

function main(args) {
  if (args.length && (args.length !== 2 || args[0] !== '--root')) {
    console.error('用法：node tools/check-maintenance.js [--root <项目目录>]');
    return 1;
  }
  try {
    const result = checkProject(args.length ? path.resolve(args[1]) : path.resolve(__dirname, '..'));
    for (const issue of result.issues) {
      console.error(`${issue.file}:${issue.line}:${issue.column} [${issue.rule}] ${issue.message}`);
    }
    if (result.issues.length) {
      console.error(`维护保护检查失败：${result.issues.length} 项问题`);
      return 1;
    }
    console.log(`维护保护检查通过：${result.files} 个模块、${result.dependencies} 条依赖；严格 ES5 / 分层与静态依赖 / 无循环`);
    return 0;
  } catch (error) {
    console.error('维护保护检查无法完成：' + error.message);
    return 1;
  }
}

module.exports = { checkSources, checkProject, main };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
