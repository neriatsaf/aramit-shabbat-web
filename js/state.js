/* פשיטא: the data of the dictionary, the saved state (aramit-shabbat-v1), helpers, spaced study (FSRS through fsrs.js),
   distractors, what to practise, progress, and the data files loaded after the first screen (LAZY) */
import { norm, stripPrefix } from './rules.js';
import { keepNext, studyMode } from './learn.js';
import { ctInit, quizItems } from './quiz.js';
import { bankInit, xwInit, xwOv } from './xw.js';
import { closeSheet, mirrorSoon, now, openSheet } from './settings.js';
import { R } from './main.js';

/* the values that several modules change (they were plain variables of the one app.js) */
export const ST = {};

/* ---------- data ---------- */
const VERSION = '1.12.2';
/* the public address of the web version, added to every shared result, from the Android app and from the browser alike */
const APP_URL = 'https://pshita.tsafrir.com/';
/* where "דיווח על טעות" goes: the email address that receives the reports. The button opens the reader's mail app with the
   subject and the message ready, naming the board in use */
const FEEDBACK_EMAIL = 'neriatsaf@gmail.com';
/* running inside the Android app, or in a browser; and in a browser, whether it was opened from the home screen */
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const BETA = NATIVE || (/[?&]test\b/.test(location.search) && /[?&]beta\b/.test(location.search));
/* usage measurement (Google Analytics 4, loaded by index.html on the public site only): one event per action, and
   nothing at all when the script is missing, blocked or offline. With ?test the events are kept on window.__ev */
function track(name, params) {
  try {
    if (/[?&]test\b/.test(location.search)) (window.__ev = window.__ev || []).push([name, params || {}]);
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  } catch (e) { /* measurement never stops the app */ }
}
const STANDALONE = !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone);
const VARIANTS = window.VARIANTS || {}, ALIASES = window.ALIASES || {};
/* the first DECK_CORE entries are the chosen store (three uses or more in the Gemara); the rest is the expanded store of all 24 chapters, rare words included */
const CORE_N = window.DECK_CORE || window.DECK.length;
const D = window.DECK.map((r, i) => ({ w: r[0], m0: r[1], c: r[2], a: r[3], x: r[4] || 0, p: r[0].indexOf(' ') >= 0, i, v: VARIANTS[r[0]] || [], pk: r[5] || 0, rare: !!r[6], ext: i >= CORE_N }));
const PEREKS = window.PEREKS || [['', 0]];
D.forEach(e => {
  e.nw = norm(e.w); e.sw = e.nw.split(' ').map(stripPrefix).join(' ');
  e.alt = e.v.map(x => { const n = norm(x); return [n, n.split(' ').map(stripPrefix).join(' ')]; });
});
const BY = new Map(D.map(e => [e.w, e]));
const WORDS = D.filter(e => !e.p), PHRASES = D.filter(e => e.p);
WORDS.forEach((e, k) => e.k = k); PHRASES.forEach((e, k) => e.k = k);
const GROUP = new Map();
(window.GROUPS || []).forEach(g => g.forEach(w => { if (BY.has(w)) GROUP.set(w, g); }));
const BYDAF = D.slice().sort((x, y) => x.a - y.a || y.c - x.c);
/* where every deck entry appears: a bitmap of the 312 pages, and a bit per chapter (by the exact passage).
   occ.js loads after the first screen (see LAZY below); until then each entry counts only its first page and chapter */
D.forEach(e => { e.occ = null; e.pkm = 1 << e.pk; });
function occInit() {
  const raw = window.OCC || [], pkm = window.OCCPK || [];
  D.forEach((e, i) => {
    e.occ = null; e.pkm = Number.isInteger(pkm[i]) ? pkm[i] : (1 << e.pk);
    if (!raw[i]) return;
    try { const b = atob(raw[i]), u = new Uint8Array(b.length); for (let k = 0; k < b.length; k++) u[k] = b.charCodeAt(k); e.occ = u; } catch (err) { /* keep the first page only */ }
  });
}
function occAny(e, a0, a1) {
  if (!e.occ) return e.a >= a0 && e.a <= a1;
  for (let a = a0; a <= a1; a++) if (e.occ[a >> 3] & (1 << (a & 7))) return true;
  return false;
}
/* the concepts glossary: terms of the tractate, from the Mishnah and the Gemara, grouped by topic */
const TOPICS = window.TOPICS || [];
function pkOf(a) { let k = 0; for (let i = 0; i < PEREKS.length; i++) if (PEREKS[i][1] <= a) k = i; return k; }
const CN = (window.CONCEPTS || []).map((r, i) => ({ cn: true, w: r[0], s: r[1], m0: r[2], t: r[3], a: r[4], mi: !!r[5], i, key: 'מושג:' + r[0], pk: Number.isInteger(r[6]) ? r[6] : pkOf(r[4]) }));
CN.forEach(c => { c.nw = norm(c.w); c.ns = norm(c.s); });
const CNBYDAF = CN.slice().sort((x, y) => x.a - y.a || x.i - y.i);
const INTERVALS = [0, 1, 3, 7, 14, 30, 60];
const KNOWN_BOX = 4;

/* ---------- state ---------- */
const KEY = 'aramit-shabbat-v1';
const SYNC = window.PshitaSync || null; /* the optional cloud backup (sync.js); idle while its Firebase config is empty */
/* schemaVersion: 1 (or missing) up to 1.6, the Leitner stages only; 2 from 1.7, every entry also carries its FSRS state (see fsrsOf) */
const SCHEMA = 2;
/* gen and at serve the cloud sync (sync.js): gen rises on a full reset, so the reset wins over older copies on other devices;
   at is the moment of the last save */
const S = { prog: {}, edits: {}, fav: {}, miss: {}, settings: { order: 'freq', newPerDay: 10, size: 'm' }, best: {}, onboarded: false, schemaVersion: SCHEMA, gen: 0, at: 0 };
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) {
      S.prog = raw.prog || {}; S.edits = raw.edits || {}; S.best = raw.best || {}; S.fav = raw.fav || {}; S.miss = raw.miss || {}; S._cstat = raw.cstat || null;
      Object.assign(S.settings, raw.settings || {}); S.onboarded = !!raw.onboarded; S.schemaVersion = raw.schemaVersion || 1;
      S.gen = Number.isInteger(raw.gen) ? raw.gen : 0; S.at = Number.isFinite(raw.at) ? raw.at : 0;
      migrate();
    }
    launchReset(!!raw);
  } catch (e) { /* first run or storage blocked: start clean */ }
}
/* the launch to the yeshiva (24.11.2026): progress saved before it is wiped once on each device, so everyone starts
   together with edition #1. What is kept: the look and study settings and the first opening. What goes: the progress,
   edits, favourites, mistakes, best scores, streaks and lifelines, the archive marks and a daily board or Wordle in play */
