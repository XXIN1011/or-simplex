'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { waitForDebugger } = require('../../lib/browser-startup.js');

function child() {
  return Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
}
async function endpoint(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return server.address().port;
}

test('浏览器尚未就绪时继续探测，直到获得可用的调试地址', async t => {
  let attempts = 0;
  const port = await endpoint(t, (req, res) => {
    if (++attempts < 3) { res.writeHead(503); res.end('starting'); return; }
    res.end(JSON.stringify({ webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser/test' }));
  });
  const process = child();
  const version = await waitForDebugger(port, process, { timeoutMs: 2000, pollMs: 5 });
  assert.equal(attempts, 3);
  assert.match(version.webSocketDebuggerUrl, /devtools\/browser/);
  assert.equal(process.listenerCount('error'), 0);
});

test('浏览器提前退出时立即失败并报告退出码', async () => {
  const process = child();
  process.exitCode = 23;
  await assert.rejects(waitForDebugger(1, process), /exit=23/);
});

test('调试端点无响应时按总时限失败，不会一直等 fetch', async t => {
  const port = await endpoint(t, () => {});
  const started = Date.now();
  await assert.rejects(waitForDebugger(port, child(), { timeoutMs: 100, pollMs: 5 }), /调试端口未就绪/);
  assert.ok(Date.now() - started < 2000);
});

test('端点返回不完整 JSON 时不能误报浏览器就绪', async t => {
  const port = await endpoint(t, (req, res) => res.end('{}'));
  await assert.rejects(waitForDebugger(port, child(), { timeoutMs: 100, pollMs: 5 }), /未返回 WebSocket 地址/);
});
