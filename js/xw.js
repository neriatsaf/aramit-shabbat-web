/* פשיטא: the arrow crossword (תשחץ): the daily board, personal boards, the archive, the board on screen */
import './locator.js';   /* first: keeps the modules running in order */
import { answerInGloss, norm, rootLeak, xwLetters, xwVague } from './rules.js';
import { $, APP_URL, BETA, CN, D, NATIVE, PEREKS, S, SC, ST, WORDS, XWN, bare, bindSeg, cSource, countLine, dafName, esc, getGlossForMode, gloss, inScope, lazyWait, loadScript, noParens, ordPk, pid, sameMeaning, save, short, shuffle, timers, toast, track } from './state.js';
import { dayOf, holdLabel, reviewHtml, xwStreak, xwStreakInfo } from './learn.js';
import { DEL_SVG, drillOn } from './dict.js';
import { quizCfg } from './quiz.js';
import { renderWordle, streakLineHtml, wdFor } from './wordle.js';
import { closeSheet, localDay, openSheet, sheetOpen, two } from './settings.js';
import { R, drawn, goBack, nav, render } from './main.js';

function renderGameReview() {
  const ms = ST.game.mistakes || [];
  ST.view.innerHTML = '<div class="row between"><h2>הטעויות בסיבוב</h2><button class="link" id="back">חזרה</button></div>' + reviewHtml(ms) +
    '<button class="btn wide" id="drill">חידון קצר על הטעויות האלה</button>';
  $('back').onclick = goBack;
  $('drill').onclick = () => drillOn(ms.map(m => m.e));
}

/* ---------- arrow crossword (תשחץ): its own tab, with its own state, apart from the other games ----------
   A 9 by 9 board laid out right to left: column 0 is the rightmost, and moving left adds one to the column.
   A definition cell sends its word in one of four ways:
   'l' to the cell on its left and on leftwards, 'd' to the cell below and on down,
   'dl' to the cell below and from there leftwards, 'ld' to the cell on its left and from there down.
   Letters are kept without final forms, so a final letter typed in the middle of a crossing word still counts */
ST.xg = null;
/* a crossword entry may be a dictionary word or phrase, a concept, or one of the terms added for the daily board */
const XE = ((window.DAILY && window.DAILY.extra) || []).map((x, i) => ({ xe: true, w: x[0], s: x[1], m0: x[2], i }));
/* the crossword bank (bank.js): terms of the Torah world for the crosswords only, handled like the added terms:
   a short definition for the cell, a full explanation for the summary, and no place in the dictionary, the learning or the Wordle */
/* bank.js and xwclues.js load after the first screen (see LAZY below); the crossword and the Wordle wait for them */
let BK = [];
function bankInit() { BK = (window.BANK || []).map((r, i) => ({ xe: true, bk: true, w: r[0], t: r[1], s: r[2], m0: r[3], i })); ST.WDICT = null; }
function xwEntry(src, i) { return src === 'c' ? CN[i] : src === 'x' ? XE[i] : src === 'b' ? BK[i] : D[i]; }
function xwSrc(e) { return e.cn ? 'c' : e.bk ? 'b' : e.xe ? 'x' : 'd'; }
function xwAns(e) { return norm(xwLetters(e.w)).split(''); }
/* a phrase of several words gets its letter count per word, as in a printed crossword: (3, 2) */
function xwSplit(e) { const p = e.w.trim().split(/\s+/); return p.length > 1 ? ' (' + p.map(x => xwLetters(x).length).join(', ') + ')' : ''; }
/* a definition rewritten for the crossword (xwclues.js) replaces one that shows the answer or is too short to solve;
   the dictionary keeps the original */
let XWC = {};
function xwOv(e) { return XWC[xwSrc(e) + ':' + e.w]; }
function xwClue(e) { return getGlossForMode(e, 'crossword') + xwSplit(e); }
function xwDef(e) { return (xwOv(e) || (e.cn || e.xe ? e.s : gloss(e))) + xwSplit(e); }
/* a board from its word list: [source, index, arrow, clue cell] on R rows and C columns */
function xwFromRefs(R, C, refs) {
  const L = new Array(R * C).fill(''), K = new Array(R * C).fill(null), words = [];
  for (const [src, i, t, clue, wtext] of refs) {
    /* a saved board names each word by its place in the store; when the store has changed since (a term taken out of the bank),
       the place may now hold another word, and the board is not rebuilt from it */
    const e = xwEntry(src, i); if (!e || !XNAME[t] || (wtext && wtext !== e.w)) return null;
    const ans = xwAns(e), p = xwCells(t, Math.floor(clue / C), clue % C, ans.length);
    if (p.cells.some(q => q[0] < 0 || q[1] < 0 || q[0] >= R || q[1] >= C)) return null;
    const cells = p.cells.map(q => q[0] * C + q[1]);
    for (let j = 0; j < cells.length; j++) { if (L[cells[j]] && L[cells[j]] !== ans[j]) return null; L[cells[j]] = ans[j]; }
    K[clue] = (K[clue] || []).concat([{ t, wi: words.length }]);
    words.push({ e, t, clue, cells, h: p.h, ans });
  }
  /* a board that could not be played is not shown: a word under two letters, a letter on a definition cell, or a word whose
     row runs on into other letters, so the cells after its definition do not match its answer */
  for (const w of words) {
    if (w.cells.length < 2 || w.cells.some(k => K[k]) || L[w.clue]) return null;
    const dr = w.h ? 0 : 1, dc = w.h ? 1 : 0, last = w.cells[w.cells.length - 1], r = Math.floor(last / C) + dr, c = last % C + dc;
    if (r < R && c < C && L[r * C + c] && !K[r * C + c]) return null;
  }
  return { R, C, L, K, words };
}
/* the daily board: the prepared board for today's edition; after the last board it starts over.
   The site opens to the yeshiva on LAUNCH (moved from 22.11 to 24.11.2026, with a reset of progress, see launchReset): from that day the count starts again at #1, with the first board and the first
   Wordle word of the file. The days before it keep the count of the file (DAILY.epoch), so the boards already played stay
   as they were. The file of the boards itself does not change */
const LAUNCH = '2026-11-24';
function xwEpoch(day) { const ep = (window.DAILY && window.DAILY.epoch) || day; return day >= LAUNCH ? LAUNCH : ep; }
function xwEdition(day) {
  const ep = xwEpoch(day), ms = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.max(1, Math.round((ms(day) - ms(ep)) / 86400000) + 1);
}
function xwDailyBoard(day) {
  const bs = (window.DAILY && window.DAILY.boards) || []; if (!bs.length) return null;
  const ed = xwEdition(day), d = bs[(ed - 1) % bs.length], b = xwFromRefs(d.R, d.C, d.words);
  if (b) { b.theme = d.theme; b.anchor = true; b.ed = ed; }
  return b;
}
/* each board allows three hints (one letter each) */
const XW_HINTS = 3, XW_CHECKS = 3;
const XN = 9;
/* personal boards draw on the chosen store; a board by chapters may also take words of the expanded store from those chapters.
   No levels (24.11.2026): from the whole store only the chosen store, without the rare words of the expanded store */
/* a word that is not clean (a prefix, the same as in Hebrew, a letter's name) is never asked for (XW_SKIP, tools/make-xwskip.js) */
let XW_SKIP = new Set();
const xwOk = (e, txt, lim) => { const o = xwOv(e), t = o || txt; return !XW_SKIP.has(xwSrc(e) + ':' + e.w) && t.length <= lim && !answerInGloss(e.w, o || (e.bk ? e.s : e.m0)) && !xwVague(e.w, t) && !rootLeak(e.w, String(t).replace(/\s*\([^)]*\)/g, '')); };
let XW_ALL = [], XW_TWO = [];
/* the crossword pools, once bank.js and xwclues.js are in */
function xwInit() {
  XWC = window.XW_CLUES || {}; XW_SKIP = new Set(window.XW_SKIP || []);
  XW_ALL = WORDS.filter(e => /^[א-ת]{3,7}$/.test(e.w) && !(e.ext && /בעל כמה פירושים/.test(e.m0)) && xwOk(e, e.cn ? e.s : short(e), 34));
  BK.forEach(e => { if (/^[א-ת]{3,7}$/.test(e.w) && xwOk(e, e.s, 40)) XW_ALL.push(e); });
  XW_TWO = WORDS.filter(e => XW_TWO_OK.has(e.w) && xwOk(e, e.cn ? e.s : short(e), 34));
  BK.forEach(e => { if (XW_TWO_OK.has(e.w) && xwOk(e, e.s, 40)) XW_TWO.push(e); });
}
/* two-letter answers, for the rectangular personal board only (decided with the owner 24.11.2026): a short board of a single
   chapter rarely fills without them. Only clean, real words: no prefix (ב ל ד ו), no letter name (מם), nothing that is the
   same as in Hebrew and presented as Aramaic (לה, כי), and no bare particle (קא). The old 9x9 generator keeps 3 to 7 letters */
const XW_TWO_OK = new Set(['בר', 'הא', 'אי', 'מי', 'מר', 'בי', 'חד', 'תא', 'נח', 'דא', 'תו', 'הך', 'הי', 'דל', 'חש', 'שב', 'הב',
  'קב', 'קש', 'דף', 'פך', 'סם', 'טס', 'עף', 'סל', 'גץ', 'כס', 'רז', 'טב', 'רב', 'שס', 'רן', 'טז', 'שך']);