const RESET_AT = '2026-11-24', RESET_KEY = 'aramit-reset';
function launchReset(had) {
  /* the browser tests seed their own saved state; they reach the reset only with ?test&reset */
  if (/[?&]test\b/.test(location.search) && !/[?&]reset\b/.test(location.search)) return;
  if (localStorage.getItem(RESET_KEY) === RESET_AT) return;
  if (had) {
    S.prog = {}; S.edits = {}; S.best = {}; S.fav = {}; S.miss = {};
    ['xwDays', 'wdDays', 'xwDaily', 'wdLast', 'arch', 'shieldSeen'].forEach(k => delete S.settings[k]);
    ['aramit-shabbat-xw', 'aramit-shabbat-wordle'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify(S));
  }
  localStorage.setItem(RESET_KEY, RESET_AT);
}
/* spellings merged in a later version: carry the progress and any edited gloss over to the kept entry */
function migrate() {
  let changed = false;
  for (const from in ALIASES) {
    const to = ALIASES[from];
    if (S.prog[from]) { if (!S.prog[to] || S.prog[from].b > S.prog[to].b) S.prog[to] = S.prog[from]; delete S.prog[from]; changed = true; }
    if (S.edits[from]) { if (!S.edits[to]) S.edits[to] = S.edits[from]; delete S.edits[from]; changed = true; }
  }
  /* up to version 1.0.7 concepts kept their own quiz record. From 1.0.8 they share the review schedule with the words */
  if (S._cstat) {
    for (const w in S._cstat) {
      const st = S._cstat[w], k = 'מושג:' + w;
      if (st && st[2] && !S.prog[k]) { const t = today(); S.prog[k] = { b: KNOWN_BOX, d: t + INTERVALS[KNOWN_BOX], n: 1, x: 0, f: t, k: 1 }; }
      else if (st && st[1] > st[0]) S.miss[k] = 2;
    }
    changed = true;
  }
  delete S._cstat;
  /* 1.7: the Leitner stages become FSRS states once, on every device. The stage and the day of the next review stay as
     they were (older versions and the screens keep reading them), so nothing is lost and no review moves */
  if ((S.schemaVersion || 1) < SCHEMA) { for (const k in S.prog) fsrsOf(S.prog[k]); S.schemaVersion = SCHEMA; changed = true; }
  if (changed) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
}
let ver = 0; /* rises on every save: a panel drawn at an older value may show stale progress */
/* in a private window or with storage blocked the app keeps working from memory, and says so once */
let saveWarned = false;
function save(quiet) { ver++; S.at = Date.now(); mirrorSoon(); if (!quiet && SYNC) SYNC.dirty(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { if (!saveWarned) { saveWarned = true; toast('לא ניתן לשמור במכשיר הזה (גלישה פרטית?). ההתקדמות תישמר רק עד סגירת הדף'); } } }

/* ---------- helpers ---------- */
/* the four main screens live side by side on one rail, and each keeps what it shows until it needs redrawing.
   Lookups by id search an open sheet first, then the screen being drawn, and only then the whole page */
/* the crossword lives on its own panel at the far end of the rail: it opens from the games, and a swipe never lands on it */
const RAIL = ['xw', 'games', 'quiz', 'dict', 'learn'];
const PANEL = {}; RAIL.forEach(t => { PANEL[t] = document.getElementById('p-' + t); });
ST.view = PANEL.learn;
const $ = id => {
  const sel = '#' + (window.CSS && CSS.escape ? CSS.escape(id) : id), host = document.getElementById('sheet-host');
  return (host && host.firstChild && host.querySelector(sel)) || (ST.view && ST.view.querySelector(sel)) || document.getElementById(id);
};
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function today() { const d = now(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); }
function shuffle(a, rnd) { rnd = rnd || Math.random; a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function sample(a, n) { return shuffle(a).slice(0, n); }
function pid(e) { return e.cn ? e.key : e.w; }
const BYID = new Map(); D.forEach(e => BYID.set(e.w, e)); CN.forEach(c => BYID.set(c.key, c));
/* glossPure: while the daily crossword is built, personal edits are set aside so every device builds the same board */
ST.glossPure = false;
function gloss(e) { return (!ST.glossPure && S.edits[pid(e)]) || e.m0; }
/* the bank of repeated mistakes: an entry goes in on a wrong answer and leaves after two right answers in a row */
function noteAnswer(e, ok) { const k = pid(e); if (!ok) S.miss[k] = 2; else if (S.miss[k]) { if (--S.miss[k] <= 0) delete S.miss[k]; } }
function isFav(e) { return !!S.fav[pid(e)]; }
function toggleFav(e) { const k = pid(e); if (S.fav[k]) delete S.fav[k]; else S.fav[k] = 1; save(); }
function starHtml(e) { const on = isFav(e); return '<button class="star' + (on ? ' on' : '') + '" data-star="' + esc(pid(e)) + '" aria-pressed="' + on + '" aria-label="' + (on ? 'הסרה מהמועדפים' : 'הוספה למועדפים') + '">' + (on ? '★' : '☆') + '</button>'; }
function bindStars(root, after) {
  root.querySelectorAll('[data-star]').forEach(b => { b.onclick = ev => { ev.stopPropagation(); const e = BYID.get(b.dataset.star); if (!e) return; toggleFav(e); toast(isFav(e) ? 'נוסף למועדפים' : 'הוסר מהמועדפים'); after(); }; });
}
function explainHtml(c) { return '<div class="explain"><span class="label">הסבר</span><p class="cfull">' + esc(gloss(c)) + '</p><span class="src">' + esc(cSource(c)) + '</span></div>'; }
function srcHtml(e) { return e.cn ? '' : '<span class="src">' + esc(countLine(e)) + ' · לראשונה ב' + dafName(e.a) + '</span>'; }
/* the context sentence of an entry of the chosen store (www/examples.js, loaded only when first needed): a short
   sentence from the Gemara with the entry marked, and its place. Row: [text, page (0 is ב ע"א), segment of Sefaria,
   the places of the marked words, cut (1 the start was cut, 2 the end, 3 both)]. Until the file arrives an empty box
   stands in its place, and fillEx fills every such box once it is there */
/* examples.js comes through the shared loader of the data files (need, see LAZY) */
function loadExamples() { return need(['examples']).then(() => { if (!window.EXAMPLES) throw new Error('empty'); return window.EXAMPLES; }); }
function exRow(e) { const X = window.EXAMPLES; return e && !e.cn && !e.ext && X && Array.isArray(X[e.i]) ? X[e.i] : null; }
function exInner(r) {
  const at = new Set(r[3] || []), cut = r[4] | 0;
  const txt = String(r[0]).split(' ').map((w, i) => at.has(i) ? '<mark>' + esc(w) + '</mark>' : esc(w)).join(' ');
  return '<span class="label">בגמרא</span><p class="ctxt">' + (cut & 1 ? '...' : '') + txt + (cut & 2 ? '...' : '') + '</p>' +
    '<span class="src">מסכת שבת, ' + dafName(r[1]) + '</span>';
}
function exHtml(e) {
  if (!e || e.cn || e.ext) return '';
  const r = exRow(e);
  if (r) return '<div class="ctx" data-ex="' + e.i + '">' + exInner(r) + '</div>';
  if (!window.EXAMPLES) loadExamples().then(fillEx).catch(() => { /* offline on a first visit: the card stays without it */ });
  return '<div class="ctx" data-ex="' + e.i + '" hidden></div>';
}
function fillEx() {
  document.querySelectorAll('.ctx[data-ex]').forEach(el => { if (el.firstChild) return; const r = exRow(D[+el.dataset.ex]); if (r) { el.innerHTML = exInner(r); el.hidden = false; } });
  keepNext();
}
/* what is shown once an answer is given: the entry and its meaning, and for a concept the full explanation with its source */
function afterHtml(e) { return e.cn ? '<div class="answer">' + esc(e.w) + ': ' + esc(e.s) + '</div>' + explainHtml(e) : '<div class="answer">' + esc(e.w) + ': ' + esc(gloss(e)) + '</div>' + srcHtml(e) + exHtml(e); }
function short(e) {
  if (e.cn) return e.s;
  let g = noParens(gloss(e));
  if (g.length > 44) { const k = g.indexOf(';'); if (k > 6) g = g.slice(0, k); }
  return g || gloss(e);
}
/* one place that decides which wording of a meaning each part of the app shows, from the one store of data:
   dictionary, study : the full meaning of data.js, with its brackets and every sense
   crossword         : the definition rewritten for the crossword (xwclues.js) when there is one, else the short meaning
   speed, pairs      : a card: no brackets, the first sense only (before ";"), and when that is still longer than 22 characters,
                       the crossword definition without its closing words (", בלשון הגמרא", ", בארמית"...) if it is shorter.
                       A card never passes 25 characters: what is left is cut at a comma, or at the last whole word
   quiz              : the meaning without brackets, so the right answer is not longer than the wrong ones by its notes.
   A bracket that marks an abbreviation, (ר"ת), always stays */
const KEEP_PAREN = /\(ר["״]ת\)/;
function noParens(t) { return String(t).replace(/\s*\([^)]*\)/g, m => KEEP_PAREN.test(m) ? m : '').replace(/\s{2,}/g, ' ').trim(); }
const XW_TAILS = /,\s*(בלשון הגמרא|בלשון המשנה|בלשון חכמים|בארמית|בגמרא|במשנה|בלשון התלמוד)\s*$/;
const CARD_MAX = 25;
function getGlossForMode(e, mode) {
  const full = e.cn || e.xe ? e.s : gloss(e);
  if (mode === 'dictionary' || mode === 'study') return full;
  if (mode === 'crossword') return (typeof xwOv === 'function' && xwOv(e)) || (e.cn || e.xe ? e.s : short(e));
  if (mode === 'quiz') return noParens(full) || full;
  /* speed, pairs */
  let t = noParens(full) || full;
  const k = t.indexOf(';'); if (k > 0) t = t.slice(0, k).trim();
  if (t.length > 22) { const o = typeof xwOv === 'function' && xwOv(e); if (o) { const c = noParens(o).replace(XW_TAILS, '').trim(); if (c && c.length < t.length) t = c; } }
  if (t.length > CARD_MAX) { const m = t.search(/[,:]/); if (m >= 4 && m <= CARD_MAX) t = t.slice(0, m).trim(); }
  if (t.length > CARD_MAX) { const cut = t.slice(0, CARD_MAX - 1), sp = cut.lastIndexOf(' '); t = (sp >= 8 ? cut.slice(0, sp) : cut).trim() + '…'; }
  return t;
}
function hebNum(n) {
  const u = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], t = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'], h = ['', 'ק', 'ר', 'ש', 'ת'];
  return (h[Math.floor(n / 100)] + t[Math.floor(n % 100 / 10)] + u[n % 10]).replace('יה', 'טו').replace('יו', 'טז');
}
function dafNum(a) { return Math.floor(a / 2) + 2; }
/* ===== the page picker: two wheels side by side, swiped up and down: the chapters on the right, the pages of the chosen
   chapter on the left; the item in the band in the middle is the one chosen. Each wheel scrolls only itself (scrollTop):
   nothing here may scroll the screens around it.
   dpHtml(id, daf, o) writes it, dpBind(id, o) brings it to life. o: { lo, hi } pages allowed, edge: 'first' | 'last' (the page
   a chapter starts at when it is chosen: its first page for "מדף", its last for "עד דף"), skip: a label for an item before the
   pages that chooses the chapter itself (the value is then its last page, and skipped is true), onChange(daf, skipped) */
function pkPages(k) { const a0 = PEREKS[k][1], a1 = k + 1 < PEREKS.length ? PEREKS[k + 1][1] - 1 : 313; return [dafNum(a0), dafNum(a1)]; }
function dpPereks(o) { const out = []; PEREKS.forEach((pk, k) => { const [f, l] = pkPages(k); if (l >= o.lo && f <= o.hi) out.push(k); }); return out; }
function dpPkOf(daf, o, pref) { const ks = dpPereks(o); if (pref !== undefined && ks.indexOf(pref) >= 0) { const [f, l] = pkPages(pref); if (daf >= f && daf <= l) return pref; } return ks.find(k => { const [f, l] = pkPages(k); return daf >= f && daf <= l; }) ?? ks[0]; }
function dpPagesHtml(k, daf, o, skipped) {
  const [f, l] = pkPages(k), a = Math.max(f, o.lo), b = Math.min(l, o.hi); let h = '';
  if (o.skip) h += '<button class="dpi skip" data-v="skip" aria-pressed="' + !!skipped + '">' + o.skip + '</button>';
  for (let d = a; d <= b; d++) h += '<button class="dpi" data-v="' + d + '" aria-pressed="' + (!skipped && d === daf) + '" aria-label="דף ' + hebNum(d) + '">' + hebNum(d) + '</button>';
  return h;
}
function dpHtml(id, daf, o) {
  const k = dpPkOf(daf, o, o.pk); if (o.skip && o.skipped) daf = Math.min(pkPages(k)[1], o.hi);
  /* o.none: nothing chosen yet (the first opening, before a swipe or a tap) */
  return '<div class="dpick' + (o.none ? ' none' : '') + '" id="' + id + '" data-pk="' + k + '" data-v="' + daf + '"' + (o.skipped ? ' data-skip="1"' : '') + '>' +
    '<div class="dpcol"><span class="dplab">פרק</span><div class="dpwin"><div class="dpstrip" data-r="pk" role="listbox" aria-label="פרק">' + dpPereks(o).map(j => '<button class="dpi pk" data-v="' + j + '" aria-pressed="' + (!o.none && j === k) + '">' + ordPk(j) + '. ' + esc(PEREKS[j][0]) + '</button>').join('') + '</div></div></div>' +
    '<div class="dpcol"><span class="dplab">דף</span><div class="dpwin"><div class="dpstrip" data-r="d" role="listbox" aria-label="דף">' + (o.none ? '<span class="dphint small muted">בחרו פרק</span>' : dpPagesHtml(k, daf, o, o.skipped)) + '</div></div></div></div>';
}
function dpBind(id, o) {
  const box = $(id); if (!box) return null;
  const strips = { pk: box.querySelector('[data-r=pk]'), d: box.querySelector('[data-r=d]') };
  const quiet = { pk: 0, d: 0 };   /* per wheel: a scroll this code makes itself is not a choice */
  /* only the wheel scrolls: scrollIntoView would also scroll the frame of the screens (overflow hidden is still scrollable) */
  const centre = (strip, smooth) => { const on = strip.querySelector('[aria-pressed=true]'); if (!on) return; quiet[strip.dataset.r] = Date.now() + (smooth ? 700 : 250);
    strip.scrollTo({ top: on.offsetTop - (strip.clientHeight - on.offsetHeight) / 2, behavior: smooth ? 'smooth' : 'auto' }); };
  const mark = (strip, el) => strip.querySelectorAll('.dpi').forEach(b => b.setAttribute('aria-pressed', String(b === el)));
  const emit = () => { if (o.onChange) o.onChange(+box.dataset.v, box.dataset.skip === '1'); };
  const choosePage = (el, smooth) => {
    mark(strips.d, el);
    if (el.dataset.v === 'skip') { box.dataset.skip = '1'; box.dataset.v = String(Math.min(pkPages(+box.dataset.pk)[1], o.hi)); }
    else { delete box.dataset.skip; box.dataset.v = el.dataset.v; }
    if (smooth) centre(strips.d, true); emit();
  };
  const choosePk = (k, smooth) => {
    box.classList.remove('none'); box.dataset.pk = String(k); mark(strips.pk, strips.pk.querySelector('[data-v="' + k + '"]'));
    const [f, l] = pkPages(k), d = o.edge === 'first' ? Math.max(f, o.lo) : Math.min(l, o.hi);
    const skip = !!o.skip; strips.d.innerHTML = dpPagesHtml(k, d, o, skip);
    box.dataset.v = String(d); if (skip) box.dataset.skip = '1'; else delete box.dataset.skip;
    if (smooth) centre(strips.pk, true); centre(strips.d, false); emit();
  };
  /* the item nearest the middle of a strip, once the finger has let go and the strip has stopped */
  const nearest = strip => { const r = strip.getBoundingClientRect(), mid = r.top + r.height / 2; let best = null, bd = 1e9;
    strip.querySelectorAll('.dpi').forEach(b => { const q = b.getBoundingClientRect(), dd = Math.abs(q.top + q.height / 2 - mid); if (dd < bd) { bd = dd; best = b; } }); return best; };
  Object.keys(strips).forEach(r => {
    const strip = strips[r]; let t = 0, touched = false;
    /* while nothing is chosen, only a finger, the mouse or the wheel chooses (a scroll the page makes by itself does not) */
    ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(ev => strip.addEventListener(ev, () => { touched = true; }, { passive: true }));
    const settle = () => { if ((drag && !dragged) || Date.now() < quiet[r] || !box.isConnected || (box.classList.contains('none') && !touched)) return; const b = nearest(strip); if (!b || (b.getAttribute('aria-pressed') === 'true' && !box.classList.contains('none'))) return;
      if (r === 'pk') choosePk(+b.dataset.v, false); else choosePage(b, false); };
    let raf = 0;
    const live = () => { raf = 0; if (drag && !dragged) return; settle(); };
    strip.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(live); clearTimeout(t); t = setTimeout(settle, 160); }, { passive: true });
    /* a mouse drags the wheel too (a finger, a trackpad and the wheel of the mouse scroll it by themselves); a drag is not a click */
    let drag = null, dragged = false;
    strip.addEventListener('pointerdown', ev => { if (ev.pointerType !== 'mouse' || ev.button !== 0) return;
      drag = { y: ev.clientY, top: strip.scrollTop }; dragged = false; });
    strip.addEventListener('pointermove', ev => { if (!drag) return; const dy = ev.clientY - drag.y;
      if (!dragged && Math.abs(dy) > 4) { dragged = true; strip.classList.add('dragging'); try { strip.setPointerCapture(ev.pointerId); } catch (x) { /* gone */ } }
      if (dragged) { strip.scrollTop = drag.top - dy; ev.preventDefault(); } });
    const drop = () => { if (!drag) return; drag = null; if (dragged) { strip.classList.remove('dragging'); clearTimeout(t); t = setTimeout(settle, 60); } };
    strip.addEventListener('pointerup', drop); strip.addEventListener('pointercancel', drop); strip.addEventListener('lostpointercapture', drop);
    strip.addEventListener('click', ev => { if (dragged) { dragged = false; ev.preventDefault(); ev.stopPropagation(); return; }
      const b = ev.target.closest('.dpi'); if (!b) return;
      if (r === 'pk') { if (+b.dataset.v !== +box.dataset.pk || box.classList.contains('none')) choosePk(+b.dataset.v, true); else centre(strip, true); } else choosePage(b, true); });
  });
  centre(strips.pk, false); centre(strips.d, false);
  return { set: daf => { const k = dpPkOf(daf, o, +box.dataset.pk); if (k !== +box.dataset.pk) { box.dataset.pk = String(k); mark(strips.pk, strips.pk.querySelector('[data-v="' + k + '"]')); }
    strips.d.innerHTML = dpPagesHtml(k, daf, o, false); delete box.dataset.skip; box.dataset.v = String(daf); centre(strips.pk, false); centre(strips.d, false); } };
}
/* a range of pages: on the page, one line ("מדף ב, יציאות השבת / עד דף כ, יציאות השבת" and "שינוי"); a tap opens a window from
   the bottom with the wheels, one step at a time: "מדף" and "הבא", then "עד דף", starting at the same page and unable to go
   before it, with a line back to "מדף". The wheels live only in that window, so they never catch a scroll of the page.
   Nothing changes until "סיום"; "ביטול" or a tap outside leaves the range as it was */
