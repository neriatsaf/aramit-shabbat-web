/* ארמית: מסכת שבת. כל הלוגיקה של האפליקציה, בלי תלות ברשת. */
(function () {
'use strict';

/* ---------- data ---------- */
const FIN = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
function norm(s) {
  return String(s).replace(/[֑-ׇ]/g, '').replace(/["'׳״־-]/g, '').replace(/[ךםןףץ]/g, c => FIN[c]).replace(/\s+/g, ' ').trim();
}
function stripPrefix(s) { return s.replace(/^(וד|ו|ד)(?=.{2,})/, ''); }

const VERSION = '1.6.4';
/* the public address of the web version, added to every shared result, from the Android app and from the browser alike */
const APP_URL = 'https://neriatsaf.github.io/aramit-shabbat-web/';
/* where "דיווח על טעות" goes: the email address that receives the reports. The button opens the reader's mail app with the
   subject and the message ready, naming the board in use */
const FEEDBACK_EMAIL = 'neriatsaf@gmail.com';
/* running inside the Android app, or in a browser; and in a browser, whether it was opened from the home screen */
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const BETA = NATIVE || (/[?&]test\b/.test(location.search) && /[?&]beta\b/.test(location.search));
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
/* where every deck entry appears: a bitmap of the 312 pages, and a bit per chapter (by the exact passage) */
(function () {
  const raw = window.OCC || [], pkm = window.OCCPK || [];
  D.forEach((e, i) => {
    e.occ = null; e.pkm = Number.isInteger(pkm[i]) ? pkm[i] : (1 << e.pk);
    if (!raw[i]) return;
    try { const b = atob(raw[i]), u = new Uint8Array(b.length); for (let k = 0; k < b.length; k++) u[k] = b.charCodeAt(k); e.occ = u; } catch (err) { /* keep the first page only */ }
  });
})();
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
const S = { prog: {}, edits: {}, fav: {}, miss: {}, settings: { order: 'freq', newPerDay: 10, size: 'm' }, best: {}, onboarded: false };
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) {
      S.prog = raw.prog || {}; S.edits = raw.edits || {}; S.best = raw.best || {}; S.fav = raw.fav || {}; S.miss = raw.miss || {}; S._cstat = raw.cstat || null;
      Object.assign(S.settings, raw.settings || {}); S.onboarded = !!raw.onboarded;
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
  if (changed) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
}
let ver = 0; /* rises on every save: a panel drawn at an older value may show stale progress */
/* in a private window or with storage blocked the app keeps working from memory, and says so once */
let saveWarned = false;
function save() { ver++; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { if (!saveWarned) { saveWarned = true; toast('לא ניתן לשמור במכשיר הזה (גלישה פרטית?). ההתקדמות תישמר רק עד סגירת הדף'); } } }

/* ---------- helpers ---------- */
/* the four main screens live side by side on one rail, and each keeps what it shows until it needs redrawing.
   Lookups by id search an open sheet first, then the screen being drawn, and only then the whole page */
/* the crossword lives on its own panel at the far end of the rail: it opens from the games, and a swipe never lands on it */
const RAIL = ['xw', 'games', 'quiz', 'dict', 'learn'];
const PANEL = {}; RAIL.forEach(t => { PANEL[t] = document.getElementById('p-' + t); });
let view = PANEL.learn;
const $ = id => {
  const sel = '#' + (window.CSS && CSS.escape ? CSS.escape(id) : id), host = document.getElementById('sheet-host');
  return (host && host.firstChild && host.querySelector(sel)) || (view && view.querySelector(sel)) || document.getElementById(id);
};
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function today() { const d = now(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); }
function shuffle(a, rnd) { rnd = rnd || Math.random; a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function sample(a, n) { return shuffle(a).slice(0, n); }
function pid(e) { return e.cn ? e.key : e.w; }
const BYID = new Map(); D.forEach(e => BYID.set(e.w, e)); CN.forEach(c => BYID.set(c.key, c));
/* glossPure: while the daily crossword is built, personal edits are set aside so every device builds the same board */
let glossPure = false;
function gloss(e) { return (!glossPure && S.edits[pid(e)]) || e.m0; }
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
/* what is shown once an answer is given: the entry and its meaning, and for a concept the full explanation with its source */
function afterHtml(e) { return e.cn ? '<div class="answer">' + esc(e.w) + ': ' + esc(e.s) + '</div>' + explainHtml(e) : '<div class="answer">' + esc(e.w) + ': ' + esc(gloss(e)) + '</div>' + srcHtml(e); }
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
function dafName(a) { return 'דף ' + hebNum(dafNum(a)) + (a % 2 ? ' ע"ב' : ' ע"א'); }
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
   A miss sets the count back to zero */
const KNOWN_RUN = 3;
function grade(e, ok, recall) {
  const k = pid(e), t = today(); const p = S.prog[k] || { b: 0, d: t, n: 0, x: 0, f: t };
  p.n++;
  if (ok) {
    p.b = Math.min(p.b + 1, 6); p.d = t + INTERVALS[p.b];
    if (p.rd !== t) { p.r = (p.r || 0) + 1; p.rd = t; }
    if (recall) p.fr = 1;
    if (p.r >= KNOWN_RUN && p.fr && p.b < KNOWN_BOX) { p.b = KNOWN_BOX; p.d = t + INTERVALS[KNOWN_BOX]; }
  }
  else { p.x++; p.b = Math.max(0, Math.min(p.b, 1) - 1); p.d = t; p.r = 0; p.rd = t; delete p.fr; }
  S.prog[k] = p; save();
}
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
function scopeItems() { return kindList().filter(inScope); }
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
    '<p class="small muted">ערך נחשב ידוע כשהגיע לשלב 4 מתוך 6 בלוח החזרות, או כשסומן כידוע.</p>' +
    row('מילים וביטויים', D) + (CN.length ? row('מושגים', CN) : '') +
    (CN.length ? '<h3>מושגים לפי נושא</h3>' + TOPICS.map((t, k) => row(t, CN.filter(c => c.t === k))).join('') + '<h3>מושגים לפי פרק</h3>' + pkRows(CN) : '') +
    '<h3>מילים וביטויים לפי פרק</h3><p class="small muted">כל מילה נספרת בפרק שבו היא מופיעה לראשונה.</p>' + pkRows(D));
  $('pg-close').onclick = closeSheet;
}

/* ---------- navigation ---------- */
const TABS = ['learn', 'dict', 'quiz', 'games'];
let R = { tab: 'learn', sub: null };
function nav(tab, sub, replace, keep) {
  stopTimers();
  const next = { tab, sub: sub || null };
  const top = !R.sub && !next.sub;
  if (top && !replace && next.tab === 'learn' && history.state && history.state.tab && history.state.tab !== 'learn' && history.length > 1) { history.back(); return; }
  R = next;
  try { if (replace || (top && history.state && history.state.tab && history.state.tab !== 'learn')) history.replaceState(R, ''); else history.pushState(R, ''); } catch (e) { /* history unavailable */ }
  render(keep);
}
function goBack() { if (history.length > 1) history.back(); else nav('learn', null, true); }
window.addEventListener('popstate', ev => {
  stopTimers(); if (sheetOpen) closeSheet();
  const was = R; R = ev.state && ev.state.tab ? ev.state : { tab: 'learn', sub: null };
  render(!was.sub && !R.sub && was.tab !== R.tab);
});
/* what each panel shows now: the value of ver when it was drawn, and the inner screen if any */
const drawn = {};
function fresh(tab) { const d = drawn[tab]; return !!d && d.ver === ver && !d.sub && d.day === localDay(); }
function paint(tab) {
  const keepView = view, sub = tab === R.tab ? R.sub : null;
  view = PANEL[tab]; view.className = 'panel'; view.style.paddingBottom = '';
  try {
    if (tab === 'dict') renderDict();
    else if (tab === 'quiz') { if (sub === 'run' && quiz) renderQuiz(); else if (sub === 'done' && quiz) renderQuizDone(); else if (sub === 'review' && quiz) renderQuizReview(); else renderQuizSetup(); }
    else if (tab === 'xw') { if (sub === 'board' && xg) renderXW(); else if (sub === 'review' && xg) renderXWReview(); else renderXWSetup(); }
    else if (tab === 'games') {
      if (sub === 'wordle') { if (!wd || (!wd.arch && wd.day !== localDay())) wd = wdToday(); if (wd) renderWordle(); else renderGames(); }
      else if (sub === 'match' && game) renderMatch();
      else if (sub === 'blitz' && game) renderBlitz();
      else if (sub === 'fill' && game) renderFill();
      else if (sub === 'over' && game) renderGameOver();
      else if (sub === 'review' && game) renderGameReview();
      else renderGames();
    }
    else if (sub === 'session' && session) renderSession();
    else if (sub === 'done' && session) renderSessionDone();
    else if (sub === 'review' && session) renderLearnReview();
    else if (sub === 'more') renderMore();
    else renderLearn();
  } finally {
    drawn[tab] = { ver, sub: sub && R.tab === tab ? R.sub : null, day: localDay() };
    view = tab === R.tab ? PANEL[tab] : keepView;
  }
}
/* keep: a plain move between two main screens, which keeps the panel as it is when nothing changed since it was drawn */
function render(keep) {
  if (R.tab === 'xw' && R.sub === 'board' && xwStale()) {
    xwStopClock(); xg = null; R = { tab: 'learn', sub: null };
    try { history.replaceState(R, ''); } catch (e) { /* ignore */ }
    toast('התחיל יום חדש: הלוח היומי של היום מחכה'); keep = false;
  }
  const lit = R.tab === 'xw' ? 'games' : R.tab;   /* the crossword belongs to the games tab */
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === lit)));
  const from = shownTab;
  document.body.classList.toggle('xwmode', R.tab === 'xw' && R.sub === 'board');
  if (!(R.tab === 'xw' && R.sub === 'board') && xg && xg.open) { xg.open = false; xwSave(); }
  view = PANEL[R.tab];
  if (!keep || !fresh(R.tab)) { paint(R.tab); if (!keep) view.scrollTop = 0; }
  place(R.tab, !calm && from !== null && from !== R.tab);
}

/* moving between the four tabs: a tap or a sideways swipe slides the rail.
   The rail runs left to right in the order games, crossword, quiz, dictionary, learn, so the tab bar and the panels line up;
   each panel turns back to right to left inside. While a finger drags, the rail follows it with no transition */
const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rail = document.getElementById('rail'), railWrap = document.getElementById('rail-wrap');
/* the tab bar covers the bottom of every screen; its real height (a larger system font, the system's navigation bar) sets
   how much room the screens leave under their last item (--tabs-h), so nothing stays hidden behind it */
(function tabsHeight() {
  const bar = document.getElementById('tabs'); if (!bar) return;
  const set = () => { const h = Math.ceil(bar.getBoundingClientRect().height); if (h) document.documentElement.style.setProperty('--tabs-h', h + 'px'); };
  set(); window.addEventListener('resize', set); window.addEventListener('load', set);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(set);
  if (window.ResizeObserver) new ResizeObserver(set).observe(bar);
})();
/* the frame only clips the rail; if anything scrolls it (scrollIntoView, focus), put it back at once */
railWrap.addEventListener('scroll', () => { if (railWrap.scrollLeft || railWrap.scrollTop) { railWrap.scrollLeft = 0; railWrap.scrollTop = 0; } });
const EASE = 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)';
let shownTab = null;
function railAt(tab, px) { return 'translate3d(calc(' + (-RAIL.indexOf(tab) * 100 / RAIL.length) + '% + ' + (px || 0) + 'px),0,0)'; }
function place(tab, animate) {
  rail.style.transition = animate ? EASE : 'none';
  rail.style.transform = railAt(tab, 0);
  shownTab = tab;
  RAIL.forEach(t => { const p = PANEL[t]; if (t === tab) { p.removeAttribute('inert'); p.removeAttribute('aria-hidden'); } else { p.setAttribute('inert', ''); p.setAttribute('aria-hidden', 'true'); } });
}
function turnTo(tab) {
  if (tab === R.tab && !R.sub) { place(tab, !calm); return; }
  nav(tab, null, !!R.sub, !R.sub);
}
(function swipe() {
  let x0 = 0, y0 = 0, t0 = 0, dx = 0, active = false, tracking = false, blockClick = 0, target = null;
  const edge = 28;
  railWrap.addEventListener('touchstart', ev => {
    /* a swipe that never ended (the browser took the touch over) must not leave the rail between two screens */
    if (active) place(R.tab, false);
    tracking = false; active = false; dx = 0;
    if (R.sub || sheetOpen || ev.touches.length !== 1 || TABS.indexOf(R.tab) < 0) return;
    const t = ev.touches[0];
    if (t.clientX < edge || t.clientX > window.innerWidth - edge) return; /* leave the system back gesture alone */
    /* strips that scroll sideways themselves (the page picker) keep the swipe to themselves */
    if (ev.target.closest && ev.target.closest('.chips, .dpstrip, input, textarea, select')) return;
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); tracking = true;
  }, { passive: true });
  railWrap.addEventListener('touchmove', ev => {
    if (!tracking) return;
    const t = ev.touches[0]; dx = t.clientX - x0; const dy = t.clientY - y0;
    if (!active) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { tracking = false; return; }
      if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      active = true;
      const i = TABS.indexOf(R.tab);
      /* bring both neighbours up to date before they come into view */
      [TABS[i + 1], TABS[i - 1]].forEach(n => { if (n && !fresh(n)) paint(n); });
      rail.style.transition = 'none';
    }
    target = TABS[TABS.indexOf(R.tab) + (dx > 0 ? 1 : -1)] || null;
    rail.style.transform = railAt(R.tab, target ? dx : dx * 0.2);
  }, { passive: true });
  function end() {
    if (!tracking) return; tracking = false;
    if (!active) return; active = false; blockClick = Date.now();
    const fast = Math.abs(dx) > 40 && Math.abs(dx) / Math.max(1, Date.now() - t0) > 0.45;
    const far = Math.abs(dx) > Math.min(96, railWrap.clientWidth * 0.24);
    if (target && (far || fast)) turnTo(target); else place(R.tab, !calm);
  }
  railWrap.addEventListener('touchend', end, { passive: true });
  railWrap.addEventListener('touchcancel', end, { passive: true });
  railWrap.addEventListener('click', ev => { if (Date.now() - blockClick < 350) { ev.stopPropagation(); ev.preventDefault(); } }, true);
})();

/* ---------- the web version: offline cache and adding to the home screen ---------- */
let installEv = null;
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IN_APP = /WhatsApp|FBAN|FBAV|Instagram|Line\/|; wv\)/.test(navigator.userAgent);
const IOS_OTHER = IOS && /CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
function installHidden() { try { return Date.now() < +(localStorage.getItem('aramit-install-hide') || 0); } catch (e) { return false; } }
/* shown only in a browser, never inside the Android app or once opened from the home screen */
function installHtml() {
  if (NATIVE || STANDALONE || installHidden()) return '';
  let how;
  if (installEv) how = '<button class="btn wide" id="ins-go">התקנה כאפליקציה</button>';
  else if (IOS && (IN_APP || IOS_OTHER)) how = '<p class="small">באייפון: פתחו את הקישור בספארי, ושם: כפתור השיתוף ואז "הוסף למסך הבית".</p>';
  else if (IOS) how = '<p class="small">באייפון: כפתור השיתוף בתחתית ספארי, ואז "הוסף למסך הבית".</p>';
  else if (IN_APP) how = '<p class="small">פתחו את הקישור בדפדפן (בתפריט: פתיחה ב-Chrome), ושם בחרו "הוספה למסך הבית".</p>';
  else how = '<p class="small">בתפריט הדפדפן בחרו "הוספה למסך הבית" או "התקנת אפליקציה".</p>';
  return '<div class="install" id="install"><div class="row between"><b>הוסף כאפליקציה למסך הבית</b><button class="link" id="ins-x" aria-label="סגירה">סגירה</button></div>' +
    '<p class="small muted">כך היא נפתחת במסך מלא ועובדת גם בלי רשת.</p>' + how + '</div>';
}
function bindInstall() {
  const x = $('ins-x'); if (x) x.onclick = () => { try { localStorage.setItem('aramit-install-hide', String(Date.now() + 30 * 86400000)); } catch (e) { /* ignore */ } const b = $('install'); if (b) b.remove(); };
  const go = $('ins-go'); if (go) go.onclick = () => { const ev = installEv; installEv = null; ev.prompt(); ev.userChoice.then(() => { const b = $('install'); if (b) b.remove(); }); };
}
if (!NATIVE) {
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); installEv = ev; if (R.tab === 'learn' && !R.sub) { const keep = view; view = PANEL.learn; const b = $('install'); if (b) b.remove(); PANEL.learn.insertAdjacentHTML('beforeend', installHtml()); bindInstall(); view = keep; } });
  window.addEventListener('appinstalled', () => { const b = document.getElementById('install'); if (b) b.remove(); });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    const had = !!navigator.serviceWorker.controller;
    let asked = false;
    /* a new version waits in the background: a bar at the bottom offers it, and a tap lets it take over and reloads */
    const offer = w => {
      if (!w || !navigator.serviceWorker.controller || document.getElementById('upd')) return;
      document.body.insertAdjacentHTML('beforeend', '<button class="upd" id="upd" type="button">גרסה חדשה זמינה: לחצו לרענון</button>');
      document.getElementById('upd').onclick = () => { asked = true; w.postMessage({ type: 'skip-waiting' }); setTimeout(() => location.reload(), 3000); };
    };
    navigator.serviceWorker.register('sw.js').then(reg => {
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); }); });
    }).catch(() => { /* no offline cache in this browser */ });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!had) return;
      if (asked || (!R.sub && !sheetOpen)) location.reload(); else toast('גרסה חדשה הותקנה. היא תיטען בפתיחה הבאה');
    });
  }
}

/* ---------- learn ---------- */
let session = null;
function nounNew(n) { return SC.kind === 'words' ? 'מילים חדשות' : SC.kind === 'concepts' ? 'מושגים חדשים' : 'ערכים חדשים'; }
/* the order in which new entries are introduced. By page: words by first appearance and concepts by their source, together.
   By frequency: words from the most frequent down, and concepts in the order of the glossary, one concept after every three words */
function orderedScope() {
  const items = scopeItems();
  if (S.settings.order === 'daf') return items.slice().sort((x, y) => x.a - y.a || (x.cn ? 1 : 0) - (y.cn ? 1 : 0) || (x.cn ? x.i - y.i : y.c - x.c));
  const w = items.filter(e => !e.cn), c = items.filter(e => e.cn), out = [];
  let i = 0, j = 0;
  while (i < w.length || j < c.length) { for (let k = 0; k < 3 && i < w.length; k++) out.push(w[i++]); if (j < c.length) out.push(c[j++]); }
  return out;
}
function freshList(n) { const out = []; for (const e of orderedScope()) { if (out.length >= n) break; if (!S.prog[pid(e)]) out.push(e); } return out; }
function drillScope() { return SC.by === 'fav' || SC.by === 'miss'; }
/* days in a row with the daily crossword solved, counting back from today, or from yesterday while today is still open */
function dayOf(d) { return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); }
function xwStreak() { return streakOf(S.settings.xwDays, S.settings.xwDaily && S.settings.xwDaily.day); }
function xwStreakInfo() { return streakInfo(S.settings.xwDays, S.settings.xwDaily && S.settings.xwDaily.day); }
function dailyCardHtml() {
  const day = localDay(), d = S.settings.xwDaily && S.settings.xwDaily.day === day ? S.settings.xwDaily : null, xi = xwStreakInfo(), n = xi.n, wi = streakInfo(S.settings.wdDays);
  const tb = xwDailyBoard(day), sv = xwLoad(), going = sv && sv.day === day && sv.b.anchor;
  const wl = S.settings.wdLast && S.settings.wdLast.day === day ? S.settings.wdLast : null, wn = wi.n;
  let wgo = false; try { const o = JSON.parse(localStorage.getItem(WKEY) || 'null'); wgo = !!(o && o.day === day && o.rows && o.rows.length && !o.done); } catch (x) { /* none */ }
  const ed = tb ? tb.ed : xwEdition(day);
  return '<div class="hub" id="hub"><p class="hubh">האתגרים של היום</p><div class="hubg">' +
    '<button class="hcard" id="h-xw"><span class="hico xw" aria-hidden="true"><i class="y"></i><i></i><i class="y"></i><i></i><i class="y"></i><i></i><i class="y"></i><i></i><i class="y"></i></span><b>התשחץ היומי #' + ed + '</b>' + (tb ? '<span class="ht">' + esc(tb.theme) + '</span>' : '') +
      '<span class="hs' + (d ? ' ok' : '') + '" dir="rtl">' + (d ? 'הושלם ב-' + mmss(d.secs) + ' ✓' : going ? 'בתהליך' : 'פתור עכשיו') + '</span><span class="hf" dir="rtl">\u200f🔥 ' + n + ' <em>🛡️ ' + xi.shields + '/2</em></span></button>' +
    '<button class="hcard" id="h-wd"><span class="hico wd" aria-hidden="true"><i class="g"></i><i></i><i class="y"></i><i></i><i class="g"></i></span><b>וורדל #' + ed + '</b><span class="ht">מילה יומית בחמש אותיות</span>' +
      '<span class="hs' + (wl && wl.won ? ' ok' : '') + '" dir="rtl">' + (wl ? '\u200f' + (wl.won ? wl.n + '/6 ✓' : 'X/6') : wgo ? 'בתהליך' : 'פתור עכשיו') + '</span><span class="hf" dir="rtl">\u200f🔥 ' + wn + ' <em>🛡️ ' + wi.shields + '/2</em></span></button>' +
    '</div><div class="hubx">' + (ed > 1 || BETA ? '<button class="hlink" id="h-arch">ארכיון ‹</button>' : '') + (d && tb ? '<button class="hlink" id="h-share">שתף את התשחץ</button>' : '') + '</div></div>';
}
/* where the learner holds in the tractate: a page range (מדף עד דף) chosen in "מה מתרגלים" or in the quiz.
   It filters the daily learning, the quiz and the personal crossword; "+ דף" moves the last page on by one */
