// js/theme.js — Toggle de tema con icono ☀️/🌙 para Bootswatch Flatly/Darkly locales
(function(){
  var KEY   = 'theme';
  var light = document.getElementById('theme-light');
  var dark  = document.getElementById('theme-dark');
  var btn   = document.getElementById('themeToggle');
  var root  = document.documentElement;

  if (!light || !dark || !btn) return;

  function apply(mode){
    var isDark = (mode === 'dark');

    // Alternar las hojas de estilo locales
    dark.disabled  = !isDark;
    light.disabled =  isDark;

    // Clase en <html> para estilos dependientes del tema
    root.classList.toggle('dark',  isDark);
    root.classList.toggle('light', !isDark);

    // Guardar preferencia del usuario
    try{ localStorage.setItem(KEY, mode); }catch(_){}

    // Icono + accesibilidad
    var icon = btn.querySelector('.icon');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    btn.setAttribute('aria-pressed', String(isDark));
    btn.setAttribute('aria-label', isDark ? 'Cambiar tema: claro' : 'Cambiar tema: oscuro');

    // Barra del navegador móvil
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = isDark ? '#0b1220' : '#ffffff';
  }

  // Tema inicial: preferencia guardada > preferencia del sistema
  var saved = null; try{ saved = localStorage.getItem(KEY); }catch(_){}
  var prefersDark = false;
  try{ prefersDark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches; }catch(_){}
  apply(saved || (prefersDark ? 'dark' : 'light'));

  // Click toggle
  btn.addEventListener('click', function(){
    var next = (dark.disabled ? 'dark' : 'light');
    apply(next);
  });

  // Acompañar cambios del sistema si el usuario NO forzó un tema
  try{
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    // addEventListener es soportado moderno; en Safari viejo existe mq.addListener
    (mq.addEventListener || mq.addListener).call(mq, 'change', function(e){
      var stored = null; try{ stored = localStorage.getItem(KEY); }catch(_){}
      if (!stored) apply(e.matches ? 'dark' : 'light');
    });
  }catch(_){}
})();