function dpSumText(d0, d1, lo, hi) {
  const pk = d => PEREKS[dpPkOf(d, { lo, hi })][0];
  return d0 === d1 ? 'דף ' + hebNum(d0) + ' בלבד, ' + pk(d0) : 'מדף ' + hebNum(d0) + ', ' + pk(d0) + '<br>עד דף ' + hebNum(d1) + ', ' + pk(d1);
}
function dpRangeHtml(p, d0, d1, lo, hi) {
  return '<button class="dpsum" id="' + p + '-sum" aria-label="בחירת דפים"><span id="' + p + '-sumt">' + dpSumText(d0, d1, lo, hi) + '</span><span class="dpchg">שינוי</span></button>';
}
function dpRangeBind(p, st, lo, hi, after) {
  const btn = $(p + '-sum'); if (!btn) return;
  btn.onclick = () => openDpModal(st, lo, hi, (d0, d1) => { st.d0 = d0; st.d1 = d1; const t = $(p + '-sumt'); if (t) t.innerHTML = dpSumText(d0, d1, lo, hi); after(); });
}
function openDpModal(st, lo, hi, done) {
  const tmp = { d0: st.d0, d1: Math.max(st.d1, st.d0) }; let step = 'from';
  const m = document.createElement('div'); m.className = 'dpmodal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'בחירת דפים');
  m.innerHTML = '<div class="dpm-panel"><div class="dpm-body"></div></div>'; document.body.appendChild(m);
  const body = m.querySelector('.dpm-body');
  const close = () => { m.classList.remove('on'); setTimeout(() => m.remove(), 200); document.removeEventListener('keydown', onKey); };
  const onKey = ev => { if (ev.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  m.addEventListener('click', ev => { if (ev.target === m) close(); });
  const draw = () => {
    if (step === 'from') {
      body.innerHTML = '<div class="dpstep"><b>מדף</b><span class="small muted">שלב 1 מתוך 2</span></div>' + dpHtml('dpm-d0', tmp.d0, { lo, hi }) +
        '<div class="dpm-act"><button class="btn line" id="dpm-cancel">ביטול</button><button class="btn" id="dpm-next">הבא: עד דף</button></div>';
      dpBind('dpm-d0', { lo, hi, edge: 'first', onChange: d => { tmp.d0 = d; } });
      $('dpm-next').onclick = () => { tmp.d1 = tmp.d0; step = 'to'; draw(); };
    } else {
      const k = dpPkOf(tmp.d0, { lo, hi });
      body.innerHTML = '<button class="dpback" id="dpm-back"><span>מדף ' + hebNum(tmp.d0) + ', ' + esc(PEREKS[k][0]) + '</span><span class="dpchg">שינוי</span></button>' +
        '<div class="dpstep"><b>עד דף</b><span class="small muted">שלב 2 מתוך 2</span></div>' + dpHtml('dpm-d1', tmp.d1, { lo: tmp.d0, hi }) +
        '<p class="small muted dpone">לדף אחד בלבד, משאירים את אותו דף.</p>' +
        '<div class="dpm-act"><button class="btn line" id="dpm-cancel">ביטול</button><button class="btn" id="dpm-done">סיום</button></div>';
      dpBind('dpm-d1', { lo: tmp.d0, hi, edge: 'first', onChange: d => { tmp.d1 = d; } });
      $('dpm-back').onclick = () => { step = 'from'; draw(); };
      $('dpm-done').onclick = () => { close(); done(tmp.d0, tmp.d1); };
    }
    $('dpm-cancel').onclick = close;
  };
  draw(); requestAnimationFrame(() => m.classList.add('on'));
}
/* with no-break spaces, so "דף ב ע"א" never splits over two lines */
function dafName(a) { return 'דף\u00a0' + hebNum(dafNum(a)) + (a % 2 ? '\u00a0ע"ב' : '\u00a0ע"א'); }
function dafShort(a) { return hebNum(dafNum(a)) + (a % 2 ? ':' : '.'); }
function ordPk(k) { return ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'יא', 'יב', 'יג', 'יד', 'טו', 'טז', 'יז', 'יח', 'יט', 'כ', 'כא', 'כב', 'כג', 'כד'][k] || ''; }
function cSource(c) { return (c.mi ? 'משנה' : 'גמרא') + ', ' + dafName(c.a) + ', פרק ' + ordPk(c.pk) + ' (' + PEREKS[c.pk][0] + ')'; }
function altLine(e) { return e.v.length ? 'נכתב גם: ' + e.v.join(', ') : ''; }
function countLine(e) {
  if (e.x) return 'הצורה הכתובה מופיעה ' + e.c + ' פעמים במסכת, כולל שימושים אחרים שלה';
  return (e.c === 1 ? 'פעם אחת' : e.c === 2 ? 'פעמיים' : e.c + ' פעמים') + ' במסכת' + (e.ext ? ', במשנה ובגמרא' : '');
}
let toastTimer = null;
function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2200); }
let timers = [];
function stopTimers() { timers.forEach(clearInterval); timers = []; }

