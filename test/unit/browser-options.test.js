'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launchArgs } = require('../../lib/browser-options.js');

test('Linux CI 可启动临时无头浏览器，桌面运行保持默认沙箱', () => {
  const options = runtime => launchArgs({}, 9222, '/tmp/test-profile', runtime);
  const ci = options({platform:'linux',ci:'true'});
  assert.ok(ci.includes('--no-sandbox'));
  assert.ok(ci.includes('--disable-dev-shm-usage'));
  assert.ok(ci.includes('--user-data-dir=/tmp/test-profile'));
  for (const runtime of [{platform:'linux',ci:undefined},{platform:'linux',ci:'false'},
    {platform:'win32',ci:'true'},{platform:'darwin',ci:'true'}]) {
    assert.ok(!options(runtime).includes('--no-sandbox'));
  }
});
