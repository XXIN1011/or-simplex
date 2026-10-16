'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
test('安静模式失败或未收尾不能以零退出码通过', () => {
  const quiet = path.resolve(__dirname,'../../lib/quiet.js');
  for(const ending of ['',"q.end(false,'故意失败')"]){
    const run = spawnSync(process.execPath,['-e',`process.argv.push('--quiet');const q=require(${JSON.stringify(quiet)}).begin('exit-test');${ending}`],{encoding:'utf8'});
    assert.equal(run.status,1);
    assert.match(run.stdout,/FAIL/);
  }
});