/* ---------- spaced repetition ---------- */
function isDue(e) { const p = S.prog[pid(e)]; return !!p && p.d <= today(); }
function isKnown(e) { const p = S.prog[pid(e)]; return !!p && p.b >= KNOWN_BOX; }
function stats(list) {
  const t = today();
  let due = 0, learned = 0, fresh = 0; const boxes = [0, 0, 0, 0, 0, 0, 0];
  list.forEach(e => { const p = S.prog[pid(e)]; if (!p) { fresh++; return; } boxes[Math.min(p.b, 6)]++; if (p.b >= KNOWN_BOX) learned++; if (p.d <= t) due++; });
  return { total: list.length, due, learned, fresh, boxes, seen: list.length - fresh };
}
/* new entries begun today; one marked "כבר מכיר" (k) does not use up a place */
function newToday() { const t = today(); let n = 0; for (const k in S.prog) if (S.prog[k].f === t && !S.prog[k].k) n++; return n; }
/* r counts the rounds in a row (one a day at most) in which the entry was remembered; at three it becomes known
   and leaves the daily reviews, provided one of them was a free recall (fr: the card turned over, not four answers to pick from).
   A miss sets the count back to zero.
   From 1.7 the next review comes from FSRS (www/fsrs.js): s is the stability in days, df the difficulty (1 to 10), ls the day
   of the last review. The stage b (0 to 6) and the due day d are kept and follow from the interval, so every screen and
   older backups go on working. An entry never reaches "known" (stage 4) without at least one free recall on the way,
   except in the study mode "אמריקאי" (only four answers), where "known" follows the FSRS stability alone */
