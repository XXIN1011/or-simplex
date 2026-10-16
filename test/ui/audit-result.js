'use strict';

function auditPassed(data) {
  return data.smallTargets.length === 0 && data.tinyFonts.length === 0
    && data.lowContrast.length === 0 && data.forms.unlabeled === 0 && !data.hOverflow;
}

module.exports = { auditPassed };