function gem(n) { const h = hebNum(n); return h.length === 1 ? h + '׳' : h.slice(0, -1) + '״' + h.slice(-1); }
function holdLabel() { return SC.d0 === SC.d1 ? 'דף ' + gem(SC.d0) : 'דפים ' + gem(SC.d0) + '–' + gem(SC.d1); }
function holdHtml() {
  if (SC.by !== 'daf') return '';
  return '<div class="hold"><button class="holdl" id="hold-open">אוחז ב' + esc(holdLabel()) + '<small>הכנה לדף ' + esc(gem(SC.d1)) + '</small></button><button class="btn line" id="hold-plus"' + (SC.d1 >= 157 ? ' disabled' : '') + '>+ דף</button></div>';
}
/* הכנה לדף: the words and concepts that appear for the first time on the last page of the range, to read before the lesson */
function openPrep() {
  const d = SC.d1, ws = D.filter(e => dafNum(e.a) === d).sort((x, y) => x.a - y.a || y.c - x.c), cs = CN.filter(e => dafNum(e.a) === d);
  const row = e => '<div><b>' + esc(e.w) + '</b> <span>' + esc(e.cn ? e.s : gloss(e)) + '</span>' + (e.rare ? ' <span class="rare">נדיר</span>' : '') + '</div>';
  openSheet('<div class="row between"><h2>הכנה לדף ' + esc(gem(d)) + '</h2><button class="link" id="pr-close">סגירה</button></div>' +
    '<p class="small muted">מה שמופיע לראשונה במסכת בדף ' + esc(gem(d)) + ': ' + ws.length + ' מילים וביטויים' + (cs.length ? ' ו-' + cs.length + ' מושגים' : '') + '.</p>' +
    (cs.length ? '<h3>מושגים</h3><div class="review prep">' + cs.map(row).join('') + '</div>' : '') +
    (ws.length ? '<h3>מילים וביטויים</h3><div class="review prep">' + ws.map(row).join('') + '</div>' : '<p>בדף הזה אין מילים חדשות.</p>') +
    ((ws.length || cs.length) ? '<button class="btn wide" id="pr-go">תרגול מילות הדף (' + (ws.length + cs.length) + ')</button>' : '') +
    '<button class="btn line wide" id="pr-scope">שינוי הטווח</button>');
  const pg = $('pr-go'); if (pg) pg.onclick = () => { closeSheet(); startSession('prep', cs.concat(ws).map(e => ({ e, isNew: !S.prog[pid(e)] }))); };
  $('pr-close').onclick = closeSheet;
  $('pr-scope').onclick = () => { closeSheet(); openScope(renderLearn); };
}
function renderLearn() {
  const list = scopeItems(), st = stats(list), room = Math.max(0, S.settings.newPerDay - newToday());
  const seg = [['var(--soft)', st.fresh], ['var(--gold)', st.boxes[0] + st.boxes[1]], ['var(--brand)', st.boxes[2] + st.boxes[3]], ['var(--good)', st.boxes[4] + st.boxes[5] + st.boxes[6]]];
  const drill = drillScope(), fresh = Math.min(room, st.fresh), todo = drill ? Math.min(list.length, 40) : st.due + fresh;
  const fem = SC.kind === 'words';
  view.innerHTML = scopeBar() +
    '<div class="today"><div class="ring" style="--p:' + (st.total ? (st.learned / st.total).toFixed(3) : 0) + '"><span><b>' + st.learned + '</b><small>מתוך ' + st.total + '</small></span></div>' +
    '<div class="tlist"><h3>הלימוד של היום</h3><div><span>לחזרה היום</span><b>' + st.due + '</b></div>' +
    '<div><span>' + (fem ? 'חדשות להיום' : 'חדשים להיום') + '</span><b>' + fresh + '</b></div>' +
    '<div><span>ידועים</span><b>' + st.learned + '</b></div></div>' +
    '<button class="btn wide" id="go"' + (list.length ? '' : ' disabled') + '>' + (!list.length ? 'אין ערכים בבחירה הזו' : drill ? 'תרגול הרשימה (' + todo + ')' : todo ? 'התחלת הלימוד של היום (' + todo + ')' : 'להמשיך ללמוד') + '</button></div>' +
    (list.length ? '<div class="stack"><div class="bar">' + seg.map(s => s[1] ? '<i style="background:' + s[0] + ';width:' + (s[1] / st.total * 100) + '%"></i>' : '').join('') + '</div>' +
    '<div class="legend"><span style="--c:var(--good)">ידועים ' + seg[3][1] + '</span><span style="--c:var(--brand)">בתהליך ' + seg[2][1] + '</span><span style="--c:var(--gold)">בתחילת הדרך ' + seg[1][1] + '</span><span style="--c:var(--line)">עוד לא נלמדו ' + st.fresh + '</span></div>' +
    '<button class="link start" id="pg-open">פירוט ההתקדמות לפי פרקים ונושאים</button></div>' : '') +
    (drill ? '<p class="note">' + (SC.by === 'fav' ? 'תרגול של הערכים שסימנת בכוכב.' : 'תרגול של הערכים שטעית בהם. ערך יוצא מהרשימה אחרי שתי תשובות נכונות ברצף.') + ' תשובה נכונה כאן לא משנה את לוח החזרות, וטעות מחזירה את הערך להתחלה.</p>' :
    '<p class="small muted">תשובה נכונה מרחיקה את החזרה הבאה: יום, שלושה ימים, שבוע, שבועיים, חודש וחודשיים. טעות מחזירה את הערך להתחלה.</p>');
  view.insertAdjacentHTML('afterbegin', dailyCardHtml() + holdHtml()); $('h-xw').onclick = startXWDaily; $('h-wd').onclick = startWordle;
  /* on the first day there is nothing in the archive yet */
  if ($('h-arch')) $('h-arch').onclick = openArchive;
  const hs = $('h-share'); if (hs) hs.onclick = () => { const day = localDay(), d = S.settings.xwDaily, tb = xwDailyBoard(day); if (d && d.day === day && tb) copyText(dailyShareText(tb, d.secs, d.hints || 0, d.checks || 0, day)); };
  const hp = $('hold-plus'); if (hp) hp.onclick = () => { if (SC.d1 < 157) { SC.d1++; saveSc(); render(false); toast('אוחז עד דף ' + hebNum(SC.d1)); } };
  const ho = $('hold-open'); if (ho) ho.onclick = openPrep;
  shieldNotice(); backupNote();
  view.insertAdjacentHTML('beforeend', installHtml()); bindInstall();
  $('go').onclick = () => startSession();
  $('sc-open').onclick = () => openScope(renderLearn);
  const pg = $('pg-open'); if (pg) pg.onclick = openProgress;
}
function buildQueue(kind) {
  const list = scopeItems();
  if (kind === 'more') return freshList(10).map(e => ({ e, isNew: true }));
  if (kind === 'free') {
    const seen = list.filter(e => S.prog[pid(e)]).sort((x, y) => (S.prog[pid(x)].b - S.prog[pid(y)].b) || (S.prog[pid(y)].x - S.prog[pid(x)].x));
    return shuffle(seen.slice(0, 20)).map(e => ({ e, isNew: false }));
  }
  if (drillScope()) return shuffle(list).slice(0, 40).map(e => ({ e, isNew: false }));
  const room = Math.max(0, S.settings.newPerDay - newToday());
  return shuffle(list.filter(isDue)).map(e => ({ e, isNew: false })).concat(freshList(room).map(e => ({ e, isNew: true })));
}
function startSession(kind, list) {
  const q = list || buildQueue(kind);
  if (!q.length) {
    if (kind) { toast(kind === 'free' ? 'עוד לא למדת ערכים מהבחירה הזו' : 'כל הערכים בבחירה הזו כבר נלמדו'); return; }
    if (drillScope()) { toast('הרשימה ריקה'); return; }
    nav('learn', 'more', R.sub === 'done' || R.sub === 'review'); return;
  }
  session = { kind: kind || (drillScope() ? 'free' : 'due'), queue: q, pos: 0, right: 0, wrong: 0, stage: 'ask', picked: null, mode: null, q: null, missed: [], review: null, list: list ? list.map(x => x.e) : null };
  nav('learn', 'session', R.sub === 'more' || R.sub === 'done' || R.sub === 'review');
}
function renderMore() {
  const st = stats(scopeItems());
  view.innerHTML = '<div class="result"><h2>סיימת את מה שתוכנן להיום</h2>' +
    '<p class="muted">אין כרגע ערכים לחזרה בבחירה הזו, והמכסה היומית של ערכים חדשים נוצלה. אפשר להמשיך בכל זאת.</p>' +
    '<button class="btn wide" id="more"' + (st.fresh ? '' : ' disabled') + '>עוד 10 ' + nounNew() + '</button>' +
    '<button class="btn ghost wide" id="free"' + (st.seen ? '' : ' disabled') + '>חזרה חופשית על מה שלמדתי</button>' +
    '<p class="small muted">בחזרה חופשית, תשובה נכונה לא משנה את לוח החזרות. טעות מחזירה את הערך להתחלה.</p>' +
    '<button class="link" id="back">חזרה</button></div>';
  $('more').onclick = () => startSession('more');
  $('free').onclick = () => startSession('free');
  $('back').onclick = goBack;
}
function pickMode(item) {
  if (item.isNew) return { type: 'intro' };
  return { type: Math.random() < 0.55 ? 'mcq' : 'flip' };
}
function wordCls(t) { return 'word' + (t.length > 14 ? ' md' : ''); }
function renderSession() {
  const s = session;
  if (s.review) return renderSessionReview();
  const item = s.queue[s.pos];
  if (!item) {
    if (s.missed.length) { s.review = { qs: shuffle(s.missed).map(e => makeQ(e, false, null)), pos: 0, right: 0, stage: 'ask', picked: null }; view.scrollTop = 0; return renderSessionReview(); }
    nav('learn', 'done', true); return;
  }
  const e = item.e, p = S.prog[pid(e)], cn = !!e.cn;
  if (!s.mode) {
    s.mode = pickMode(item);
    if (s.mode.type === 'mcq') s.q = makeQ(e, !!(p && p.b >= 3), null);
    if (s.mode.type === 'flip') s.rev = !!(p && p.b >= 2 && Math.random() < 0.4);
  }
  const m = s.mode; let inner = '';
  if (m.type === 'intro') {
    inner = cn
      ? '<span class="tag">מושג חדש, ' + esc(TOPICS[e.t]) + '</span><div class="' + wordCls(e.w) + '">' + esc(e.w) + '</div><div class="answer">' + esc(e.s) + '</div>' + explainHtml(e) +
        '<div class="two"><button class="btn ghost" id="known">כבר מכיר ✓</button><button class="btn" id="learn">ללמוד אותו</button></div>'
      : '<span class="tag">מילה חדשה</span><div class="' + wordCls(e.w) + '">' + esc(e.w) + '</div>' +
        '<div class="answer">' + esc(gloss(e)) + '</div>' + (e.v.length ? '<span class="src">' + esc(altLine(e)) + '</span>' : '') + srcHtml(e) +
        '<div class="two"><button class="btn ghost" id="known">כבר מכיר ✓</button><button class="btn" id="learn">ללמוד אותה</button></div>';
  } else if (m.type === 'flip') {
    const front = s.rev ? '<span class="tag">' + (cn ? 'איזה מושג מתאים להגדרה?' : 'איזו מילה מתאימה לפירוש?') + '</span><div class="word sm">' + esc(cn ? e.s : gloss(e)) + '</div>'
                        : '<span class="tag">' + (cn ? 'מה פירוש המושג?' : 'מה הפירוש?') + '</span><div class="' + wordCls(e.w) + '">' + esc(e.w) + '</div>';
    const back = cn ? '<div class="answer">' + (s.rev ? '<span class="word md">' + esc(e.w) + '</span>' : esc(e.s)) + '</div>' + explainHtml(e)
                    : '<div class="answer">' + (s.rev ? '<span class="word md">' + esc(e.w) + '</span>' : esc(gloss(e))) + '</div>' + srcHtml(e);
    inner = front + (s.stage === 'ask' ? '<button class="btn wide" id="show">הצגת התשובה</button>'
      : back + '<div class="two"><button class="btn bad" id="no">לא ידעתי</button><button class="btn good" id="yes">ידעתי</button></div>') +
      '<div class="knownrow"><button class="link" id="known">כבר מכיר ✓</button></div>';
  } else {
    const shown = s.stage === 'shown';
    inner = promptHtml(s.q) + optionsHtml(s.q, shown, s.picked) + (shown ? afterHtml(e) + '<button class="btn wide" id="next">הבא</button>' : '<div class="knownrow"><button class="link" id="known">כבר מכיר ✓</button></div>');
  }
  view.innerHTML = '<div class="row between"><span class="small muted">' + (s.pos + 1) + ' מתוך ' + s.queue.length + (p ? ' · שלב ' + p.b + ' מתוך 6' : '') + '</span><button class="link" id="quit">סיום</button></div>' +
    '<div class="progress"><i style="width:' + Math.round(s.pos / s.queue.length * 100) + '%"></i></div><section class="card" id="lcard">' + inner + '<i class="swhint"></i></section>' +
    '<p class="small muted center swtip">החלקה ימינה: זוכר. שמאלה: לחזרה. למעלה: כבר מכיר</p>';
  $('quit').onclick = () => nav('learn', 'done', true);
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('known', () => { markKnown(e); if (item.isNew) topUpNew(); advance(); });
  on('learn', () => { const t = today(); S.prog[pid(e)] = { b: 0, d: t, n: 0, x: 0, f: t }; save(); requeue(item, 2); advance(); });
  on('show', () => { s.stage = 'shown'; renderSession(); });
  on('yes', () => { apply(item, true); advance(); });
  on('no', () => { apply(item, false); advance(); });
  on('next', advance);
  view.querySelectorAll('.opt').forEach(b => { b.onclick = () => { s.picked = +b.dataset.i; s.stage = 'shown'; apply(item, s.q.opts[s.picked] === e); renderSession(); }; });
  /* the card follows the thumb. Right: remembered; left: back for review; up: already known. A question with four answers
     takes only the upward gesture, and one already answered takes none */
  const acts = {
    known: () => { markKnown(e); if (item.isNew) topUpNew(); advance(); },
    yes: m.type === 'intro' ? () => { const t = today(); S.prog[pid(e)] = { b: 0, d: t, n: 0, x: 0, f: t }; save(); requeue(item, 2); advance(); } : m.type === 'flip' ? () => { apply(item, true); advance(); } : null,
    no: m.type === 'intro' ? () => { const t = today(); S.prog[pid(e)] = { b: 0, d: t, n: 0, x: 0, f: t }; save(); requeue(item, 2); advance(); } : m.type === 'flip' ? () => { apply(item, false); advance(); } : null
  };
  if (m.type === 'mcq' && s.stage === 'shown') return;
  cardSwipe($('lcard'), acts);
}
function cardSwipe(card, acts) {
  if (!card) return;
  const hint = card.querySelector('.swhint'), LABEL = { yes: 'זוכר', no: 'לחזרה', known: 'כבר מכיר ✓' };
  let x0 = 0, y0 = 0, dx = 0, dy = 0, on = false, kind = null;
  const which = () => (-dy > 70 && -dy > Math.abs(dx)) ? 'known' : dx > 80 ? 'yes' : dx < -80 ? 'no' : null;
  card.addEventListener('touchstart', ev => { if (ev.touches.length !== 1 || ev.target.closest('button,a,input')) return; const t = ev.touches[0]; x0 = t.clientX; y0 = t.clientY; dx = dy = 0; on = true; card.classList.add('drag'); }, { passive: true });
  card.addEventListener('touchmove', ev => {
    if (!on) return; const t = ev.touches[0]; dx = t.clientX - x0; dy = t.clientY - y0;
    /* in a right-to-left page a move to the right is positive dx all the same */
    card.style.transform = 'translate(' + dx * 0.6 + 'px,' + Math.min(0, dy) * 0.6 + 'px) rotate(' + dx / 40 + 'deg)';
    kind = which(); if (kind && !acts[kind]) kind = null;
    hint.className = 'swhint' + (kind ? ' ' + kind : ''); hint.textContent = kind ? LABEL[kind] : ''; hint.style.opacity = kind ? 1 : Math.min(1, Math.max(Math.abs(dx), -dy) / 120) * 0.4;
  }, { passive: true });
  const end = () => {
    if (!on) return; on = false; card.classList.remove('drag');
    const k = which(), fn = k && acts[k];
    if (fn) { card.classList.add('fly'); card.style.transform = k === 'known' ? 'translateY(-120%)' : 'translateX(' + (k === 'yes' ? 120 : -120) + '%)'; card.style.opacity = 0; setTimeout(fn, 170); }
    else { card.classList.add('fly'); card.style.transform = ''; hint.style.opacity = 0; setTimeout(() => card.classList.remove('fly'), 200); }
  };
  card.addEventListener('touchend', end); card.addEventListener('touchcancel', end);
}
/* a new entry marked "כבר מכיר" in a round of the day: the next new entry of the order joins the end of the round */
function topUpNew() {
  const s = session; if (!s || s.kind === 'free' || s.kind === 'prep' || drillScope()) return;
  const inQ = new Set(s.queue.map(x => x.e)), next = orderedScope().find(e => !S.prog[pid(e)] && !inQ.has(e));
  if (next) s.queue.push({ e: next, isNew: true });
}
function apply(item, ok) {
  const s = session;
  noteAnswer(item.e, ok);
  if (!(s.kind === 'free' && ok)) grade(item.e, ok, s.mode && s.mode.type === 'flip'); else save();
  if (ok) s.right++; else { s.wrong++; if (s.missed.indexOf(item.e) < 0) s.missed.push(item.e); }
}
/* the end of a round: what was marked as not known comes back once, as a question with four answers.
   This round is for practice only; the review schedule already counted the miss */
function renderSessionReview() {
  const s = session, r = s.review, q = r.qs[r.pos];
  if (!q) { nav('learn', 'done', true); return; }
  const shown = r.stage === 'shown';
  view.innerHTML = '<div class="row between"><span class="small muted">חזרה על מה שלא ידעת: ' + (r.pos + 1) + ' מתוך ' + r.qs.length + '</span><button class="link" id="quit">סיום</button></div>' +
    '<div class="progress"><i style="width:' + Math.round(r.pos / r.qs.length * 100) + '%"></i></div>' +
    '<section class="card">' + promptHtml(q) + optionsHtml(q, shown, r.picked) +
    (shown ? afterHtml(q.e) + '<button class="btn wide" id="next">' + (r.pos + 1 < r.qs.length ? 'הבא' : 'לסיכום') + '</button>' : '') + '</section>';
  $('quit').onclick = () => nav('learn', 'done', true);
  view.querySelectorAll('.opt').forEach(b => { b.onclick = () => {
    r.picked = +b.dataset.i; r.stage = 'shown'; if (q.opts[r.picked] === q.e) r.right++;
    renderSessionReview();
    const ex = view.querySelector('.explain, .answer'); if (ex && ex.scrollIntoView) ex.scrollIntoView({ block: 'nearest' });
  }; });
  const nx = $('next'); if (nx) nx.onclick = () => { r.pos++; r.stage = 'ask'; r.picked = null; view.scrollTop = 0; renderSessionReview(); };
}
function requeue(item, gap) { const s = session; if (s.queue.length > 400) return; s.queue.splice(Math.min(s.pos + 1 + gap, s.queue.length), 0, { e: item.e, isNew: false }); }
function advance() { const s = session; s.pos++; s.mode = null; s.q = null; s.stage = 'ask'; s.picked = null; renderSession(); }
function renderSessionDone() {
  const s = session, n = s.missed.length, r = s.review;
  view.innerHTML = '<div class="result"><div class="big">' + s.right + '</div><p>תשובות נכונות, ' + s.wrong + ' טעויות</p>' +
    (r && r.pos ? '<p class="small">בחזרה בסוף הסבב: ' + r.right + ' נכונות מתוך ' + Math.min(r.pos, r.qs.length) + '.</p>' : '') +
    (n ? '<p class="muted small">ערכים שטעית בהם יחזרו מחר, ונכנסו לרשימת הטעויות החוזרות.</p>' : '') +
    doneButtons('עוד סיבוב', n) + '<button class="link" id="home">חזרה למסך הלימוד</button></div>';
  $('again').onclick = () => { if (s.list) { startSession(s.kind, s.list.map(e => ({ e, isNew: !S.prog[pid(e)] }))); return; } const k = s.kind === 'due' ? undefined : s.kind; startSession(k); };
  const mb = $('mist'); if (mb) mb.onclick = () => nav('learn', 'review');
  $('home').onclick = () => { session = null; goBack(); };
}
function renderLearnReview() {
  const ms = session.missed;
  view.innerHTML = '<div class="row between"><h2>הטעויות בסבב</h2><button class="link" id="back">חזרה</button></div>' + reviewHtml(ms.map(e => ({ e }))) +
    '<button class="btn wide" id="drill">חידון קצר על הטעויות האלה</button>';
  $('back').onclick = goBack;
  $('drill').onclick = () => drillOn(ms);
}
/* the two buttons that close every round: another round on top, and the mistakes under it */
function doneButtons(againLabel, n) {
  return '<button class="btn wide" id="again">' + againLabel + '</button>' +
    (n ? '<button class="btn ghost wide" id="mist">מעבר על הטעויות (' + n + ')</button>' : '<p class="muted small">בלי טעויות בסיבוב הזה.</p>');
}
function reviewHtml(ms) {
  return '<div class="review">' + ms.map(m => '<div><b>' + esc(m.e.w) + '</b><br><span>' + esc(m.e.cn ? m.e.s : gloss(m.e)) + '</span>' +
    (m.picked ? '<br><span class="small muted">בחרת: ' + esc(m.picked) + '</span>' : '') +
    '<br><span class="src">' + esc(m.e.cn ? cSource(m.e) : countLine(m.e) + ' · לראשונה ב' + dafName(m.e.a)) + '</span></div>').join('') + '</div>';
}
function drillOn(list, replace) {
  const go = () => { quiz = { drill: true, qs: shuffle(list).map(e => makeQ(e, false, null)), pos: 0, right: 0, wrong: [], stage: 'ask', picked: null, again: go }; nav('quiz', 'run', replace || (R.tab === 'quiz' && R.sub === 'done')); replace = false; };
  go();
}

