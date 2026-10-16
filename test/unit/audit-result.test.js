'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { auditPassed } = require('../ui/audit-result.js');

test('无障碍门禁包含对比度、标注、触摸目标、字号及溢出', () => {
  const clean = () => ({smallTargets:[],tinyFonts:[],lowContrast:[],forms:{unlabeled:0},hOverflow:false});
  assert.equal(auditPassed(clean()), true);
  for (const field of ['smallTargets','tinyFonts','lowContrast']) {
    const data = clean(); data[field].push({});
    assert.equal(auditPassed(data), false, field);
  }
  const unlabeled = clean(); unlabeled.forms.unlabeled = 1;
  assert.equal(auditPassed(unlabeled), false);
  const overflow = clean(); overflow.hOverflow = true;
  assert.equal(auditPassed(overflow), false);
});
