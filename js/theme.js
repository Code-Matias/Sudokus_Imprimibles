// js/theme.js
(function () {
  function qs(id) { return document.getElementById(id); }

  // Intentamos encontrar los <link> por id, y si no, por href
  var light = qs('theme-light') || document.querySelector('link[href*="flatly"]');
  var dark  = qs('theme-dark')  || document.querySelector('link[href*="darkly"]');
  var btn   = qs('themeToggle');

  if (!light || !dark || !btn) return; // nada que hacer

  // Tema preferido: localStorage o prefers-color-scheme
  var stored = null;
  try { stored = localStorage.getItem('theme'); } catch (_) {}

  var preferDark = false;
  try { preferDark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches; } catch (_) {}

  apply(stored || (preferDark ? 'dark' : 'light'));

  btn.addEventListener('click', function () {
    apply(dark.disabled ? 'dark' : 'light');
  });

  function apply(mode) {
    var isDark = mode === 'dark';
    dark.disabled  = !isDark;
    light.disabled =  isDark;
    try { localStorage.setItem('theme', mode); } catch (_) {}
    btn.setAttribute('aria-pressed', String(isDark));
  }
})();