const KNOWN_RUN = 3, MAX_IVL = 180;
const F = window.FSRS || null;
const r2 = x => Math.round(x * 100) / 100;
/* the FSRS state of an entry saved by an older version (or marked known, or begun), made from its Leitner stage */
function fsrsOf(p) {
  if (!F || !p || (p.s > 0 && p.df >= 1 && p.df <= 10 && Number.isInteger(p.ls))) return p;
  const c = F.fromLeitner(p.b, p.x, p.n); p.s = r2(c.s); p.df = r2(c.d); if (!(p.ls <= today())) delete p.ls;
  if (!Number.isInteger(p.ls)) p.ls = Number.isInteger(p.d) ? Math.max(p.f || 0, p.d - INTERVALS[Math.min(6, Math.max(0, p.b | 0))]) : today();
  return p;
}
function grade(e, ok, recall) {
  const k = pid(e), t = today(); const p = S.prog[k] || { b: 0, d: t, n: 0, x: 0, f: t };
  const first = !(p.s > 0) && !p.n, wasKnown = p.b >= KNOWN_BOX;
  p.n++;
  if (F) {
    const c = first ? F.next(null, 0, ok ? 3 : 1) : (fsrsOf(p), F.next({ s: p.s, d: p.df }, t - p.ls, ok ? 3 : 1));
    p.s = r2(c.s); p.df = r2(c.d); p.ls = t;
  }
  if (ok) {
    if (p.rd !== t) { p.r = (p.r || 0) + 1; p.rd = t; }
    if (recall) p.fr = 1;
    let ivl, b;
    if (F) { ivl = F.interval(p.s, 0.9, MAX_IVL); b = Math.max(p.b, F.boxOf(ivl)); }
    else { b = Math.min(p.b + 1, 6); ivl = INTERVALS[b]; }
    const needRecall = !F || studyMode() !== 'mcq';
    if (needRecall && !wasKnown && !p.fr && b >= KNOWN_BOX) { b = KNOWN_BOX - 1; ivl = Math.min(ivl, INTERVALS[b]); }
    if (needRecall && p.r >= KNOWN_RUN && p.fr && b < KNOWN_BOX) { b = KNOWN_BOX; ivl = Math.max(ivl, INTERVALS[KNOWN_BOX]); if (F) p.s = Math.max(p.s, INTERVALS[KNOWN_BOX]); }
    p.b = b; p.d = t + ivl;
  }
  else { p.x++; p.b = Math.max(0, Math.min(p.b, 1) - 1); p.d = t; p.r = 0; p.rd = t; delete p.fr; }
  S.prog[k] = p; save();
}
/* the chance to remember the entry today, by FSRS (null before the first review) */
function recallNow(e) { const p = S.prog[pid(e)]; if (!F || !p || !p.n) return null; fsrsOf(p); return F.retrievability(today() - p.ls, p.s); }
function markKnown(e) { const t = today(); S.prog[pid(e)] = { b: KNOWN_BOX, d: t + INTERVALS[KNOWN_BOX], n: 1, x: 0, f: t, k: 1 }; save(); }
function stageName(e) {
  const p = S.prog[pid(e)]; if (!p) return e.cn ? 'עוד לא נלמד' : 'עוד לא נלמדה';
  if (p.d <= today()) return 'מחכה לחזרה, שלב ' + p.b + ' מתוך 6';
  return 'שלב ' + p.b + ' מתוך 6, חזרה בעוד ' + (p.d - today()) + ' ימים';
}
function dotColor(e) {
  const p = S.prog[pid(e)]; if (!p) return '';
  const c = p.b >= 4 ? 'var(--good)' : p.b >= 2 ? 'var(--brand)' : 'var(--gold)';
  return '<i class="dot" style="background:' + c + '"></i>';
}

