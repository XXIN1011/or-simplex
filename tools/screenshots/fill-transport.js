(function () {
  document.querySelector('#tpPanel [data-guide="sample"]').click();
  var supply = document.querySelector('#tpPanel [data-key="supply"][data-i="0"]');
  supply.value = '30'; supply.dispatchEvent(new Event('input', { bubbles: true }));
  var route = document.querySelector('#tpPanel [data-key="cells"][data-i="0"][data-j="0"]');
  route.value = 'M'; route.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('tpSolveBtn').click();
})();