const xwCfg = { src: 'all', pereks: [] };
function restoreXw() {
  const c = S.settings.xw || {};
  xwCfg.src = c.src === 'learned' || c.src === 'pk' ? c.src : 'all';
  xwCfg.pereks = (Array.isArray(c.pereks) ? c.pereks : []).filter((k, i, l) => Number.isInteger(k) && k >= 0 && k < PEREKS.length && l.indexOf(k) === i).sort((x, y) => x - y);
}
function saveXw() { S.settings.xw = { src: xwCfg.src, pereks: xwCfg.pereks.slice() }; save(); }
function xwSrcOk(e, k) {
  if (e.bk) return xwCfg.src === 'all';
  if (e.ext && xwCfg.src === 'learned') return false;
  if (e.ext && xwCfg.src === 'all') return false;
  if (xwCfg.src === 'learned') return !!S.prog[pid(e)];
  if (xwCfg.src === 'pk') return k === undefined ? (!xwCfg.pereks.length || xwCfg.pereks.some(p => e.pkm & (1 << p))) : !!(e.pkm & (1 << k));
  return true;
}
function xwPoolOf(list) { return list.filter(e => xwSrcOk(e) && (SC.by !== 'daf' || xwCfg.src !== 'all' || (!e.bk && inScope(e)))); }
function xwPool() { return xwPoolOf(XW_ALL); }
/* the pool of the rectangular board (xw-worker.js): the same choice, with the clean two-letter words, in the form the worker
   takes. m keeps two entries of one meaning (אית and איכא) off the same board, as sameMeaning does for the old generator */
function xwRectPool() {
  return xwPoolOf(XW_ALL.concat(XW_TWO)).map(e => ({ s: xwSrc(e), i: e.i, w: e.w, clue: xwDef(e), m: e.bk ? '' : bare(short(e)) }));
}

/* where a word sits: its cells in reading order, and the cell before its start and after its end */
function xwCells(t, cr, cc, n) {
  const h = t === 'l' || t === 'dl', r0 = t === 'dl' || t === 'd' ? cr + 1 : cr, c0 = t === 'l' || t === 'ld' ? cc + 1 : cc;
  const dr = h ? 0 : 1, dc = h ? 1 : 0, cells = [];
  for (let i = 0; i < n; i++) cells.push([r0 + dr * i, c0 + dc * i]);
  return { h, cells, before: [r0 - dr, c0 - dc], after: [r0 + dr * n, c0 + dc * n] };
}
const xin = (r, c) => r >= 0 && c >= 0 && r < XN && c < XN;
function xwTry(cands) {
  const L = new Array(XN * XN).fill(''), stop = new Array(XN * XN).fill(false), K = new Array(XN * XN).fill(null), O = new Array(XN * XN).fill(0);
  const words = [], picked = [];
  const at = (r, c) => r * XN + c;
  function fit(w, t, cr, cc) {
    if (!xin(cr, cc)) return -1;
    const ci = at(cr, cc);
    if (L[ci] || (K[ci] && K[ci].length >= 2)) return -1;
    const p = xwCells(t, cr, cc, w.length), bit = p.h ? 1 : 2;
    /* a shared definition cell holds one word that starts on its left and one that starts below it, never two on the same side */
    const leftSide = x => x === 'l' || x === 'ld';
    if (K[ci] && K[ci].some(k => leftSide(k.t) === leftSide(t))) return -1;
    for (const q of [p.before, p.after]) if (xin(q[0], q[1]) && L[at(q[0], q[1])]) return -1;
    /* no parallel word may run alongside: a new letter may touch another letter only where a crossing word passes (checked below) */
    let cross = 0;
    for (let i = 0; i < w.length; i++) {
      const r = p.cells[i][0], c = p.cells[i][1];
      if (!xin(r, c)) return -1;
      const k = at(r, c);
      if (L[k]) { if (L[k] !== w[i] || (O[k] & bit)) return -1; cross++; continue; }
      if (stop[k] || K[k] || k === ci) return -1;
      const n1 = p.h ? [r - 1, c] : [r, c - 1], n2 = p.h ? [r + 1, c] : [r, c + 1];
      if ((xin(n1[0], n1[1]) && L[at(n1[0], n1[1])]) || (xin(n2[0], n2[1]) && L[at(n2[0], n2[1])])) return -1;
    }
    return cross;
  }
  function put(e, w, t, cr, cc) {
    const p = xwCells(t, cr, cc, w.length), bit = p.h ? 1 : 2, ci = at(cr, cc);
    p.cells.forEach((q, i) => { const k = at(q[0], q[1]); L[k] = w[i]; O[k] |= bit; });
    for (const q of [p.before, p.after]) if (xin(q[0], q[1])) stop[at(q[0], q[1])] = true;
    K[ci] = (K[ci] || []).concat([{ t, wi: words.length }]); stop[ci] = true;
    words.push({ e, t, clue: ci, cells: p.cells.map(q => at(q[0], q[1])), h: p.h, ans: w });
    picked.push(e);
  }
  /* the first word goes near the middle. After it, every word in the shuffled pool is tried in turn, only where it
     crosses a letter already on the board, and it takes its best such place. Two passes over the pool */
  const TYPES = ['l', 'd', 'dl', 'ld'], HT = ['l', 'dl'], VT = ['d', 'ld'];
  const clueOf = (t, r0, c0) => t === 'l' || t === 'ld' ? [r0, c0 - 1] : [r0 - 1, c0];
  function bestPlace(w) {
    let best = null, bs = -1e9;
    const consider = (x, t, cr, cc) => {
      const sc = x * 10 + (K[at(cr, cc)] ? 3 : 0) - (t.length > 1 ? 2 : 0) + xwRnd() * 6;
      if (sc > bs) { bs = sc; best = [t, cr, cc]; }
    };
    if (!words.length) {
      for (const t of TYPES) for (let cr = 2; cr < 7; cr++) for (let cc = 2; cc < 7; cc++) { const x = fit(w, t, cr, cc); if (x >= 0) consider(-Math.abs(cr - 4) - Math.abs(cc - 4), t, cr, cc); }
      return best;
    }
    for (let k = 0; k < XN * XN; k++) {
      if (!L[k]) continue;
      const r = Math.floor(k / XN), c = k % XN;
      for (let i = 0; i < w.length; i++) {
        if (w[i] !== L[k]) continue;
        if (!(O[k] & 1)) for (const t of HT) { const q = clueOf(t, r, c - i); const x = fit(w, t, q[0], q[1]); if (x > 0) consider(x, t, q[0], q[1]); }
        if (!(O[k] & 2)) for (const t of VT) { const q = clueOf(t, r - i, c); const x = fit(w, t, q[0], q[1]); if (x > 0) consider(x, t, q[0], q[1]); }
      }
    }
    return best;
  }
  const items = cands.map(e => { const w = norm(e.w).split(''); return { e, w }; });
  for (let pass = 0; pass < 2 && words.length < 17; pass++) {
    const before = words.length;
    for (const it of items) {
      if (words.length >= 17) break;
      if (it.done) continue;
      const b = bestPlace(it.w); if (!b) continue;
      it.done = true;
      /* no two words on a board with the same meaning, or the same word in two spellings */
      if (picked.some(p => norm(p.w) === norm(it.e.w) || sameMeaning(p, it.e))) continue;
      put(it.e, it.w, b[0], b[1], b[2]);
    }
    if (words.length === before) break;
  }
  const letters = L.filter(Boolean).length;
  return { R: XN, C: XN, L, K, words, score: words.length * 4 + letters };
}
/* tries run in short slices so the screen stays responsive. A board needs at least 13 words.
   A personal board stops at 15 or more, or at 13 or more after a while, and gives up after seven seconds.
   The daily board draws every random number from a generator seeded by the date, and stops by count, never by time,
   so every device builds exactly the same board on the same day */
