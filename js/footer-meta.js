// js/footer-meta.js
// Completa versión/fecha desde /version.json y muestra estado PWA.

(async function () {
  const v = document.getElementById('appVersion');
  const d = document.getElementById('buildDate');
  const p = document.getElementById('pwaStatus');

  // 1) Version y fecha desde version.json
  try {
    // no-cache para evitar quedar pegado por el navegador o el SW
    const res = await fetch('./version.json', { cache: 'no-cache' });
    if (res.ok) {
      const meta = await res.json();
      if (v && meta.version) v.textContent = `v${meta.version}`;
      if (d && meta.build)   d.textContent = `Actualizado ${meta.build}`;
    } else {
      // si no se pudo leer el json, no rompe la vista
      if (v) v.textContent = '';
      if (d) d.textContent = '';
    }
  } catch {
    // fallbacks silenciosos
  }

  // 2) Estado PWA (offline si hay SW controlando esta página)
  if (p) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(() => {
          p.textContent = navigator.serviceWorker.controller ? 'Funciona offline' : 'Modo online';
        })
        .catch(() => { p.textContent = 'Modo online'; });
    } else {
      p.textContent = 'Modo online';
    }
  }
})();
