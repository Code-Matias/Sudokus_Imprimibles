// /js/generator-worker.js
// Genera sudokus en un hilo aparte. Garantiza huecos aunque el core falle en tallar.
(function () {
  const VER = 'v10'; // <= SUBE ESTE NÚMERO si vuelves a editar para forzar recarga

  // Cache-bust al importar dependencias
  let base;
  try { base = new URL('./', self.location.href).href; } catch { base = './'; }
  try {
    importScripts(base + 'rng.js?' + VER, base + 'sudoku-core.js?' + VER);
  } catch (e) {
    self.postMessage({ type: 'error', message: 'No pude cargar rng/sudoku-core', detail: String(e) });
    return;
  }

  let aborted = false;

  const HOLE_TARGET = {
    easy: 20,
    medium: 30,
    hard: 38,
  };

  function ensureHoles(puzzle, difficulty, rng) {
    const r = rng || RNG.random();
    const target = HOLE_TARGET[difficulty] ?? HOLE_TARGET.medium;

    let holes = 0;
    for (let i = 0; i < puzzle.length; i++) if (puzzle[i] === 0) holes++;

    if (holes >= target) return puzzle;

    const cells = Array.from({ length: 81 }, (_, i) => i);
    r.shuffle(cells);

    // intenta apagar celdas sueltas manteniendo unicidad
    for (const i of cells) {
      if (holes >= target) break;
      if (puzzle[i] === 0) continue;
      const keep = puzzle[i];
      puzzle[i] = 0;
      if (Sudoku.countSolutions(puzzle, 2) === 1) {
        holes++;
      } else {
        puzzle[i] = keep;
      }
    }

    // Defensa: al menos 1 hueco
    if (holes === 0) {
      const i = r.randint(0, 80);
      const keep = puzzle[i];
      puzzle[i] = 0;
      if (Sudoku.countSolutions(puzzle, 2) !== 1) puzzle[i] = keep;
    }

    return puzzle;
  }

  self.onmessage = (e) => {
    const data = e.data || {};
    if (data.type === 'cancel') { aborted = true; return; }
    if (data.type !== 'start') return;

    aborted = false;
    const difficulty = (data.difficulty || 'medium').toLowerCase();
    const count = Math.max(1, +data.count || 1);
    const seed = (data.seed || '').trim();

    const baseRng = seed ? RNG.fromSeedString(seed) : RNG.fromSeedString(Date.now().toString());

    for (let i = 0; i < count; i++) {
      if (aborted) { self.postMessage({ type: 'cancelled', generated: i }); return; }

      const rng = RNG.fromSeedString(String(baseRng.next()) + ':' + i);

      try {
        let { puzzle, solution } = Sudoku.generatePuzzle(difficulty, rng);

        // 🔧 Parche: si no hay huecos, forzarlos (manteniendo unicidad)
        if (!puzzle.some(v => v === 0)) {
          puzzle = ensureHoles(puzzle.slice(), difficulty, rng);
        }

        self.postMessage({ type: 'progress', index: i, puzzle, solution });
      } catch (err) {
        self.postMessage({ type: 'error', message: 'Error generando puzzle', detail: String(err && err.message || err) });
      }
    }

    self.postMessage({ type: 'done' });
  };
})();
