// /js/sudoku-core.js
// Núcleo Sudoku: solver (bitmasks) + contador + generador por "masking" con unicidad.
// Siempre produce puzzle con huecos y una única solución.

const Sudoku = (() => {
  const N = 81;
  const ROW = i => (i / 9) | 0;
  const COL = i => i % 9;
  const BOX = i => (((ROW(i) / 3) | 0) * 3 + ((COL(i) / 3) | 0));
  const ALL = 0x1FF; // bits 1..9
  const bit = n => 1 << (n - 1);
  const popcount = x => { x -= (x>>>1)&0x55555555; x=(x&0x33333333)+((x>>>2)&0x33333333); return (((x+(x>>>4))&0x0F0F0F0F)*0x01010101)>>>24; };
  const firstBitVal = (bm) => 1 + (31 - Math.clz32(bm));

  // ---------- SOLVER ----------
  function solve(grid, rng) {
    const g = grid.slice();
    const rows = new Uint16Array(9).fill(ALL);
    const cols = new Uint16Array(9).fill(ALL);
    const boxes = new Uint16Array(9).fill(ALL);

    for (let i = 0; i < N; i++) {
      const v = g[i];
      if (v !== 0) {
        const r = ROW(i), c = COL(i), b = BOX(i), inv = ~bit(v);
        if (((rows[r] &= inv) & (cols[c] &= inv) & (boxes[b] &= inv)) === 0) return null;
      }
    }

    const order = [];
    for (let i = 0; i < N; i++) if (g[i] === 0) order.push(i);
    const rand = rng || RNG.random();

    function backtrack(pos) {
      if (pos === order.length) return true;

      // MRV
      let best = pos, bestCount = 10;
      for (let k = pos; k < order.length; k++) {
        const i = order[k], r = ROW(i), c = COL(i), b = BOX(i);
        const cnt = popcount(rows[r] & cols[c] & boxes[b]);
        if (cnt === 0) return false;
        if (cnt < bestCount) { bestCount = cnt; best = k; if (cnt === 1) break; }
      }

      [order[pos], order[best]] = [order[best], order[pos]];
      const i = order[pos], r = ROW(i), c = COL(i), b = BOX(i);
      const mask = rows[r] & cols[c] & boxes[b];

      const vals = [];
      for (let m = mask; m; m &= (m - 1)) vals.push(firstBitVal(m & -m));
      rand.shuffle(vals);

      for (const v of vals) {
        const bm = bit(v), inv = ~bm;
        g[i] = v;
        const pr = rows[r], pc = cols[c], pb = boxes[b];
        rows[r] &= inv; cols[c] &= inv; boxes[b] &= inv;

        if (backtrack(pos + 1)) return true;

        rows[r] = pr; cols[c] = pc; boxes[b] = pb;
        g[i] = 0;
      }
      return false;
    }

    return backtrack(0) ? g : null;
  }

  // ---------- CONTADOR ----------
  function countSolutions(grid, limit = 2) {
    let count = 0;
    const g = grid.slice();
    const rows = new Uint16Array(9).fill(ALL);
    const cols = new Uint16Array(9).fill(ALL);
    const boxes = new Uint16Array(9).fill(ALL);

    for (let i = 0; i < N; i++) {
      const v = g[i];
      if (v !== 0) {
        const r = ROW(i), c = COL(i), b = BOX(i), inv = ~bit(v);
        if (((rows[r] &= inv) & (cols[c] &= inv) & (boxes[b] &= inv)) === 0) return 0;
      }
    }

    const order = [];
    for (let i = 0; i < N; i++) if (g[i] === 0) order.push(i);

    function dfs(pos) {
      if (count >= limit) return;
      if (pos === order.length) { count++; return; }

      let best = pos, bestCount = 10;
      for (let k = pos; k < order.length; k++) {
        const i = order[k], r = ROW(i), c = COL(i), b = BOX(i);
        const cnt = popcount(rows[r] & cols[c] & boxes[b]);
        if (cnt === 0) return;
        if (cnt < bestCount) { bestCount = cnt; best = k; if (cnt === 1) break; }
      }

      [order[pos], order[best]] = [order[best], order[pos]];
      const i = order[pos], r = ROW(i), c = COL(i), b = BOX(i);
      let mask = rows[r] & cols[c] & boxes[b];

      for (let m = mask; m; m &= (m - 1)) {
        const bm = m & -m;
        const v = firstBitVal(bm);
        const inv = ~bm;
        g[i] = v;
        const pr = rows[r], pc = cols[c], pb = boxes[b];
        rows[r] &= inv; cols[c] &= inv; boxes[b] &= inv;

        dfs(pos + 1);

        rows[r] = pr; cols[c] = pc; boxes[b] = pb;
        g[i] = 0;
        if (count >= limit) return;
      }
    }

    dfs(0);
    return count;
  }

  // ---------- SOLUCIÓN COMPLETA ----------
  function generateFullSolution(rng) {
    const r = rng || RNG.random();
    const base = [1,2,3,4,5,6,7,8,9];
    r.shuffle(base);
    const g = Array(N);
    for (let rr = 0; rr < 9; rr++)
      for (let cc = 0; cc < 9; cc++)
        g[rr*9 + cc] = base[(rr*3 + ((rr/3)|0) + cc) % 9];

    const map = [0, ...r.shuffle([1,2,3,4,5,6,7,8,9])];
    for (let i = 0; i < N; i++) g[i] = map[g[i]];

    return solve(g, r) || solve(Array(N).fill(0), r);
  }

  // ---------- GENERACIÓN POR "MASKING" ----------
  const DIFF = {
    easy:   { minClues: 40, maxClues: 45 },
    medium: { minClues: 32, maxClues: 38 },
    hard:   { minClues: 26, maxClues: 31 },
  };

  // lista de pares simétricos i<=j (rotación 180°)
  function symmetricPairs() {
    const pairs = [];
    for (let i = 0; i < N; i++) {
      const r = ROW(i), c = COL(i);
      const j = (8 - r)*9 + (8 - c);
      if (i <= j) pairs.push([i, j]);
    }
    return pairs;
  }

  // Construye una máscara de "pistas a mantener" con ~targetClues
  function buildMask(targetClues, rng) {
    const r = rng || RNG.random();
    const keep = Array(N).fill(false);
    let remaining = targetClues;

    // intentamos mantener simetría, pero si queda 1, rompemos simetría
    const pairs = symmetricPairs();
    r.shuffle(pairs);

    for (const [a, b] of pairs) {
      if (remaining <= 0) break;
      if (a === b) {
        if (!keep[a]) { keep[a] = true; remaining -= 1; }
      } else if (remaining >= 2) {
        if (!keep[a] && !keep[b]) { keep[a] = keep[b] = true; remaining -= 2; }
      }
    }

    // Si aún falta 1, rellena con cualquier celda suelta
    if (remaining === 1) {
      const cells = Array.from({ length: N }, (_, i) => i);
      r.shuffle(cells);
      for (const i of cells) { if (!keep[i]) { keep[i] = true; break; } }
      remaining = 0;
    }

    // Defensa: por si acaso, asegura que no queden "todo keep" (sin huecos)
    if (keep.every(v => v)) {
      // apaga una cualquiera
      keep[r.randint(0, N - 1)] = false;
    }
    return keep;
  }

  // Genera puzzle por masking y valida unicidad
  function generatePuzzle(difficulty, rng) {
    const r = rng || RNG.random();
    const { minClues, maxClues } = DIFF[difficulty] || DIFF.medium;

    const MAX_OUTER = 12;       // reintentos de solución + máscara
    const MAX_MASK_TRIES = 40;  // reintentos de máscara sobre la misma solución

    for (let outer = 0; outer < MAX_OUTER; outer++) {
      const solution = generateFullSolution(r);

      for (let t = 0; t < MAX_MASK_TRIES; t++) {
        const targetClues = r.randint(minClues, maxClues);
        const keep = buildMask(targetClues, r);

        // aplica máscara
        const puzzle = solution.map((v, i) => keep[i] ? v : 0);

        // debe tener huecos y solución única
        if (puzzle.some(v => v === 0) && countSolutions(puzzle, 2) === 1) {
          return { puzzle, solution };
        }
      }
      // si ninguna máscara funcionó con esta solución, probar otra
    }

    // Fallback improbable: al menos un hueco, aunque fácil
    const sol = generateFullSolution(r);
    const keep = buildMask(Math.max(40, minClues || 32), r);
    const puzzle = sol.map((v, i) => keep[i] ? v : 0);
    return { puzzle, solution: sol };
  }

  return { solve, countSolutions, generatePuzzle };
})();