let xwBusy = false, xwRnd = Math.random;
function seeded(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function xwBuild(src, done, day) {
  const t0 = Date.now(), rnd = day ? seeded('aramit-xw-' + day) : Math.random;
  let best = null, n = 0;
  (function slice() {
    const t1 = Date.now();
    while (Date.now() - t1 < 40) {
      xwRnd = rnd; ST.glossPure = !!day;
      let b;
      try { b = xwTry(shuffle(src, rnd)); } finally { xwRnd = Math.random; ST.glossPure = false; }
      n++;
      if (!best || b.score > best.score) best = b;
      if (day ? (best.words.length >= 15 || n >= 120) : (best.words.length >= 15 || (best.words.length >= 13 && Date.now() - t0 > 700))) { done(best); return; }
      if (!day && Date.now() - t0 > 7000) { done(best); return; }
    }
    setTimeout(slice, 0);
  })();
}

/* the board in progress is kept on the device, so closing the app and opening it again carries on from the same point */
const XKEY = 'aramit-shabbat-xw';
function xwSave() {
  const g = ST.xg; if (!g || g.type !== 'xw' || g.arch) return;
  const o = { v: 2, R: g.b.R, C: g.b.C, day: g.day || '', ed: g.b.ed || 0, theme: g.b.theme || '', anchor: !!g.b.anchor, words: g.b.words.map(w => [xwSrc(w.e), w.e.i, w.t, w.clue, w.e.w]), typed: g.typed, hint: [...g.hint], bad: [...g.bad],
    wrongW: [...g.wrongW], hintW: [...g.hintW], act: g.act, cur: g.cur, secs: g.secs || 0, checks: g.checks || 0, open: !!g.open, done: !!g.done };
  try { localStorage.setItem(XKEY, JSON.stringify(o)); } catch (e) { /* storage full or blocked */ }
}
function xwForget() { try { localStorage.removeItem(XKEY); } catch (e) { /* ignore */ } }
function xwLoad() {
  try {
    const o = JSON.parse(localStorage.getItem(XKEY) || 'null');
    if (!o || (o.v !== 1 && o.v !== 2) || !Array.isArray(o.words) || o.done) return null;
    /* a daily board belongs to its day: on a later day it is not offered again, and today's board starts clean */
    if (o.anchor && o.day && o.day !== localDay()) return null;
    const R = o.v === 2 ? o.R : XN, C = o.v === 2 ? o.C : XN;
    const b = xwFromRefs(R, C, o.v === 2 ? o.words : o.words.map(w => ['d'].concat(w)));
    if (!b) return null;
    if (o.v === 2) { b.ed = o.ed || 0; b.theme = o.theme || ''; b.anchor = !!o.anchor; }
    const g = xwGame(b), words = b.words;
    if (Array.isArray(o.typed) && o.typed.length === R * C) g.typed = o.typed.map(x => typeof x === 'string' ? x : '');
    g.hint = new Set(o.hint || []); g.bad = new Set();   /* red cells from the old full-board check are not brought back */ g.wrongW = new Set(o.wrongW || []); g.hintW = new Set(o.hintW || []);
    if (o.act >= 0 && o.act < words.length) g.act = o.act;
    if (words[g.act].cells.indexOf(o.cur) >= 0) g.cur = o.cur; else g.cur = words[g.act].cells[0];
    g.secs = Math.max(0, o.secs | 0); g.day = o.day || ''; g.open = !!o.open; g.checks = Math.min(XW_CHECKS, Math.max(0, o.checks | 0));
    return g;
  } catch (e) { return null; }
}
function mmss(n) { return two(Math.floor(n / 60)) + ':' + two(n % 60); }

/* the top of the setup: the daily board, and the saved board if there is one */
function xwTopHtml() {
  const sv = xwLoad();
  return sv && !sv.b.anchor ? '<button class="btn ghost wide" id="xw-resume">המשך הלוח השמור (' + mmss(sv.secs) + ')</button>' : '';
}
/* the setup: where the words come from */
function renderXWSetup() {
  const n = xwPool().length;
  let sub = '';
  if (xwCfg.src === 'pk') sub = '<div class="pkgrid" id="xw-pk"><button data-v="-1" aria-pressed="' + (xwCfg.pereks.length === 0) + '"><span>כל הפרקים</span></button>' +
    PEREKS.map((pk, k) => { const c = XW_ALL.filter(e => xwSrcOk(e, k)).length; return '<button data-v="' + k + '" aria-pressed="' + (xwCfg.pereks.indexOf(k) >= 0) + '"' + (c ? '' : ' disabled') + '><span>' + ordPk(k) + '. ' + esc(pk[0]) + '</span><b>' + c + '</b></button>'; }).join('') + '</div>';
  ST.view.innerHTML = '<div class="row between"><h2>תשחץ אישי</h2><button class="link" id="xw-back">חזרה למשחקים</button></div>' +
    xwTopHtml() +
    '<p class="small muted" id="xw-note">בחר מאגר מילים.' + (SC.by !== 'daf' ? '' : xwCfg.src === 'all' ? ' מכל המאגר נלקחות רק מילים מהדפים שאתה אוחז בהם (' + esc(holdLabel()) + ').' :
      xwCfg.src === 'pk' ? ' בבחירת פרקים נלקחות כל המילים של הפרקים שבחרת, גם מעבר לדפים שאתה אוחז בהם.' : '') + '</p>' +
    '<div class="field"><span class="label">מאגר מילים</span><div class="seg" id="xw-src">' +
    [['all', 'כל המילים'], ['learned', 'שנלמדו'], ['pk', 'לפי פרקים']].map(o => '<button data-v="' + o[0] + '" aria-pressed="' + (xwCfg.src === o[0]) + '">' + o[1] + '</button>').join('') + '</div></div>' +
    sub +
    '<div class="xwgo"><p class="small' + (n >= XW_MIN_POOL ? ' muted' : ' strong') + '">' + (n >= XW_MIN_POOL ? n + ' מילים מתאימות.' : (n ? 'רק ' + n + ' מילים מתאימות. צריך לפחות ' + XW_MIN_POOL + '.' : 'אין מילים בבחירה הזו.')) + '</p>' +
    '<button class="btn wide" id="xw-go"' + (n >= XW_MIN_POOL ? '' : ' disabled') + '>התחל תשחץ</button></div>';
  const box = $('xw-pk');
  if (box) { const over = ST.view.scrollHeight - ST.view.clientHeight; if (over > 0) box.style.maxHeight = Math.max(88, box.offsetHeight - over - 4) + 'px'; }
  const done = () => { saveXw(); renderXWSetup(); };
  bindSeg('xw-src', v => { xwCfg.src = v; done(); });
  const pk = $('xw-pk'); if (pk) pk.querySelectorAll('button').forEach(b => { b.onclick = () => {
    const k = +b.dataset.v;
    if (k < 0) xwCfg.pereks = []; else { const at = xwCfg.pereks.indexOf(k); if (at >= 0) xwCfg.pereks.splice(at, 1); else xwCfg.pereks.push(k); xwCfg.pereks.sort((x, y) => x - y); }
    done();
  }; });
  $('xw-go').onclick = () => startXW();
  $('xw-back').onclick = goBack;
  const rs = $('xw-resume'); if (rs) rs.onclick = () => { const sv = xwLoad(); if (sv) xwOpen(sv); else { toast('הלוח השמור לא נמצא'); renderXWSetup(); } };
}
const XW_MIN_POOL = 25;
/* a personal board: first a full rectangular board with no empty cell (7 by 6, then 6 by 5, then 5 by 5), filled by
   xw-worker.js in the background so the screen never freezes; the worker script loads on the first personal board.
   When no rectangle fills within 2.5 seconds (a very narrow choice, an old browser without workers), the old 9x9
   generator takes over, as before */
function xwBusyUi(on) {
  const b = $('xw-go'); if (b) { b.disabled = on || xwPool().length < XW_MIN_POOL; b.classList.toggle('busy', on); b.textContent = on ? 'בונה לוח מלבני...' : 'התחל תשחץ'; }
  const n = $('xw-new'); if (n) n.disabled = on;
}
function startXW() {
  if (lazyWait(XWN, startXW)) return;
  const src = xwPool();
  if (src.length < XW_MIN_POOL) { toast('צריך לפחות ' + XW_MIN_POOL + ' מילים כדי לבנות לוח. כדאי להרחיב את הבחירה'); return; }
  if (xwBusy) return;
  xwBusy = true; toast('בונה לוח מלבני...'); xwBusyUi(true);
  const from = R.tab + '/' + R.sub, t0 = Date.now();
  const open = b => { xwBusy = false; xwBusyUi(false); const t = $('toast'); if (t) t.hidden = true; xwOpen(xwGame(b)); };
  const old = () => xwBuild(src, b => {
    xwBusy = false; xwBusyUi(false);
    if (R.tab + '/' + R.sub !== from) return;   /* moved elsewhere meanwhile */
    if (!b || b.words.length < 13) { toast('לא הצלחתי לבנות לוח של 13 מילים לפחות מהבחירה הזו. כדאי להרחיב אותה'); return; }
    track('xw_personal', { kind: 'old', ms: Date.now() - t0 });
    open(b);
  });
  loadScript('xw-worker.js').then(() => window.XWRect ? window.XWRect.build(xwRectPool(), { ms: 2500 }) : null, () => null).then(r => {
    if (R.tab + '/' + R.sub !== from) { xwBusy = false; xwBusyUi(false); return; }
    const b = r && xwFromRefs(r.R, r.C, r.words);
    if (!b) { toast('בונה לוח...'); old(); return; }
    track('xw_personal', { kind: r.size, ms: Date.now() - t0 });
    open(b);
  });
}
/* what each screen needs before it can be drawn */
function lazyFor(tab, sub) {
  const narrow = SC.by === 'perek' || SC.by === 'daf';
  if (tab === 'xw') return XWN;
  if (tab === 'games') return sub === 'wordle' ? ['bank'] : sub && sub.indexOf('loc') !== 0 && narrow ? ['occ'] : [];
  if (tab === 'quiz') return (quizCfg.mode === 'content' ? ['content'] : []).concat(narrow ? ['occ'] : []);
  if (tab === 'dict') return ['occ'];
  if (tab === 'learn' && sub) return narrow ? ['occ'] : [];
  return [];
}
/* the daily board: all words, the same for everyone on the same date */
/* a daily board left open past midnight: it is closed, so the day that ended keeps its record and today starts clean */
function xwStale() { return !!(ST.xg && ST.xg.type === 'xw' && ST.xg.day && ST.xg.b.anchor && !ST.xg.done && ST.xg.day !== localDay()); }
/* the archive: every edition from #1 to yesterday, to solve again; a board or word solved here does not touch the streak or lifelines.
   In the beta (the APK, or ?test&beta) it holds every edition of the file, #1 to the last, the coming ones marked with their day */
/* the beta counts by the launch schedule (#1 on LAUNCH), so each edition shows the day it is meant for, even before the launch */
function edDay(n) { const d = new Date((BETA ? LAUNCH : xwEpoch(localDay())) + 'T12:00:00'); d.setDate(d.getDate() + n - 1); return dayOf(d); }
function nowEd() { const day = localDay(); return BETA && day < LAUNCH ? 0 : xwEdition(day); }
function archMax() { return BETA && window.DAILY ? window.DAILY.boards.length : xwEdition(localDay()) - 1; }
function archTag(n) { const ed = nowEd(); return n > ed ? '<span class="atag fut">עתידי</span>' : n === ed ? '<span class="atag now">היום</span>' : ''; }
/* an edition of the archive; in the beta, today's edition and the coming ones are a look only: nothing of them is recorded */
function openArchXW(n) { if (lazyWait(XWN, openArchXW, [n])) return; const dd = edDay(n), bd = xwDailyBoard(dd); if (!bd) return; const g = xwGame(bd); g.arch = dd; g.lab = BETA && n >= nowEd(); xwOpen(g); }
function openArchWD(n) { if (lazyWait(XWN, openArchWD, [n])) return; const g = wdFor(edDay(n), true); if (!g) return; g.lab = BETA && n >= nowEd(); ST.wd = g; if (R.tab === 'games' && R.sub === 'wordle') renderWordle(); else nav('games', 'wordle'); }
function openArchive() {
  if (lazyWait(XWN, openArchive)) return;
  const ed = nowEd(), arch = S.settings.arch || { xw: {}, wd: {} }, rows = [], max = archMax();
  const order = []; if (BETA) for (let n = 1; n <= max; n++) order.push(n); else for (let n = max; n >= 1; n--) order.push(n);
  order.forEach(n => {
    const dd = edDay(n), d = window.DAILY.boards[(n - 1) % window.DAILY.boards.length];
    rows.push('<div class="arow' + (n > ed ? ' fut' : '') + '" data-n="' + n + '"><div><b>#' + n + '</b> ' + archTag(n) + ' <span class="small muted">' + dd.split('-').reverse().join('.') + '</span><br><span class="small">' + esc(d ? d.theme : '') + '</span></div>' +
      '<button class="btn line" data-axw="' + n + '">תשחץ' + (arch.xw[n] ? ' ✓' : '') + '</button><button class="btn line" data-awd="' + n + '">וורדל' + (arch.wd[n] ? ' ✓' : '') + '</button></div>');
  });
  openSheet('<div class="row between"><h2>ארכיון 📅</h2><button class="link" id="ar-close">סגירה</button></div>' +
    (BETA ? '<p class="small muted">🛠️ בטא: כל ' + max + ' המהדורות, כולל העתידיות. פתיחה של מהדורה של היום או עתידית היא לבדיקה בלבד, ולא נרשמת.</p>'
      : '<p class="small muted">מהדורות קודמות, מ-#1 ועד אתמול. פתרון כאן לא משנה את הרצף 🔥 ואת חבלי ההצלה 🛡️.</p>') +
    (rows.length ? '<div class="alist" id="ar-list">' + rows.join('') + '</div>' : '<p>עוד אין מהדורות קודמות. מחר תופיע כאן המהדורה של היום.</p>'));
  $('ar-close').onclick = closeSheet;
  if (BETA) { const r = document.querySelector('#ar-list [data-n="' + ed + '"]'); if (r) r.scrollIntoView({ block: 'center' }); }
  document.querySelectorAll('#sheet [data-axw]').forEach(b => { b.onclick = () => { closeSheet(); openArchXW(+b.dataset.axw); }; });
  document.querySelectorAll('#sheet [data-awd]').forEach(b => { b.onclick = () => { closeSheet(); openArchWD(+b.dataset.awd); }; });
}
/* 🛠️ the beta bar above an archived board or word: the previous and next edition, a jump to any number, and a look at the solution */
function labNavHtml(g, ed, p) {
  if (!BETA || !g.arch || !window.DAILY) return '';
  const max = window.DAILY.boards.length, d = edDay(ed).split('-');
  /* one short line: previous, the edition and its day, next, a number to jump to, and the solution */
  return '<div class="labnav"><button class="lnb" id="' + p + '-prev" aria-label="המהדורה הקודמת"' + (ed <= 1 ? ' disabled' : '') + '>›</button>' +
    '<span class="lnc">#' + ed + ' ' + archTag(ed) + ' <span class="muted">' + d[2] + '.' + d[1] + '</span></span>' +
    '<button class="lnb" id="' + p + '-next" aria-label="המהדורה הבאה"' + (ed >= max ? ' disabled' : '') + '>‹</button>' +
    '<input type="number" inputmode="numeric" id="' + p + '-ed" min="1" max="' + max + '" placeholder="#" aria-label="מעבר למהדורה לפי מספר"><button class="lnb go" id="' + p + '-go" aria-label="מעבר">↵</button>' +
    '<button class="link" id="' + p + '-peek">' + (g.peek ? 'הסתר פתרון' : 'הצג פתרון') + '</button></div>';
}
function bindLabNav(g, ed, open, repaint, p) {
  if (!$(p + '-prev')) return;
  const max = window.DAILY.boards.length, go = n => open(Math.min(max, Math.max(1, n)));
  $(p + '-prev').onclick = () => go(ed - 1); $(p + '-next').onclick = () => go(ed + 1);
  $(p + '-go').onclick = () => { const n = parseInt($(p + '-ed').value, 10); if (n) go(n); };
  $(p + '-ed').onkeydown = e => { if (e.key === 'Enter') $(p + '-go').click(); };
  $(p + '-peek').onclick = () => { g.peek = !g.peek; repaint(); };
}
function startXWDaily() {
  if (lazyWait(XWN, startXWDaily)) return;
  const day = localDay(), saved = xwLoad();
  if (saved && saved.day === day && saved.b.anchor) { xwOpen(saved); return; }
  const b = xwDailyBoard(day);
  if (!b) { toast('הלוח היומי לא נמצא'); return; }
  const g = xwGame(b); g.day = day; xwOpen(g);
}
function xwGame(b) {
  const N = b.R * b.C, cw = new Array(N).fill(null).map(() => []);
  b.words.forEach((w, i) => w.cells.forEach(k => cw[k].push(i)));
  /* empty cells that reach the edge through other empty cells are left out of the drawing, so the board keeps a clean stepped outline */
  const out = new Set(), st = [];
  for (let k = 0; k < N; k++) { const r = Math.floor(k / b.C), c = k % b.C; if (!b.L[k] && !b.K[k] && (r === 0 || c === 0 || r === b.R - 1 || c === b.C - 1)) { out.add(k); st.push(k); } }
  while (st.length) { const k = st.pop(), r = Math.floor(k / b.C), c = k % b.C;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= b.R || cc >= b.C) continue; const q = rr * b.C + cc; if (!b.L[q] && !b.K[q] && !out.has(q)) { out.add(q); st.push(q); } } }
  return { type: 'xw', b, cw, out, typed: new Array(N).fill(''), bad: new Set(), hint: new Set(), wrongW: new Set(), hintW: new Set(), act: 0, cur: b.words[0].cells[0], checks: 0, secs: 0, day: '', open: false, done: false };
}
function xwOpen(g) {
  ST.xg = g; xwSave();
  const inBoard = R.tab === 'xw' && R.sub === 'board';
  if (inBoard) { renderXW(); return; }
  nav('xw', 'board', R.tab === 'xw' && R.sub === 'review');
}
const XKEYS = ['קראטוןםפ', 'שדגכעיחלךף', 'זסבהנמצתץ'];
/* "איך פותרים את התשחץ?": opens by itself the first time a crossword (daily or personal) is opened, then from the ? button.
   It counts as seen once it is closed. Tests (?test) open it by themselves only when they ask for it (&xwhelp) */
