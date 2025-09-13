// /js/sudoku-ui.js
// UI: genera lotes, alterna soluciones, imprime. Crea secciones de impresión separadas:
//  - "Problemas" (tableros con huecos)
//  - "Soluciones" (todas al final)
// Requiere que el worker esté accesible en js/generator-worker.js

(function () {
  const WORKER_VER = 'v10'; // Asegúrate que coincida con el VER del worker
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
      toolbar: document.querySelector('.controls') || document.querySelector('form') || document.querySelector('header'),
      main: document.querySelector('main') || document.body
    };

    ['generateBtn','printBtn','toggleSolutionsBtn'].forEach(k=>{
      if (els[k]) els[k].setAttribute('type', 'button');
    });

    // ---------- Estado ----------
    let showSolutions = false;
    let running = false;
    let worker = null;
    let gridEl = null;
    const results = []; // {puzzle, solution, index}

    // ---------- Secciones “sólo impresión” (se crean aquí y se mantienen ocultas en pantalla) ----------
    const printProblemsSection = document.createElement('section');
    printProblemsSection.className = 'print-only print-section print-problems';

    const problemsHeading = document.createElement('h2');
    problemsHeading.className = 'print-title';
    problemsHeading.textContent = 'Sudokus (para resolver)';
    printProblemsSection.appendChild(problemsHeading);

    const problemsGrid = document.createElement('div');
    problemsGrid.className = 'print-grid';
    printProblemsSection.appendChild(problemsGrid);

    const printSolutionsSection = document.createElement('section');
    printSolutionsSection.className = 'print-only print-section print-solutions';
    const solutionsHeading = document.createElement('h2');
    solutionsHeading.className = 'print-title';
    solutionsHeading.textContent = 'Soluciones';
    printSolutionsSection.appendChild(solutionsHeading);
    const solutionsGrid = document.createElement('div');
    solutionsGrid.className = 'print-grid';
    printSolutionsSection.appendChild(solutionsGrid);

    // Insertar al final del <main> si existe, sino al final del body
    (els.main || document.body).appendChild(printProblemsSection);
    (els.main || document.body).appendChild(printSolutionsSection);

    // ---------- Utilidades ----------
    function setStatus(t){ if (els.status) els.status.textContent = t || ''; }
    function parseCount(){
      const n = +(els.count && els.count.value);
      return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 1;
    }

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

    function createScreenCard(item, idx) {
      const card = document.createElement('div');
      card.className = 'card';

      const holes = item.puzzle.reduce((s,v)=>s+(v===0),0);
      const h = document.createElement('h3');
      h.innerHTML = `<span>Sudoku</span><small>#${String(idx+1).padStart(2,'0')} • Huecos: ${holes}</small>`;
      card.appendChild(h);

      // tablero (con huecos)
      card.appendChild(renderBoard(item.puzzle, { withBlanks: true }));

      const lbl = document.createElement('div');
      lbl.className = 'solution-label';
      lbl.textContent = 'Solución';
      card.appendChild(lbl);

      const solWrap = document.createElement('div');
      solWrap.className = 'solution' + (showSolutions ? '' : ' hidden');
      solWrap.appendChild(renderBoard(item.solution, { withBlanks: false }));
      card.appendChild(solWrap);

      return card;
    }

    function createPrintCard(title, grid) {
      // Tarjeta minimalista para impresión (usa clases distintas)
      const card = document.createElement('div');
      card.className = 'print-card';

      const h = document.createElement('div');
      h.className = 'print-card-title';
      h.textContent = title;
      card.appendChild(h);

      card.appendChild(renderBoard(grid, { withBlanks: grid.some(v => v===0) }));
      return card;
    }

    function resetResults() {
      results.length = 0;
      problemsGrid.innerHTML = '';
      solutionsGrid.innerHTML = '';
    }

    // ---------- UI States ----------
    function startUI(total){
      running = true;
      resetResults();

      if (els.generateBtn) { els.generateBtn.textContent = 'Cancelar'; els.generateBtn.dataset.mode = 'cancel'; }
      if (els.printBtn) els.printBtn.disabled = true;
      if (els.toggleSolutionsBtn) els.toggleSolutionsBtn.disabled = true;

      els.output.innerHTML = '';
      gridEl = document.createElement('div');
      gridEl.className = 'puzzle-grid';
      els.output.appendChild(gridEl);
      setStatus(`Generando 0/${total}…`);
    }

    function stopUI(){
      running = false;
      if (els.generateBtn) { els.generateBtn.textContent = 'Generar'; els.generateBtn.dataset.mode = 'generate'; }
      if (els.printBtn) els.printBtn.disabled = false;
      if (els.toggleSolutionsBtn) els.toggleSolutionsBtn.disabled = false;
    }

    // ---------- Worker ----------
    function createWorker(){
      if (worker) { try { worker.terminate(); } catch {} worker = null; }
      try {
        worker = new Worker(WORKER_URL, { type:'classic' });
      } catch (e) {
        console.error('[Worker] No pude crear el worker:', e);
        setStatus('Error creando worker (ver consola).');
        stopUI();
        return null;
      }

      worker.onmessage = (e)=>{
        const m = e.data || {};
        if (m.type === 'progress'){
          const item = { puzzle: m.puzzle, solution: m.solution, index: m.index };
          results.push(item);

          // pantalla
          gridEl.appendChild(createScreenCard(item, m.index));

          // impresión (problemas)
          const holes = item.puzzle.reduce((s,v)=>s+(v===0),0);
          const title = `#${String(m.index+1).padStart(2,'0')} • Huecos: ${holes}`;
          problemsGrid.appendChild(createPrintCard(title, item.puzzle));

          // impresión (soluciones)
          const titleSol = `#${String(m.index+1).padStart(2,'0')}`;
          solutionsGrid.appendChild(createPrintCard(titleSol, item.solution));

          const total = parseCount();
          setStatus(`Generando ${Math.min(m.index+1, total)}/${total}…`);
        } else if (m.type === 'done'){
          setStatus('Listo.');
          stopUI();
        } else if (m.type === 'cancelled'){
          setStatus(`Cancelado tras ${m.generated}.`);
          stopUI();
        } else if (m.type === 'error'){
          console.error('[Worker error msg]:', m.message, m.detail);
          setStatus('Error (ver consola).');
          stopUI();
        }
      };
      worker.onerror = (err)=>{ console.error('[Worker onerror]:', err); setStatus('Error del worker'); stopUI(); };
      return worker;
    }

    function startGeneration(ev){
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      if (running) return;

      const total = parseCount();
      startUI(total);

      const w = createWorker();
      if (!w) return;

      w.postMessage({
        type: 'start',
        difficulty: (els.difficulty && els.difficulty.value) || 'medium',
        count: total,
        seed: (els.seed && els.seed.value || '').trim(),
      });
    }

    // ---------- Eventos ----------
    if (els.generateBtn) els.generateBtn.dataset.mode = 'generate';
    if (els.generateBtn) els.generateBtn.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      if (els.generateBtn.dataset.mode === 'cancel' && worker){ worker.postMessage({ type:'cancel' }); return; }
      startGeneration(ev);
    });

    if (els.printBtn) els.printBtn.addEventListener('click', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); window.print(); });

    if (els.toggleSolutionsBtn) els.toggleSolutionsBtn.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      showSolutions = !showSolutions;
      els.toggleSolutionsBtn.textContent = showSolutions ? 'Ocultar soluciones' : 'Mostrar soluciones';
      document.querySelectorAll('.solution').forEach(el => el.classList.toggle('hidden', !showSolutions));
    });

    // Atajos
    window.addEventListener('keydown', (ev)=>{
      if (ev.key==='g'||ev.key==='G'){ ev.preventDefault(); els.generateBtn && els.generateBtn.click(); }
      else if (ev.key==='p'||ev.key==='P'){ ev.preventDefault(); els.printBtn && els.printBtn.click(); }
      else if (ev.key==='s'||ev.key==='S'){ ev.preventDefault(); els.toggleSolutionsBtn && els.toggleSolutionsBtn.click(); }
    });
  });
})();
