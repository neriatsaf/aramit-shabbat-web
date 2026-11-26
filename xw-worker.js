/* The rectangular personal crossword: a full board with no empty cell (every cell is a letter or a definition), filled
   in the background so the screen never freezes.

   One file, three uses:
   1. As a Web Worker (new Worker('xw-worker.js')): it loads the templates (xw-templates.js) and answers each message
      { id, pool, opts } with { id, ok, R, C, words, size, tries, ms } or { id, ok: false, why }.
   2. As a plain script in the page (<script src="xw-worker.js">): it defines window.XWRect.build(pool, opts), a Promise
      that starts the worker, stops it after the time allowed, and resolves with the board or with null. On null the
      caller falls back to the old generator (xwBuild in js/xw.js).
   3. In Node (require): the same functions, for tools/make-xw-templates.js and tests/xw-rect.js.

   pool: the entries the solver chose, each { s, i, w, clue } (s: source c/d/x/b, i: index in that source, w: the word as
   the store writes it, clue: the definition the cell shows). Optional per entry: pref (a higher one is tried first) and
   m (a key of meaning; two entries with the same m never stand on the same board).
   The board comes back as words [s, i, t, clue cell, w], the form js/xw.js saves and reads (xwFromRefs).

   The sizes are tried in order: 7 rows by 6 columns (like the daily board), then 6 by 5, then 5 by 5. A size whose
   templates need more words of some length than the pool holds is passed over at once. Each size has its share of the
   time; after the whole time (2.5 seconds by default) the answer is "no board", and the caller uses the old generator. */
