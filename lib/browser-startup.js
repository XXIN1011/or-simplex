'use strict';

const STARTUP_TIMEOUT_MS = 60000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/* 冷启动可能超过 15 秒；按总时限等待，并给每次 HTTP 探测单独设限。
   浏览器退出时立即报错，不能把启动失败拖成一次完整超时。 */
async function waitForDebugger(port, child, opts = {}) {
  const timeoutMs = opts.timeoutMs === undefined ? STARTUP_TIMEOUT_MS : opts.timeoutMs;
  const pollMs = opts.pollMs === undefined ? 250 : opts.pollMs;
  const started = Date.now();
  const deadline = started + timeoutMs;
  let lastError = '尚未收到调试端点响应';
  let spawnError = null;
  const onError = error => { spawnError = error; };
  child.on('error', onError);
  try {
    while (Date.now() < deadline) {
      if (spawnError) throw new Error('Chrome 启动失败：' + spawnError.message);
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error('Chrome 在调试端口就绪前退出（exit=' + child.exitCode
          + '，signal=' + child.signalCode + '）');
      }
      try {
        const response = await fetch('http://127.0.0.1:' + port + '/json/version', {
          signal: AbortSignal.timeout(Math.max(1, Math.min(1000, deadline - Date.now())))
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const version = await response.json();
        if (typeof version.webSocketDebuggerUrl !== 'string' || !version.webSocketDebuggerUrl) {
          throw new Error('调试端点未返回 WebSocket 地址');
        }
        return version;
      } catch (error) { lastError = error.message; }
      const remaining = deadline - Date.now();
      if (remaining > 0) await sleep(Math.min(pollMs, remaining));
    }
    throw new Error('Chrome 调试端口未就绪（' + port + '，等待 ' + (Date.now() - started)
      + ' ms）：' + lastError);
  } finally { child.removeListener('error', onError); }
}

module.exports = { waitForDebugger, STARTUP_TIMEOUT_MS };