const XW_HELP_KEY = 'aramit-xw-help-seen';
const XW_HELP_AUTO = !/[?&]test\b/.test(location.search) || /[?&]xwhelp\b/.test(location.search);
function xwHelpSeen() { try { return localStorage.getItem(XW_HELP_KEY) === '1'; } catch (x) { return true; } }
function openXWHelp() {
  const ar = t => '<i class="xh-a" aria-hidden="true">' + XARROW[t] + '</i>';
  openSheet('<div class="xhelpbox"><h2>איך פותרים את התשחץ?</h2><ul class="xhl">' +
    '<li><b>החצים והכיוון.</b> ההגדרות נמצאות בתוך משבצות הלוח, בעברית. החץ מראה מאיפה מתחילה התשובה ולאיזה כיוון כותבים: ' + ar('l') + ' שמאלה, ' + ar('d') + ' למטה, ' + ar('dl') + ' ' + ar('ld') + ' מתחילים במשבצת הסמוכה ופונים. <b>התשובות הן מילים בארמית ומושגים מעולם התורה.</b></li>' +
    '<li><b>משבצת מפוצלת ומסגרת זהב.</b> במשבצת עם שתי הגדרות, לחיצה בוחרת אחת מהן. מסגרת הזהב מסמנת איזו הגדרה פעילה כרגע.</li>' +
    '<li><b>ביטויים וראשי תיבות.</b> <span class="xh-k">(3, 4)</span> מציין ביטוי בן שתי מילים: כותבים ברצף, בלי רווח. <span class="xh-k">(ר"ת)</span> מציין ראשי תיבות: כותבים את האותיות בלי גרשיים, למשל <span class="xh-k">שס</span> או <span class="xh-k">רמבם</span>.</li>' +
    '<li><b>מילים פתורות ורמזים.</b> מילה שנפתרה נצבעת וננעלת, כדי לעזור בהצטלבויות. נתקעתם? כפתור הרמז 💡 חושף אות אחת במילה הפעילה (שלושה רמזים לכל לוח), ו"ניקוי מילה" מוחק אותה כדי להתחיל מחדש.</li>' +
    '</ul><button class="btn wide" id="xh-ok">הבנתי, בואו נתחיל</button></div>');
  const sh = $('sheet'), done = () => { try { localStorage.setItem(XW_HELP_KEY, '1'); } catch (x) { /* storage blocked */ } closeSheet(); };
  $('xh-ok').onclick = done;
  if (sh) sh.onclick = ev => { if (ev.target.id === 'sheet') done(); };
}
const XARROW = {
  l: '<svg viewBox="0 0 10 10"><path d="M9 5H1.5M4.5 2L1.5 5l3 3"/></svg>',
  d: '<svg viewBox="0 0 10 10"><path d="M5 1v7.5M2 5.5l3 3 3-3"/></svg>',
  dl: '<svg viewBox="0 0 10 10"><path d="M8 1v6H1.5M4 4.5L1.5 7 4 9.5"/></svg>',
  ld: '<svg viewBox="0 0 10 10"><path d="M9 2H3v6.5M.5 6L3 8.5 5.5 6"/></svg>'
};
const XNAME = { l: 'משמאל', d: 'מתחת', dl: 'מתחת ושמאלה', ld: 'משמאל ולמטה' };
/* the letter to show in a cell for a word: its own spelling, so a final letter appears where the word ends */
function xwShow(w, k) { return xwLetters(w.e.w).charAt(w.cells.indexOf(k)); }
/* three kinds of cell: a letter of at least one word, a definition, and a void that belongs to nothing.
   The grid is laid out right to left, so column 0 is drawn first and stands on the right */
