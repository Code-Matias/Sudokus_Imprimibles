// js/sw-register.js
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./service-worker.js')
      .catch(err => console.warn('[SW] registro falló:', err));
  });
})();