/* ---------- distractors ---------- */
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = []; for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const simCache = new Map();
function similar(e) {
  if (simCache.has(e.w)) return simCache.get(e.w);
  const list = e.p ? PHRASES : WORDS; const scored = [];
  for (const o of list) {
    if (o === e) continue;
    const d = lev(e.sw, o.sw);
    const rel = d / Math.max(e.sw.length, o.sw.length);
    if (rel <= 0.67) scored.push([rel + (o.sw[0] === e.sw[0] ? -0.08 : 0), o]);
  }
  scored.sort((x, y) => x[0] - y[0]);
  const out = scored.slice(0, 9).map(x => x[1]);
  simCache.set(e.w, out); return out;
}
function near(e, span) {
  const list = e.p ? PHRASES : WORDS; const out = [];
  for (let k = Math.max(0, e.k - span); k < Math.min(list.length, e.k + span + 1); k++) if (list[k] !== e) out.push(list[k]);
  return out;
}
/* wrong answers: the same kind and a similar frequency; for a word already known well (tough), look-alikes and same-field words first */
function bare(g) { return norm(g).replace(/[^\u05d0-\u05ea ]/g, '').replace(/(^| )[והשלבכמ](?=[\u05d0-\u05ea]{3})/g, '$1'); }
/* two glosses that differ only in number, gender or a prefix are not a fair choice */
function tooClose(g1, g2) {
  const x = bare(g1), y = bare(g2); if (x === y) return true;
  const a1 = x.split(' ')[0], b1 = y.split(' ')[0];
  if (a1.length >= 3 && b1.length >= 3 && (a1.startsWith(b1.slice(0, Math.max(3, b1.length - 2))) || b1.startsWith(a1.slice(0, Math.max(3, a1.length - 2))))) return true;
  return Math.max(x.length, y.length) >= 4 && lev(x, y) <= 2;
}
/* two entries may never be offered side by side when their Hebrew meaning is the same (אית and איכא, לית and ליכא) */
function sameMeaning(x, y) {
  return x === y || norm(gloss(x)) === norm(gloss(y)) || bare(short(x)) === bare(short(y)) || tooClose(short(x), short(y));
}
function pickDistinct(src, n) {
  const picked = [];
  for (const e of shuffle(src)) { if (picked.some(p => sameMeaning(p, e))) continue; picked.push(e); if (picked.length === n) break; }
  return picked;
}
function distractors(e, tough) {
  const out = [];
  function take(cands, limit) {
    for (const o of cands) {
      if (out.length >= limit) break;
      if (sameMeaning(o, e) || out.some(p => sameMeaning(p, o))) continue;
      out.push(o);
    }
  }
  if (tough) {
    const g = (GROUP.get(e.w) || []).map(w => BY.get(w)).filter(Boolean);
    take(shuffle(g.concat(similar(e))), 3);
  }
  take(shuffle(near(e, 45)), 3);
  take(shuffle(D), 3);
  return out;
}
function makeQuestion(e, tough) {
  const rev = Math.random() < (tough ? 0.5 : 0.25);
  const opts = shuffle([e].concat(distractors(e, tough)));
  return { e, rev, opts };
}
/* concept questions: wrong answers from the same topic; for a concept already known well (tough), half the time from the definition to the term */
function cDistinct(x, y) { return x !== y && x.ns !== y.ns && x.nw !== y.nw; }
function makeCQuestion(c, tough, pool) {
  const out = [], same = o => o.t === c.t;
  const take = (cands) => { for (const o of cands) { if (out.length >= 3) break; if (!cDistinct(o, c) || out.some(p => !cDistinct(p, o))) continue; out.push(o); } };
  if (pool) {
    /* chosen chapters: wrong answers come from those chapters first. A small chapter is completed from the rest of the glossary, same topic first */
    take(shuffle(pool.filter(same)));
    take(shuffle(pool));
    take(shuffle(CN.filter(same)));
  } else take(shuffle(CN.filter(same)));
  take(shuffle(CN));
  return { e: c, rev: !!tough && Math.random() < 0.5, opts: shuffle([c].concat(out)) };
}
function optionsHtml(q, shown, picked) {
  return '<div class="opts">' + q.opts.map((o, i) => {
    let cls = 'opt' + (q.rev ? ' aram' : '') + (q.e.cn && !q.rev ? ' long' : '');
    if (shown) { if (o === q.e) cls += ' right'; else if (picked === i) cls += ' wrong'; }
    return '<button class="' + cls + '" data-i="' + i + '"' + (shown ? ' disabled' : '') + '>' + esc(q.rev ? o.w : getGlossForMode(o, q.gmode || 'quiz')) + '</button>';
  }).join('') + '</div>';
}
function promptHtml(q) {
  if (q.e.cn) return q.rev ? '<span class="tag">איזה מושג מתאים להגדרה?</span><div class="word sm">' + esc(q.e.s) + '</div>'
                           : '<span class="tag">' + esc(TOPICS[q.e.t]) + '</span><div class="word' + (q.e.w.length > 14 ? ' md' : '') + '">' + esc(q.e.w) + '</div>';
  return q.rev ? '<span class="tag">איזו מילה מתאימה לפירוש?</span><div class="word sm">' + esc(getGlossForMode(q.e, 'quiz')) + '</div>'
               : '<span class="tag">מה הפירוש?</span><div class="word' + (q.e.w.length > 14 ? ' md' : '') + '">' + esc(q.e.w) + '</div>';
}
function pool(scope, list) { list = list || D; return scope === 'learned' ? list.filter(e => S.prog[pid(e)]) : list; }
function scopeControl(scope, id, list) {
  list = list || D; const n = pool('learned', list).length;
  return '<div class="field"><span class="label">מאיפה לקחת מילים</span><div class="seg" id="' + id + '">' +
    '<button data-v="all" aria-pressed="' + (scope === 'all') + '">כל המאגר (' + D.length + ')</button>' +
    '<button data-v="learned" aria-pressed="' + (scope === 'learned') + '">מילים שלמדתי (' + n + ')</button></div></div>';
}
function bindSeg(id, cb) { const el = $(id); if (!el) return; el.querySelectorAll('button').forEach(b => { b.onclick = () => cb(b.dataset.v); }); }

/* ---------- what to practise ----------
   One choice serves the quiz and the learning screen: which store (words, concepts or both), and which part of it:
   everything, chosen chapters, a range of pages, one topic, what was already learned, favourites, or the bank of repeated mistakes. */