function xwSolved(w) { return w.cells.every(k => ST.xg.typed[k] && norm(ST.xg.typed[k]) === ST.xg.b.L[k]); }
/* a definition cell shows each definition in its own block. The arrow of each definition sits outside it, in the first letter
   of its word, on the edge that touches the definition: the right edge for a word that starts on the left (straight left, or
   left and then down), the top edge for a word that starts below (straight down, or down and then left).
   In a shared cell the left-starting word is always on top */
const XLEFT = { l: 1, ld: 1 };
function xwBoardHtml() {
  /* no frame marks the anchor word on the board (removed 24.11.2026 at the owner's request) */
  const g = ST.xg, b = g.b, act = b.words[g.act], on = new Set(act.cells);
  const arrows = {};
  b.K.forEach(ks => { if (ks) ks.forEach(x => { const f = b.words[x.wi].cells[0]; (arrows[f] = arrows[f] || []).push(x); }); });
  let h = '';
  for (let r = 0; r < b.R; r++) for (let c = 0; c < b.C; c++) {
    const k = r * b.C + c;
    if (b.L[k]) {
      const cls = 'cell-letter' + (on.has(k) ? ' on' : '') + (k === g.cur ? ' cur' : '') + (g.bad.has(k) ? ' bad' : '') + (g.hint.has(k) ? ' hint' : '') + (xwLocked(k) ? ' lock' : '') +
        (g.cw[k].some(i => xwSolved(b.words[i])) ? ' sol' : '');   /* a letter of a solved word: a slightly different shade */
      const pk = g.peek && !g.typed[k];   /* 🛠️ beta: the solution shows faint in the cells not filled */
      const ar = (arrows[k] || []).map(x => '<i class="xa xa-' + x.t + (xwSolved(b.words[x.wi]) ? ' done' : '') + '" data-wi="' + x.wi + '" aria-hidden="true">' + XARROW[x.t] + '</i>').join('');
      h += '<button class="' + cls + (pk ? ' peek' : '') + '" data-k="' + k + '" aria-label="משבצת">' + esc(pk ? b.L[k] : norm(g.typed[k])) + ar + '</button>';
    } else if (b.K[k]) {
      const ks = b.K[k].slice().sort((x, y) => (XLEFT[y.t] ? 1 : 0) - (XLEFT[x.t] ? 1 : 0)), two = ks.length > 1;
      h += '<button class="cell-clue' + (ks.some(x => x.wi === g.act) ? ' kon' : '') + (two ? ' two' : '') + (ks.every(x => xwSolved(b.words[x.wi])) ? ' solved' : '') + '" data-k="' + k + '">' +
        ks.map(x => {
          const side = XLEFT[x.t] ? 'side-l' : 'side-b';
          return '<span class="xq ' + side + (x.wi === g.act ? ' sel' : '') + (xwSolved(b.words[x.wi]) ? ' done' : '') + '" data-t="' + x.t + '" data-wi="' + x.wi + '">' +
            '<em>' + esc(xwClue(b.words[x.wi].e)) + '</em></span>';
        }).join('') + '</button>';
    } else h += '<div class="' + (g.out.has(k) ? 'cell-out' : 'cell-void') + '" data-k="' + k + '"></div>';
  }
  return h;
}
/* each definition gets the largest type that shows it whole in its block, so no word is ever cut. When even the smallest
   readable size is too large, the cell takes a shorter form of the definition: first without what is in brackets, then
   only its first part (up to a comma, semicolon or colon); the bar above the board always shows it in full.
   The sizes and the forms chosen are kept for the board */