(function (root) {
  'use strict';
  const FIN = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  /* the answer as the board holds it: letters only, without vowel points, final letters made plain (as norm in js/rules.js) */
  const base = s => String(s).replace(/[֑-ׇ]/g, '').replace(/[^א-ת]/g, '').replace(/[ךםןףץ]/g, c => FIN[c]);
  /* two forms of one word (איתא and אית, שבתא and שבת) share this key and never stand on the same board (as make-daily.js) */
  const rootOf = w => { const b = base(w).replace(/[וי]/g, ''); return b.length > 2 ? b.replace(/[אה]$/, '') : b; };
  /* the longest definition that may share its cell with another (half a cell), as in make-daily.js */
  const SHARED_MAX = 24;
  const SIZES = [[7, 6], [6, 5], [5, 5]];
  /* the share of the whole time each size may use, counted from the start */
  const SHARE = { '7x6': 0.55, '6x5': 0.8, '5x5': 1 };

  function makeRng(seed) {
    let a = 0; for (const ch of String(seed)) a = Math.imul(a ^ ch.charCodeAt(0), 2654435761) >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(a, rnd) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; }

  /* the pool as the filler wants it: one entry for each spelling, from 2 to 8 letters */
  function prepPool(raw) {
    const seen = new Set(), out = [];
    for (const e of raw || []) {
      if (!e || typeof e.w !== 'string') continue;
      const ans = base(e.w);
      if (ans.length < 2 || ans.length > 8 || seen.has(ans)) continue;
      seen.add(ans);
      const clue = String(e.clue || '');
      out.push({ s: e.s, i: e.i, w: e.w, ans, short: e.short !== undefined ? !!e.short : clue.length <= SHARED_MAX, root: rootOf(e.w), m: e.m || '', pref: +e.pref || 0 });
    }
    return out;
  }
  /* for each length, the answers, and for each position and letter the answers that have it (bit sets of 32) */
  function index(pool) {
    const by = {};
    pool.forEach(e => { const n = e.ans.length; (by[n] = by[n] || []).push(e); });
    const idx = {};
    for (const n in by) {
      const list = by[n], W = Math.ceil(list.length / 32), pos = [];
      for (let i = 0; i < +n; i++) { const m = new Map(); list.forEach((e, j) => { const ch = e.ans[i]; if (!m.has(ch)) m.set(ch, new Uint32Array(W)); m.get(ch)[j >> 5] |= 1 << (j & 31); }); pos.push(m); }
      const all = new Uint32Array(W), short = new Uint32Array(W);
      for (let j = 0; j < list.length; j++) { all[j >> 5] |= 1 << (j & 31); if (list[j].short) short[j >> 5] |= 1 << (j & 31); }
      idx[n] = { list, W, pos, all, short, nShort: list.filter(e => e.short).length };
    }
    return idx;
  }
  const pop = x => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; };

  /* the cells of a word from its arrow and its definition cell, as xwCells in js/xw.js: column 0 is the rightmost and a
     word across runs to the next column (c + 1). l: starts on the left of the cell; ld: starts on the left and runs down;
     d: starts below and runs down; dl: starts below and runs across */
  function cellsOf(C, t, clue, n) {
    const cr = Math.floor(clue / C), cc = clue % C, h = t === 'l' || t === 'dl';
    const r0 = t === 'dl' || t === 'd' ? cr + 1 : cr, c0 = t === 'l' || t === 'ld' ? cc + 1 : cc, out = [];
    for (let i = 0; i < n; i++) out.push((r0 + (h ? 0 : i)) * C + c0 + (h ? i : 0));
    return out;
  }
  /* a template: { R, C, w: [[arrow, definition cell, length], ...] }. Its slots, with the cells each word takes and whether
     its definition shares the cell with another (then only a short definition fits) */
  function slotsOf(tpl) {
    const uses = new Map(); tpl.w.forEach(([, k]) => uses.set(k, (uses.get(k) || 0) + 1));
    return tpl.w.map(([t, k, n]) => ({ t, clue: k, n, cells: cellsOf(tpl.C, t, k, n), shared: uses.get(k) > 1 }));
  }
  /* how many words of each length a template needs, and how many of them must be short */
  function needs(tpl) {
    const o = {}; slotsOf(tpl).forEach(s => { const x = o[s.n] = o[s.n] || { n: 0, sh: 0 }; x.n++; if (s.shared) x.sh++; });
    return o;
  }
  /* the pool can hold the template at all: enough answers of every length (and short ones for shared cells) */
  function canHold(tpl, idx) {
    const nd = tpl._needs || (tpl._needs = needs(tpl));
    for (const n in nd) { const I = idx[n]; if (!I || I.list.length < nd[n].n || I.nShort < nd[n].sh) return false; }
    return true;
  }

  /* fill the slots of one template: the slot with the fewest candidates first, at most `per` candidates tried in each.
     Returns the entries by slot, or null when it runs out of candidates, of nodes (budget) or of time (until) */
  function fill(tpl, idx, rnd, budget, until, per) {
    const slots = tpl._slots || (tpl._slots = slotsOf(tpl)), N = tpl.R * tpl.C, L = new Array(N).fill('');
    const at = slots.map(() => null), used = new Set(), keys = new Map();
    const xs = tpl._xs || (tpl._xs = slots.map((s, i) => slots.map((t, j) => j !== i && t.cells.some(k => s.cells.indexOf(k) >= 0) ? j : -1).filter(j => j >= 0)));
    per = per || 12;
    let nodes = 0, out = false;
    const cand = s => {
      const I = idx[s.n]; if (!I) return null;
      const m = Uint32Array.from(s.shared ? I.short : I.all);
      for (let i = 0; i < s.n; i++) { const ch = L[s.cells[i]]; if (!ch) continue; const b = I.pos[i].get(ch); if (!b) return null; for (let w = 0; w < I.W; w++) m[w] &= b[w]; }
      return m;
    };
    const count = m => { let n = 0; for (let w = 0; w < m.length; w++) n += pop(m[w]); return n; };
    const keyOf = e => e.m ? [e.root, '~' + e.m] : [e.root];
    function place(i, e) { const s = slots[i], prev = s.cells.map(k => L[k]); s.cells.forEach((k, j) => { L[k] = e.ans[j]; }); at[i] = e; used.add(e.ans); keyOf(e).forEach(k => keys.set(k, (keys.get(k) || 0) + 1)); return prev; }
    function undo(i, prev) { const s = slots[i], e = at[i]; used.delete(e.ans); keyOf(e).forEach(k => keys.set(k, keys.get(k) - 1)); at[i] = null; s.cells.forEach((k, j) => { L[k] = prev[j]; }); }
    function ok(i) { for (const j of xs[i]) if (!at[j]) { const m = cand(slots[j]); if (!m || !count(m)) return false; } return true; }
    function go() {
      if (++nodes > budget) return false;
      if ((nodes & 63) === 0 && until && Date.now() > until) { out = true; return false; }
      let bi = -1, bm = null, bn = 1e9;
      for (let i = 0; i < slots.length; i++) if (!at[i]) { const m = cand(slots[i]), n = m ? count(m) : 0; if (!n) return false; if (n < bn) { bn = n; bi = i; bm = m; } }
      if (bi < 0) return true;
      const I = idx[slots[bi].n], ids = [];
      for (let w = 0; w < bm.length; w++) { let x = bm[w]; while (x) { const b = x & -x; ids.push((w << 5) + (31 - Math.clz32(b))); x ^= b; } }
      const keyed = ids.map(j => [I.list[j], rnd() + I.list[j].pref]).sort((a, b) => b[1] - a[1]);
      let tries = 0;
      for (const [e] of keyed) {
        if (used.has(e.ans) || keyOf(e).some(k => keys.get(k))) continue;
        if (++tries > per) break;
        const prev = place(bi, e);
        if (ok(bi) && go()) return true;
        undo(bi, prev);
        if (out) return false;
      }
      return false;
    }
    return go() ? at : null;
  }

  /* one board: the sizes in order, the templates of a size in random order, each filled until the time of its size ends.
     opts: { ms: the whole time (2500), seed: a fixed seed (tests), sizes: [[R, C], ...], budget: nodes per try (3000),
     templates: the list to use (XW_TEMPLATES) } */
  function buildRect(raw, opts) {
    opts = opts || {};
    const t0 = Date.now(), ms = opts.ms || 2500, rnd = opts.seed !== undefined ? makeRng(opts.seed) : Math.random;
    const T = opts.templates || root.XW_TEMPLATES || [];
    const pool = prepPool(raw), idx = index(pool);
    let tries = 0;
    for (const [R, C] of opts.sizes || SIZES) {
      const size = R + 'x' + C, until = t0 + ms * (SHARE[size] || 1);
      const list = shuffle(T.filter(t => t.R === R && t.C === C && canHold(t, idx)), rnd);
      if (!list.length) continue;
      /* each template is tried in turn, again and again with other words, while the time of this size lasts */
      for (let round = 0; Date.now() < until && round < 400; round++) {
        for (const tpl of list) {
          if (Date.now() >= until) break;
          tries++;
          const at = fill(tpl, idx, rnd, opts.budget || 3000, until);
          if (!at) continue;
          const words = tpl._slots.map((s, j) => [at[j].s, at[j].i, s.t, s.clue, at[j].w]);
          return { ok: true, R, C, size, words, tries, ms: Date.now() - t0 };
        }
      }
    }
    return { ok: false, why: pool.length ? 'no board in time' : 'empty pool', tries, ms: Date.now() - t0 };
  }

  const api = { base, rootOf, makeRng, prepPool, index, slotsOf, cellsOf, needs, canHold, fill, buildRect, SIZES, SHARED_MAX };

  const inWorker = typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope;
  if (inWorker) {
    try { root.importScripts('xw-templates.js'); } catch (e) { /* no templates: every request answers "no board" */ }
    root.onmessage = ev => {
      const d = ev.data || {};
      let res;
      try { res = buildRect(d.pool, d.opts); } catch (e) { res = { ok: false, why: String(e && e.message || e) }; }
      res.id = d.id;
      root.postMessage(res);
    };
  } else if (typeof window !== 'undefined') {
    /* the page side. XWRect.build(pool, { ms }) resolves with { R, C, words, size } or with null (no worker, no board in
       time, or an error); the worker is stopped in any case, so a slow phone never keeps it running */
    const here = (document.currentScript && document.currentScript.src) || 'xw-worker.js';
    let seq = 0;
    window.XWRect = {
      build(pool, opts) {
        opts = opts || {};
        const ms = opts.ms || 2500;
        return new Promise(resolve => {
          let w, done = false, timer;
          const end = r => { if (done) return; done = true; clearTimeout(timer); try { w && w.terminate(); } catch (e) { /* ignore */ } resolve(r && r.ok ? r : null); };
          try { w = new Worker(here); } catch (e) { end(null); return; }
          const id = ++seq;
          /* the worker stops itself at ms; this is the last word, for a phone too busy to answer in time */
          timer = setTimeout(() => end(null), ms + 400);
          w.onmessage = ev => { if (ev.data && ev.data.id === id) end(ev.data); };
          w.onerror = () => end(null);
          const slim = (pool || []).map(e => ({ s: e.s, i: e.i, w: e.w, clue: e.clue, pref: e.pref, m: e.m }));
          w.postMessage({ id, pool: slim, opts: { ms, sizes: opts.sizes, seed: opts.seed } });
        });
      }
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
