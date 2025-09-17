(async function () {
  const v = document.getElementById('appVersion');
  const d = document.getElementById('buildDate');
  const p = document.getElementById('pwaStatus');

  try {
    const res = await fetch('./version.json', { cache: 'no-cache' });
    if (res.ok) {
      const meta = await res.json();
      if (v && meta.version) v.textContent = `v${meta.version}`;
      if (d && meta.build)   d.textContent = `Actualizado ${meta.build}`;
    }
  } catch {}

  if (p) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(() => { p.textContent = navigator.serviceWorker.controller ? 'Funciona offline' : 'Modo online'; })
        .catch(() => { p.textContent = 'Modo online'; });
    } else {
      p.textContent = 'Modo online';
    }
  }
})();