function xwShorter(t) {
  const m = /\s\((\d+(?:, \d+)*)\)$/.exec(t), tail = m ? m[0] : '', body = m ? t.slice(0, -tail.length) : t, out = [t];
  const a = noParens(body); if (a && a !== body) out.push(a + tail);
  const k = a.search(/[,;:]/); if (k >= 6) out.push(a.slice(0, k).trim() + tail);
  /* the mark (ר"ת) goes only when nothing else fits a narrow cell */
  const bare = a.replace(/\s*\(ר["״]ת\)/g, '').trim(); if (bare && bare !== a) out.push(bare + tail);
  return out;
}
function xwFitClues() {
  const g = ST.xg, grid = $('xw-grid'); if (!grid) return;
  const key = grid.offsetWidth + 'x' + grid.offsetHeight; if (g._fsAt !== key) { g._fs = {}; g._fsAt = key; }
  grid.querySelectorAll('.xq').forEach(q => {
    /* a solved definition keeps room for its ✓, so its size is worked out again once it is solved */
    const em = q.firstChild, wi = q.dataset.wi + (q.classList.contains('done') ? 'd' : ''), two = q.parentNode.classList.contains('two');
    const kept = g._fs[wi];
    if (kept) { em.textContent = kept.t; em.style.fontSize = kept.fs + 'px'; if (kept.clip) em.classList.add('clip'); return; }
    const cs = getComputedStyle(q), H = q.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const fits = () => em.getBoundingClientRect().height <= H + 0.5 && em.scrollWidth <= em.clientWidth + 0.5;
    const forms = xwShorter(em.textContent);
    /* measured in bold, the weight of a selected definition, so the size holds whether or not it is selected */
    em.style.fontWeight = '700';
    let got = null;
    /* the full text down to 7px, then the shorter forms down to 7px, then everything down to 6px */
    for (const min of [7, 6]) {
      for (const t of forms) {
        em.textContent = t;
        for (let fs = two ? 9.5 : 10.5; fs >= min; fs -= 0.5) { em.style.fontSize = fs + 'px'; if (fits()) { got = { t, fs }; break; } }
        if (got) break;
      }
      if (got) break;
    }
    if (!got) { got = { t: forms[forms.length - 1], fs: 6, clip: true }; em.textContent = got.t; em.style.fontSize = '6px'; em.classList.add('clip'); }
    em.style.fontWeight = '';
    g._fs[wi] = got;
  });
}
/* the live bar over the board: the definition of the selected word with its length (or the lengths of a phrase),
   and beside it the word as typed so far, one element for each letter so the order never flips, with a gap between the
   words of a phrase. A letter marked wrong by a check is red here too, and a tap on a letter moves the cursor to its cell */
function xwBarHtml() {
  const g = ST.xg, w = g.b.words[g.act], e = w.e;
  if (g.done) return '<p class="xdef xsolved"><b>' + (g.day && g.b.anchor ? 'פתרת את התשחץ היומי #' + g.b.ed : 'פתרת את הלוח') + ' ✓</b> <span>' + mmss(g.secs || 0) + '</span></p><button class="btn" id="xw-sum">לסיכום</button>';
  const parts = e.w.trim().split(/\s+/).map(x => xwLetters(x).length).filter(n => n > 0);
  const def = xwOv(e) || (e.cn || e.xe ? e.s : gloss(e)), len = parts.length > 1 ? parts.join(', ') : w.cells.length + ' אותיות';
  let live = '', at = 0, gaps = new Set(); parts.slice(0, -1).forEach(n => { at += n; gaps.add(at); });
  w.cells.forEach((k, i) => {
    if (gaps.has(i)) live += '<i class="gap"></i>';
    const ch = g.typed[k] ? (i === w.cells.length - 1 || gaps.has(i + 1) ? xwFinal(norm(g.typed[k])) : norm(g.typed[k])) : '_';
    live += '<i data-k="' + k + '" class="' + (k === g.cur ? 'cur ' : '') + (g.bad.has(k) ? 'bad ' : '') + (g.hint.has(k) ? 'hint' : '') + '">' + esc(ch) + '</i>';
  });
  /* a word solved shows a green ✓ beside its letters; a word with a letter marked wrong by a check shows a red ✗ */
  const full = w.cells.every(k => g.typed[k]);
  const mark = xwSolved(w) ? '<b class="xmark ok" aria-label="המילה נכונה">✓</b>' : full || w.cells.some(k => g.bad.has(k)) ? '<b class="xmark no" aria-label="יש במילה טעות">✗</b>' : '';
  return '<p class="xdef"><b>' + esc(def) + '</b> <span>(' + len + ')</span></p><div class="xlive" dir="rtl">' + live + '</div>' + mark;
}
/* the pin: an open lock while typing moves on, a closed one while the cursor stays in its cell */
const XLOCK = {
  off: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V5.5a4 4 0 0 1 8 0V7"/></svg>',
  on: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
};
function xwFinal(ch) { return ({ 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' })[ch] || ch; }
/* the bar keeps one height: a long definition takes smaller type until it fits its two lines, so the board never moves */
function xwFitBar() {
  const p = ST.view.querySelector('#xw-bar .xdef'); if (!p) return;
  p.style.fontSize = '';
  let size = 0.98;
  while (p.scrollHeight > p.clientHeight + 1 && size > 0.62) { size -= 0.04; p.style.fontSize = size.toFixed(2) + 'rem'; }
}
function renderXW() {
  const g = ST.xg;
  ST.view.className = 'panel tight';
  ST.view.innerHTML = '<div class="xw"><div class="row between"><span class="small muted"><b class="xtime" id="xw-time">' + mmss(g.secs || 0) + '</b> <span id="xw-left"></span></span><span>' + (g.day || g.arch ? '' : '<button class="link" id="xw-new">לוח חדש</button> ') + '<button class="xhelp" id="xw-help" aria-label="איך משחקים?">?</button><button class="link" id="quit">חזרה</button></span></div>' +
    labNavHtml(g, g.b.ed, 'lx') +
    '<div class="xbar" id="xw-bar" aria-live="polite"></div>' +
    '<div class="xgrid" id="xw-grid" dir="rtl" style="grid-template-columns:repeat(' + g.b.C + ',1fr);grid-template-rows:repeat(' + g.b.R + ',1fr)"></div>' +
    '<div class="xlow">' +
    '<div class="xtools"><button id="xw-hint"></button><button id="xw-clear">ניקוי מילה 🗑️</button><button class="pin" id="xw-pin"></button></div>' +
    '<div class="xkb" dir="ltr">' + XKEYS.map((row, i) => '<div class="r' + i + '">' + row.split('').map(ch => '<button data-ch="' + ch + '">' + ch + '</button>').join('') +
      (i === 0 ? '<button class="del" id="xw-del" aria-label="מחיקה">' + DEL_SVG + '</button>' : '') + '</div>').join('') + '</div></div></div>';
  xwPaint(); xwFit(); xwFitClues(); setTimeout(xwRefit, 350);
  bindLabNav(g, g.b.ed, openArchXW, () => { renderXW(); }, 'lx');
  $('xw-help').onclick = openXWHelp;
  if (XW_HELP_AUTO && !xwHelpSeen() && !sheetOpen) setTimeout(() => { if (R.tab === 'xw' && R.sub === 'board' && !sheetOpen) openXWHelp(); }, 250);
  g.open = true; xwSave();
  xwClock();
  /* a solved board offers its summary in the bar, so the button above goes back; a full board not yet right opens the summary */
  $('quit').onclick = () => { if (!g.done && g.b.L.every((ch, k) => !ch || g.typed[k])) xwSummary(); else goBack(); };
  /* a personal board offers a new one; the daily board does not lead away to a personal one */
  if ($('xw-new')) $('xw-new').onclick = () => startXW();
  $('xw-bar').onclick = ev => { if (ev.target.closest('#xw-sum')) { xwSummary(); return; } const t = ev.target.closest('[data-k]'); if (!t || ST.xg.done) return; ST.xg.cur = +t.dataset.k; xwPaint(); xwSave(); };
  $('xw-grid').onclick = ev => { const t = ev.target.closest('[data-k]'), q = ev.target.closest('.xq'); if (t) xwTap(+t.dataset.k, q ? +q.dataset.wi : undefined); };
  ST.view.querySelectorAll('.xkb [data-ch]').forEach(b => { b.onclick = () => xwType(b.dataset.ch); });
  $('xw-del').onclick = xwDel;
  $('xw-hint').onclick = xwHint;
  $('xw-clear').onclick = xwClear;
  /* the pin belongs to the board in hand and is not kept: every board opens with it off */
  $('xw-pin').onclick = () => { g.pin = !g.pin; xwPaint(); };
}
/* the board takes whatever height is left once the definition bar and the keyboard are in place */
/* the board takes the width; the block under it (definition bar, tools, keyboard) sits on the bottom edge with no gaps,
   and whatever height is left over makes the keys taller, from 44 up to 58 pixels */
function xwFit(depth) {
  const grid = $('xw-grid'); if (!grid) return;
  /* keep the keyboard just above the tab bar, whatever height the bar has on this device */
  const tabs = document.getElementById('tabs'); if (tabs && !depth) ST.view.style.paddingBottom = (tabs.offsetHeight + 4) + 'px';
  const kb = ST.view.querySelector('.xkb'); kb.style.setProperty('--kh', '44px');
  const box = ST.view.querySelector('.xw'), cs = getComputedStyle(ST.view), gap = parseFloat(getComputedStyle(box).rowGap) || 0;
  let others = 0, n = 0;
  for (const el of box.children) { if (el !== grid) { others += el.offsetHeight; n++; } }
  const free = ST.view.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - others - gap * n - 2;
  /* square cells: as large as the width and the free height allow for this board's columns and rows */
  const R = ST.xg.b.R, C = ST.xg.b.C, wide = ST.view.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const cell = Math.max(24, Math.min(wide / C, free / R, 72));
  grid.style.width = Math.floor(cell * C) + 'px'; grid.style.height = Math.floor(cell * R) + 'px';
  const spare = free - Math.floor(cell * R);
  if (spare > 0) kb.style.setProperty('--kh', Math.min(58, 44 + spare / 3).toFixed(1) + 'px');
  /* the keyboard must end above the tab bar. The board is centred in its column, so making it smaller does not lift the
     keyboard: the column itself is cut by the overlap (on some phones the page reaches under the tab bar), and the board
     is sized again for the room that is left */
  if (tabs && !depth) {
    const over = kb.getBoundingClientRect().bottom - tabs.getBoundingClientRect().top + 4;
    if (over > 0) { ST.view.style.paddingBottom = (parseFloat(ST.view.style.paddingBottom) + over) + 'px'; xwFit(1); }
  }
}
/* fonts that arrive late, the address bar or the system bar of the phone change the height after the first layout */
function xwRefit() { if (R.tab === 'xw' && R.sub === 'board' && ST.xg && ST.xg.type === 'xw' && $('xw-grid')) { xwFit(); xwFitClues(); } }
if (document.fonts && document.fonts.ready) document.fonts.ready.then(xwRefit);
if (window.visualViewport) window.visualViewport.addEventListener('resize', xwRefit);
/* the tab bar can grow after the board is laid out (the system bar of the phone, a font that arrives late) */
if (window.ResizeObserver) {
  const ro = new ResizeObserver(() => xwRefit());
  const tb = document.getElementById('tabs'); if (tb) ro.observe(tb, { box: 'border-box' });
  /* the page itself changes height after a reload (the address bar settling, the update just applied): the board is laid out again */
  const px = document.getElementById('p-xw'); if (px) ro.observe(px, { box: 'border-box' });
}
window.addEventListener('load', () => { xwRefit(); setTimeout(xwRefit, 800); });
window.addEventListener('resize', () => { if (R.tab === 'xw' && R.sub === 'board' && ST.xg && ST.xg.type === 'xw') { xwFit(); xwFitClues(); } });
function xwPaint() {
  const g = ST.xg, left = g.b.L.reduce((n, ch, k) => n + (ch && !g.typed[k] ? 1 : 0), 0);
  $('xw-grid').innerHTML = xwBoardHtml();
  $('xw-bar').innerHTML = xwBarHtml(); xwFitBar();
  const hl = XW_HINTS - g.hint.size, hb = $('xw-hint');
  hb.textContent = 'רמז (' + hl + ') 💡'; hb.disabled = hl <= 0 || g.done;
  const pb = $('xw-pin'), pin = !!g.pin;
  pb.innerHTML = pin ? XLOCK.on : XLOCK.off; pb.classList.toggle('on', pin); pb.setAttribute('aria-pressed', String(pin));
  pb.setAttribute('aria-label', pin ? 'הסמן נעול במשבצת: הקלדה מחליפה את האות בלי להתקדם' : 'נעילת הסמן במשבצת');
  xwFitClues();
  /* the top line says what this board is first (the daily crossword and its number, or a personal board), then how much is
     left, and the theme last, where a narrow screen may cut it */
  const daily = g.arch || (g.day && g.b.anchor);
  $('xw-left').innerHTML = '<b class="xname">' + (daily ? 'התשחץ היומי #' + g.b.ed + (g.arch ? ' (ארכיון)' : '') : 'לוח אישי') + '</b> · ' +
    esc((left ? 'נשארו ' + left : 'הלוח מלא') + (daily && g.b.theme ? ', ' + g.b.theme : ', ' + g.b.words.length + ' מילים'));
  /* the button beside it goes back while the board is open, and to the summary once every cell is filled */
  const qb = $('quit'); if (qb) qb.textContent = !g.done && g.b.L.every((ch, k) => !ch || g.typed[k]) ? 'סיכום' : 'חזרה';
  /* anything that changed height on this paint (a line of text that wrapped) must not push the keyboard under the tab bar */
  const kb = ST.view.querySelector('.xkb'), tabs = document.getElementById('tabs'), grid = $('xw-grid');
  if (kb && tabs && grid && grid.style.width && kb.getBoundingClientRect().bottom > tabs.getBoundingClientRect().top + 1) xwFit();
}
/* a tap on a definition selects the word of the half that was touched; a tap elsewhere in the cell moves between its words */
function xwTap(k, wi) {
  if (ST.xg) ST.xg._tp = null;   /* a tap, a deletion or a cleared word starts the typing point again from the cursor */
  const g = ST.xg, b = g.b;
  if (b.K[k]) {
    const ks = b.K[k], i = ks.findIndex(x => x.wi === g.act);
    g.act = wi !== undefined && ks.some(x => x.wi === wi) ? wi : ks[i >= 0 && ks.length > 1 ? (i + 1) % ks.length : 0].wi;
    const w = b.words[g.act]; const empty = w.cells.find(c => !g.typed[c]); g.cur = empty !== undefined ? empty : w.cells[0];
  } else if (b.L[k]) {
    const ws = g.cw[k];
    if (k === g.cur && ws.length > 1) g.act = ws.find(i => i !== g.act);   /* a second tap on a crossing turns the direction */
    else if (ws.indexOf(g.act) < 0) { const same = ws.find(i => b.words[i].h === b.words[g.act].h); g.act = same !== undefined ? same : ws[0]; }
    g.cur = k;
  }
  xwPaint(); xwSave();
}
function xwStep(dir) {
  const w = ST.xg.b.words[ST.xg.act], i = w.cells.indexOf(ST.xg.cur), j = i + dir;
  if (j >= 0 && j < w.cells.length) ST.xg.cur = w.cells[j];
}
function xwType(ch) {
  ch = norm(ch);   /* ך ם ן ף ץ are taken as כ מ נ פ צ: the board shows plain letters, the bar the word as written */
  if (xwStale()) { render(false); return; }
  const g = ST.xg, w = g.b.words[g.act];
  if (g.done) return;
  /* with the pin on, the letter replaces the one under the cursor and the cursor stays */
  if (g.pin) {
    if (xwLocked(g.cur)) { toast('המשבצת נעולה: היא שייכת למילה שנפתרה או לרמז'); return; }
    g.typed[g.cur] = ch; g.bad.delete(g.cur); xwNoteWrong(g.cur); if (xwSolved(w)) xwNextOpen(); xwPaint(); xwSave(); xwDone(); return;
  }
  /* the typing point: the cell after the last letter typed in this word, or the cursor when it was moved since.
     A locked letter there (from a crossing word solved, or a hint) that matches the key is taken as typed, so typing the whole
     word, letters already in place included, puts every letter in its own cell. A key that does not match it skips the locked
     letters and goes into the next free cell, as before, for typing only the missing letters */
  /* when the cursor was put at the first free cell after locked letters (a tap on the definition, or the move to the next
     open word), the typing point is the start of the word, so a key for the first locked letter is taken too */
  const ci = w.cells.indexOf(g.cur), fresh = ci > 0 && w.cells.slice(0, ci).every(xwLocked) ? 0 : ci;
  const tp = g._tp && g._tp.act === g.act && g._tp.cur === g.cur ? g._tp.i : fresh;
  if (tp >= 0 && tp < w.cells.length && xwLocked(w.cells[tp]) && g.b.L[w.cells[tp]] === ch) {
    const nx = w.cells.findIndex((c, x) => x > tp && !g.typed[c] && !xwLocked(c));
    if (nx >= 0) g.cur = w.cells[nx];
    g._tp = { act: g.act, cur: g.cur, i: tp + 1 };
    xwPaint(); xwSave(); return;
  }
  /* the letter goes into the first free cell from the typing point on. When there is none from there to the end (the free
     cells of the word lie before it), it goes into the cursor's cell, or else the first free cell of the word. Only a word with
     no free cell at all is solved, and only then does the key do nothing */
  let i = tp >= 0 && tp < w.cells.length ? tp : Math.max(0, w.cells.indexOf(g.cur));
  while (i < w.cells.length && xwLocked(w.cells[i])) i++;
  if (i >= w.cells.length) { const c = w.cells.indexOf(g.cur); i = c >= 0 && !xwLocked(g.cur) ? c : w.cells.findIndex(x => !xwLocked(x)); }
  if (i < 0) { toast('המילה הזו כבר נפתרה'); return; }
  const k = w.cells[i];
  g.typed[k] = ch; g.bad.delete(k); xwNoteWrong(k);
  /* on to the next empty cell of the word, passing over letters already in place and locked cells */
  const empty = j => !g.typed[w.cells[j]] && !xwLocked(w.cells[j]);
  let j = i + 1; while (j < w.cells.length && !empty(j)) j++;
  if (j >= w.cells.length) { j = w.cells.findIndex((c, x) => x !== i && empty(x)); if (j < 0) j = Math.min(i + 1, w.cells.length - 1); }
  g.cur = w.cells[j];
  g._tp = { act: g.act, cur: g.cur, i: i + 1 };
  /* a word just solved: on to the next open word of the board, at its first empty cell */
  if (xwSolved(w)) xwNextOpen();
  xwPaint(); xwSave(); xwDone();
}
/* a word filled in to its last cell with a wrong letter counts as a mistake of the board, for the summary and its review */
function xwNoteWrong(k) { const g = ST.xg; g.cw[k].forEach(i => { const w = g.b.words[i]; if (w.cells.every(c => g.typed[c]) && !xwSolved(w)) g.wrongW.add(i); }); }
function xwNextOpen() {
  const g = ST.xg, ws = g.b.words, n = ws.length;
  for (let d = 1; d < n; d++) {
    const i = (g.act + d) % n, w = ws[i];
    if (xwSolved(w)) continue;
    const k = w.cells.find(c => !g.typed[c] && !xwLocked(c));
    g.act = i; g.cur = k !== undefined ? k : w.cells.find(c => !xwLocked(c)) || w.cells[0]; return true;
  }
  return false;
}
/* ⌫ deletes the letter under the cursor; on an empty cell it goes back and deletes the letter before.
   Letters a hint revealed or that belong to a crossing word already solved are kept and passed over, as typing passes over them */
/* a cell is locked when a hint revealed it or when any word through it is solved */
function xwLocked(k) { const g = ST.xg; return g.hint.has(k) || g.cw[k].some(i => xwSolved(g.b.words[i])); }
function xwKeep(k) { return xwLocked(k); }
function xwDel() {
  if (ST.xg) ST.xg._tp = null;   /* a tap, a deletion or a cleared word starts the typing point again from the cursor */
  const g = ST.xg, k = g.cur;
  if (g.done) return;
  if (g.typed[k] && !xwKeep(k)) { g.typed[k] = ''; g.bad.delete(k); xwPaint(); xwSave(); return; }
  const w = g.b.words[g.act];
  let j = w.cells.indexOf(k) - 1;
  while (j >= 0 && xwKeep(w.cells[j])) j--;
  if (j >= 0) { const p = w.cells[j]; g.cur = p; g.typed[p] = ''; g.bad.delete(p); }
  xwPaint(); xwSave();
}
/* clear the letters of the active word, except those a hint revealed and those shared with a crossing word already solved */
function xwClear() {
  if (ST.xg) ST.xg._tp = null;   /* a tap, a deletion or a cleared word starts the typing point again from the cursor */
  const g = ST.xg; if (g.done) return;
  const w = g.b.words[g.act];
  w.cells.forEach(k => { if (!xwKeep(k)) { g.typed[k] = ''; g.bad.delete(k); } });
  const free = w.cells.find(k => !g.hint.has(k)); g.cur = free !== undefined ? free : w.cells[0];
  xwPaint(); xwSave();
}
function xwHint() {
  if (xwStale()) { render(false); return; }
  if (ST.xg.done) return;
  if (ST.xg.hint.size >= XW_HINTS) { toast('נוצלו כל ' + XW_HINTS + ' הרמזים של הלוח'); return; }
  const g = ST.xg, w = g.b.words[g.act], ok = k => g.typed[k] && norm(g.typed[k]) === g.b.L[k];
  const k = !ok(g.cur) && w.cells.indexOf(g.cur) >= 0 ? g.cur : w.cells.find(c => !ok(c));
  if (k === undefined) { toast('המילה הזו כבר נכונה'); return; }
  g.typed[k] = xwShow(w, k); g.hint.add(k); g.bad.delete(k); g.hintW.add(g.act);
  xwPaint(); xwSave(); xwDone();
}
function xwDone() {
  const g = ST.xg, b = g.b;
  const full = b.L.every((ch, k) => !ch || g.typed[k]);
  if (!full) return;
  /* a full board with a mistake is not checked as a whole: nothing turns red, and the ✗ beside a word in the bar is what
     shows where to look. The board ends when every letter is right */
  if (!b.L.every((ch, k) => !ch || norm(g.typed[k]) === ch)) return;
  if (!g.done) track('crossword_complete', { type: g.arch ? 'archive' : g.day ? 'daily' : 'personal', seconds: g.secs || 0, hints: g.hint.size });
  g.done = true; xwStopClock();
  g.mistakes = [...new Set([...g.wrongW, ...g.hintW])].map(i => ({ e: b.words[i].e, picked: null }));
  if (g.arch) { if (!g.lab) { const a = S.settings.arch || { xw: {}, wd: {} }; a.xw[g.b.ed] = g.secs || 1; S.settings.arch = a; save(); } }
  else if (g.day) {
    S.settings.xwDaily = { day: g.day, secs: g.secs, hints: g.hint.size, checks: g.checks || 0 };
    const days = (S.settings.xwDays || []).filter(d => d !== g.day).concat([g.day]).sort().slice(-400);
    S.settings.xwDays = days; save();
  }
  /* the solved board stays in view; the bar says so and offers the summary, which no longer opens by itself */
  if (!g.arch) xwForget(); xwPaint();
}
function renderXWReview() {
  const ms = ST.xg.mistakes || [];
  ST.view.innerHTML = '<div class="row between"><h2>הטעויות בלוח</h2><button class="link" id="back">חזרה</button></div>' + reviewHtml(ms) +
    '<button class="btn wide" id="drill">חידון קצר על הטעויות האלה</button>';
  $('back').onclick = goBack;
  $('drill').onclick = () => { const es = ms.map(m => m.e).filter(e => !e.xe); if (es.length) drillOn(es); else toast('בטעויות האלה אין מילים מהמילון לחידון'); };
}
/* the summary: time, hints, every word with its meaning, and a result to share */
function nWrongCells(n) { return n === 1 ? 'משבצת אחת שגויה' : n + ' משבצות שגויות'; }
function xwWrong() { const g = ST.xg; return g.b.L.reduce((n, ch, k) => n + (ch && g.typed[k] && norm(g.typed[k]) !== ch ? 1 : 0), 0); }
/* "בלי רמזים ובדיקות", or the two counts in brackets */
function xwAids(h) { return h ? ' (רמזים: ' + h + ')' : ', בלי רמזים'; }
/* the result of the daily board, the same words the summary shares, from the record kept for the day */
/* the result to share, short and with nothing of the solution: the game and its edition, the time, the hints,
   the streak and the address. Each line opens with a right-to-left mark, so it reads right in a chat */
function shareLines(lines) { const link = APP_URL || (NATIVE ? '' : window.location.origin + window.location.pathname); return lines.map(x => '\u200f' + x).join('\n') + (link ? '\n' + link : ''); }
function dailyShareText(b, secs, hints, checks, day) {
  return shareLines(['פשיטא: הארמית של מסכת שבת', '🧩 תשחץ יומי #' + b.ed, '⏱️ זמן: ' + mmss(secs || 0), '💡 ' + (hints ? 'רמזים: ' + hints : 'בלי רמזים'), '🔥 רצף: ' + xwStreak()]);
}
function xwShareText() {
  const g = ST.xg, h = g.hint.size, wrong = g.done ? 0 : xwWrong();
  if (g.done && g.day && g.b.anchor && !g.arch) return dailyShareText(g.b, g.secs, h, 0, g.day);
  const link = APP_URL || (NATIVE ? '' : window.location.origin + window.location.pathname);
  return 'פשיטא: הארמית של מסכת שבת\n' + (g.day ? 'תשחץ יומי' + (g.b.anchor ? ' #' + g.b.ed + ': ' + g.b.theme : '') + ', ' + g.day.split('-').reverse().join('.') : 'תשחץ') + '\n' +
    (g.done ? 'פתרתי ' : 'מילאתי ') + g.b.words.length + ' מילים ב-' + mmss(g.secs || 0) + xwAids(h, g.checks || 0) +
    (wrong ? ', ' + nWrongCells(wrong) : '') + (link ? '\n' + link : '');
}
/* under each entry: the full explanation of a concept, and where in the tractate it is found */
function xwMore(e) {
  if (e.cn) return '<br><span class="small">' + esc(e.m0) + '</span><br><span class="src">' + esc(cSource(e)) + '</span>';
  if (e.xe) return '<br><span class="small">' + esc(e.m0) + '</span>';
  return '<br><span class="src">' + esc(countLine(e) + ', לראשונה ב' + dafName(e.a)) + '</span>';
}
function xwSummary() {
  const g = ST.xg, wrong = g.done ? 0 : xwWrong(), h = g.hint.size;
  const words = g.b.words.slice().sort((x, y) => x.clue - y.clue);
  openSheet('<h2>' + (g.done ? (g.arch ? 'פתרת את מהדורה #' + g.b.ed + ' מהארכיון' : g.day ? 'פתרת את התשחץ היומי' + (g.b.anchor ? ' #' + g.b.ed : '') : 'פתרת את הלוח') : 'הלוח מלא') + '</h2>' +
    '<div class="stats"><div class="stat"><b>' + mmss(g.secs || 0) + '</b><span>זמן</span></div><div class="stat"><b>' + g.b.words.length + '</b><span>מילים</span></div><div class="stat"><b>' + h + '</b><span>רמזים</span></div></div>' +
    (wrong ? '<p class="small strong">יש בלוח ' + nWrongCells(wrong) + '. בדיקת שגיאות תסמן ' + (wrong === 1 ? 'אותה' : 'אותן') + '.</p>' : '') +
    (g.b.anchor ? '<p class="small muted">' + esc('#' + g.b.ed + ', ' + g.b.theme) + '</p>' : '') +
    (g.done && g.day && g.b.anchor && !g.arch ? streakLineHtml(xwStreakInfo(), 'הרצף בתשחץ היומי') : '') +
    '<div class="review xwlist">' + words.map(w => '<div' + (g.b.anchor && w === g.b.words[0] ? ' class="anc"' : '') + '><b>' + esc(w.e.w) + '</b> <span>' + esc(xwDef(w.e)) + '</span>' + xwMore(w.e) + '</div>').join('') + '</div>' +
    (g.done ? '<button class="btn wide" id="xs-new">לוח חדש</button>' : '<button class="btn wide" id="xs-back">חזרה ללוח</button>') +
    '<button class="btn line wide" id="xs-share">שתף תוצאה</button>' +
    '<button class="link" id="xs-close">' + (g.done ? 'סגירה' : 'יציאה מהלוח') + '</button>');
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('xs-new', () => { closeSheet(); startXW(); });
  on('xs-back', closeSheet);
  on('xs-share', () => copyText(xwShareText()));
  on('xs-close', () => { closeSheet(); if (!g.done) goBack(); });
}
/* copy to the clipboard, with the older route for web views that refuse the newer one */
function copyText(text) {
  const old = () => {
    const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    t.remove(); toast(ok ? 'התוצאה הועתקה. אפשר להדביק אותה בכל הודעה' : 'לא הצלחתי להעתיק במכשיר הזה');
  };
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(() => toast('התוצאה הועתקה. אפשר להדביק אותה בכל הודעה'), old); return; } } catch (e) { /* fall through */ }
  old();
}
/* the quiet clock: it runs only while the board is on screen and the app is in front, and stops once the board is solved */
let xwTick = null;
function xwStopClock() { if (xwTick) { clearInterval(xwTick); xwTick = null; } }
function xwClock() {
  xwStopClock();
  const g = ST.xg; if (g.done) return;
  xwTick = setInterval(() => {
    if (document.hidden || sheetOpen || !(R.tab === 'xw' && R.sub === 'board') || ST.xg !== g || g.done) return;
    g.secs = (g.secs || 0) + 1;
    const el = $('xw-time'); if (el) el.textContent = mmss(g.secs);
    if (g.secs % 5 === 0) xwSave();
  }, 1000);
  timers.push(xwTick);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (ST.xg && ST.xg.type === 'xw' && !ST.xg.done) xwSave(); return; }
  /* back in front: a new day redraws the screen, and the web version asks whether a newer version was published */
  if (drawn[R.tab] && drawn[R.tab].day !== localDay() && !sheetOpen) render(false);
  if (!NATIVE && 'serviceWorker' in navigator && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(r => { if (r) r.update(); }).catch(() => { /* offline */ });
});
/* a physical keyboard (1.7). A Hebrew letter is taken as typed; with the keyboard on English the key is read by its place,
   as the standard Hebrew layout puts it (E is ק, T is א), so no switching is needed on a computer */
const KEY_HE = { KeyE: 'ק', KeyR: 'ר', KeyT: 'א', KeyY: 'ט', KeyU: 'ו', KeyI: 'ן', KeyO: 'ם', KeyP: 'פ', KeyA: 'ש', KeyS: 'ד', KeyD: 'ג', KeyF: 'כ',
  KeyG: 'ע', KeyH: 'י', KeyJ: 'ח', KeyK: 'ל', KeyL: 'ך', Semicolon: 'ף', KeyZ: 'ז', KeyX: 'ס', KeyC: 'ב', KeyV: 'ה', KeyB: 'נ', KeyN: 'מ', KeyM: 'צ', Comma: 'ת', Period: 'ץ' };
function keyLetter(ev) {
  if (/^[א-ת]$/.test(ev.key)) return ev.key;
  return /^[a-zA-Z;,.]$/.test(ev.key) && KEY_HE[ev.code] ? KEY_HE[ev.code] : '';
}
/* the crossword: arrows move the cursor to the next letter cell that way (the board runs right to left), Enter or Tab go to
   the next open word (Shift goes back), Space turns the direction on a crossing, ⌫ and Delete erase */
function xwArrow(dr, dc) {
  const g = ST.xg, b = g.b, r0 = Math.floor(g.cur / b.C), c0 = g.cur % b.C;
  for (let r = r0 + dr, c = c0 + dc; r >= 0 && c >= 0 && r < b.R && c < b.C; r += dr, c += dc) {
    const k = r * b.C + c; if (!b.L[k]) continue;
    const ws = g.cw[k], h = dc !== 0;
    if (ws.indexOf(g.act) < 0 || b.words[g.act].h !== h) { const same = ws.find(i => b.words[i].h === h); g.act = same !== undefined ? same : ws.indexOf(g.act) >= 0 ? g.act : ws[0]; }
    g.cur = k; g._tp = null; xwPaint(); xwSave(); return;
  }
}
function xwWordStep(back) {
  const g = ST.xg, ws = g.b.words, n = ws.length;
  if (!back) { if (!xwNextOpen()) return; }
  else for (let d = 1; d < n; d++) { const i = (g.act - d + n) % n, w = ws[i]; if (xwSolved(w)) continue; const k = w.cells.find(c => !g.typed[c] && !xwLocked(c)); g.act = i; g.cur = k !== undefined ? k : w.cells[0]; break; }
  g._tp = null; xwPaint(); xwSave();
}
document.addEventListener('keydown', ev => {
  if (!(R.tab === 'xw' && R.sub === 'board' && ST.xg && ST.xg.type === 'xw') || sheetOpen || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
  const ch = keyLetter(ev), k = ev.key;
  if (k === 'Backspace' || k === 'Delete') { ev.preventDefault(); xwDel(); }
  else if (ch) { ev.preventDefault(); xwType(ch); }
  else if (ST.xg.done) return;
  else if (k === 'ArrowRight') { ev.preventDefault(); xwArrow(0, -1); }
  else if (k === 'ArrowLeft') { ev.preventDefault(); xwArrow(0, 1); }
  else if (k === 'ArrowUp') { ev.preventDefault(); xwArrow(-1, 0); }
  else if (k === 'ArrowDown') { ev.preventDefault(); xwArrow(1, 0); }
  else if (k === 'Enter' || k === 'Tab') { ev.preventDefault(); xwWordStep(ev.shiftKey); }
  else if (k === ' ') { ev.preventDefault(); const ws = ST.xg.cw[ST.xg.cur]; if (ws && ws.length > 1) { ST.xg.act = ws.find(i => i !== ST.xg.act); ST.xg._tp = null; xwPaint(); xwSave(); } }
});

export { BK, XE, XKEY, XKEYS, XW_TWO, archMax, bankInit, bindLabNav, copyText, dailyShareText, keyLetter, labNavHtml, lazyFor, mmss, openArchWD, openArchXW, openArchive, renderGameReview, renderXW, renderXWReview, renderXWSetup, restoreXw, shareLines, startXWDaily, xwAns, xwCfg, xwDailyBoard, xwEdition, xwEntry, xwFromRefs, xwGame, xwInit, xwLoad, xwOpen, xwOv, xwPaint, xwPool, xwSave, xwSrc, xwStale, xwStopClock, xwTry };