/* ---------- dictionary ---------- */
/* the list draws DICT_STEP rows at a time and draws the next ones when the reader scrolls near its end */
const DICT_STEP = 80;
const dict = { q: '', sort: 'freq', filter: 'all', from: 0, open: null, limit: DICT_STEP, editing: false, more: false };
/* one search box serves both stores: results from the tab on screen come first, and results from the other store follow under their own heading */
function wordSearch(list, q) {
  const qs = stripPrefix(q), scored = [];
  for (const e of list) {
    let sc = -1;
    if (e.nw === q || e.sw === qs || e.nw === qs || e.alt.some(v => v[0] === q || v[1] === qs || v[0] === qs)) sc = 0;
    else if (e.nw.startsWith(q) || e.sw.startsWith(qs) || (e.p && e.sw.split(' ').some(x => x.startsWith(qs))) || e.alt.some(v => v[0].startsWith(q) || v[1].startsWith(qs))) sc = 1;
    else if (e.nw.includes(q) || (qs.length >= 2 && (e.sw.includes(qs) || e.nw.includes(qs)))) sc = 2;
    else if (q.length >= 2 && normGloss(e).includes(q)) sc = 3;
    if (sc >= 0) scored.push([sc, e]);
  }
  scored.sort((x, y) => x[0] - y[0]);
  return scored.map(x => x[1]);
}
/* the normalized gloss is kept with the entry and made again only when the gloss changes, so a search over thousands of entries stays quick */
function normGloss(e) { const g = gloss(e); if (e._g !== g) { e._g = g; e._ng = norm(g); } return e._ng; }
function conceptSearch(list, q) {
  const qs = stripPrefix(q), scored = [];
  for (const c of list) {
    let sc = -1;
    if (c.nw === q || c.nw === qs) sc = 0;
    else if (c.nw.startsWith(q) || c.nw.startsWith(qs)) sc = 1;
    else if (c.nw.split(' ').some(x => x.startsWith(q) || (qs.length >= 2 && x.startsWith(qs)))) sc = 2;
    else if (c.nw.includes(q) || (qs.length >= 2 && c.nw.includes(qs))) sc = 3;
    else if (q.length >= 2 && (c.ns.includes(q) || norm(gloss(c)).includes(q))) sc = 4;
    if (sc >= 0) scored.push([sc, c]);
  }
  scored.sort((x, y) => x[0] - y[0]);
  return scored.map(x => x[1]);
}
function dictRows() {
  const q = norm(dict.q);
  let list = dict.sort === 'daf' ? BYDAF : D;
  list = list.filter(e => {
    if (dict.filter === 'words' && e.p) return false;
    if (dict.filter === 'phrases' && !e.p) return false;
    if (dict.filter === 'seen' && !S.prog[e.w]) return false;
    if (dict.filter === 'new' && S.prog[e.w]) return false;
    if (dict.filter === 'fav' && !S.fav[e.w]) return false;
    if (dict.filter === 'rare' && !e.rare) return false;
    if (dict.sort === 'daf' && dafNum(e.a) < dict.from) return false;
    return true;
  });
  return q ? wordSearch(list, q) : list;
}
let dictKind = 'words';
function kindSeg(id, kind) {
  return '<div class="seg" id="' + id + '"><button data-v="words" aria-pressed="' + (kind === 'words') + '">מילים וביטויים</button>' +
    '<button data-v="concepts" aria-pressed="' + (kind === 'concepts') + '">מושגים</button></div>';
}
const cdict = { sort: 'topic', topic: -1, open: null, editing: false };
function cRows() {
  const q = norm(dict.q);
  let list = cdict.sort === 'daf' ? CNBYDAF : CN;
  if (cdict.topic >= 0) list = list.filter(c => c.t === cdict.topic);
  if (cdict.topic === -2) list = list.filter(isFav);
  return q ? conceptSearch(list, q) : list;
}
function wordItem(e) {
  const open = dict.open === e.w;
  return '<div class="item' + (open ? ' open' : '') + '" data-w="' + esc(e.w) + '"><span class="w">' + esc(e.w) + dotColor(e) + (e.rare ? '<span class="rare">נדיר</span>' : '') + '</span>' +
    '<span class="n"><b>' + (e.x ? '~' : '') + e.c + '</b>' + dafShort(e.a) + '</span>' + starHtml(e) +
    '<span class="m">' + esc(gloss(e)) + (S.edits[e.w] ? ' <span class="edited">נערך</span>' : '') + (e.v.length ? '<br><span class="small">' + esc(altLine(e)) + '</span>' : '') + '</span>' + (open ? detailHtml(e) : '') + '</div>';
}
function conceptItem(c) {
  const open = cdict.open === c.i;
  return '<div class="item' + (open ? ' open' : '') + '" data-i="' + c.i + '"><span class="w">' + esc(c.w) + dotColor(c) + '</span>' +
    '<span class="n"><b>' + dafShort(c.a) + '</b>' + (c.mi ? 'משנה' : 'גמרא') + '</span>' + starHtml(c) +
    '<span class="m">' + esc(c.s) + (S.edits[c.key] ? ' <span class="edited">נערך</span>' : '') + '</span>' + (open ? cDetailHtml(c) : '') + '</div>';
}
const OTHER_MAX = 40;
/* the block of results from the store that is not on screen */
function otherHtml(kind, rows) {
  if (!rows.length) return '';
  const name = kind === 'words' ? 'מילים וביטויים' : 'מושגים', shown = rows.slice(0, OTHER_MAX);
  return '<div class="otherhead"><b>מתוך ' + name + '</b><span>' + rows.length + '</span></div>' +
    shown.map(kind === 'words' ? wordItem : conceptItem).join('') +
    (rows.length > shown.length ? '<p class="small muted otherfoot">מוצגות ' + shown.length + ' התוצאות הראשונות מתוך ' + rows.length + '. המתג שלמעלה מציג את כולן.</p>' : '');
}
function countText(kind, q, n, m) {
  if (!q) return kind === 'words' ? (n ? n + ' ערכים' : dict.filter === 'fav' ? 'עוד לא סימנת מילים בכוכב.' : 'אין ערכים בסינון הזה.') : (n ? nConcepts(n) + (cdict.topic === -2 ? ' במועדפים' : ' מן המשנה ומן הגמרא') : cdict.topic === -2 ? 'עוד לא סימנת מושגים בכוכב.' : 'אין מושגים בנושא הזה.');
  if (!n && !m) return 'לא נמצאו תוצאות, לא במילים ולא במושגים. אפשר לנסות בלי אותיות השימוש, או לחפש מילה מתוך הפירוש.';
  const a = kind === 'words' ? 'מילים וביטויים' : 'מושגים', b = kind === 'words' ? 'מושגים' : 'מילים וביטויים';
  const res = k => k === 1 ? 'תוצאה אחת' : k + ' תוצאות';
  return a + ': ' + res(n) + '. ' + b + ': ' + res(m) + '.';
}
function refill() { if (dictKind === 'concepts' && CN.length) fillCDict(); else fillDict(); }
/* a tap on any card, from either store, opens it in place. One card is open at a time */
function bindItem(el) {
  el.onclick = ev => {
    if (ev.target.closest('.detail')) return;
    if (el.dataset.w !== undefined) { dict.open = dict.open === el.dataset.w ? null : el.dataset.w; cdict.open = null; }
    else { const i = +el.dataset.i; cdict.open = cdict.open === i ? null : i; dict.open = null; }
    dict.editing = false; cdict.editing = false; refill();
  };
}
function bindItems() {
  view.querySelectorAll('#dlist .item, #dother .item').forEach(bindItem);
  bindStars(view, refill);
  const det = view.querySelector('.detail'); if (!det) return;
  if (det.parentNode.dataset.w !== undefined) bindDetail(det, BY.get(det.parentNode.dataset.w)); else bindCDetail(CN[+det.parentNode.dataset.i]);
}
function bindSearch() {
  const qi = $('dq');
  let tm = null;
  qi.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { dict.q = qi.value; dict.limit = DICT_STEP; dict.open = null; cdict.open = null; refill(); }, 90); };
}
const SEARCH_HINT = 'חיפוש במילים, בביטויים ובמושגים';
function renderCDict() {
  view.innerHTML = kindSeg('dkind', 'concepts') +
    '<div class="dsearch"><input type="search" id="dq" placeholder="' + SEARCH_HINT + '" value="' + esc(dict.q) + '" autocomplete="off" enterkeyhint="search">' +
    '<button class="morebtn" id="dmore-opts" aria-expanded="' + !!dict.more + '">סינון ומיון ' + (dict.more ? '▴' : '▾') + (cdict.topic !== -1 || cdict.sort !== 'topic' ? ' •' : '') + '</button></div>' +
    (dict.more ? '<div class="dopts"><div class="seg" id="dsort"><button data-v="topic" aria-pressed="' + (cdict.sort === 'topic') + '">לפי נושאים</button><button data-v="daf" aria-pressed="' + (cdict.sort === 'daf') + '">לפי סדר הדפים</button></div>' +
    '<div class="chips" id="dchips"><button class="chip" data-v="-1" aria-pressed="' + (cdict.topic === -1) + '">הכול</button><button class="chip" data-v="-2" aria-pressed="' + (cdict.topic === -2) + '">מועדפים</button>' +
    TOPICS.map((t, k) => '<button class="chip" data-v="' + k + '" aria-pressed="' + (cdict.topic === k) + '">' + esc(t) + '</button>').join('') + '</div></div>' : '') +
    '<p class="small muted" id="dcount"></p><div class="list" id="dlist"></div><div class="list" id="dother"></div>';
  bindSeg('dkind', v => { dictKind = v; renderDict(); });
  $('dmeter').onclick = openProgress;
  bindSearch();
  $('dmore-opts').onclick = () => { dict.more = !dict.more; renderCDict(); };
  bindSeg('dsort', v => { cdict.sort = v; cdict.open = null; renderCDict(); });
  const dc = $('dchips');
  if (dc) { dc.querySelectorAll('button').forEach(b => { b.onclick = () => { cdict.topic = +b.dataset.v; cdict.open = null; renderCDict(); }; });
    const on = dc.querySelector('[aria-pressed="true"]'); if (on && on.scrollIntoView && cdict.topic > 1) on.scrollIntoView({ block: 'nearest', inline: 'center' }); }
  fillCDict();
}
function fillCDict() {
  const q = norm(dict.q), rows = cRows(), other = q ? wordSearch(D, q) : [];
  $('dcount').textContent = countText('concepts', q, rows.length, other.length);
  let h = '', last = -1;
  for (const c of rows) {
    if (!q && cdict.sort === 'topic' && cdict.topic === -1 && c.t !== last) { last = c.t; h += '<div class="dafhead">' + esc(TOPICS[c.t]) + '</div>'; }
    if (!q && cdict.sort === 'daf' && c.pk !== last) { last = c.pk; h += '<div class="dafhead">פרק ' + ordPk(c.pk) + ': ' + esc(PEREKS[c.pk][0]) + '</div>'; }
    h += conceptItem(c);
  }
  $('dlist').innerHTML = h;
  $('dother').innerHTML = otherHtml('words', other);
  bindItems();
}
function cDetailHtml(c) {
  const p = S.prog[c.key];
  let h = '<div class="detail">';
  if (cdict.editing) {
    h += '<div class="field"><label for="ded">ההסבר שלך (נשמר רק במכשיר הזה)</label><textarea id="ded" class="tall">' + esc(gloss(c)) + '</textarea></div>' +
      '<div class="row"><button class="btn" id="dsave">שמירה</button><button class="btn ghost" id="dcancel">ביטול</button>' +
      (S.edits[c.key] ? '<button class="link" id="drestore">שחזור ההסבר המקורי</button>' : '') + '</div>';
  } else {
    h += '<p class="cfull">' + esc(gloss(c)) + '</p><p class="small muted">' + esc(cSource(c)) + '.</p><p class="small muted">' + esc(stageName(c)) + '.</p>' +
      '<div class="row"><button class="btn ghost" id="dedit">עריכת ההסבר</button>' +
      (p ? '<button class="link" id="dreset">איפוס ההתקדמות במושג</button>' : '<button class="link" id="dknown">סימון כמושג שאני יודע</button>') + '</div>';
  }
  return h + '</div>';
}
function bindCDetail(c) {
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('dedit', () => { cdict.editing = true; refill(); const t = $('ded'); if (t) t.focus(); });
  on('dcancel', () => { cdict.editing = false; refill(); });
  on('dsave', () => { const v = $('ded').value.trim(); if (v && v !== c.m0) S.edits[c.key] = v; else delete S.edits[c.key]; save(); cdict.editing = false; toast('ההסבר נשמר'); refill(); });
  on('drestore', () => { delete S.edits[c.key]; save(); cdict.editing = false; toast('ההסבר המקורי שוחזר'); refill(); });
  on('dknown', () => { markKnown(c); toast('סומן כמושג ידוע'); refill(); });
  on('dreset', () => { delete S.prog[c.key]; save(); toast('המושג חזר להתחלה'); refill(); });
}
function renderDict() {
  if (dictKind === 'concepts' && CN.length) return renderCDict();
  const dafOpts = []; for (let n = 2; n <= 157; n++) dafOpts.push('<option value="' + n + '"' + (dict.from === n ? ' selected' : '') + '>מדף ' + hebNum(n) + '</option>');
  const chips = [['all', 'הכול'], ['fav', 'מועדפים'], ['words', 'מילים'], ['phrases', 'ביטויים'], ['rare', 'מילים נדירות'], ['seen', 'למדתי'], ['new', 'עוד לא למדתי']];
  /* on top only the store, the search and one small button; the filters and the order open under it */
  view.innerHTML = (CN.length ? kindSeg('dkind', 'words') : '') +
    '<div class="dsearch"><input type="search" id="dq" placeholder="' + (CN.length ? SEARCH_HINT : 'חיפוש בארמית או בעברית') + '" value="' + esc(dict.q) + '" autocomplete="off" enterkeyhint="search">' +
    '<button class="morebtn" id="dmore-opts" aria-expanded="' + !!dict.more + '">סינון ומיון ' + (dict.more ? '▴' : '▾') + (dict.filter !== 'all' || dict.sort !== 'freq' ? ' •' : '') + '</button></div>' +
    (dict.more ? '<div class="dopts"><div class="seg" id="dsort"><button data-v="freq" aria-pressed="' + (dict.sort === 'freq') + '">לפי שכיחות</button><button data-v="daf" aria-pressed="' + (dict.sort === 'daf') + '">לפי סדר הדפים</button></div>' +
    (dict.sort === 'daf' ? '<select id="dfrom" aria-label="התחלה מדף"><option value="0">מתחילת המסכת (דף ב)</option>' + dafOpts.join('') + '</select>' : '') +
    '<div class="chips" id="dchips">' + chips.map(c => '<button class="chip" data-v="' + c[0] + '" aria-pressed="' + (dict.filter === c[0]) + '">' + c[1] + '</button>').join('') + '</div></div>' : '') +
    '<p class="small muted" id="dcount"></p><div class="list" id="dlist"></div><div id="dmore"></div><div class="list" id="dother"></div>';
  bindSeg('dkind', v => { dictKind = v; renderDict(); });
  bindSearch();
  $('dmore-opts').onclick = () => { dict.more = !dict.more; renderDict(); };
  bindSeg('dsort', v => { dict.sort = v; dict.limit = DICT_STEP; renderDict(); });
  const df = $('dfrom'); if (df) df.onchange = () => { dict.from = +df.value; dict.limit = DICT_STEP; fillDict(); };
  const dc = $('dchips'); if (dc) dc.querySelectorAll('button').forEach(b => { b.onclick = () => { dict.filter = b.dataset.v; dict.limit = DICT_STEP; renderDict(); }; });
  fillDict();
}
let dictRowsNow = [], dictObs = null;
function dictHtml(from, to) {
  const grouped = dict.sort === 'daf' && !norm(dict.q); let h = '', last = from > 0 ? dafNum(dictRowsNow[from - 1].a) : -1;
  for (let k = from; k < to; k++) {
    const e = dictRowsNow[k];
    if (grouped && dafNum(e.a) !== last) { last = dafNum(e.a); h += '<div class="dafhead">דף ' + hebNum(last) + '</div>'; }
    h += wordItem(e);
  }
  return h;
}
function fillDict() {
  const q = norm(dict.q), rows = dictRows(), other = q && CN.length ? conceptSearch(CN, q) : [];
  dictRowsNow = rows; dict.limit = Math.max(DICT_STEP, Math.min(dict.limit, rows.length));
  $('dcount').textContent = countText('words', q, rows.length, other.length);
  $('dlist').innerHTML = dictHtml(0, Math.min(dict.limit, rows.length));
  $('dother').innerHTML = otherHtml('concepts', other);
  dictMore();
  bindItems();
}
/* the next rows are added below the ones on screen, without drawing the list again */
function dictGrow() {
  const list = $('dlist'), shown = Math.min(dict.limit, dictRowsNow.length);
  if (!list || shown >= dictRowsNow.length) return;
  dict.limit = Math.min(shown + DICT_STEP, dictRowsNow.length);
  list.insertAdjacentHTML('beforeend', dictHtml(shown, dict.limit));
  [...list.children].forEach(el => { if (el.classList.contains('item') && !el.onclick) bindItem(el); });
  bindStars(list, refill);
  dictMore();
}
function dictMore() {
  const box = $('dmore'); if (!box) return;
  const left = dictRowsNow.length - Math.min(dict.limit, dictRowsNow.length);
  if (dictObs) { dictObs.disconnect(); dictObs = null; }
  box.innerHTML = left > 0 ? '<button class="btn ghost wide" id="dmorebtn">עוד ' + left + ' ערכים</button>' : '';
  if (left <= 0) return;
  $('dmorebtn').onclick = dictGrow;
  if ('IntersectionObserver' in window) {
    dictObs = new IntersectionObserver(en => { if (en.some(x => x.isIntersecting)) dictGrow(); }, { root: null, rootMargin: '0px 0px 600px 0px' });
    dictObs.observe(box);
  }
}
function detailHtml(e) {
  const p = S.prog[e.w];
  let h = '<div class="detail"><p class="small muted">' + esc(countLine(e)) + '. לראשונה ב' + dafName(e.a) + '.</p><p class="small muted">' + esc(stageName(e)) + '</p>';
  if (dict.editing) {
    h += '<div class="field"><label for="ded">הפירוש שלך (נשמר רק במכשיר הזה)</label><textarea id="ded">' + esc(gloss(e)) + '</textarea></div>' +
      '<div class="row"><button class="btn" id="dsave">שמירה</button><button class="btn ghost" id="dcancel">ביטול</button>' +
      (S.edits[e.w] ? '<button class="link" id="drestore">שחזור הפירוש המקורי</button>' : '') + '</div>' +
      (S.edits[e.w] ? '<p class="small muted">הפירוש המקורי: ' + esc(e.m0) + '</p>' : '');
  } else {
    h += '<div class="row"><button class="btn ghost" id="dedit">עריכת הפירוש</button>' +
      (p ? '<button class="link" id="dreset">איפוס ההתקדמות במילה</button>' : '<button class="link" id="dknown">סימון כמילה שאני יודע</button>') + '</div>';
  }
  return h + '</div>';
}
function bindDetail(det, e) {
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('dedit', () => { dict.editing = true; refill(); const t = $('ded'); if (t) t.focus(); });
  on('dcancel', () => { dict.editing = false; refill(); });
  on('dsave', () => { const v = $('ded').value.trim(); if (v && v !== e.m0) S.edits[e.w] = v; else delete S.edits[e.w]; save(); dict.editing = false; toast('הפירוש נשמר'); refill(); });
  on('drestore', () => { delete S.edits[e.w]; save(); dict.editing = false; toast('הפירוש המקורי שוחזר'); refill(); });
  on('dreset', () => { delete S.prog[e.w]; save(); toast('המילה חזרה להתחלה'); refill(); });
  on('dknown', () => { markKnown(e); toast('סומנה כמילה ידועה'); refill(); });
}

/* ---------- quiz ---------- */
let quiz = null;
const quizCfg = { len: 10, mode: 'lex' };
/* in a choice by chapters or by pages, wrong answers for a concept come from the chosen part first, and a small part is completed from the rest of the glossary.
   For a word the wrong answers always come from the whole deck: that is what makes a look-alike a look-alike */
function narrowed() { return (SC.by === 'perek' && SC.pereks.length > 0) || SC.by === 'daf'; }
function makeQ(e, tough, cpool) { return e.cn ? makeCQuestion(e, tough, cpool) : makeQuestion(e, tough); }
function startQuiz(items, extra) {
  const cpool = narrowed() && !(extra && extra.daily) ? items.filter(e => e.cn) : null;
  quiz = Object.assign({ kind: SC.kind, qs: items.map(e => makeQ(e, false, cpool && cpool.length ? cpool : null)), pos: 0, right: 0, wrong: [], stage: 'ask', picked: null }, extra || {});
  nav('quiz', 'run', R.tab === 'quiz' && R.sub === 'done');
}
/* no levels anywhere (24.11.2026). From the whole store the quiz asks only the chosen store (the common words);
   the rare words of the expanded store come only with a choice by chapters or pages */