const SC = { kind: 'words', by: 'all', topic: -1, pereks: [], d0: 2, d1: 2, wmode: 'any' };
const KINDS = { words: 'מילים וביטויים', concepts: 'מושגים', both: 'מילים ומושגים' };
function saveSc() { S.settings.sc = { kind: SC.kind, by: SC.by, topic: SC.topic, pereks: SC.pereks.slice(), d0: SC.d0, d1: SC.d1, wmode: SC.wmode }; save(); }
function restoreSc() {
  const c = S.settings.sc, old = S.settings.cq;
  const okPk = a => (Array.isArray(a) ? a : []).filter(k => Number.isInteger(k) && k >= 0 && k < PEREKS.length);
  if (c) {
    SC.kind = KINDS[c.kind] && (c.kind === 'words' || CN.length) ? c.kind : 'words';
    SC.by = ['all', 'perek', 'daf', 'topic', 'seen', 'fav', 'miss'].indexOf(c.by) >= 0 ? c.by : 'all';
    SC.topic = Number.isInteger(c.topic) && c.topic >= 0 && c.topic < TOPICS.length ? c.topic : -1;
    SC.pereks = okPk(c.pereks);
    SC.d0 = Number.isInteger(c.d0) && c.d0 >= 2 && c.d0 <= 157 ? c.d0 : 2;
    SC.d1 = Number.isInteger(c.d1) && c.d1 >= SC.d0 && c.d1 <= 157 ? c.d1 : SC.d0;
    SC.wmode = c.wmode === 'first' ? 'first' : 'any';
  } else if (old) { /* the choice saved by version 1.0.7, which had it for the concept quiz only */
    if (old.by === 'perek' && okPk(old.pereks).length) { SC.kind = 'concepts'; SC.by = 'perek'; SC.pereks = okPk(old.pereks); }
    else if (Number.isInteger(old.topic) && old.topic >= 0 && old.topic < TOPICS.length) { SC.kind = 'concepts'; SC.by = 'topic'; SC.topic = old.topic; }
  }
  if (SC.by === 'topic' && SC.kind !== 'concepts') SC.by = 'all';
}
function inScope(e) {
  switch (SC.by) {
    case 'perek':
      if (!SC.pereks.length) return true;
      if (e.cn || SC.wmode === 'first') return SC.pereks.indexOf(e.pk) >= 0;
      return SC.pereks.some(k => e.pkm & (1 << k));
    case 'daf': {
      const a0 = (SC.d0 - 2) * 2, a1 = (SC.d1 - 2) * 2 + 1;
      if (e.cn || SC.wmode === 'first') return e.a >= a0 && e.a <= a1;
      return occAny(e, a0, a1);
    }
    case 'topic': return !!e.cn && (SC.topic < 0 || e.t === SC.topic);
    case 'seen': return !!S.prog[pid(e)];
    case 'fav': return !!S.fav[pid(e)];
    case 'miss': return !!S.miss[pid(e)];
  }
  return true;
}
function kindList(kind) { kind = kind || SC.kind; return kind === 'words' ? D : kind === 'concepts' ? CN : D.concat(CN); }
/* Hebrew words whose definition is the word itself teach no Aramaic: kept in the dictionary, never in study, the quiz or the games (24.11.2026) */
const NO_STUDY = new Set(['חייב', 'מחייב']);
function studyOk(e) { return e.cn || !NO_STUDY.has(e.w); }
function scopeItems() { return kindList().filter(e => studyOk(e) && inScope(e)); }
function nWords(n) { return n === 1 ? 'מילה או ביטוי אחד' : n + ' מילים וביטויים'; }
function nConcepts(n) { return n === 1 ? 'מושג אחד' : n + ' מושגים'; }
function countLabel(items) {
  const c = items.filter(e => e.cn).length, w = items.length - c;
  if (!items.length) return 'אין ערכים בבחירה הזו';
  if (SC.kind === 'words') return nWords(w);
  if (SC.kind === 'concepts') return nConcepts(c);
  return nWords(w) + ', ' + nConcepts(c);
}
function scopeLabel() {
  let where = 'הכול';
  if (SC.by === 'perek') where = !SC.pereks.length ? 'כל הפרקים' : SC.pereks.length === 1 ? 'פרק ' + PEREKS[SC.pereks[0]][0] : SC.pereks.length + ' פרקים (' + SC.pereks.map(ordPk).join(', ') + ')';
  else if (SC.by === 'daf') where = SC.d0 === SC.d1 ? 'דף ' + hebNum(SC.d0) : 'דפים ' + hebNum(SC.d0) + ' עד ' + hebNum(SC.d1);
  else if (SC.by === 'topic') where = SC.topic < 0 ? 'כל הנושאים' : TOPICS[SC.topic];
  else if (SC.by === 'seen') where = 'מה שכבר למדתי';
  else if (SC.by === 'fav') where = 'מועדפים';
  else if (SC.by === 'miss') where = 'טעויות חוזרות';
  return KINDS[SC.kind] + ', ' + where;
}
/* the words of a chapter or a page are either all the words that appear there, or only those that appear there for the first time */
function pkCount(k) { return kindList().filter(e => e.cn || SC.wmode === 'first' ? e.pk === k : !!(e.pkm & (1 << k))).length; }
/* compact (the quiz): every choice in one even grid inside its card */
function qCard(label, inner, id) { return '<section class="qcard"' + (id ? ' id="' + id + '"' : '') + '><span class="label">' + label + '</span>' + inner + '</section>'; }
function scopeHtml(noKind, compact) {
  const items = scopeItems(), nf = kindList().filter(e => S.fav[pid(e)]).length, nm = kindList().filter(e => S.miss[pid(e)]).length;
  let bys = [['all', 'הכול'], ['perek', 'לפי פרק'], ['daf', 'לפי דף (טווח דפים)']].concat(SC.kind === 'concepts' ? [['topic', 'לפי נושא']] : [], [['seen', 'מה שכבר למדתי'], ['fav', 'מועדפים (' + nf + ')'], ['miss', 'טעויות חוזרות (' + nm + ')']]);
  if (compact) { const label = { daf: 'לפי דף', seen: 'מה שלמדתי' }; bys = bys.map(b => [b[0], label[b[0]] || b[1]]); }
  let sub = '';
  if (SC.by === 'perek') {
    sub = '<div class="pkpick" id="sc-pk"><button class="chip" data-v="-1" aria-pressed="' + (SC.pereks.length === 0) + '">כל הפרקים</button>' +
      PEREKS.map((pk, k) => { const n = pkCount(k); return '<button class="chip" data-v="' + k + '" aria-pressed="' + (SC.pereks.indexOf(k) >= 0) + '"' + (n ? '' : ' disabled') + '>' + ordPk(k) + '. ' + esc(pk[0]) + ' (' + n + ')</button>'; }).join('') + '</div>' +
      '<p class="small muted">אפשר לסמן כמה פרקים יחד, למשל את הפרקים שכבר למדת.</p>';
  } else if (SC.by === 'daf') {
    sub = dpRangeHtml('sc', SC.d0, SC.d1, 2, 157);
  } else if (SC.by === 'topic') {
    sub = '<select id="sc-topic" aria-label="נושא"><option value="-1">כל הנושאים (' + CN.length + ')</option>' +
      TOPICS.map((t, k) => '<option value="' + k + '"' + (SC.topic === k ? ' selected' : '') + '>' + esc(t) + ' (' + CN.filter(c => c.t === k).length + ')</option>').join('') + '</select>';
  } else if (SC.by === 'fav') sub = '<p class="small muted">ערכים שסימנת בכוכב במילון.</p>';
  else if (SC.by === 'miss') sub = '<p class="small muted">ערכים שטעית בהם בחידון, בלימוד או במשחקים. ערך יוצא מהרשימה אחרי שתי תשובות נכונות ברצף.</p>';
  if ((SC.by === 'perek' || SC.by === 'daf') && SC.kind !== 'concepts')
    sub += '<div class="field"><span class="label">אילו מילים</span><div class="seg" id="sc-wm"><button data-v="any" aria-pressed="' + (SC.wmode !== 'first') + '">כל מה שמופיע שם</button><button data-v="first" aria-pressed="' + (SC.wmode === 'first') + '">רק מה שמופיע שם לראשונה</button></div></div>';
  if (compact) return qCard('מה לתרגל', '<div class="seg grid2 qby" id="sc-by">' + bys.map(b => '<button data-v="' + b[0] + '" aria-pressed="' + (SC.by === b[0]) + '">' + b[1] + '</button>').join('') + '</div>' +
    (sub ? '<div class="qsub">' + sub + '</div>' : '') + '<p class="qcount" id="sc-count">' + countLabel(items) + '</p>');
  return '<div class="field"><span class="label">מה לתרגל</span>' +
    (CN.length && !noKind ? '<div class="seg" id="sc-kind">' + ['words', 'concepts', 'both'].map(k => '<button data-v="' + k + '" aria-pressed="' + (SC.kind === k) + '">' + (k === 'both' ? 'שניהם' : KINDS[k]) + '</button>').join('') + '</div>' : '') +
    '<div class="pkpick" id="sc-by">' + bys.map(b => '<button class="chip" data-v="' + b[0] + '" aria-pressed="' + (SC.by === b[0]) + '">' + b[1] + '</button>').join('') + '</div>' + sub +
    '<p class="small strong" id="sc-count">' + countLabel(items) + '.</p></div>';
}
function bindScope(again) {
  const done = () => { saveSc(); again(); };
  bindSeg('sc-kind', v => { SC.kind = v; if (SC.by === 'topic' && v !== 'concepts') SC.by = 'all'; done(); });
  bindSeg('sc-wm', v => { SC.wmode = v; done(); });
  const by = $('sc-by'); if (by) by.querySelectorAll('button').forEach(b => { b.onclick = () => { SC.by = b.dataset.v; done(); }; });
  const pk = $('sc-pk'); if (pk) pk.querySelectorAll('button').forEach(b => { b.onclick = () => {
    const k = +b.dataset.v;
    if (k < 0) SC.pereks = [];
    else { const at = SC.pereks.indexOf(k); if (at >= 0) SC.pereks.splice(at, 1); else SC.pereks.push(k); SC.pereks.sort((x, y) => x - y); }
    done();
  }; });
  const tp = $('sc-topic');
  /* the pickers change the range without drawing the choice again (that would stop a strip under the finger): only the count follows */
  dpRangeBind('sc', SC, 2, 157, () => { saveSc(); const items = scopeItems(), c = $('sc-count');
    if (c) c.textContent = countLabel(items) + (c.classList.contains('qcount') ? '' : '.'); const q = $('qstart'); if (q && R.tab === 'quiz') q.disabled = !quizItems().length; });
  if (tp) tp.onchange = () => { SC.topic = +tp.value; done(); };
}
/* on the learning screen the choice sits behind one line that says what is being practised */
function scopeBar() { return '<button class="scopebar" id="sc-open"><span>מה מתרגלים</span><b>' + esc(scopeLabel()) + '</b><em>שינוי</em></button>'; }
function openScope(after) {
  openSheet('<div class="row between"><h2>מה לתרגל</h2><button class="link" id="sc-close">סגירה</button></div>' + scopeHtml() + '<button class="btn wide" id="sc-done">אישור</button>');
  const close = () => { closeSheet(); after(); };
  $('sc-close').onclick = close; $('sc-done').onclick = close;
  bindScope(() => openScope(after));
}

