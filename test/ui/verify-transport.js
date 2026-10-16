'use strict';
const chrome = require('../../lib/chrome');
(async () => {
  const target = chrome.resolveTarget(process.argv[2] || 'index.html');
  const session = await chrome.launch({url:target.url+'#/transport',captureErrors:true});
  let pass = 0, fail = 0;
  try {
    await require('./transport-cases')(session,(ok,label)=>{ok ? pass++ : fail++; console.log((ok?'PASS ':'FAIL ')+label);},target.url);
    console.log(`运输界面：${pass} 通过 / ${fail} 失败`);
    process.exitCode = fail ? 1 : 0;
  } finally { await session.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
