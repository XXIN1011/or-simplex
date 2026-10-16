(function () {
  document.querySelector('#tpPanel [data-guide="sample"]').click();
  var supply = document.querySelector('#tpPanel [data-key="supply"][data-i="0"]');
  supply.value = '30'; supply.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('tpSolveBtn').click();
})();
