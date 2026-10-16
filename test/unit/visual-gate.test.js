'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
test('视觉验证的构建或截图失败不能产生通过结果', {skip:!fs.existsSync(bash)}, () => {
  for(const fn of ['node(){ return 1; }','node(){ if [ "$1" = src/build.js ]; then return 0; else return 1; fi; }']) {
    const r=spawnSync(bash,['-c',fn+'; export -f node; bash tools/verify-visual.sh'],{encoding:'utf8'});
    assert.equal(r.status,1,r.stdout+r.stderr);
    assert.doesNotMatch(r.stdout,/全部达标/);
  }
  const empty=spawnSync(bash,['-c','node(){ return 0; }; export -f node; VERIFY_CASE=missing bash tools/verify-visual.sh'],{encoding:'utf8'});
  assert.equal(empty.status,1);
  assert.match(empty.stderr,/没有匹配/);
});