/* ---------- progress ---------- */
function meterHtml(list, noun, id) {
  const known = list.filter(isKnown).length, pct = list.length ? known / list.length * 100 : 0;
  return '<button class="meter" id="' + id + '"><span>ידועים: <b>' + known + '</b> מתוך ' + list.length + ' ' + noun + '</span><em>פירוט</em><i class="pbar"><i style="width:' + pct + '%"></i></i></button>';
}
function openProgress() {
  const row = (name, list) => { const k = list.filter(isKnown).length; return '<div class="prow"><span>' + esc(name) + '</span><b>' + k + '/' + list.length + '</b><i class="pbar"><i style="width:' + (list.length ? k / list.length * 100 : 0) + '%"></i></i></div>'; };
  const pkRows = list => PEREKS.map((pk, k) => { const l = list.filter(e => e.pk === k); return l.length ? row(ordPk(k) + '. ' + pk[0], l) : ''; }).join('');
  openSheet('<div class="row between"><h2>התקדמות</h2><button class="link" id="pg-close">סגירה</button></div>' +
    '<p class="small muted">ערך נחשב ידוע כשהגיע לשלב 4 מתוך 6 בלוח החזרות' + (studyMode() === 'mcq' ? '' : ' (ולפחות פעם אחת בדרך נזכרת בו בעצמך, בכרטיס שהופכים)') + ', או כשסומן כידוע.</p>' +
    row('מילים וביטויים', D) + (CN.length ? row('מושגים', CN) : '') +
    (CN.length ? '<h3>מושגים לפי נושא</h3>' + TOPICS.map((t, k) => row(t, CN.filter(c => c.t === k))).join('') + '<h3>מושגים לפי פרק</h3>' + pkRows(CN) : '') +
    '<h3>מילים וביטויים לפי פרק</h3><p class="small muted">כל מילה נספרת בפרק שבו היא מופיעה לראשונה.</p>' + pkRows(D));
  $('pg-close').onclick = closeSheet;
}
/* a script loaded on demand, once: the same promise for every caller. A failure (offline before the file was cached) is
   not kept, so the next call tries again */
const SCRIPTS = {};
function loadScript(src) {
  if (SCRIPTS[src]) return SCRIPTS[src];
  return (SCRIPTS[src] = new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => ok(); s.onerror = () => { delete SCRIPTS[src]; s.remove(); fail(new Error('load ' + src)); };
    document.head.appendChild(s);
  }));
}
/* ---------- data files loaded after the first screen (1.7) ----------
   index.html loads only what the first screen needs (the dictionary, the concepts, the daily boards, the Wordle hints).
   The rest is fetched on demand, from the offline cache once the site was visited:
   occ.js (where each entry appears) and bank.js with xwclues.js (the crossword) start right after the first screen is
   drawn; content.js (the content quiz) and examples.js (the context sentences) wait until a screen asks for them.
   A screen that needs a file not yet in shows "טוען..." and draws itself when it arrives. need() can be called from
   anywhere: one promise per file, and the file's own set-up runs once */
const LAZY = { occ: ['occ.js', occInit], bank: ['bank.js', bankInit], xwclues: ['xwclues.js', null], content: ['content.js', ctInit], examples: ['examples.js', null] };
const LAZY_IN = new Set(), XWN = ['bank', 'xwclues'];
/* a file already in the page (an older index.html still in a cache, or a test that put it there) counts as loaded */
const LAZY_GLOBAL = { occ: 'OCC', bank: 'BANK', xwclues: 'XW_CLUES', content: 'CQ', examples: 'EXAMPLES' };
function lazyHas(names) { return names.every(n => LAZY_IN.has(n)); }
function lazyMark(n) {
  if (LAZY_IN.has(n)) return;
  LAZY_IN.add(n); if (LAZY[n][1]) LAZY[n][1]();
  if (n === 'bank' || n === 'xwclues') { if (lazyHas(XWN)) xwInit(); }
  ver++;   /* every panel drawn before is redrawn when next shown */
}
function need(names) {
  return Promise.all(names.map(n => LAZY_IN.has(n) ? null : (window[LAZY_GLOBAL[n]] ? (lazyMark(n), null) : loadScript(LAZY[n][0]).then(() => lazyMark(n)))));
}
/* the start of an action that needs a file: when it is not in yet, the action runs again once it is. Returns true when it waits */
function lazyWait(names, fn, args) {
  if (lazyHas(names)) return false;
  toast('טוען...');
  need(names).then(() => { const t = $('toast'); if (t && t.textContent === 'טוען...') t.hidden = true; fn.apply(null, args || []); }, () => toast('לא הצלחתי לטעון את הנתונים. בדקו את החיבור לרשת ונסו שוב'));
  return true;
}

export { $, APP_URL, BETA, BY, BYDAF, BYID, CN, CNBYDAF, CORE_N, D, FEEDBACK_EMAIL, INTERVALS, KEY, KINDS, KNOWN_BOX, KNOWN_RUN, NATIVE, PANEL, PEREKS, PHRASES, RAIL, RESET_AT, RESET_KEY, S, SC, STANDALONE, SYNC, TOPICS, VERSION, WORDS, XWN, afterHtml, altLine, bare, bindScope, bindSeg, bindStars, cSource, countLine, dafName, dafNum, dafShort, distractors, dotColor, dpBind, dpHtml, dpPkOf, dpRangeBind, dpRangeHtml, esc, exHtml, explainHtml, fsrsOf, getGlossForMode, gloss, grade, hebNum, inScope, isDue, isFav, isKnown, lazyHas, lazyWait, lev, load, loadScript, makeCQuestion, makeQuestion, markKnown, migrate, nConcepts, need, newToday, noParens, noteAnswer, openProgress, openScope, optionsHtml, ordPk, pickDistinct, pid, pkOf, pool, promptHtml, qCard, recallNow, restoreSc, sameMeaning, sample, save, saveSc, scopeBar, scopeHtml, scopeItems, short, shuffle, srcHtml, stageName, starHtml, stats, stopTimers, studyOk, timers, toast, today, track, ver };
