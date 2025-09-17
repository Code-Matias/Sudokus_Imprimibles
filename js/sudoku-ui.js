// js/sudoku-ui.js
// UI de la app: genera sudokus, muestra resultados en pantalla y arma secciones de impresión.
// - Botón "Generar" con spinner y estados claros.
// - Validación de "Cantidad" (1–100) con feedback amable.
// - Impresión: tableros en SVG (líneas perfectas) dentro de .print-only.
// - Sin dependencias externas. Worker clásico: js/generator-worker.js

(function () {
  const WORKER_VER = 'v10'; // versiona cuando cambies el worker
  let WORKER_URL;

  function safeWorkerURL() {
    try {
      return new URL('js/generator-worker.js?' + WORKER_VER, window.location.href);
    } catch {
      return 'js/generator-worker.js?' + WORKER_VER;
    }
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  // ------------ URL compartible (difficulty, count, seed) ------------
  function readParams() {
    const q = new URLSearchParams(location.search);
    const diff  = q.get('difficulty');
    const count = q.get('count');
    const seed  = q.get('seed');

    const d = document.getElementById('difficulty');
    const c = document.getElementById('count');
    const s = document.getElementById('seed');

    if (diff && d)  d.value = diff;
    if (count && c) c.value = count;
    if (seed && s)  s.value = seed;
  }

  function writeParams() {
    const q = new URLSearchParams(location.search);
    const d = document.getElementById('difficulty');
    const c = document.getElementById('count');
    const s = document.getElementById('seed');

    if (d) q.set('difficulty', d.value);
    if (c) q.set('count', c.value);
    if (s) {
      const v = (s.value || '').trim();
      if (v) q.set('seed', v); else q.delete('seed');
    }
    try { history.replaceState(null, '', `${location.pathname}?${q.toString()}`); } catch {}
  }
  // -------------------------------------------------------------------

  ready(() => {
    WORKER_URL = safeWorkerURL();

    // ---------- Captura de elementos ----------
    const els = {
      output: document.getElementById('output'),
      status: document.getElementById('status'),
      difficulty: document.getElementById('difficulty'),
      count: document.getElementById('count'),
      seed: document.getElementById('seed'),
      generateBtn: document.getElementById('generateBtn'),
      printBtn: document.getElementById('printBtn'),
      toggleSolutionsBtn: document.getElementById('toggleSolutionsBtn'),
      main: document.querySelector('main') || document.body,

      // Opciones avanzadas
      advDetails: document.getElementById('advOpts'),
      copyBtn: document.getElementById('copyLink'),
      copyMsg: document.getElementById('copyMsg'),
    };

    // Si no existe #output en el HTML, lo creo para evitar errores
    if (!els.output) {
      els.output = document.createElement('div');
      els.output.id = 'output';
      (els.main || document.body).appendChild(els.output);
    }

    // Inicializar valores desde la URL y persistir cambios en la URL
    readParams();
    ['difficulty','count','seed'].forEach(id => {
      const el = document.getElementById(id);
      el && el.addEventListener('change', writeParams);
    });

    // Asegurar type="button"
    ['generateBtn', 'printBtn', 'toggleSolutionsBtn'].forEach(k => {
      if (els[k]) els[k].setAttribute('type', 'button');
    });

    // ---------- Estado ----------
    let showSolutions = false;
    let running = false;
    let worker = null;
    let gridEl = null;
    const results = []; // {puzzle, solution, index}

    // ---------- Secciones de impresión (ocultas en pantalla por CSS) ----------
    const printProblemsSection = document.createElement('section');
    printProblemsSection.className = 'print-only print-section print-problems';
    const problemsHeading = document.createElement('h2');
    problemsHeading.className = 'print-title';
    problemsHeading.textContent = 'Sudokus (para resolver)';
    const problemsGrid = document.createElement('div');
    problemsGrid.className = 'print-grid';
    printProblemsSection.appendChild(problemsHeading);
    printProblemsSection.appendChild(problemsGrid);

    const printSolutionsSection = document.createElement('section');
    printSolutionsSection.className = 'print-only print-section print-solutions';
    const solutionsHeading = document.createElement('h2');
    solutionsHeading.className = 'print-title';
    solutionsHeading.textContent = 'Soluciones';
    const solutionsGrid = document.createElement('div');
    solutionsGrid.className = 'print-grid';
    printSolutionsSection.appendChild(solutionsHeading);
    printSolutionsSection.appendChild(solutionsGrid);

    (els.main || document.body).appendChild(printProblemsSection);
    (els.main || document.body).appendChild(printSolutionsSection);

    // ---------- Helpers UI ----------
    function setStatus(t) {
      if (els.status) els.status.textContent = t || '';
    }

    // Validación amable de Cantidad (1–100)
    function parseCount() {
      const n = +(els.count && els.count.value);
      if (!Number.isFinite(n) || n < 1 || n > 100) {
        setStatus('Elegí una cantidad entre 1 y 100.');
        return 0;
      }
      return Math.min(n, 100);
    }

    // Botón Generar: asegurar spans (label + spinner) para togglear estado
    function initGenerateButtonUI() {
      if (!els.generateBtn) return;
      if (!els.generateBtn.querySelector('.label')) {
        const lab = document.createElement('span');
        lab.className = 'label';
        lab.textContent = 'Generar';
        els.generateBtn.appendChild(lab);
      }
      if (!els.generateBtn.querySelector('.spinner-border')) {
        const sp = document.createElement('span');
        sp.className = 'spinner-border spinner-border-sm d-none';
        sp.setAttribute('role', 'status');
        sp.setAttribute('aria-hidden', 'true');
        els.generateBtn.appendChild(sp);
      }
    }

    function setGenerating(isOn, textWhile = 'Generando…') {
      if (!els.generateBtn) return;
      const label = els.generateBtn.querySelector('.label');
      const spin = els.generateBtn.querySelector('.spinner-border');
      els.generateBtn.disabled = !!isOn;
      if (spin) spin.classList.toggle('d-none', !isOn);
      if (label) label.textContent = isOn ? textWhile : 'Generar';
    }

    function setPrintEnabled(canPrint) {
      if (els.printBtn) els.printBtn.disabled = !canPrint;
    }

    initGenerateButtonUI();
    setPrintEnabled(false);

    // ---------- Render de tableros ----------
    // Pantalla: con <div> y bordes simples
    function renderBoard(grid, { withBlanks = true } = {}) {
      const board = document.createElement('div');
      board.className = 'board';
      for (let i = 0; i < grid.length; i++) {
        const v = grid[i];
        const cell = document.createElement('div');
        cell.className = 'cell' + (v === 0 ? ' blank' : '');
        cell.textContent = v === 0 ? (withBlanks ? '' : '·') : String(v);
        board.appendChild(cell);
      }
      return board;
    }

    // Impresión: SVG (líneas perfectas)
    function renderBoardSVG(grid) {
      const size = 270; // unidades internas del SVG (se escalan al 100%)
      const step = size / 9;
      const NS = 'http://www.w3.org/2000/svg';

      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.setAttribute('aria-hidden', 'true');

      const THIN = 0.8;
      const THICK = 1.6;
      const FRAME = 2.2;

      // Fondo
      const bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
      bg.setAttribute('width', String(size));
      bg.setAttribute('height', String(size));
      bg.setAttribute('fill', '#fff');
      svg.appendChild(bg);

      // Líneas internas
      for (let i = 1; i <= 8; i++) {
        const x = i * step, y = i * step;
        const sw = (i % 3 === 0) ? THICK : THIN;

        const v = document.createElementNS(NS, 'line');
        v.setAttribute('x1', x); v.setAttribute('y1', 0);
        v.setAttribute('x2', x); v.setAttribute('y2', size);
        v.setAttribute('stroke', '#888');
        v.setAttribute('stroke-width', sw);
        v.setAttribute('shape-rendering', 'crispEdges');
        v.setAttribute('stroke-linecap', 'square');
        svg.appendChild(v);

        const h = document.createElementNS(NS, 'line');
        h.setAttribute('x1', 0); h.setAttribute('y1', y);
        h.setAttribute('x2', size); h.setAttribute('y2', y);
        h.setAttribute('stroke', '#888');
        h.setAttribute('stroke-width', sw);
        h.setAttribute('shape-rendering', 'crispEdges');
        h.setAttribute('stroke-linecap', 'square');
        svg.appendChild(h);
      }

      // Marco exterior
      const off = FRAME / 2;
      const frame = document.createElementNS(NS, 'rect');
      frame.setAttribute('x', String(off));
      frame.setAttribute('y', String(off));
      frame.setAttribute('width', String(size - FRAME));
      frame.setAttribute('height', String(size - FRAME));
      frame.setAttribute('fill', 'none');
      frame.setAttribute('stroke', '#333');
      frame.setAttribute('stroke-width', FRAME);
      frame.setAttribute('shape-rendering', 'crispEdges');
      frame.setAttribute('stroke-linecap', 'square');
      svg.appendChild(frame);

      // Números (80% de la celda, centrados)
      const fontSize = step * 0.80;
      for (let i = 0; i < 81; i++) {
        const val = grid[i];
        if (!val) continue;
        const r = (i / 9) | 0;
        const c = i % 9;
        const cx = c * step + step / 2;
        const cy = r * step + step / 2;

        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', cx);
        t.setAttribute('y', cy);
        t.setAttribute('font-family', 'Georgia, "Times New Roman", Times, serif');
        t.setAttribute('font-size', String(fontSize));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'middle');
        t.textContent = String(val);
        svg.appendChild(t);
      }

      const wrap = document.createElement('div');
      wrap.className = 'board board-svg';
      wrap.appendChild(svg);
      return wrap;
    }

    // Tarjeta de pantalla (con solución opcional)
    function createScreenCard(item, idx) {
      const card = document.createElement('div');
      card.className = 'card sudoku-card';

      const header = document.createElement('div');
      header.className = 'card-header d-flex justify-content-between align-items-center';
      const title = document.createElement('span');
      title.textContent = 'Sudoku';
      const meta = document.createElement('small');
      const holes = item.puzzle.reduce((s, v) => s + (v === 0), 0);
      meta.textContent = `#${String(idx + 1).padStart(2, '0')} • Huecos: ${holes}`;
      header.appendChild(title);
      header.appendChild(meta);
      card.appendChild(header);

      const body = document.createElement('div');
      body.className = 'card-body';
      body.appendChild(renderBoard(item.puzzle, { withBlanks: true }));

      const lbl = document.createElement('div');
      lbl.className = 'solution-label';
      lbl.textContent = 'Solución';
      body.appendChild(lbl);

      const solWrap = document.createElement('div');
      solWrap.className = 'solution' + (showSolutions ? '' : ' hidden');
      solWrap.appendChild(renderBoard(item.solution, { withBlanks: false }));
      body.appendChild(solWrap);

      card.appendChild(body);
      return card;
    }

    // Tarjeta de impresión (SVG)
    function createPrintCard(title, grid) {
      const card = document.createElement('div');
      card.className = 'print-card';

      const h = document.createElement('div');
      h.className = 'print-card-title';
      h.textContent = title;
      card.appendChild(h);

      card.appendChild(renderBoardSVG(grid));
      return card;
    }

    function resetResults() {
      results.length = 0;
      if (gridEl) gridEl.innerHTML = '';
      problemsGrid.innerHTML = '';
      solutionsGrid.innerHTML = '';
      setPrintEnabled(false);
    }

    // ---------- UI States ----------
    function startUI(total) {
      running = true;
      resetResults();

      // botón Generar en modo carga + otros estados
      setGenerating(true, 'Generando…');
      if (els.generateBtn) els.generateBtn.dataset.mode = 'cancel';
      setPrintEnabled(false);
      if (els.toggleSolutionsBtn) els.toggleSolutionsBtn.disabled = true;

      // preparar grilla de pantalla y estado
      els.output.innerHTML = '';
      gridEl = document.createElement('div');
      gridEl.className = 'puzzle-grid';
      els.output.appendChild(gridEl);
      setStatus(`Generando 0/${total}…`);
    }

    function stopUI() {
      running = false;

      // volver botón Generar a normal (asegurando spans)
      setGenerating(false);
      if (els.generateBtn) {
        if (!els.generateBtn.querySelector('.label')) {
          const lab = document.createElement('span'); lab.className = 'label'; lab.textContent = 'Generar';
          els.generateBtn.appendChild(lab);
        }
        if (!els.generateBtn.querySelector('.spinner-border')) {
          const sp = document.createElement('span'); sp.className = 'spinner-border spinner-border-sm d-none';
          sp.setAttribute('role', 'status'); sp.setAttribute('aria-hidden', 'true');
          els.generateBtn.appendChild(sp);
        }
        els.generateBtn.dataset.mode = 'generate';
      }

      // habilitar impresión si hay resultados
      setPrintEnabled(results.length > 0);
      if (els.toggleSolutionsBtn) els.toggleSolutionsBtn.disabled = false;
    }

    // ---------- Worker ----------
    function createWorker() {
      if (worker) {
        try { worker.terminate(); } catch {}
        worker = null;
      }
      try {
        worker = new Worker(WORKER_URL, { type: 'classic' });
      } catch (e) {
        console.error('[Worker] No pude crear el worker:', e);
        setStatus('Error creando worker (ver consola).');
        stopUI();
        return null;
      }

      worker.onmessage = (e) => {
        const m = e.data || {};
        if (m.type === 'progress') {
          const item = { puzzle: m.puzzle, solution: m.solution, index: m.index };
          results.push(item);

          // pantalla
          gridEl.appendChild(createScreenCard(item, m.index));

          // impresión (problemas)
          const holes = item.puzzle.reduce((s, v) => s + (v === 0), 0);
          const title = `#${String(m.index + 1).padStart(2, '0')} • Huecos: ${holes}`;
          problemsGrid.appendChild(createPrintCard(title, item.puzzle));

          // impresión (soluciones)
          const titleSol = `#${String(m.index + 1).padStart(2, '0')}`;
          solutionsGrid.appendChild(createPrintCard(titleSol, item.solution));

          // progreso y permitir imprimir
          const total = parseCount() || 0; // si usuario cambió el campo en medio, no romper
          setStatus(`Generando ${Math.min(m.index + 1, total || (m.index + 1))}/${total || '…'}…`);
          setPrintEnabled(true);
        } else if (m.type === 'done') {
          setStatus('¡Listo! Sudokus generados.');
          stopUI();
        } else if (m.type === 'cancelled') {
          setStatus(`Cancelado tras ${m.generated}.`);
          stopUI();
        } else if (m.type === 'error') {
          console.error('[Worker error msg]:', m.message, m.detail);
          setStatus('Ocurrió un error al generar. Intentá de nuevo.');
          stopUI();
        }
      };

      worker.onerror = (err) => {
        console.error('[Worker onerror]:', err);
        setStatus('Error del worker (ver consola).');
        stopUI();
      };

      return worker;
    }

    function startGeneration(ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      if (running) return;

      const total = parseCount();
      if (!total) { return; } // no arranca si la cantidad es inválida

      // Persistir en URL (NO autogeneramos seed)
      writeParams();

      startUI(total);

      const w = createWorker();
      if (!w) return;

      w.postMessage({
        type: 'start',
        difficulty: (els.difficulty && els.difficulty.value) || 'medium',
        count: total,
        seed: (els.seed && els.seed.value || '').trim(), // puede ir vacío
      });
    }

    // ---------- Eventos ----------
    if (els.generateBtn) els.generateBtn.dataset.mode = 'generate';
    if (els.generateBtn) els.generateBtn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      // Alterna entre generar y cancelar
      if (els.generateBtn.dataset.mode === 'cancel' && worker) {
        try { worker.postMessage({ type: 'cancel' }); } catch {}
        return;
      }
      startGeneration(ev);
    });

    if (els.printBtn) els.printBtn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      window.print();
    });

    if (els.toggleSolutionsBtn) els.toggleSolutionsBtn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      showSolutions = !showSolutions;
      els.toggleSolutionsBtn.textContent = showSolutions ? 'Ocultar soluciones' : 'Mostrar soluciones';
      document.querySelectorAll('.solution').forEach(el => el.classList.toggle('hidden', !showSolutions));
    });

    // Atajos de teclado
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'g' || ev.key === 'G') { ev.preventDefault(); els.generateBtn && els.generateBtn.click(); }
      else if (ev.key === 'p' || ev.key === 'P') { ev.preventDefault(); els.printBtn && els.printBtn.click(); }
      else if (ev.key === 's' || ev.key === 'S') { ev.preventDefault(); els.toggleSolutionsBtn && els.toggleSolutionsBtn.click(); }
    });

    // -------- Opciones avanzadas: copiar enlace del set --------
    if (els.copyBtn) {
      els.copyBtn.addEventListener('click', async () => {
        writeParams(); // asegura que la URL tenga los valores actuales
        try {
          await navigator.clipboard.writeText(location.href);
          if (els.copyMsg) els.copyMsg.textContent = 'Enlace copiado.';
          setTimeout(() => { if (els.copyMsg) els.copyMsg.textContent = ''; }, 2000);
        } catch {
          if (els.copyMsg) els.copyMsg.textContent = 'No se pudo copiar, copiá manualmente.';
        }
      });
    }
    // Si ya hay seed en el campo/URL, abrir las opciones avanzadas
    if (els.advDetails && els.seed && (els.seed.value || '').trim()) {
      els.advDetails.open = true;
    }
    // ------------------------------------------------------------
  });
})();