function quizItems() { const all = scopeItems(); return SC.by === 'all' ? all.filter(e => e.cn || !e.ext) : all; }
function lenCard(n, noun) {
  return qCard('מספר שאלות', '<div class="seg" id="qlen">' + [10, 20, 40].map(k => '<button data-v="' + k + '" aria-pressed="' + (quizCfg.len === k) + '">' + k + '</button>').join('') + '</div>' +
    (n && n < quizCfg.len ? '<p class="small muted">בבחירה הזו יש ' + noun(n) + ', וזה יהיה אורך החידון.</p>' : ''));
}
function renderQuizSetup() {
  if (quizCfg.mode === 'content' && CT.length) return renderTQSetup();
  if (SC.kind === 'both') { SC.kind = 'words'; saveSc(); }
  const src = quizItems(), n = src.length, key = { words: 'quiz-', concepts: 'cquiz-', both: 'mquiz-' }[SC.kind] + 'mid', b = S.best[key];
  const few = narrowed() && SC.kind !== 'words' && src.filter(e => e.cn).length < 4 && src.some(e => e.cn);
  view.innerHTML = '<div class="qsetup"><h2>חידון אמריקאי</h2>' + modeSeg() + scopeHtml(true, true) +
    (few ? '<p class="small muted">בבחירה הזו יש פחות מארבעה מושגים, ולכן התשובות השגויות יושלמו משאר המילון, קודם מאותו נושא.</p>' : '') +
    lenCard(n, k => k + ' ערכים') +
    '<button class="btn wide" id="qstart"' + (n ? '' : ' disabled') + '>' + (n ? 'התחלת החידון' : 'אין ערכים בבחירה הזו') + '</button>' +
    (b ? '<p class="small muted qbest">התוצאה הטובה ביותר שלך: ' + b + '%</p>' : '') + '</div>';
  bindMode(); bindScope(renderQuizSetup);
  bindSeg('qlen', v => { quizCfg.len = +v; renderQuizSetup(); });
  const len = quizCfg.len;
  const go = () => { const items = quizItems(); if (!items.length) { toast('אין ערכים בבחירה הזו'); return; } startQuiz(sample(items, Math.min(len, items.length)), { bestKey: key, again: go }); };
  $('qstart').onclick = go;
}
/* the short daily round that the reminder opens: ten entries, mistakes first, then what is due, then what was learned, then anything */
function startDaily() {
  const all = D.concat(CN), take = [], seen = new Set();
  const add = list => { for (const e of shuffle(list)) { if (take.length >= 10) return; if (!seen.has(e)) { seen.add(e); take.push(e); } } };
  add(all.filter(e => S.miss[pid(e)])); add(all.filter(isDue)); add(all.filter(e => S.prog[pid(e)])); add(all);
  if (sheetOpen && S.onboarded) closeSheet();
  startQuiz(shuffle(take), { kind: 'both', daily: true, again: startDaily });
}
function renderQuiz() {
  const z = quiz, q = z.qs[z.pos];
  if (!q) { finishQuiz(); return; }
  if (q.ct) { renderTQ(); return; }
  const shown = z.stage === 'shown';
  view.innerHTML = '<div class="row between"><span class="small muted">' + (z.daily ? 'חזרה יומית, ' : '') + 'שאלה ' + (z.pos + 1) + ' מתוך ' + z.qs.length + '</span><button class="link" id="quit">סיום</button></div>' +
    '<div class="progress"><i style="width:' + Math.round(z.pos / z.qs.length * 100) + '%"></i></div>' +
    '<section class="card">' + promptHtml(q) + optionsHtml(q, shown, z.picked) +
    (shown ? afterHtml(q.e) + '<button class="btn wide" id="next">' + (z.pos + 1 < z.qs.length ? 'הבא' : 'לתוצאות') + '</button>' : '') + '</section>';
  $('quit').onclick = finishQuiz;
  view.querySelectorAll('.opt').forEach(b => { b.onclick = () => {
    z.picked = +b.dataset.i; z.stage = 'shown'; const ok = q.opts[z.picked] === q.e;
    if (ok) z.right++; else z.wrong.push(q.e);
    noteAnswer(q.e, ok); save(); renderQuiz();
    if (!ok && q.e.cn) { const ex = view.querySelector('.explain'); if (ex && ex.scrollIntoView) ex.scrollIntoView({ block: 'nearest' }); }
  }; });
  const nx = $('next'); if (nx) nx.onclick = () => { z.pos++; z.stage = 'ask'; z.picked = null; renderQuiz(); view.scrollTop = 0; };
}
function finishQuiz() {
  const z = quiz; z.answered = z.pos + (z.stage === 'shown' ? 1 : 0);
  if (z.bestKey && z.answered === z.qs.length) { const pct = Math.round(z.right / z.qs.length * 100); if (!S.best[z.bestKey] || pct > S.best[z.bestKey]) { S.best[z.bestKey] = pct; save(); } }
  nav('quiz', 'done', true);
}
function renderQuizDone() {
  const z = quiz, n = z.answered || 0, m = z.wrong.length;
  view.innerHTML = '<div class="result"><div class="big">' + z.right + '/' + n + '</div><p>' + (n ? Math.round(z.right / n * 100) + '% נכון' + (z.kind === 'content' ? ', חידון תוכן' : z.daily ? ', חזרה יומית' : '') : 'לא נענו שאלות') + '</p>' +
    (m && z.kind !== 'content' ? '<p class="small muted">הערכים שטעית בהם נכנסו לרשימת הטעויות החוזרות, ואפשר לתרגל אותה בחידון ובלימוד.</p>' : '') +
    doneButtons('עוד סיבוב', m) + '<button class="link" id="back">' + (z.drill ? 'חזרה לרשימת הטעויות' : 'חזרה') + '</button></div>';
  $('again').onclick = () => { if (z.again) z.again(); else { quiz = null; goBack(); } };
  const mb = $('mist'); if (mb) mb.onclick = () => nav('quiz', 'review');
  $('back').onclick = () => { quiz = null; goBack(); };
}
function renderQuizReview() {
  const z = quiz;
  view.innerHTML = '<div class="row between"><h2>הטעויות בחידון</h2><button class="link" id="back">חזרה</button></div>' +
    (z.kind === 'content'
      ? '<div class="review">' + z.wrong.map(x => '<div><b>' + esc(x.q) + '</b><br><span>' + esc(x.ans) + '</span><br><span class="src">' + esc(ctSource(x)) + '</span></div>').join('') + '</div>'
      : reviewHtml(z.wrong.map(e => ({ e }))) + '<button class="btn wide" id="drill">חידון קצר על הטעויות האלה</button>');
  $('back').onclick = goBack;
  const dr = $('drill'); if (dr) dr.onclick = () => drillOn(z.wrong.slice(), true);
}

/* ---------- content quiz: questions on the course of the sugyot ---------- */
const CTOPICS = (window.CTOPICS || []).map(t => Array.isArray(t) ? { n: t[0], pk: t[1] } : { n: t, pk: -1 });
const CT = (window.CQ || []).map((r, i) => ({ i, a: r[0], t: r[1], lv: r[2], q: r[3], ans: r[4], dis: [r[5], r[6], r[7]], quote: r[8], src: r[9], basis: r[10], note: r[11], pk: Number.isInteger(r[12]) ? r[12] : pkOf(r[0]) }));
const CT_D0 = CT.length ? dafNum(Math.min.apply(null, CT.map(x => x.a))) : 2, CT_D1 = CT.length ? dafNum(Math.max.apply(null, CT.map(x => x.a))) : 2;
const TQ = { by: 'all', topic: -1, d0: CT_D0, d1: CT_D1, pereks: [] };
function saveTq() { S.settings.tq = { by: TQ.by, topic: TQ.topic, d0: TQ.d0, d1: TQ.d1, pereks: TQ.pereks.slice() }; save(); }
function restoreTq() {
  const c = S.settings.tq || {};
  TQ.by = c.by === 'topic' || c.by === 'daf' || c.by === 'perek' ? c.by : 'all';
  TQ.pereks = (Array.isArray(c.pereks) ? c.pereks : []).filter((k, i, l) => Number.isInteger(k) && k >= 0 && k < PEREKS.length && l.indexOf(k) === i).sort((x, y) => x - y);
  TQ.topic = Number.isInteger(c.topic) && c.topic >= 0 && c.topic < CTOPICS.length ? c.topic : -1;
  TQ.d0 = Number.isInteger(c.d0) && c.d0 >= CT_D0 && c.d0 <= CT_D1 ? c.d0 : CT_D0;
  TQ.d1 = Number.isInteger(c.d1) && c.d1 >= TQ.d0 && c.d1 <= CT_D1 ? c.d1 : CT_D1;
  quizCfg.mode = S.settings.qmode === 'content' && CT.length ? 'content' : 'lex';
}
function tqWhere(x) { return TQ.by === 'perek' ? (!TQ.pereks.length || TQ.pereks.indexOf(x.pk) >= 0) : TQ.by === 'topic' ? (TQ.topic < 0 || x.t === TQ.topic) : TQ.by === 'daf' ? (dafNum(x.a) >= TQ.d0 && dafNum(x.a) <= TQ.d1) : true; }
function tqItems() { return CT.filter(tqWhere); }
function nQuestions(n) { return n === 1 ? 'שאלה אחת' : n + ' שאלות'; }
function ctSource(x) { return ['גמרא', 'משנה', 'משנה וגמרא'][x.src] + ', ' + dafName(x.a) + ', פרק ' + ordPk(x.pk) + ' (' + PEREKS[x.pk][0] + ')'; }
/* the switch at the top of the quiz screen: the three stores of the lexicon, and the content of the sugya */
function modeSeg() {
  const cur = quizCfg.mode === 'content' ? 'content' : SC.kind;
  const opts = [['words', KINDS.words]].concat(CN.length ? [['concepts', KINDS.concepts]] : [], CT.length ? [['content', 'תוכן הסוגיה']] : []);
  return opts.length > 1 ? qCard('על מה החידון', '<div class="seg" id="qmode">' + opts.map(o => '<button data-v="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + o[1] + '</button>').join('') + '</div>') : '';
}
function bindMode() {
  bindSeg('qmode', v => {
    if (v === 'content') quizCfg.mode = 'content';
    else { quizCfg.mode = 'lex'; SC.kind = v; if (SC.by === 'topic' && v !== 'concepts') SC.by = 'all'; saveSc(); }
    S.settings.qmode = quizCfg.mode; save(); renderQuizSetup();
  });
}
function renderTQSetup() {
  const items = tqItems(), n = items.length, b = S.best.tquiz;
  let sub = '';
  if (TQ.by === 'perek') sub = '<div class="pkpick" id="tq-pk"><button class="chip" data-v="-1" aria-pressed="' + (TQ.pereks.length === 0) + '">כל הפרקים</button>' +
    PEREKS.map((pk, k) => { const c = inLevel.filter(x => x.pk === k).length; return '<button class="chip" data-v="' + k + '" aria-pressed="' + (TQ.pereks.indexOf(k) >= 0) + '"' + (c ? '' : ' disabled') + '>' + ordPk(k) + '. ' + esc(pk[0]) + ' (' + c + ')</button>'; }).join('') + '</div>' +
    '<p class="small muted">אפשר לסמן פרק אחד או כמה פרקים. הפרקים מסודרים לפי סדר המסכת.</p>';
  else if (TQ.by === 'topic') sub = '<select id="tq-topic" aria-label="נושא הסוגיה"><option value="-1">כל הנושאים (' + inLevel.length + ')</option>' +
    PEREKS.map((pk, k) => { const ts = CTOPICS.map((t, j) => t.pk === k ? '<option value="' + j + '"' + (TQ.topic === j ? ' selected' : '') + '>' + esc(t.n) + ' (' + inLevel.filter(x => x.t === j).length + ')</option>' : '').join(''); return ts ? '<optgroup label="' + esc(ordPk(k) + '. ' + pk[0]) + '">' + ts + '</optgroup>' : ''; }).join('') + '</select>';
  else if (TQ.by === 'daf') sub = dpRangeHtml('tq', TQ.d0, TQ.d1, CT_D0, CT_D1);
  view.innerHTML = '<div class="qsetup"><h2>חידון אמריקאי</h2>' + modeSeg() +
    qCard('אילו סוגיות', '<p class="small muted">שאלות על מהלך הסוגיות: מה נאמר, מי סובר מה, ומה הטעם, מדף ' + hebNum(CT_D0) + ' עד דף ' + hebNum(CT_D1) + '.</p>' +
      '<div class="seg grid2 qby" id="tq-by"><button data-v="all" aria-pressed="' + (TQ.by === 'all') + '">הכול</button>' +
      '<button data-v="perek" aria-pressed="' + (TQ.by === 'perek') + '">לפי פרק</button><button data-v="topic" aria-pressed="' + (TQ.by === 'topic') + '">לפי נושא</button><button data-v="daf" aria-pressed="' + (TQ.by === 'daf') + '">לפי דף</button></div>' +
      (sub ? '<div class="qsub">' + sub + '</div>' : '') +
      '<p class="qcount" id="tq-count">' + (n ? nQuestions(n) : 'אין שאלות בבחירה הזו') + '</p>') +
    lenCard(n, nQuestions) +
    '<button class="btn wide" id="qstart"' + (n ? '' : ' disabled') + '>' + (n ? 'התחלת החידון' : 'אין שאלות בבחירה הזו') + '</button>' +
    (b ? '<p class="small muted qbest">התוצאה הטובה ביותר שלך בחידון התוכן: ' + b + '%</p>' : '') + '</div>';
  bindMode();
  const done = () => { saveTq(); renderTQSetup(); };
  bindSeg('tq-by', v => { TQ.by = v; done(); });
  bindSeg('qlen', v => { quizCfg.len = +v; renderTQSetup(); });
  const pkEl = $('tq-pk'); if (pkEl) pkEl.querySelectorAll('button').forEach(b => { b.onclick = () => {
    const k = +b.dataset.v;
    if (k < 0) TQ.pereks = [];
    else { const at = TQ.pereks.indexOf(k); if (at >= 0) TQ.pereks.splice(at, 1); else TQ.pereks.push(k); TQ.pereks.sort((x, y) => x - y); }
    done();
  }; });
  const tp = $('tq-topic');
  if (tp) tp.onchange = () => { TQ.topic = +tp.value; done(); };
  dpRangeBind('tq', TQ, CT_D0, CT_D1, () => { saveTq(); const n2 = tqItems().length, c = $('tq-count'); if (c) c.textContent = n2 ? nQuestions(n2) : 'אין שאלות בבחירה הזו'; $('qstart').disabled = !n2; });
  const len = quizCfg.len;
  const go = () => {
    const src = tqItems(); if (!src.length) { toast('אין שאלות בבחירה הזו'); return; }
    quiz = { kind: 'content', qs: sample(src, Math.min(len, src.length)).map(x => ({ ct: x, opts: shuffle([x.ans].concat(x.dis)) })), pos: 0, right: 0, wrong: [], stage: 'ask', picked: null, bestKey: 'tquiz', again: go };
    nav('quiz', 'run', R.tab === 'quiz' && R.sub === 'done');
  };
  $('qstart').onclick = go;
}
/* once an answer is chosen, the source is shown under the answers: where it is, the words of the Mishnah or the Gemara, and a note when there is one */
function ctAfterHtml(x) {
  return '<div class="explain"><span class="label">המקור</span><p class="quote">' + esc(x.quote) + '</p><span class="src">' + esc(ctSource(x)) + '</span>' +
    (x.note ? '<p class="cfull">' + esc(x.note) + '</p>' : '') +
    (x.basis === 1 ? '<span class="src">התשובה נשענת על פירוש רש"י.</span>' : x.basis === 2 ? '<span class="src">התשובה מנוסחת כפירוש, ואינה לשון המקור.</span>' : '') + '</div>';
}
function renderTQ() {
  const z = quiz, q = z.qs[z.pos], x = q.ct, shown = z.stage === 'shown';
  view.innerHTML = '<div class="row between"><span class="small muted">שאלה ' + (z.pos + 1) + ' מתוך ' + z.qs.length + '</span><button class="link" id="quit">סיום</button></div>' +
    '<div class="progress"><i style="width:' + Math.round(z.pos / z.qs.length * 100) + '%"></i></div>' +
    '<section class="card"><span class="tag">' + esc(CTOPICS[x.t].n) + '</span><p class="qtext">' + esc(x.q) + '</p>' +
    '<div class="opts">' + q.opts.map((o, i) => {
      let cls = 'opt long'; if (shown) { if (o === x.ans) cls += ' right'; else if (z.picked === i) cls += ' wrong'; }
      return '<button class="' + cls + '" data-i="' + i + '"' + (shown ? ' disabled' : '') + '>' + esc(o) + '</button>';
    }).join('') + '</div>' +
    (shown ? ctAfterHtml(x) + '<button class="btn wide" id="next">' + (z.pos + 1 < z.qs.length ? 'הבא' : 'לתוצאות') + '</button>' : '') + '</section>';
  $('quit').onclick = finishQuiz;
  view.querySelectorAll('.opt').forEach(b => { b.onclick = () => {
    z.picked = +b.dataset.i; z.stage = 'shown';
    if (q.opts[z.picked] === x.ans) z.right++; else z.wrong.push(x);
    renderTQ();
    const ex = view.querySelector('.explain'); if (ex && ex.scrollIntoView) ex.scrollIntoView({ block: 'nearest' });
  }; });
  const nx = $('next'); if (nx) nx.onclick = () => { z.pos++; z.stage = 'ask'; z.picked = null; renderQuiz(); view.scrollTop = 0; };
}

/* ---------- games ---------- */
let game = null;
const gameCfg = { scope: 'all', kind: 'words' };
function renderGames() {
  const bm = S.best.match, bb = S.best.blitz30, bf = S.best.fill;
  gameCfg.scope = 'all'; gameCfg.kind = 'words';
  view.innerHTML = '<h2>משחקים</h2><div class="menu">' +
    '<button id="g-xw"><b>תשחץ אישי</b><span>לוח חדש מהמילים שתבחר: כל המאגר, מה שלמדת או לפי פרקים</span></button>' +
    '<button id="g-match"><b>התאמת זוגות</b><span>לחבר שש מילים בארמית לפירוש שלהן, כמה שיותר מהר</span>' + (bm ? '<em>שיא: ' + bm + ' שנ\'</em>' : '') + '</button>' +
    '<button id="g-blitz"><b>אתגר 30 שניות</b><span>לזהות כמה שיותר מילים לפני שהזמן נגמר, עם ניקוד ורצף</span>' + (bb ? '<em>שיא: ' + bb + '</em>' : '') + '</button>' +
    '<button id="g-fill"><b>השלמת ביטויים</b><span>ביטוי של שקלא וטריא עם מילה חסרה. איזו מילה משלימה אותו?</span>' + (bf ? '<em>שיא: ' + bf + '/10</em>' : '') + '</button></div>';
  $('g-xw').onclick = () => nav('xw', 'setup');
  $('g-match').onclick = () => startMatch();
  $('g-blitz').onclick = () => startBlitz();
  $('g-fill').onclick = () => startFill();
}
function noteMistake(e, picked) { const g = game; g.mistakes = g.mistakes || []; if (!g.mistakes.some(m => m.e === e)) g.mistakes.push({ e, picked }); }
/* the games keep moving: from the whole store they leave out the rare words */
function gamePool(min) {
  const src = pool(gameCfg.scope).filter(e => gameCfg.scope !== 'all' || !e.rare);
  if (src.length < min) { toast('אין מספיק מילים שלמדת למשחק הזה. צריך לפחות ' + min + ', או לבחור בכל המאגר'); return null; }
  return src;
}
/* matching */
/* six concepts for one board: no two with the same or nearly the same definition, and no term that contains another */
function cClose(x, y) { return x.ns === y.ns || x.nw.includes(y.nw) || y.nw.includes(x.nw) || lev(x.ns, y.ns) <= Math.max(3, Math.round(Math.max(x.ns.length, y.ns.length) * 0.25)); }
function pickConcepts(src, n) { const out = []; for (const c of shuffle(src)) { if (out.some(p => cClose(p, c))) continue; out.push(c); if (out.length === n) break; } return out; }
function startMatch() {
  const cn = gameCfg.kind === 'concepts' && CN.length > 0;
  let src;
  if (cn) { src = pool(gameCfg.scope, CN); if (src.length < 6) { toast('אין מספיק מושגים שלמדת למשחק הזה. צריך לפחות 6, או לבחור בכל המאגר'); return; } }
  else { src = gamePool(6); if (!src) return; }
  const picked = cn ? pickConcepts(src, 6) : pickDistinct(src, 6);
  if (picked.length < 6) { toast(cn ? 'אין מספיק מושגים שונים למשחק' : 'אין מספיק מילים שונות למשחק'); return; }
  game = { type: 'match', cn, left: shuffle(picked), right: shuffle(picked), done: new Set(), selL: null, selR: null, miss: null, misses: 0, t0: Date.now(), secs: 0 };
  nav('games', 'match', R.sub === 'over');
  timers.push(setInterval(() => { game.secs = Math.floor((Date.now() - game.t0) / 1000); const el = $('m-time'); if (el) el.textContent = game.secs; }, 500));
}
function renderMatch() {
  const g = game; let h = '<div class="hud"><div><b id="m-time">' + g.secs + '</b><span>שניות</span></div><div><b>' + g.done.size + '/6</b><span>זוגות</span></div><div><b>' + g.misses + '</b><span>טעויות</span></div></div><div class="match">';
  for (let i = 0; i < 6; i++) {
    const l = g.left[i], r = g.right[i];
    h += '<button class="tile aram' + (g.done.has(l.w) ? ' done' : '') + (g.selL === i ? ' sel' : '') + (g.miss && g.miss[0] === i ? ' miss' : '') + '" data-s="L" data-i="' + i + '"' + (g.done.has(l.w) ? ' disabled' : '') + '>' + esc(l.w) + '</button>' +
         '<button class="tile' + (g.cn ? ' long' : '') + (g.done.has(r.w) ? ' done' : '') + (g.selR === i ? ' sel' : '') + (g.miss && g.miss[1] === i ? ' miss' : '') + '" data-s="R" data-i="' + i + '"' + (g.done.has(r.w) ? ' disabled' : '') + '>' + esc(getGlossForMode(r, 'pairs')) + '</button>';
  }
  view.innerHTML = h + '</div><p class="small muted">' + (g.cn ? 'בוחרים מושג מהטור הימני ואת ההגדרה שלו מהטור השמאלי.' : 'בוחרים מילה מהטור הימני ואת הפירוש שלה מהטור השמאלי.') + '</p><button class="link" id="quit">סיום</button>';
  $('quit').onclick = goBack;
  view.querySelectorAll('.tile').forEach(b => { b.onclick = () => {
    const i = +b.dataset.i; g.miss = null;
    if (b.dataset.s === 'L') g.selL = g.selL === i ? null : i; else g.selR = g.selR === i ? null : i;
    if (g.selL !== null && g.selR !== null) {
      if (g.left[g.selL] === g.right[g.selR]) g.done.add(g.left[g.selL].w); else { g.misses++; g.miss = [g.selL, g.selR]; noteMistake(g.left[g.selL], getGlossForMode(g.right[g.selR], 'pairs')); }
      g.selL = null; g.selR = null;
    }
    if (g.done.size === 6) {
      stopTimers(); g.secs = Math.round((Date.now() - g.t0) / 1000); const score = g.secs + g.misses * 3;
      const bk = g.cn ? 'cmatch' : 'match', best = !S.best[bk] || score < S.best[bk]; if (best) { S.best[bk] = score; save(); }
      g.over = { big: score, line: 'שניות, כולל 3 שניות קנס על כל טעות (' + g.misses + ')', best, again: startMatch };
      nav('games', 'over', true); return;
    }
    renderMatch();
  }; });
}
/* blitz: 30 seconds since 1.5.3. Its best is kept under its own key (blitz30), so a best of the old minute does not stand in the way */
const BLITZ_SECS = 30;
function startBlitz() {
  const src = gamePool(8); if (!src) return;
  game = { type: 'blitz', src, left: BLITZ_SECS, score: 0, streak: 0, top: 0, right: 0, total: 0, q: null, flash: null, lock: false };
  nextBlitz();
  nav('games', 'blitz', R.sub === 'over');
  timers.push(setInterval(() => {
    game.left--; const el = $('b-time'); if (el) el.textContent = Math.max(0, game.left);
    if (game.left <= 0) {
      stopTimers(); const best = !S.best.blitz30 || game.score > S.best.blitz30; if (best && game.score) { S.best.blitz30 = game.score; save(); }
      game.over = { big: game.score, line: 'נקודות. ' + game.right + ' נכונות מתוך ' + game.total + ', הרצף הארוך ביותר: ' + game.top, best: best && game.score > 0, again: startBlitz };
      nav('games', 'over', true);
    }
  }, 1000));
}
function nextBlitz() { const g = game; let e; do { e = g.src[Math.floor(Math.random() * g.src.length)]; } while (g.q && g.src.length > 1 && e === g.q.e); g.q = makeQuestion(e, false); g.q.rev = false; g.q.gmode = 'speed'; g.q.opts = shuffle([e].concat(distractors(e, false))); g.flash = null; g.lock = false; }
function renderBlitz() {
  const g = game, q = g.q;
  view.innerHTML = '<div class="hud"><div><b id="b-time">' + Math.max(0, g.left) + '</b><span>שניות</span></div><div><b>' + g.score + '</b><span>נקודות</span></div><div><b>' + g.streak + '</b><span>רצף</span></div></div>' +
    '<section class="card"><div class="word' + (q.e.w.length > 14 ? ' md' : '') + '">' + esc(q.e.w) + '</div>' + optionsHtml(q, !!g.flash, g.flash ? g.flash.i : null) + '</section><button class="link" id="quit">סיום</button>';
  $('quit').onclick = goBack;
  view.querySelectorAll('.opt').forEach(b => { b.onclick = () => {
    if (g.lock) return; g.lock = true; const i = +b.dataset.i; const ok = q.opts[i] === q.e; g.total++;
    if (ok) { g.right++; g.streak++; g.top = Math.max(g.top, g.streak); g.score += 10 + Math.min(10, (g.streak - 1) * 2); }
    else { g.streak = 0; noteMistake(q.e, getGlossForMode(q.opts[i], 'speed')); }
    noteAnswer(q.e, ok); save();
    g.flash = { i }; renderBlitz();
    setTimeout(() => { if (game !== g || R.sub !== 'blitz') return; nextBlitz(); renderBlitz(); }, ok ? 220 : 900);
  }; });
}
/* phrase completion */
const FILLABLE = PHRASES.filter(e => e.w.indexOf('...') < 0);
const FILL_WORDS = Array.from(new Set([].concat.apply([], FILLABLE.map(e => e.w.split(' ')))));
function startFill() {
  let src = gameCfg.scope === 'learned' ? FILLABLE.filter(e => S.prog[e.w]) : FILLABLE;
  if (src.length < 4) { if (gameCfg.scope === 'learned') toast('עוד לא למדת מספיק ביטויים, לכן המשחק משתמש בכל הביטויים'); src = FILLABLE; }
  game = { type: 'fill', qs: sample(src, Math.min(10, src.length)).map(makeFill), pos: 0, right: 0, stage: 'ask', picked: null };
  nav('games', 'fill', R.sub === 'over');
}
function makeFill(e) {
  const parts = e.w.split(' '); const k = Math.floor(Math.random() * parts.length); const ans = parts[k];
  const opts = [ans];
  for (const w of shuffle(FILL_WORDS)) {
    if (opts.length >= 4) break;
    if (opts.indexOf(w) >= 0 || parts.indexOf(w) >= 0) continue;
    const alt = parts.slice(); alt[k] = w;
    if (BY.has(alt.join(' '))) continue; /* would complete a different real phrase */
    opts.push(w);
  }
  return { e, parts, k, ans, opts: shuffle(opts) };
}
function renderFill() {
  const g = game, q = g.qs[g.pos];
  if (!q) {
    const best = g.qs.length === 10 && g.right > 0 && (!S.best.fill || g.right > S.best.fill); if (best) { S.best.fill = g.right; save(); }
    g.over = { big: g.right + '/' + g.qs.length, line: 'ביטויים הושלמו נכון', best, again: startFill }; nav('games', 'over', true); return;
  }
  const shown = g.stage === 'shown';
  const phrase = q.parts.map((p, i) => i === q.k ? '<span class="blank">' + (shown ? esc(q.ans) : '&nbsp;') + '</span>' : esc(p)).join(' ');
  view.innerHTML = '<div class="row between"><span class="small muted">ביטוי ' + (g.pos + 1) + ' מתוך ' + g.qs.length + '</span><button class="link" id="quit">סיום</button></div>' +
    '<div class="progress"><i style="width:' + Math.round(g.pos / g.qs.length * 100) + '%"></i></div>' +
    '<section class="card"><span class="tag">איזו מילה חסרה?</span><div class="word md">' + phrase + '</div><p class="muted">' + esc(gloss(q.e)) + '</p>' +
    '<div class="opts">' + q.opts.map((o, i) => { let cls = 'opt aram'; if (shown) { if (o === q.ans) cls += ' right'; else if (g.picked === i) cls += ' wrong'; } return '<button class="' + cls + '" data-i="' + i + '"' + (shown ? ' disabled' : '') + '>' + esc(o) + '</button>'; }).join('') + '</div>' +
    (shown ? '<span class="src">' + esc(countLine(q.e)) + ' · לראשונה ב' + dafName(q.e.a) + '</span><button class="btn wide" id="next">הבא</button>' : '') + '</section>';
  $('quit').onclick = goBack;
  view.querySelectorAll('.opt').forEach(b => { b.onclick = () => { g.picked = +b.dataset.i; g.stage = 'shown'; const ok = q.opts[g.picked] === q.ans; if (ok) g.right++; else noteMistake(q.e, q.parts.map((p, i) => i === q.k ? q.opts[g.picked] : p).join(' ')); noteAnswer(q.e, ok); save(); renderFill(); }; });
  const nx = $('next'); if (nx) nx.onclick = () => { g.pos++; g.stage = 'ask'; g.picked = null; renderFill(); };
}
function renderGameOver() {
  const o = game.over, n = (game.mistakes || []).length;
  view.innerHTML = '<div class="result"><div class="big">' + o.big + '</div><p>' + esc(o.line) + '</p>' + (o.best ? '<p style="color:var(--gold);font-weight:700">שיא אישי חדש</p>' : '') +
    doneButtons(o.againLabel || 'עוד סיבוב', n) + '<button class="link" id="back">חזרה למשחקים</button></div>';
  $('again').onclick = () => o.again();
  $('back').onclick = goBack;
  const mb = $('mist'); if (mb) mb.onclick = () => nav('games', 'review');
}
function renderGameReview() {
  const ms = game.mistakes || [];
  view.innerHTML = '<div class="row between"><h2>הטעויות בסיבוב</h2><button class="link" id="back">חזרה</button></div>' + reviewHtml(ms) +
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
let xg = null;
/* a crossword entry may be a dictionary word or phrase, a concept, or one of the terms added for the daily board */
const XE = ((window.DAILY && window.DAILY.extra) || []).map((x, i) => ({ xe: true, w: x[0], s: x[1], m0: x[2], i }));
/* the crossword bank (bank.js): terms of the Torah world for the crosswords only, handled like the added terms:
   a short definition for the cell, a full explanation for the summary, and no place in the dictionary, the learning or the Wordle */
const BK = (window.BANK || []).map((r, i) => ({ xe: true, bk: true, w: r[0], t: r[1], s: r[2], m0: r[3], i }));
function xwEntry(src, i) { return src === 'c' ? CN[i] : src === 'x' ? XE[i] : src === 'b' ? BK[i] : D[i]; }
function xwSrc(e) { return e.cn ? 'c' : e.bk ? 'b' : e.xe ? 'x' : 'd'; }
function xwLetters(s) { return String(s).replace(/[\u0591-\u05C7]/g, '').replace(/[^\u05d0-\u05ea]/g, ''); }
function xwAns(e) { return norm(xwLetters(e.w)).split(''); }
/* a phrase of several words gets its letter count per word, as in a printed crossword: (3, 2) */
function xwSplit(e) { const p = e.w.trim().split(/\s+/); return p.length > 1 ? ' (' + p.map(x => xwLetters(x).length).join(', ') + ')' : ''; }
/* a definition rewritten for the crossword (xwclues.js) replaces one that shows the answer or is too short to solve;
   the dictionary keeps the original */
const XWC = window.XW_CLUES || {};
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
/* the answer must not show in its own definition: a whole word of the definition, once the prefixes ה ו ב ל כ מ ש
   and the endings ים ות ין are taken off, may not be the answer (so "טל" is not caught by "טלטול"). The same rule as tools/make-daily.js */
function answerInGloss(ans, text) {
  const ENDS = ['ימ', 'ות', 'ינ'];   /* ים ות ין, with the final letters made plain */
  const forms = t => { const out = new Set([t]); let x = t;
    /* one prefix letter may leave two letters (הטל); two or three must leave three (מונח is not מ+ו+נח) */
    for (let i = 0; i < 3 && /^[הובלכמש]/.test(x) && x.length > (i === 0 ? 2 : 3); i++) { x = x.slice(1); out.add(x); }
    for (const v of [...out]) for (const end of ENDS) if (v.endsWith(end) && v.length - 2 >= 2) out.add(v.slice(0, -2));
    const k = t.replace(/[וי]/g, ''); if (k.length >= 3) out.add('~' + k);   /* a spelling with or without ו and י */
    return out; };
  const words = String(ans).split(/\s+/).map(x => norm(xwLetters(x))).filter(w => w.length >= 2).map(w => {
    const f = new Set([w]); for (const end of ENDS) if (w.endsWith(end) && w.length - 2 >= 2) f.add(w.slice(0, -2));
    const k = w.replace(/[וי]/g, ''); if (k.length >= 3) f.add('~' + k); return f; });
  const toks = (String(text).match(/[\u05d0-\u05ea]+/g) || []).map(norm);
  const WORDS_A = String(ans).split(/\s+/).map(x => norm(xwLetters(x)));
  /* an Aramaic noun or word that ends in א, and its Hebrew translation without the א: שבתא and שבת, דמא and דם, בשרא and בשר.
     The stem is compared as written and with ו and י left out on both sides */
  const stems = WORDS_A.filter(w => w.length >= 3 && w.endsWith('א')).map(w => { const s = w.slice(0, -1); return [s, s.replace(/[וי]/g, '')]; });
  if (stems.length && toks.some(t => { const f = [t]; let x = t; for (let i = 0; i < 2 && /^[הובלכמשד]/.test(x) && x.length > 2; i++) { x = x.slice(1); f.push(x); }
    return f.some(v => stems.some(([s, ks]) => v === s || (ks.length >= 2 && v.replace(/[וי]/g, '') === ks))); })) return true;
  return toks.some(t => { const f = forms(t); return words.some(ws => [...ws].some(w => f.has(w))); });
}
/* for each letter of a word as written: F a final letter, R one of כ מ נ פ צ written plain, a dot for the rest.
   A final letter may stand only where the crossing word ends too, written final (the same rule as tools/make-daily.js) */
/* a definition that cannot be solved without guessing: only small words, or for two or three letters fewer than two words of content */
const XSMALL = new Set(('של על אל את עם מן לו לה להם להן לנו לי לך לכם אותו אותה אותם אותן אותי אותנו זה זו זאת זהו זוהי אלה אלו הוא היא הם הן ' +
  'אני אנחנו אתה אתם גם אף אם כי כאשר כש כמו אך רק לא אין יש הרי האם וכי מה מי איך כך כן כאן שם עוד כבר אז עד בין אחר אחרי לפני ' +
  'ש ה ו ב ל מ כ ד שהוא שהיא שלו שלה שלהם עליו עליה עליהם ממנו ממנה בו בה בהם לפי אצל').split(' '));
function xwVague(ans, clue) {
  const toks = (String(clue).replace(/\([^)]*\)/g, ' ').match(/[\u05d0-\u05ea"׳״']+/g) || []).map(t => t.replace(/["׳״']/g, ''));
  const content = toks.filter(t => !XSMALL.has(t));
  return !content.length || (norm(xwLetters(ans)).length <= 3 && content.length < 2);
}
/* the root of the answer in its definition: the same test as tools/make-daily.js (rootLeak), so a personal board leaves out
   exactly the entries the daily pool leaves out: a dictionary meaning that gives the Hebrew form of the same word (אדליק: הדליק),
   unless xwclues.js has a definition of its own for it */
const LFIN = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const lwords = s => String(s).replace(/[֑-ׇ]/g, '').replace(/[^א-ת ]/g, ' ').replace(/[ךםןףץ]/g, c => LFIN[c]).split(/\s+/).filter(Boolean);
const LSKIP = /^(בלשונ|הגמרא|בגמרא|המשנה|במשנה|בארמית|ארמית|לשונ|מילת|שאלה)$/;
const LSTOP2 = new Set('של על אל את עם מן כל זה זו זאת לא כי אם גם מה מי הוא היא הם הן לו לה בו בה מסכת אמורא תנא ספר רבי רב בן בר'.split(' '));
const LENDS = ['יהו', 'יהמ', 'יה', 'יו', 'הו', 'נו', 'ות', 'ימ', 'ינ', 'תי', 'ה', 'ת', 'ו', 'א'];
function lcores(w) {
  const out = new Set(), starts = [w]; let x = w;
  for (let i = 0; i < 3 && /^[הובלכמשדנתאי]/.test(x) && x.length > 3; i++) { x = x.slice(1); starts.push(x); }
  for (const s of starts) { const ends = [s]; for (const e of LENDS) if (s.endsWith(e) && s.length - e.length >= 2) ends.push(s.slice(0, -e.length));
    for (const t of ends) { const k = t.replace(/[ויא]/g, ''); if (k.length >= 2) out.add(k.length >= 3 ? k.slice(0, 3) : k); } }
  return out;
}
function lroot2(w) { const o = new Set(); for (const s of [w, /^[הובלכמשדנתאי]/.test(w) && w.length > 3 ? w.slice(1) : null]) { if (!s) continue;
  const ends = [s]; for (const e of LENDS) if (s.endsWith(e) && s.length - e.length >= 2) ends.push(s.slice(0, -e.length));
  for (const t of ends) { const k = t.replace(/[ויא]/g, ''); if (k.length === 2) o.add(k); } } return o; }
const lskel = w => w.replace(/[ויא]/g, '').replace(/ה$/, '');
const lstrips = t => { const o = new Set([t]); let x = t; for (let i = 0; i < 2 && /^[הובלכמשד]/.test(x) && x.length > 3; i++) { x = x.slice(1); o.add(x); } return o; };
const lcommon = (a, b) => { for (let i = 0; i + 3 <= a.length; i++) if (b.includes(a.slice(i, i + 3))) return true; return false; };
function rootLeak(ans, clue) {
  const aw = lwords(ans), multi = aw.length > 1, tw = lwords(clue).filter(t => !LSKIP.test(t));
  for (const a0 of aw) {
    if (!(multi && a0.length <= 2)) { const A = lcores(a0), A2 = lroot2(a0);
      for (const t0 of tw) { if (t0.length < 2) continue;
        for (const t of lcores(t0)) if (A.has(t) && (t.length === 3 || (t0.length <= 5 && !LSTOP2.has(t0) && A2.has(t)))) return t0; } }
    const S = [...lstrips(a0)].map(lskel);
    for (const t0 of tw) for (const t of [...lstrips(t0)].map(lskel)) for (const a of S) {
      if (a.length >= 3 && lcommon(a, t)) return t0;
      if (a.length === 2 && !(multi && a0.length <= 2) && !LSTOP2.has(t0) && t.length >= 2 && t.length <= 4 && t.includes(a)) return t0;
    }
  }
  return '';
}
/* personal boards draw on the chosen store; a board by chapters may also take words of the expanded store from those chapters.
   No levels (24.11.2026): from the whole store only the chosen store, without the rare words of the expanded store */
const xwOk = (e, txt, lim) => { const o = xwOv(e), t = o || txt; return t.length <= lim && !answerInGloss(e.w, o || (e.bk ? e.s : e.m0)) && !xwVague(e.w, t) && !rootLeak(e.w, String(t).replace(/\s*\([^)]*\)/g, '')); };
const XW_ALL = WORDS.filter(e => /^[א-ת]{3,7}$/.test(e.w) && !(e.ext && /בעל כמה פירושים/.test(e.m0)) && xwOk(e, e.cn ? e.s : short(e), 34));
BK.forEach(e => { if (/^[א-ת]{3,7}$/.test(e.w) && xwOk(e, e.s, 40)) XW_ALL.push(e); });
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
function xwPool() { return XW_ALL.filter(e => xwSrcOk(e) && (SC.by !== 'daf' || xwCfg.src !== 'all' || (!e.bk && inScope(e)))); }

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
      xwRnd = rnd; glossPure = !!day;
      let b;
      try { b = xwTry(shuffle(src, rnd)); } finally { xwRnd = Math.random; glossPure = false; }
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
  const g = xg; if (!g || g.type !== 'xw' || g.arch) return;
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
  view.innerHTML = '<div class="row between"><h2>תשחץ אישי</h2><button class="link" id="xw-back">חזרה למשחקים</button></div>' +
    xwTopHtml() +
    '<p class="small muted">בחר מאגר מילים.' + (SC.by === 'daf' ? ' מכל המאגר נלקחות רק מילים מהדפים שאתה אוחז בהם (' + esc(holdLabel()) + ').' : '') + '</p>' +
    '<div class="field"><span class="label">מאגר מילים</span><div class="seg" id="xw-src">' +
    [['all', 'כל המילים'], ['learned', 'שנלמדו'], ['pk', 'לפי פרקים']].map(o => '<button data-v="' + o[0] + '" aria-pressed="' + (xwCfg.src === o[0]) + '">' + o[1] + '</button>').join('') + '</div></div>' +
    sub +
    '<div class="xwgo"><p class="small' + (n >= XW_MIN_POOL ? ' muted' : ' strong') + '">' + (n >= XW_MIN_POOL ? n + ' מילים מתאימות.' : (n ? 'רק ' + n + ' מילים מתאימות. צריך לפחות ' + XW_MIN_POOL + '.' : 'אין מילים בבחירה הזו.')) + '</p>' +
    '<button class="btn wide" id="xw-go"' + (n >= XW_MIN_POOL ? '' : ' disabled') + '>התחל תשחץ</button></div>';
  const box = $('xw-pk');
  if (box) { const over = view.scrollHeight - view.clientHeight; if (over > 0) box.style.maxHeight = Math.max(88, box.offsetHeight - over - 4) + 'px'; }
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
function startXW() {
  const src = xwPool();
  if (src.length < XW_MIN_POOL) { toast('צריך לפחות ' + XW_MIN_POOL + ' מילים כדי לבנות לוח. כדאי להרחיב את הבחירה'); return; }
  if (xwBusy) return;
  xwBusy = true; toast('בונה לוח...');
  const from = R.tab + '/' + R.sub;
  xwBuild(src, b => {
    xwBusy = false;
    if (R.tab + '/' + R.sub !== from) return;   /* moved elsewhere meanwhile */
    if (!b || b.words.length < 13) { toast('לא הצלחתי לבנות לוח של 13 מילים לפחות מהבחירה הזו. כדאי להרחיב אותה'); return; }
    const t = $('toast'); if (t) t.hidden = true;
    xwOpen(xwGame(b));
  });
}
/* the daily board: all words, the same for everyone on the same date */
/* a daily board left open past midnight: it is closed, so the day that ended keeps its record and today starts clean */
function xwStale() { return !!(xg && xg.type === 'xw' && xg.day && xg.b.anchor && !xg.done && xg.day !== localDay()); }
/* the archive: every edition from #1 to yesterday, to solve again; a board or word solved here does not touch the streak or lifelines.
   In the beta (the APK, or ?test&beta) it holds every edition of the file, #1 to the last, the coming ones marked with their day */
/* the beta counts by the launch schedule (#1 on LAUNCH), so each edition shows the day it is meant for, even before the launch */
function edDay(n) { const d = new Date((BETA ? LAUNCH : xwEpoch(localDay())) + 'T12:00:00'); d.setDate(d.getDate() + n - 1); return dayOf(d); }
function nowEd() { const day = localDay(); return BETA && day < LAUNCH ? 0 : xwEdition(day); }
function archMax() { return BETA && window.DAILY ? window.DAILY.boards.length : xwEdition(localDay()) - 1; }
function archTag(n) { const ed = nowEd(); return n > ed ? '<span class="atag fut">עתידי</span>' : n === ed ? '<span class="atag now">היום</span>' : ''; }
/* an edition of the archive; in the beta, today's edition and the coming ones are a look only: nothing of them is recorded */
function openArchXW(n) { const dd = edDay(n), bd = xwDailyBoard(dd); if (!bd) return; const g = xwGame(bd); g.arch = dd; g.lab = BETA && n >= nowEd(); xwOpen(g); }
function openArchWD(n) { const g = wdFor(edDay(n), true); if (!g) return; g.lab = BETA && n >= nowEd(); wd = g; if (R.tab === 'games' && R.sub === 'wordle') renderWordle(); else nav('games', 'wordle'); }
function openArchive() {
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
  xg = g; xwSave();
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
function xwSolved(w) { return w.cells.every(k => xg.typed[k] && norm(xg.typed[k]) === xg.b.L[k]); }
/* a definition cell shows each definition in its own block. The arrow of each definition sits outside it, in the first letter
   of its word, on the edge that touches the definition: the right edge for a word that starts on the left (straight left, or
   left and then down), the top edge for a word that starts below (straight down, or down and then left).
   In a shared cell the left-starting word is always on top */
const XLEFT = { l: 1, ld: 1 };
function xwBoardHtml() {
  /* no frame marks the anchor word on the board (removed 24.11.2026 at the owner's request) */
  const g = xg, b = g.b, act = b.words[g.act], on = new Set(act.cells);
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
  const g = xg, grid = $('xw-grid'); if (!grid) return;
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
  const g = xg, w = g.b.words[g.act], e = w.e;
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
  const p = view.querySelector('#xw-bar .xdef'); if (!p) return;
  p.style.fontSize = '';
  let size = 0.98;
  while (p.scrollHeight > p.clientHeight + 1 && size > 0.62) { size -= 0.04; p.style.fontSize = size.toFixed(2) + 'rem'; }
}
function renderXW() {
  const g = xg;
  view.className = 'panel tight';
  view.innerHTML = '<div class="xw"><div class="row between"><span class="small muted"><b class="xtime" id="xw-time">' + mmss(g.secs || 0) + '</b> <span id="xw-left"></span></span><span>' + (g.day || g.arch ? '' : '<button class="link" id="xw-new">לוח חדש</button> ') + '<button class="xhelp" id="xw-help" aria-label="איך משחקים?">?</button><button class="link" id="quit">חזרה</button></span></div>' +
    labNavHtml(g, g.b.ed, 'lx') +
    '<div class="xbar" id="xw-bar" aria-live="polite"></div>' +
    '<div class="xgrid" id="xw-grid" dir="rtl" style="grid-template-columns:repeat(' + g.b.C + ',1fr);grid-template-rows:repeat(' + g.b.R + ',1fr)"></div>' +
    '<div class="xlow">' +
    '<div class="xtools"><button id="xw-hint"></button><button id="xw-clear">ניקוי מילה 🗑️</button><button class="pin" id="xw-pin"></button></div>' +
    '<div class="xkb" dir="ltr">' + XKEYS.map((row, i) => '<div class="r' + i + '">' + row.split('').map(ch => '<button data-ch="' + ch + '">' + ch + '</button>').join('') +
      (i === 0 ? '<button class="del" id="xw-del" aria-label="מחיקה">⌫</button>' : '') + '</div>').join('') + '</div></div></div>';
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
  $('xw-bar').onclick = ev => { if (ev.target.closest('#xw-sum')) { xwSummary(); return; } const t = ev.target.closest('[data-k]'); if (!t || xg.done) return; xg.cur = +t.dataset.k; xwPaint(); xwSave(); };
  $('xw-grid').onclick = ev => { const t = ev.target.closest('[data-k]'), q = ev.target.closest('.xq'); if (t) xwTap(+t.dataset.k, q ? +q.dataset.wi : undefined); };
  view.querySelectorAll('.xkb [data-ch]').forEach(b => { b.onclick = () => xwType(b.dataset.ch); });
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
  const tabs = document.getElementById('tabs'); if (tabs && !depth) view.style.paddingBottom = (tabs.offsetHeight + 4) + 'px';
  const kb = view.querySelector('.xkb'); kb.style.setProperty('--kh', '44px');
  const box = view.querySelector('.xw'), cs = getComputedStyle(view), gap = parseFloat(getComputedStyle(box).rowGap) || 0;
  let others = 0, n = 0;
  for (const el of box.children) { if (el !== grid) { others += el.offsetHeight; n++; } }
  const free = view.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - others - gap * n - 2;
  /* square cells: as large as the width and the free height allow for this board's columns and rows */
  const R = xg.b.R, C = xg.b.C, wide = view.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const cell = Math.max(24, Math.min(wide / C, free / R, 72));
  grid.style.width = Math.floor(cell * C) + 'px'; grid.style.height = Math.floor(cell * R) + 'px';
  const spare = free - Math.floor(cell * R);
  if (spare > 0) kb.style.setProperty('--kh', Math.min(58, 44 + spare / 3).toFixed(1) + 'px');
  /* the keyboard must end above the tab bar. The board is centred in its column, so making it smaller does not lift the
     keyboard: the column itself is cut by the overlap (on some phones the page reaches under the tab bar), and the board
     is sized again for the room that is left */
  if (tabs && !depth) {
    const over = kb.getBoundingClientRect().bottom - tabs.getBoundingClientRect().top + 4;
    if (over > 0) { view.style.paddingBottom = (parseFloat(view.style.paddingBottom) + over) + 'px'; xwFit(1); }
  }
}
/* fonts that arrive late, the address bar or the system bar of the phone change the height after the first layout */
function xwRefit() { if (R.tab === 'xw' && R.sub === 'board' && xg && xg.type === 'xw' && $('xw-grid')) { xwFit(); xwFitClues(); } }
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
window.addEventListener('resize', () => { if (R.tab === 'xw' && R.sub === 'board' && xg && xg.type === 'xw') { xwFit(); xwFitClues(); } });
function xwPaint() {
  const g = xg, left = g.b.L.reduce((n, ch, k) => n + (ch && !g.typed[k] ? 1 : 0), 0);
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
  $('xw-left').innerHTML = '<b class="xname">' + (daily ? 'התשחץ היומי #' + g.b.ed + (g.arch ? ' (ארכיון)' : '') : 'לוח אישי') + '</b> ' +
    esc((left ? 'נשארו ' + left : 'הלוח מלא') + (daily && g.b.theme ? ', ' + g.b.theme : ', ' + g.b.words.length + ' מילים'));
  /* the button beside it goes back while the board is open, and to the summary once every cell is filled */
  const qb = $('quit'); if (qb) qb.textContent = !g.done && g.b.L.every((ch, k) => !ch || g.typed[k]) ? 'סיכום' : 'חזרה';
  /* anything that changed height on this paint (a line of text that wrapped) must not push the keyboard under the tab bar */
  const kb = view.querySelector('.xkb'), tabs = document.getElementById('tabs'), grid = $('xw-grid');
  if (kb && tabs && grid && grid.style.width && kb.getBoundingClientRect().bottom > tabs.getBoundingClientRect().top + 1) xwFit();
}
/* a tap on a definition selects the word of the half that was touched; a tap elsewhere in the cell moves between its words */
function xwTap(k, wi) {
  if (xg) xg._tp = null;   /* a tap, a deletion or a cleared word starts the typing point again from the cursor */
  const g = xg, b = g.b;
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
  const w = xg.b.words[xg.act], i = w.cells.indexOf(xg.cur), j = i + dir;
  if (j >= 0 && j < w.cells.length) xg.cur = w.cells[j];
}
function xwType(ch) {
  ch = norm(ch);   /* ך ם ן ף ץ are taken as כ מ נ פ צ: the board shows plain letters, the bar the word as written */
  if (xwStale()) { render(false); return; }
  const g = xg, w = g.b.words[g.act];
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
function xwNoteWrong(k) { const g = xg; g.cw[k].forEach(i => { const w = g.b.words[i]; if (w.cells.every(c => g.typed[c]) && !xwSolved(w)) g.wrongW.add(i); }); }
function xwNextOpen() {
  const g = xg, ws = g.b.words, n = ws.length;
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
function xwLocked(k) { const g = xg; return g.hint.has(k) || g.cw[k].some(i => xwSolved(g.b.words[i])); }
function xwKeep(k) { return xwLocked(k); }
function xwDel() {
  if (xg) xg._tp = null;   /* a tap, a deletion or a cleared word starts the typing point again from the cursor */
  const g = xg, k = g.cur;
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
  if (xg) xg._tp = null;   /* a tap, a deletion or a cleared word starts the typing point again from the cursor */
  const g = xg; if (g.done) return;
  const w = g.b.words[g.act];
  w.cells.forEach(k => { if (!xwKeep(k)) { g.typed[k] = ''; g.bad.delete(k); } });
  const free = w.cells.find(k => !g.hint.has(k)); g.cur = free !== undefined ? free : w.cells[0];
  xwPaint(); xwSave();
}
function xwHint() {
  if (xwStale()) { render(false); return; }
  if (xg.done) return;
  if (xg.hint.size >= XW_HINTS) { toast('נוצלו כל ' + XW_HINTS + ' הרמזים של הלוח'); return; }
  const g = xg, w = g.b.words[g.act], ok = k => g.typed[k] && norm(g.typed[k]) === g.b.L[k];
  const k = !ok(g.cur) && w.cells.indexOf(g.cur) >= 0 ? g.cur : w.cells.find(c => !ok(c));
  if (k === undefined) { toast('המילה הזו כבר נכונה'); return; }
  g.typed[k] = xwShow(w, k); g.hint.add(k); g.bad.delete(k); g.hintW.add(g.act);
  xwPaint(); xwSave(); xwDone();
}
function xwDone() {
  const g = xg, b = g.b;
  const full = b.L.every((ch, k) => !ch || g.typed[k]);
  if (!full) return;
  /* a full board with a mistake is not checked as a whole: nothing turns red, and the ✗ beside a word in the bar is what
     shows where to look. The board ends when every letter is right */
  if (!b.L.every((ch, k) => !ch || norm(g.typed[k]) === ch)) return;
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
  const ms = xg.mistakes || [];
  view.innerHTML = '<div class="row between"><h2>הטעויות בלוח</h2><button class="link" id="back">חזרה</button></div>' + reviewHtml(ms) +
    '<button class="btn wide" id="drill">חידון קצר על הטעויות האלה</button>';
  $('back').onclick = goBack;
  $('drill').onclick = () => { const es = ms.map(m => m.e).filter(e => !e.xe); if (es.length) drillOn(es); else toast('בטעויות האלה אין מילים מהמילון לחידון'); };
}
/* the summary: time, hints, every word with its meaning, and a result to share */
function nWrongCells(n) { return n === 1 ? 'משבצת אחת שגויה' : n + ' משבצות שגויות'; }
function xwWrong() { const g = xg; return g.b.L.reduce((n, ch, k) => n + (ch && g.typed[k] && norm(g.typed[k]) !== ch ? 1 : 0), 0); }
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
  const g = xg, h = g.hint.size, wrong = g.done ? 0 : xwWrong();
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
  const g = xg, wrong = g.done ? 0 : xwWrong(), h = g.hint.size;
  const words = g.b.words.slice().sort((x, y) => x.clue - y.clue);
  openSheet('<h2>' + (g.done ? (g.arch ? 'פתרת את מהדורה #' + g.b.ed + ' מהארכיון' : g.day ? 'פתרת את התשחץ היומי' + (g.b.anchor ? ' #' + g.b.ed : '') : 'פתרת את הלוח') : 'הלוח מלא') + '</h2>' +
    '<div class="stats"><div class="stat"><b>' + mmss(g.secs || 0) + '</b><span>זמן</span></div><div class="stat"><b>' + g.b.words.length + '</b><span>מילים</span></div><div class="stat"><b>' + h + '</b><span>רמזים</span></div></div>' +
    (wrong ? '<p class="small strong">יש בלוח ' + nWrongCells(wrong) + '. בדיקת שגיאות תסמן ' + (wrong === 1 ? 'אותה' : 'אותן') + '.</p>' : '') +
    (g.b.anchor ? '<p class="small muted">' + esc('#' + g.b.ed + ', ' + g.b.theme) + '</p>' : '') +
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
  const g = xg; if (g.done) return;
  xwTick = setInterval(() => {
    if (document.hidden || sheetOpen || !(R.tab === 'xw' && R.sub === 'board') || xg !== g || g.done) return;
    g.secs = (g.secs || 0) + 1;
    const el = $('xw-time'); if (el) el.textContent = mmss(g.secs);
    if (g.secs % 5 === 0) xwSave();
  }, 1000);
  timers.push(xwTick);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (xg && xg.type === 'xw' && !xg.done) xwSave(); return; }
  /* back in front: a new day redraws the screen, and the web version asks whether a newer version was published */
  if (drawn[R.tab] && drawn[R.tab].day !== localDay() && !sheetOpen) render(false);
  if (!NATIVE && 'serviceWorker' in navigator && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(r => { if (r) r.update(); }).catch(() => { /* offline */ });
});
document.addEventListener('keydown', ev => {
  if (!(R.tab === 'xw' && R.sub === 'board' && xg && xg.type === 'xw') || sheetOpen || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.key === 'Backspace') { ev.preventDefault(); xwDel(); }
  else if (/^[א-ת]$/.test(ev.key)) { ev.preventDefault(); xwType(ev.key); }
});

/* ---------- Wordle of the tractate (וורדל מסכת שבת): one word of five letters a day, six guesses ----------
   The word of the day comes from the list prepared in daily-boards.js, so it is the same on every device.
   A guess may be any word of five letters in the app's dictionary, concepts and added terms.
   Final letters count as their plain form; the fifth letter, the leftmost, is shown in its final form */
const WKEY = 'aramit-shabbat-wordle';
const W_FIN = { 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' };
let wd = null, WDICT = null;
/* a guess counts when it is a real word: any word of five letters in the app (the dictionary with its other spellings, the
   concepts, the general terms and the bank), or a Hebrew word of five letters from hewords.js. The word of the day is
   always from the Wordle list of the tractate (daily-boards.js); hewords.js only decides what may be guessed.
   hewords.js (about 150 KB) loads when the Wordle opens, not with the page */
function wdDict() {
  if (WDICT) return WDICT;
  WDICT = new Set();
  const add = w => String(w).split(/\s+/).forEach(t => { if (/["'׳״]/.test(t)) return; const L = norm(xwLetters(t)); if (L.length === 5) WDICT.add(L); });
  D.forEach(e => { add(e.w); e.v.forEach(add); }); CN.forEach(c => add(c.w)); XE.forEach(x => add(x.w)); BK.forEach(x => add(x.w));
  return WDICT;
}
let HEW = null, HEW_P = null, HEW_FAIL = false;
function heWordsLoad() {
  if (window.HE_WORDS5 || HEW_FAIL) return Promise.resolve();
  if (!HEW_P) HEW_P = new Promise(res => {
    const el = document.createElement('script'); el.src = 'hewords.js';
    el.onload = () => res(); el.onerror = () => { HEW_FAIL = true; res(); };
    document.head.appendChild(el);
  });
  return HEW_P;
}
function heWords() {
  if (!HEW && window.HE_WORDS5) { const t = window.HE_WORDS5; HEW = new Set(); for (let i = 0; i + 5 <= t.length; i += 5) HEW.add(t.slice(i, i + 5)); }
  return HEW;
}
function wdValid(w) { w = norm(w); const h = heWords(); return wdDict().has(w) || !!(h && h.has(w)); }
function wdShow(ch, i) { return i === 4 && W_FIN[ch] ? W_FIN[ch] : ch; }
function wdScore(g, ans) {
  const out = ['x', 'x', 'x', 'x', 'x'], left = {};
  for (let i = 0; i < 5; i++) { if (g[i] === ans[i]) out[i] = 'g'; else left[ans[i]] = (left[ans[i]] || 0) + 1; }
  for (let i = 0; i < 5; i++) if (out[i] !== 'g' && left[g[i]]) { out[i] = 'y'; left[g[i]]--; }
  return out;
}
function wdToday() { return wdFor(localDay(), false); }
function wdFor(day, arch) {
  const refs = (window.DAILY && window.DAILY.wordle) || []; if (!refs.length) return null;
  const ed = xwEdition(day), r = refs[(ed - 1) % refs.length], e = xwEntry(r[0], r[1]); if (!e) return null;
  const g = { day, ed, e, ans: xwAns(e).join(''), rows: [], cur: '', hint: false, done: false, won: false, arch: !!arch };
  if (arch) return g;
  try { const o = JSON.parse(localStorage.getItem(WKEY) || 'null'); if (o && o.day === day && o.ans === g.ans) Object.assign(g, { rows: o.rows || [], hint: !!o.hint, done: !!o.done, won: !!o.won }); } catch (x) { /* a fresh start */ }
  return g;
}
function wdSave() { if (wd && wd.arch) return; try { localStorage.setItem(WKEY, JSON.stringify({ day: wd.day, ans: wd.ans, rows: wd.rows, hint: wd.hint, done: wd.done, won: wd.won })); } catch (x) { /* storage blocked */ } }
function wdChapter(e) {
  if (e.bk) return 'מושג יסוד: ' + ((window.BANK_TOPICS || [])[e.t] || '');
  if (e.xe) return 'מונח כללי בהלכות שבת, לא מפרק אחד';
  const k = e.cn ? e.pk : (Number.isInteger(e.pk) ? e.pk : pkOf(e.a));
  return 'פרק ' + ordPk(k) + ': ' + PEREKS[k][0];
}
function startWordle() { wd = wdToday(); if (!wd) { toast('המילה היומית לא נמצאה'); return; } nav('games', 'wordle'); }
function renderWordle() {
  const g = wd; heWordsLoad();
  view.className = 'panel tight';
  const rows = [];
  for (let r = 0; r < 6; r++) {
    const word = g.rows[r] || (r === g.rows.length && !g.done ? g.cur : ''), sc = g.rows[r] ? wdScore(g.rows[r], g.ans) : null;
    rows.push('<div class="wrow">' + [0, 1, 2, 3, 4].map(i => '<span class="wt' + (sc ? ' s-' + sc[i] : word[i] ? ' full' : '') + '">' + (word[i] ? wdShow(word[i], i) : '') + '</span>').join('') + '</div>');
  }
  /* each key takes the best colour its letter has had: green, then gold, then grey */
  const st = {};
  const rank = { x: 1, y: 2, g: 3 };
  g.rows.forEach(w => wdScore(w, g.ans).forEach((v, i) => { const c = w[i]; if (!st[c] || rank[v] > rank[st[c]]) st[c] = v; }));
  const keyCls = ch => { const v = st[norm(ch)]; return v ? ' class="k-' + v + '"' : ''; };
  const end = g.done ? wdEndHtml() : '';
  view.innerHTML = '<div class="wd"><div class="row between"><b class="wtitle">וורדל מסכת שבת #' + g.ed + (g.arch ? ' (ארכיון)' : '') + '</b><span>' + (g.done ? '' : '<button class="link" id="wd-hint"' + (g.hint ? ' disabled' : '') + '>רמז פרק 💡</button> ') + '<button class="link" id="quit">חזרה</button></span></div>' +
    labNavHtml(g, g.ed, 'lw') +
    (g.peek ? '<p class="small wclue labpeek">🛠️ ' + esc(g.e.w) + ' (' + esc(g.ans) + '): ' + esc(getGlossForMode(g.e, 'dictionary')) + '</p>' : '') +
    (g.hint ? '<p class="small wclue">💡 ' + esc(wdChapter(g.e)) + '</p>' : '') +
    '<div class="wgrid" id="wd-grid" dir="rtl">' + rows.join('') + '</div>' + end +
    (g.done ? '' : '<div class="xlow"><div class="xkb" dir="ltr">' + XKEYS.map((row, i) => '<div class="r' + i + (i === 2 ? ' wide' : '') + '">' +
      (i === 2 ? '<button class="del enter" id="wd-enter">אישור</button>' : '') +
      row.split('').map(ch => '<button data-ch="' + ch + '"' + keyCls(ch) + '>' + ch + '</button>').join('') +
      (i === 0 ? '<button class="del" id="wd-del" aria-label="מחיקה">⌫</button>' : '') + '</div>').join('') + '</div></div>') + '</div>';
  wdFit();
  bindLabNav(g, g.ed, openArchWD, renderWordle, 'lw');
  $('quit').onclick = goBack;
  const hb = $('wd-hint'); if (hb) hb.onclick = () => { if (g.done || g.hint) return; g.hint = true; wdSave(); renderWordle(); };
  view.querySelectorAll('.xkb [data-ch]').forEach(b => { b.onclick = () => wdType(b.dataset.ch); });
  const del = $('wd-del'); if (del) del.onclick = wdDel;
  const en = $('wd-enter'); if (en) en.onclick = wdEnter;
  const sh = $('wd-share'); if (sh) sh.onclick = () => copyText(wdShareText());
}
function wdFit() {
  const grid = $('wd-grid'); if (!grid) return;
  const tabs = document.getElementById('tabs'); if (tabs) view.style.paddingBottom = (tabs.offsetHeight + 4) + 'px';
  const kb = view.querySelector('.xkb'), box = view.querySelector('.wd'), cs = getComputedStyle(view), gap = parseFloat(getComputedStyle(box).rowGap) || 0;
  /* on a short or crowded screen the keys get lower before the tiles get too small to read */
  let free = 0;
  for (const kh of [50, 44, 38, 34]) {
    if (kb) kb.style.setProperty('--kh', kh + 'px');
    let others = 0, n = 0; for (const el of box.children) { if (el !== grid) { others += el.offsetHeight; n++; } }
    free = view.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - others - gap * n - 4;
    if (!kb || (free - 30) / 6 >= 34) break;
  }
  const wide = view.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const t = Math.floor(Math.max(24, Math.min((wide - 24) / 5, (free - 30) / 6, 62)));
  grid.style.setProperty('--wt', t + 'px');
}
/* the word of a day that has ended gives way to today's word as soon as the reader touches the board */
function wdRoll() { if (wd && !wd.arch && wd.day !== localDay()) { wd = wdToday(); if (wd) { renderWordle(); toast('התחיל יום חדש: זו המילה של היום'); } return true; } return false; }
function wdType(ch) { if (wdRoll()) return; const g = wd; if (g.done || g.cur.length >= 5) return; g.cur += norm(ch); renderWordle(); }
function wdDel() { if (wdRoll()) return; const g = wd; if (g.done) return; g.cur = g.cur.slice(0, -1); renderWordle(); }
function wdEnter() {
  if (wdRoll()) return;
  const g = wd; if (g.done) return;
  if (g.cur.length < 5) { toast('צריך חמש אותיות'); return; }
  /* the Hebrew words may still be loading: wait for them once, then check again */
  if (!wdValid(g.cur) && g.cur !== g.ans && !window.HE_WORDS5 && !HEW_FAIL) { const cur = g.cur; heWordsLoad().then(() => { if (wd === g && g.cur === cur && !g.done) wdEnter(); }); return; }
  if (!wdValid(g.cur) && g.cur !== g.ans) { toast('המילה לא נמצאה במילון. נסו מילה אחרת'); const rr = view.querySelectorAll('.wrow')[g.rows.length]; if (rr) { rr.classList.remove('shake'); void rr.offsetWidth; rr.classList.add('shake'); } return; }
  g.rows.push(g.cur); g.cur = '';
  if (g.rows[g.rows.length - 1] === g.ans) { g.done = true; g.won = true; }
  else if (g.rows.length >= 6) g.done = true;
  if (g.done && g.arch) { if (!g.lab) { const a = S.settings.arch || { xw: {}, wd: {} }; if (g.won) a.wd[g.ed] = g.rows.length; S.settings.arch = a; save(); } }
  else if (g.done) {
    S.settings.wdLast = { day: g.day, n: g.rows.length, won: g.won, hint: g.hint };
    if (g.won) S.settings.wdDays = (S.settings.wdDays || []).filter(d => d !== g.day).concat([g.day]).sort().slice(-400);
    save();
  }
  wdSave(); renderWordle();
}
function wdEndHtml() {
  const g = wd, e = g.e, word = g.ans.split('').map(wdShow).join('');
  const def = e.cn ? e.s + '. ' + e.m0 : e.xe ? e.m0 : gloss(e);
  const src = e.cn ? cSource(e) : e.xe ? 'מונח שנוסף לאפליקציה' : countLine(e) + ', לראשונה ב' + dafName(e.a);
  return '<div class="wend"><p class="wres">' + (g.won ? 'פתרת ב-' + g.rows.length + ' ניסיונות' : 'הפעם לא. המילה הייתה:') + '</p>' +
    '<b class="wword">' + esc(word) + '</b><p>' + esc(def) + '</p><p class="src">' + esc(src) + '</p>' +
    '<button class="btn wide" id="wd-share">שתף תוצאה</button></div>';
}
function wdShareText() {
  const g = wd, link = APP_URL || (NATIVE ? '' : window.location.origin + window.location.pathname), n = streakOf(S.settings.wdDays);
  return shareLines(['פשיטא: הארמית של מסכת שבת', '🟩 וורדל מסכת שבת #' + g.ed + (g.arch ? ' (ארכיון)' : ''), '🎯 ניחושים: ' + (g.won ? g.rows.length : 'X') + '/6',
    '💡 ' + (g.hint ? 'רמזים: 1 (רמז פרק)' : 'בלי רמזים')].concat(g.arch ? [] : ['🔥 רצף: ' + n],
    g.rows.map(w => wdScore(w, g.ans).map(v => ({ g: '🟩', y: '🟨', x: '⬜' })[v]).join(''))));
}
/* the streak with its lifelines (🛡️), worked out afresh from the list of solved days, so it never drifts.
   Each challenge holds up to two lifelines and starts with two. One calendar day missed uses a lifeline and the streak goes on;
   two days missed in a row, or a missed day with no lifeline left, end it. Every 7 days solved in a row bring one lifeline back.
   Today does not count as missed while it is still open */
function streakInfo(list, extra) {
  const days = new Set(list || []); if (extra) days.add(extra);
  const out = { n: 0, shields: 2, used: [] };
  if (!days.size) return out;
  const first = [...days].sort()[0], d = new Date(first + 'T12:00:00'), end = localDay();
  let run = 0, miss = 0;
  for (let k = 0; k < 800; k++) {
    const day = dayOf(d);
    if (day > end) break;
    if (days.has(day)) { out.n++; run++; miss = 0; if (run % 7 === 0 && out.shields < 2) out.shields++; }
    else if (day !== end) {
      miss++; run = 0;
      if (miss === 1 && out.n > 0 && out.shields > 0) { out.shields--; out.used.push(day); }
      else {
        /* a second missed day in a row: the lifeline of the day before did not save the streak, so it comes back */
        if (miss === 2 && out.used.length && out.used[out.used.length - 1] === dayOf(new Date(d.getTime() - 86400000))) { out.used.pop(); out.shields++; }
        out.n = 0;
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}
function streakOf(list, extra) { return streakInfo(list, extra).n; }
/* a lifeline used for yesterday is told once, on the learning screen */
/* a gentle reminder once in 30 days to save a backup: progress lives only on this device.
   It counts from the last backup, or from the first day with progress; "לא עכשיו" puts it off by 30 days */
const BACKUP_DAYS = 30;
function backupDue() {
  if (Object.keys(S.prog).length < 10) return false;
  const st = S.settings, t = Date.now();
  if (!st.backupBase) { st.backupBase = t; save(); }
  const from = Math.max(st.backupAt || st.backupBase, st.backupSnooze || 0);
  return t - from >= BACKUP_DAYS * 864e5;
}
function backupNote() {
  if (!backupDue()) return;
  const at = view.querySelector('.today'); (at || view).insertAdjacentHTML(at ? 'beforebegin' : 'beforeend', '<div class="bk-note" id="bk-note"><p>עבר חודש מאז הגיבוי האחרון. ההתקדמות שמורה רק במכשיר הזה, וגיבוי שומר עליה אם המכשיר יוחלף או ינוקה.</p>' +
    '<div class="row"><button class="btn" id="bk-go">גיבוי עכשיו</button><button class="btn line" id="bk-later">לא עכשיו</button></div></div>');
  $('bk-go').onclick = () => { exportBackup(); const n = $('bk-note'); if (n) n.remove(); };
  $('bk-later').onclick = () => { S.settings.backupSnooze = Date.now(); save(); const n = $('bk-note'); if (n) n.remove(); };
}
function shieldNotice() {
  const y = (() => { const d = now(); d.setDate(d.getDate() - 1); return dayOf(d); })(), seen = S.settings.shieldSeen || {}, msgs = [];
  [['xw', 'בתשחץ היומי', streakInfo(S.settings.xwDays, S.settings.xwDaily && S.settings.xwDaily.day)], ['wd', 'בוורדל', streakInfo(S.settings.wdDays)]].forEach(([k, name, inf]) => {
    if (inf.used.indexOf(y) >= 0 && seen[k] !== y) { seen[k] = y; msgs.push('🛡️ חבל הצלה שמר על הרצף ' + name + ' (🔥 ' + inf.n + '). נשארו ' + inf.shields + '/2'); }
  });
  if (msgs.length) { S.settings.shieldSeen = seen; save(); toast(msgs.join('. ')); }
}
document.addEventListener('keydown', ev => {
  if (!(R.tab === 'games' && R.sub === 'wordle' && wd) || sheetOpen || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.key === 'Enter') { ev.preventDefault(); wdEnter(); }
  else if (ev.key === 'Backspace') { ev.preventDefault(); wdDel(); }
  else if (/^[א-ת]$/.test(ev.key)) { ev.preventDefault(); wdType(ev.key); }
});

/* ---------- sheets: settings, about, onboarding ---------- */
let sheetOpen = false;
function openSheet(html, full) { $('sheet-host').innerHTML = '<div class="sheet' + (full ? ' full' : '') + '" id="sheet"><div>' + html + '</div></div>'; sheetOpen = true; if (!full) $('sheet').onclick = ev => { if (ev.target.id === 'sheet') closeSheet(); }; }
function closeSheet() { $('sheet-host').innerHTML = ''; sheetOpen = false; }
function applyLook() {
  document.documentElement.setAttribute('data-size', S.settings.size || 'm');
  const dark = S.settings.theme === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const b = document.getElementById('btn-theme'); if (b) { b.innerHTML = dark ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>'; b.setAttribute('aria-label', dark ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'); }
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', dark ? '#15100b' : '#f2e9d8');
}
/* ---------- backup, restore and the daily reminder ---------- */
function plug(name) {
  try { const c = window.Capacitor; if (!c || !c.isNativePlatform || !c.isNativePlatform()) return null; return (c.Plugins && c.Plugins[name]) || null; } catch (e) { return null; }
}
function reportWhere() {
  const out = [];
  if (R.tab === 'xw' && xg && xg.b) {
    const g = xg, daily = g.arch || (g.day && g.b.anchor);
    out.push(daily ? 'התשחץ היומי #' + g.b.ed + (g.day ? ' (' + g.day.split('-').reverse().join('.') + ')' : '') : 'תשחץ אישי');
    const w = g.b.words[g.act]; if (w && !g.done) out.push('ההגדרה: "' + w.clue + '"');
  } else if (R.tab === 'games' && R.sub === 'wordle' && wd) out.push('הוורדל היומי #' + xwEdition(wd.day || localDay()));
  else out.push('התשחץ היומי #' + xwEdition(localDay()));
  return out.join(', ');
}
function feedbackUrl() {
  const where = reportWhere();
  const body = 'דיווח על טעות באפליקציה פשיטא\n' + where + '\nגרסה ' + VERSION + ', ' + (NATIVE ? 'אנדרואיד' : 'דפדפן') + '\n\nהטעות: ';
  return 'mailto:' + FEEDBACK_EMAIL + '?subject=' + encodeURIComponent('דיווח על טעות: ' + where) + '&body=' + encodeURIComponent(body);
}
/* the beta lab (APK only) can move the date by whole days, to try editions and lifelines; elsewhere the shift is always 0 */
function dayShift() { if (!BETA) return 0; try { return parseInt(localStorage.getItem('aramit-beta-shift') || '0', 10) || 0; } catch (e) { return 0; } }
function now() { return new Date(Date.now() + dayShift() * 86400000); }
function localDay() { const d = now(); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); }
function backupText() {
  return JSON.stringify({ app: 'aramit-shabbat', version: VERSION, saved: localDay(),
    data: { prog: S.prog, edits: S.edits, best: S.best, fav: S.fav, miss: S.miss, settings: S.settings } });
}
function readBackup(text) {
  try {
    const o = JSON.parse(String(text).trim()); const d = o && o.data;
    if (!o || o.app !== 'aramit-shabbat' || !d || typeof d.prog !== 'object' || d.prog === null || Array.isArray(d.prog)) return null;
    return o;
  } catch (e) { return null; }
}
function applyBackup(o) {
  const d = o.data, obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  S.prog = {}; for (const k in obj(d.prog)) { const p = d.prog[k]; if (p && Number.isFinite(p.b) && Number.isFinite(p.d)) S.prog[k] = p; }
  S.edits = {}; for (const k in obj(d.edits)) if (typeof d.edits[k] === 'string') S.edits[k] = d.edits[k];
  S.best = obj(d.best); S.fav = obj(d.fav); S.miss = obj(d.miss); S._cstat = d.cstat && typeof d.cstat === 'object' ? d.cstat : null;
  const st = obj(d.settings); S.settings = { order: 'freq', newPerDay: 10, size: 'm' }; Object.assign(S.settings, st);
  S.onboarded = true; migrate(); save(); applyLook(); restoreSc(); restoreTq(); syncReminder(false);
  session = null; quiz = null; game = null;
}
function backupSummary(o) {
  const d = o.data, n = x => (x && typeof x === 'object' ? Object.keys(x).length : 0);
  return n(d.prog) + ' ערכים בלימוד, ' + n(d.fav) + ' מועדפים, ' + n(d.miss) + ' ברשימת הטעויות, ' + n(d.edits) + ' פירושים שנערכו' + (o.saved ? '. נשמר בתאריך ' + String(o.saved).slice(0, 10) : '');
}
async function exportBackup() {
  S.settings.backupAt = Date.now(); save();
  const text = backupText(), name = 'aramit-shabbat-backup-' + localDay() + '.json';
  const FS = plug('Filesystem'), SH = plug('Share');
  if (FS && SH) {
    try {
      const r = await FS.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      await SH.share({ title: name, dialogTitle: 'שמירת קובץ הגיבוי', files: [r.uri] });
    } catch (e) { if (!/cancel/i.test(String((e && e.message) || e))) openBackupText('לא הצלחתי לפתוח את חלון השמירה. אפשר להעתיק את הגיבוי כטקסט ולשמור אותו בכל מקום.'); }
    return;
  }
  if (plug('App')) { openBackupText(''); return; }
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); toast('קובץ הגיבוי נשמר בהורדות');
  } catch (e) { openBackupText(''); }
}
function confirmImport(o) {
  openSheet('<h2>ייבוא גיבוי</h2><p>בגיבוי: ' + esc(backupSummary(o)) + '.</p>' +
    '<div class="note">הייבוא יחליף את כל ההתקדמות, המועדפים, רשימת הטעויות והפירושים שבמכשיר הזה. אי אפשר לבטל אותו.</div>' +
    '<div class="two"><button class="btn bad" id="im-yes">לייבא ולהחליף</button><button class="btn ghost" id="im-no">ביטול</button></div>');
  $('im-no').onclick = () => openSettings();
  $('im-yes').onclick = () => { applyBackup(o); closeSheet(); toast('הגיבוי שוחזר'); nav('learn', null, true); };
}
function importText(text) { const o = readBackup(text); if (!o) { toast('זה לא קובץ גיבוי של האפליקציה'); return false; } confirmImport(o); return true; }
function openBackupText(msg) {
  openSheet('<div class="row between"><h2>גיבוי כטקסט</h2><button class="link" id="bt-close">חזרה</button></div>' + (msg ? '<div class="note">' + esc(msg) + '</div>' : '') +
    '<div class="field"><label for="bt-out">הגיבוי של המכשיר הזה</label><textarea id="bt-out" class="tall" readonly dir="ltr"></textarea></div>' +
    '<button class="btn line wide" id="bt-copy">העתקת הגיבוי</button>' +
    '<div class="field"><label for="bt-in">לשחזור: מדביקים כאן גיבוי שנשמר</label><textarea id="bt-in" dir="ltr"></textarea></div>' +
    '<button class="btn line wide" id="bt-load">ייבוא מהטקסט שהודבק</button>');
  $('bt-out').value = backupText();
  $('bt-close').onclick = () => openSettings();
  $('bt-copy').onclick = () => {
    const t = $('bt-out'); t.focus(); t.select();
    const done = ok => toast(ok ? 'הגיבוי הועתק' : 'סמנו את הטקסט והעתיקו אותו ידנית');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(() => done(true), () => { let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ } done(ok); });
    else { let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ } done(ok); }
  };
  $('bt-load').onclick = () => { const v = $('bt-in').value; if (!v.trim()) { toast('אין טקסט לייבא'); return; } importText(v); };
}
/* one local notification a day, at the chosen time. It needs no network, and a tap on it opens the short daily round */
/* the web version: the hour is kept where the service worker can read it, and on a site added to the home screen
   (Chrome on Android) the browser wakes the service worker now and then, which shows the reminder once a day after
   the chosen hour. Returns true when set, false without permission, null where the browser cannot do it */
async function webReminder(ask) {
  if (NATIVE || !('serviceWorker' in navigator) || !('caches' in window)) return null;
  try {
    const r = S.settings.remind || { on: false, h: 20, m: 0 }, reg = await navigator.serviceWorker.ready;
    const c = await caches.open('aramit-reminder'), url = new URL('reminder.json', reg.scope).href;
    const old = await c.match(url).then(x => x ? x.json() : {}).catch(() => ({}));
    await c.put(url, new Response(JSON.stringify({ on: !!r.on, h: r.h, m: r.m, last: old.last || '' }), { headers: { 'content-type': 'application/json' } }));
    if (!r.on) { if (reg.periodicSync) await reg.periodicSync.unregister('aramit-reminder').catch(() => {}); return true; }
    if (!('Notification' in window)) return null;
    let perm = Notification.permission; if (perm !== 'granted' && ask) perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;
    if (!reg.periodicSync) return null;
    const st = navigator.permissions ? await navigator.permissions.query({ name: 'periodic-background-sync' }).catch(() => null) : null;
    if (st && st.state !== 'granted') return null;
    await reg.periodicSync.register('aramit-reminder', { minInterval: 4 * 3600 * 1000 });
    return true;
  } catch (e) { return null; }
}
async function syncReminder(ask) {
  const LN = plug('LocalNotifications'); if (!LN) return webReminder(ask);
  try {
    await LN.cancel({ notifications: [{ id: 1 }] });
    const r = S.settings.remind; if (!r || !r.on) return true;
    let p = await LN.checkPermissions();
    if (p.display !== 'granted' && ask) p = await LN.requestPermissions();
    if (p.display !== 'granted') return false;
    await LN.schedule({ notifications: [{ id: 1, title: 'חזרה יומית', body: '10 מילים ומושגים ממסכת שבת', schedule: { on: { hour: r.h, minute: r.m }, allowWhileIdle: true }, extra: { daily: 1 } }] });
    return true;
  } catch (e) { return false; }
}
function two(n) { return (n < 10 ? '0' : '') + n; }

function openSettings(confirmReset) {
  const st = stats(D.concat(CN)), r = S.settings.remind || { on: false, h: 20, m: 0 }, native = !!plug('App');
  openSheet('<div class="row between"><h2>הגדרות</h2><button class="link" id="s-close">סגירה</button></div>' +
    '<div class="field"><span class="label">ערכים חדשים ביום</span><div class="seg" id="s-npd">' + [5, 10, 20, 30, 50].map(n => '<button data-v="' + n + '" aria-pressed="' + (S.settings.newPerDay === n) + '">' + n + '</button>').join('') + '</div></div>' +
    '<div class="field"><span class="label">סדר הערכים החדשים</span><div class="seg" id="s-ord"><button data-v="freq" aria-pressed="' + (S.settings.order !== 'daf') + '">מהשכיחה לנדירה</button><button data-v="daf" aria-pressed="' + (S.settings.order === 'daf') + '">לפי סדר הדפים</button></div></div>' +
    '<div class="field"><span class="label">גודל הכתב</span><div class="seg" id="s-size"><button data-v="m" aria-pressed="' + (S.settings.size === 'm') + '">רגיל</button><button data-v="l" aria-pressed="' + (S.settings.size === 'l') + '">גדול</button><button data-v="xl" aria-pressed="' + (S.settings.size === 'xl') + '">גדול מאוד</button></div></div>' +
    '<div class="field"><span class="label">תזכורת יומית</span><div class="seg" id="s-rem"><button data-v="off" aria-pressed="' + !r.on + '">כבויה</button><button data-v="on" aria-pressed="' + !!r.on + '">פעילה</button></div>' +
    (r.on ? '<label for="s-time">באיזו שעה</label><input type="time" id="s-time" value="' + two(r.h) + ':' + two(r.m) + '">' : '') +
    '<p class="small muted">התראה אחת ביום, "חזרה יומית: 10 מילים ומושגים". לחיצה עליה פותחת חידון קצר. היא פועלת בלי רשת.' + (native ? '' : ' התזכורת פועלת כאשר האתר מוצמד למסך הבית (באנדרואיד).') + '</p>' +
    '<button class="link start" id="s-daily">לפתוח את החידון היומי עכשיו</button></div>' +
    '<div class="field"><span class="label">גיבוי ושחזור</span><div class="two"><button class="btn line" id="s-export">ייצוא גיבוי</button><button class="btn line" id="s-import">ייבוא גיבוי</button></div>' +
    '<input type="file" id="s-file" accept=".json,application/json,text/plain" hidden>' +
    '<p class="small muted">קובץ הגיבוי כולל את ההתקדמות, המועדפים, רשימת הטעויות, השיאים, ההגדרות והפירושים שערכת.</p>' +
    '<button class="link start" id="s-text">גיבוי ושחזור כטקסט</button></div>' +
    betaLabHtml() +
    '<button class="btn line wide" id="s-help">איך לומדים באפליקציה</button>' +
    '<a class="btn line wide" id="s-feedback" href="' + feedbackUrl() + '">דיווח על טעות</a>' +
    (confirmReset
      ? '<div class="note">האיפוס ימחק את ההתקדמות ב־' + st.seen + ' ערכים, את המועדפים, את רשימת הטעויות, את השיאים ואת הפירושים שערכת. אי אפשר לבטל אותו.</div><div class="two"><button class="btn bad" id="s-reset-yes">למחוק הכול</button><button class="btn ghost" id="s-reset-no">ביטול</button></div>'
      : '<button class="btn line wide" id="s-reset">איפוס כל ההתקדמות</button>') +
    '<div class="stack small muted"><p><b>על האפליקציה</b></p>' +
    '<p>המאגר כולל ' + D.length + ' ערכים. ' + CORE_N + ' מהם הם המאגר הנבחר: מילים וביטויים בארמית שמופיעים בגמרא של מסכת שבת שלוש פעמים ומעלה, והספירה שלהם היא בגמרא בלבד. שאר ' + (D.length - CORE_N) + ' הערכים הם המאגר המורחב מכל 24 הפרקים: מילים ארמיות, פעלים, מונחים ושמות של חפצים וצמחים, מן המשנה ומן הגמרא, וביניהם ' + D.filter(e => e.rare).length + ' מילים נדירות שמופיעות פעם או פעמיים בלבד. מספר ההופעות נספר לפי צורת הכתיב, כולל אותיות השימוש.</p>' +
    (BK.length ? '<p>בתשחץ, היומי והאישי, משולבים גם ' + BK.length + ' מושגי יסוד מעולם התורה, הש"ס, הראשונים והישיבות. הם לא חלק מן המילון של מסכת שבת ואינם נספרים בו.</p>' : '') +
    (CN.length ? '<p>מילון המושגים כולל ' + CN.length + ' מושגים מן המשנה ומן הגמרא. מראי המקום נבדקו מול נוסח המסכת, וההסברים קצרים ואינם תחליף ללימוד הסוגיה.</p>' : '') +
    '<p>הפירושים קצרים ונועדו לעזור בקריאה שוטפת. הם אינם תחליף לרש"י ולמפרשים, ובמילה שיש לה כמה מובנים ייתכן שהפירוש לא יתאים לכל מקום. אפשר לתקן כל פירוש במילון, והתיקון נשמר במכשיר שלך.</p>' +
    '<p>הספירה נעשתה על נוסח הגמרא שבספריא (מהדורת ויליאם דוידסון, קורן). הגופנים: פרנק ריהל ליברה ואסיסטנט, ברישיון פתוח (OFL).</p>' +
    '<p>בוורדל אפשר לנחש גם מילים עבריות רגילות. רשימת המילים לקוחה ממאגר שכיחות המילים של הרמיט דייב, שנבנה מכתוביות סרטים (OpenSubtitles), ברישיון CC BY-SA 4.0.</p>' +
    '<p>האפליקציה פועלת בלי רשת ואינה אוספת שום מידע. ההתקדמות נשמרת במכשיר בלבד. גרסה ' + VERSION + '</p></div>');
  $('s-close').onclick = closeSheet;
  bindSeg('s-npd', v => { S.settings.newPerDay = +v; save(); openSettings(); render(); });
  bindSeg('s-ord', v => { S.settings.order = v; save(); openSettings(); render(); });
  bindSeg('s-size', v => { S.settings.size = v; save(); applyLook(); openSettings(); });
  bindSeg('s-rem', v => {
    const on = v === 'on'; S.settings.remind = { on, h: r.h, m: r.m }; save(); openSettings();
    syncReminder(true).then(ok => { if (on && ok === false) { S.settings.remind.on = false; save(); toast('לא ניתנה הרשאה להתראות, ולכן התזכורת כבויה'); openSettings(); } else if (on && ok) toast('התזכורת נקבעה לשעה ' + two(r.h) + ':' + two(r.m)); else if (on && ok === null) toast('בדפדפן הזה התזכורת לא תופיע. היא פועלת כשהאתר מוצמד למסך הבית באנדרואיד'); });
  });
  const tm = $('s-time'); if (tm) tm.onchange = () => {
    const mt = /^(\d{1,2}):(\d{2})/.exec(tm.value); if (!mt) return;
    S.settings.remind = { on: true, h: Math.min(23, +mt[1]), m: Math.min(59, +mt[2]) }; save();
    syncReminder(true).then(ok => { if (ok) toast('התזכורת נקבעה לשעה ' + two(S.settings.remind.h) + ':' + two(S.settings.remind.m)); });
  };
  $('s-daily').onclick = () => { closeSheet(); startDaily(); };
  $('s-export').onclick = () => { exportBackup(); };
  $('s-import').onclick = () => $('s-file').click();
  $('s-file').onchange = () => {
    const f = $('s-file').files && $('s-file').files[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = () => importText(rd.result); rd.onerror = () => toast('לא הצלחתי לקרוא את הקובץ'); rd.readAsText(f);
  };
  $('s-text').onclick = () => openBackupText('');
  $('s-help').onclick = () => openOnboarding(0);
  bindBetaLab();
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('s-reset', () => openSettings(true));
  on('s-reset-no', () => openSettings());
  on('s-reset-yes', () => { S.prog = {}; S.edits = {}; S.best = {}; S.fav = {}; S.miss = {}; save(); closeSheet(); toast('ההתקדמות אופסה'); session = null; quiz = null; game = null; nav('learn', null, true); });
}
/* 🛠️ the beta lab, in the APK only: move the date to any edition, or a day on, to try the daily boards, the archive and the lifelines */
function setShift(n) { try { if (n) localStorage.setItem('aramit-beta-shift', String(n)); else localStorage.removeItem('aramit-beta-shift'); } catch (e) { /* ignore */ } }
function betaLabHtml() {
  if (!BETA || !window.DAILY) return '';
  const day = localDay(), xi = xwStreakInfo(), wi = streakInfo(S.settings.wdDays), sh = dayShift();
  return '<div class="field lab"><span class="label">🛠️ מעבדת בטא</span>' +
    '<p class="small muted">התאריך המדומה: ' + day.split('-').reverse().join('.') + ', מהדורה #' + xwEdition(day) + (sh ? ' (הזזה של ' + sh + ' ימים)' : ' (התאריך האמיתי)') + '.</p>' +
    '<p class="small">תשחץ: 🔥 ' + xi.n + ' 🛡️ ' + xi.shields + '/2. וורדל: 🔥 ' + wi.n + ' 🛡️ ' + wi.shields + '/2.</p>' +
    '<label for="lab-ed">מעבר למהדורה (1 עד ' + ((window.DAILY && window.DAILY.boards.length) || 120) + ')</label><div class="two"><input type="number" id="lab-ed" min="1" max="' + window.DAILY.boards.length + '" value="' + Math.min(window.DAILY.boards.length, Math.max(1, xwEdition(day))) + '"><button class="btn line" id="lab-go">מעבר</button></div>' +
    '<label for="lab-ped">בדיקת מהדורה בלי להזיז את התאריך (לא נרשמת)</label><div class="three"><input type="number" id="lab-ped" min="1" max="' + window.DAILY.boards.length + '" value="' + Math.max(1, xwEdition(day)) + '"><button class="btn line" id="lab-pxw">תשחץ</button><button class="btn line" id="lab-pwd">וורדל</button></div>' +
    '<button class="link start" id="lab-arch">כל המהדורות בארכיון (#1 עד #' + window.DAILY.boards.length + ')</button>' +
    '<div class="two"><button class="btn line" id="lab-day">סימולציית יום (+1)</button><button class="btn line" id="lab-reset">חזרה להיום</button></div>' +
    '<p class="small muted">ההזזה משנה רק את התאריך שהאפליקציה רואה. הרצף וחבלי ההצלה מחושבים מחדש לפי ימי הפתרון.</p></div>';
}
function bindBetaLab() {
  if (!BETA || !$('lab-go')) return;
  const apply = n => { setShift(n); wd = null; if (xwStale()) xg = null; Object.keys(drawn).forEach(k => delete drawn[k]); openSettings(); render(false); toast('התאריך המדומה: ' + localDay().split('-').reverse().join('.') + ', מהדורה #' + xwEdition(localDay())); };
  $('lab-go').onclick = () => { const n = Math.min(window.DAILY.boards.length, Math.max(1, parseInt($('lab-ed').value, 10) || 1)); apply(dayShift() + n - xwEdition(localDay())); };
  $('lab-day').onclick = () => apply(dayShift() + 1);
  const ped = () => Math.min(window.DAILY.boards.length, Math.max(1, parseInt($('lab-ped').value, 10) || 1));
  $('lab-pxw').onclick = () => { const n = ped(); closeSheet(); openArchXW(n); };
  $('lab-pwd').onclick = () => { const n = ped(); closeSheet(); openArchWD(n); };
  $('lab-arch').onclick = () => openArchive();
  $('lab-reset').onclick = () => apply(0);
}
/* the first opening, for a new learner with nothing known yet: where they hold in the lesson, and how many of the most
   frequent words they already know. The words of the level chosen are shown as tags, all marked; a tap leaves one out */
const welcome = { lvl: 0, off: new Set(), daf: 0, skip: true, pk: undefined };
const WLEVELS = [[0, 'מתחיל'], [30, 'יסודות'], [80, 'בינוני'], [150, 'מתקדם']];
function topWords(n) { return D.filter(e => !e.ext).sort((x, y) => y.c - x.c).slice(0, n); }
function openWelcome(step) {
  const dots = '<div class="steps">' + [0, 1, 2].map(i => '<i class="' + (i <= step ? 'on' : '') + '"></i>').join('') + '</div>';
  let body, foot;
  if (step === 0) {
    body = '<div class="hero">הארמית של מסכת שבת, מילה אחרי מילה</div>' +
      '<p>' + CORE_N + ' מילים וביטויים שחוזרים בגמרא של מסכת שבת, ועוד ' + (D.length - CORE_N) + ' במאגר המורחב, עם פירוש קצר, מספר ההופעות והדף שבו כל מילה מופיעה לראשונה.</p>' +
      '<p class="muted">כמה דקות ביום מספיקות. האפליקציה זוכרת מה למדת ומחזירה כל מילה בדיוק כשצריך לחזור עליה.</p>';
    foot = '<button class="btn wide" id="o-next">הבא</button>';
  } else if (step === 1) {
    const at = welcome.daf || (SC.by === 'daf' ? SC.d1 : 2);
    body = '<div class="hero">באיזה דף אתם אוחזים בשיעור?</div>' +
      '<p class="small">מגלגלים למעלה ולמטה, או לוחצים: קודם הפרק (מימין), ואחר כך הדף. מי שלא בטוח באיזה דף, בוחר "דלג", והלימוד יגיע עד סוף הפרק.</p>' +
      dpHtml('o-dp', at, { lo: 2, hi: 157, skip: 'דלג', skipped: welcome.skip, pk: welcome.pk, none: !welcome.daf }) +
      '<p class="small muted" id="o-dpnote"></p><p class="small muted">הלימוד והחידון יתמקדו במה שלמדתם עד שם. אפשר לשנות בכל רגע ב"מה מתרגלים".</p>';
    foot = '<div class="two"><button class="btn ghost" id="o-skip">כל המסכת</button><button class="btn" id="o-next">המשך</button></div>';
  } else {
    const n = WLEVELS[welcome.lvl][0], ws = topWords(n);
    body = '<div class="hero">כמה מילים אתם כבר מכירים?</div>' +
      '<div class="seg" id="o-lvl">' + WLEVELS.map(([k, t], i) => '<button data-v="' + i + '" aria-pressed="' + (welcome.lvl === i) + '">' + t + ' (' + k + ')</button>').join('') + '</div>' +
      (n ? '<p class="small muted">' + n + ' המילים השכיחות ביותר במסכת. לחיצה על מילה שאינכם מכירים מורידה את הסימון שלה.</p>' +
        '<div class="chips known" id="o-words">' + ws.map(e => '<button class="chip" data-w="' + esc(e.w) + '" aria-pressed="' + !welcome.off.has(e.w) + '">' + esc(e.w) + '</button>').join('') + '</div>'
        : '<p class="small muted">מתחילים מן ההתחלה: המילים השכיחות ביותר יגיעו ראשונות.</p>');
    foot = '<div class="two"><button class="btn ghost" id="o-prev">הקודם</button><button class="btn" id="o-next">מתחילים' + (n ? ' (' + (n - ws.filter(e => welcome.off.has(e.w)).length) + ')' : '') + '</button></div>';
  }
  openSheet(dots + '<div class="stack" style="gap:14px">' + body + '</div>' + foot, true);
  const done = () => {
    const t = today(), n = WLEVELS[welcome.lvl][0];
    topWords(n).forEach(e => { if (!welcome.off.has(e.w)) S.prog[pid(e)] = { b: KNOWN_BOX, d: t + INTERVALS[KNOWN_BOX], n: 1, x: 0, f: t - 1, k: 1 }; });
    S.onboarded = true; save(); closeSheet(); render();
  };
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  if (step === 1) {
    const note = () => { const v = welcome.daf, k = welcome.pk ?? dpPkOf(v || 2, { lo: 2, hi: 157 });
      $('o-dpnote').textContent = !v ? 'עוד לא בחרתם. בלי בחירה, הלימוד יכלול את כל המסכת.' : welcome.skip ? 'עד סוף פרק ' + PEREKS[k][0] + ' (דף ' + hebNum(v) + ')' : 'עד דף ' + hebNum(v) + ', בפרק ' + PEREKS[k][0]; };
    dpBind('o-dp', { lo: 2, hi: 157, edge: 'last', skip: 'דלג', onChange: (d, sk) => { const bx = $('o-dp'); if (!bx) return; welcome.daf = d; welcome.skip = sk; welcome.pk = +bx.dataset.pk; note(); } });
    note();
  }
  on('o-prev', () => openWelcome(step - 1));
  on('o-skip', () => { if (SC.by === 'daf') { SC.by = 'all'; saveSc(); } openWelcome(2); });
  on('o-next', () => {
    if (step === 1) { if (welcome.daf) { SC.by = 'daf'; SC.d0 = 2; SC.d1 = welcome.daf; } else if (SC.by === 'daf') SC.by = 'all'; saveSc(); }
    if (step < 2) openWelcome(step + 1); else done();
  });
  bindSeg('o-lvl', v => { welcome.lvl = +v; welcome.off.clear(); openWelcome(2); });
  const ow = $('o-words'); if (ow) ow.onclick = ev => { const b = ev.target.closest('[data-w]'); if (!b) return; const w = b.dataset.w;
    if (welcome.off.has(w)) welcome.off.delete(w); else welcome.off.add(w);
    b.setAttribute('aria-pressed', String(!welcome.off.has(w)));
    const nb = $('o-next'), n = WLEVELS[welcome.lvl][0]; nb.textContent = 'מתחילים (' + (n - welcome.off.size) + ')'; };
}
function openOnboarding(step) {
  const dots = '<div class="steps">' + [0, 1, 2].map(i => '<i class="' + (i <= step ? 'on' : '') + '"></i>').join('') + '</div>';
  let body;
  if (step === 0) body = '<div class="hero">הארמית של מסכת שבת, מילה אחרי מילה</div>' +
    '<p>' + D.length + ' מילים וביטויים שחוזרים בגמרא של מסכת שבת, עם פירוש קצר, מספר ההופעות במסכת והדף שבו כל מילה מופיעה לראשונה.</p>' +
    (CN.length ? '<p>במילון יש גם ' + CN.length + ' מושגים של המסכת, מן המשנה ומן הגמרא, מסודרים לפי נושאים ועם מראה מקום.</p>' : '') +
    '<p class="muted">כמה דקות ביום מספיקות. האפליקציה זוכרת מה למדת ומחזירה כל מילה בדיוק כשצריך לחזור עליה.</p>';
  else if (step === 1) body = '<div class="hero">איך הלימוד עובד</div>' +
    '<p>כל יום מקבלים כמה מילים חדשות ואת המילים שהגיע זמנן לחזרה.</p>' +
    '<p>מילה שעונים עליה נכון חוזרת אחרי יום, אחר כך אחרי שלושה ימים, שבוע, שבועיים, חודש וחודשיים. טעות מחזירה אותה להתחלה.</p>' +
    '<p class="muted">מילה שכבר מכירים מסמנים "כבר יודע", והיא מדלגת קדימה. אפשר ללמוד כך גם את המושגים, ולבחור מה לתרגל: פרקים, טווח דפים, מועדפים או טעויות חוזרות. חוץ מהלימוד יש מילון מלא, חידון בשלוש רמות ושלושה משחקים.</p>';
  else body = '<div class="hero">באיזה סדר ללמוד?</div>' +
    '<div class="seg" id="o-ord"><button data-v="freq" aria-pressed="' + (S.settings.order !== 'daf') + '">מהשכיחה לנדירה</button><button data-v="daf" aria-pressed="' + (S.settings.order === 'daf') + '">לפי סדר הדפים</button></div>' +
    '<p class="note">' + (S.settings.order === 'daf' ? 'מתאים למי שלומד את המסכת על הסדר: המילים מגיעות לפי הדף שבו הן מופיעות לראשונה.' : 'מתאים לרוב הלומדים: קודם המילים שחוזרות הכי הרבה, כך שכל מילה פותחת כמה שיותר שורות בגמרא.') + '</p>' +
    '<div class="field"><span class="label">ערכים חדשים ביום</span><div class="seg" id="o-npd">' + [5, 10, 20, 30].map(n => '<button data-v="' + n + '" aria-pressed="' + (S.settings.newPerDay === n) + '">' + n + '</button>').join('') + '</div></div>' +
    '<p class="small muted">אפשר לשנות את שתי הבחירות בכל רגע במסך ההגדרות.</p>';
  openSheet(dots + '<div class="stack" style="gap:14px">' + body + '</div>' +
    (step > 0 ? '<div class="two"><button class="btn ghost" id="o-prev">הקודם</button><button class="btn" id="o-next">' + (step < 2 ? 'הבא' : 'מתחילים') + '</button></div>' : '<button class="btn wide" id="o-next">הבא</button>'), true);
  const pv = $('o-prev'); if (pv) pv.onclick = () => openOnboarding(step - 1);
  $('o-next').onclick = () => { if (step < 2) openOnboarding(step + 1); else { S.onboarded = true; save(); closeSheet(); render(); } };
  bindSeg('o-ord', v => { S.settings.order = v; save(); openOnboarding(2); });
  bindSeg('o-npd', v => { S.settings.newPerDay = +v; save(); openOnboarding(2); });
}

/* ---------- boot ---------- */
load(); applyLook(); restoreSc(); restoreTq(); restoreXw();
if (BETA) { const h = document.querySelector('header h1'); if (h) { const sm = h.querySelector('small'); (sm || h).insertAdjacentHTML(sm ? 'beforebegin' : 'beforeend', '<span class="beta">BETA</span>'); } }
document.querySelectorAll('#tabs button').forEach(b => { b.onclick = () => turnTo(b.dataset.tab); });
$('btn-settings').onclick = () => openSettings();
$('btn-theme').onclick = () => {
  S.settings.theme = S.settings.theme === 'dark' ? 'light' : 'dark'; save(); applyLook();
  if (R.tab === 'xw' && R.sub === 'board' && xg) { xg._fsAt = null; xwPaint(); }
};
try { history.replaceState(R, ''); } catch (e) { /* ignore */ }
render();
TABS.forEach(t => { if (t !== R.tab) paint(t); });
if (!S.onboarded) { if (D.concat(CN).some(isKnown)) { S.onboarded = true; save(); } else openWelcome(0); }
else { const sv = xwLoad(); if (sv && sv.open) { xg = sv; nav('xw', 'board'); } }
/* a read-only look inside, for the automated tests only */
if (/[?&]test\b/.test(location.search)) window.__t = { pools: () => { const r = { quiz: quizItems(), xw: xwPool() }; r.games = gamePool(0); r.xwSrc = xwCfg.src; r.by = SC.by; r.kind = SC.kind; return r; }, wdScore: (a, b) => wdScore(a, b), wdShare: () => wdShareText(), streak: l => streakOf(l), streakInfo: l => streakInfo(l), hold: () => holdLabel(), grade: (w, ok, rc) => grade(BYID.get(w), ok, rc), newToday: () => newToday(), backupDue: () => backupDue(), prog: w => S.prog[pid(BYID.get(w))], known: w => isKnown(BYID.get(w)), game: () => game, xw: () => xg, wd: () => wd, wdDict: () => [...wdDict()], wdValid: w => wdValid(w), heLoaded: () => !!window.HE_WORDS5, openDaily: day => { const b = xwDailyBoard(day); const g = xwGame(b); g.day = day; xwOpen(g); }, R: () => R, shown: () => shownTab, session: () => session, edition: d => xwEdition(d || localDay()), allDaily: () => window.DAILY.boards.map((d, i) => !!xwFromRefs(d.R, d.C, d.words)).filter(x => !x).length, glossFor: (w, m) => { const e = BYID.get(w) || BK.find(b => b.w === w); return e ? getGlossForMode(e, m) : ''; }, xwTry: () => xwTry(shuffle(xwPool())), xwPool: () => xwPool(), xwCfg: () => xwCfg, xwGloss: e => getGlossForMode(e, 'crossword'), archXW: n => openArchXW(n), archWD: n => openArchWD(n), archMax: () => archMax(), openArchive: () => openArchive(), openSettings: () => openSettings(), leak: e => { const o = xwOv(e); return !o && rootLeak(e.w, String(e.cn || e.xe ? e.s : short(e)).replace(/\s*\([^)]*\)/g, '')); }, cards: () => [...BYID.keys()] };

/* hardware back button inside the Android app */
try {
  const cap = window.Capacitor, App = cap && cap.Plugins && cap.Plugins.App;
  if (App && App.addListener) App.addListener('backButton', () => {
    if (sheetOpen) { if (S.onboarded) closeSheet(); return; }
    if (R.sub || R.tab !== 'learn') { history.back(); return; }
    if (App.exitApp) App.exitApp();
  });
} catch (e) { /* running in a plain browser */ }
/* the daily reminder: keep it scheduled, and open the short round when it is tapped */
try {
  const LN = plug('LocalNotifications');
  if (LN && LN.addListener) LN.addListener('localNotificationActionPerformed', () => { if (S.onboarded) startDaily(); });
  syncReminder(false);
  /* the web reminder: a tap on it opens the app with ?daily, or sends a message to the app already open */
  if (/[?&]daily\b/.test(location.search) && S.onboarded) startDaily();
  if (!NATIVE && 'serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', ev => { if (ev.data && ev.data.daily && S.onboarded) startDaily(); });
} catch (e) { /* no notifications here */ }
})();
