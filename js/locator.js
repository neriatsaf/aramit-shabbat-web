/* פשיטא: the game "איפה בגמרא?": which chapter and page a passage comes from, and the friend challenge */
import './games.js';   /* first: keeps the modules running in order */
import { $, APP_URL, PEREKS, S, SC, ST, VERSION, dafNum, esc, hebNum, ordPk, save, shuffle, toast, track } from './state.js';
import { doneButtons, gem } from './learn.js';
import { renderGames } from './games.js';
import { copyText, shareLines } from './xw.js';
import { R, calm, goBack, nav } from './main.js';

/* ---------- "איפה בגמרא?": which chapter and which page a short passage of the tractate comes from ----------
   Ten passages a round, up to 10 points each. Stage 1 picks the chapter out of all 24: a wrong chapter ends the question
   (2 points for the next or the previous chapter, 0 for any other). Stage 2 picks the page out of the pages of that
   chapter: 10 for the exact page, 8, 7, 5 for one, two or three pages off, 4 for anything further in the chapter.
   The passages (www/passages.js: mishnayot, well known baraitot and anchors of the page; one mode since 1.9, the extreme
   mode was dropped) load only when the game opens. The one personal best is S.best.locN, the key of the old normal mode,
   so the best kept in aramit-shabbat-v1 (and in the cloud backup) carries over; an old locX is left alone and unused */
const LOC_N = 10;
/* chapters that open at the top of an amud aleph, so the page before is the last page of the chapter before them */
const PK_TOP = new Set([5, 18]);
function pkDafs(k) {
  const d0 = dafNum(PEREKS[k][1]);
  if (k + 1 >= PEREKS.length) return [d0, 157];
  const nx = PEREKS[k + 1][1], d1 = dafNum(nx) - (PK_TOP.has(k + 1) ? 1 : 0);
  return [d0, d1];
}
const LOC_MAX = 1000, LOC_NEAR = 20; /* 100 a passage; a chapter next to the right one earns LOC_NEAR */
function dafPts(dist) { return dist === 0 ? 100 : dist === 1 ? 85 : dist === 2 ? 70 : dist === 3 ? 55 : 40; }
function locColor(p) { return p >= 100 ? 'g' : p >= 40 ? 'y' : 'r'; }
function locNum(n) { return n >= 1000 ? String(n).replace(/(\d)(?=(\d{3})+$)/g, '$1,') : String(n); }
let locLoading = null;
function loadPassages() {
  if (window.PASSAGES) return Promise.resolve(window.PASSAGES);
  if (locLoading) return locLoading;
  locLoading = new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = 'passages.js?v=' + VERSION;
    s.onload = () => window.PASSAGES ? ok(window.PASSAGES) : fail(new Error('empty'));
    s.onerror = () => { s.remove(); fail(new Error('load')); };
    document.head.appendChild(s);
  }).catch(e => { locLoading = null; throw e; });
  return locLoading;
}
function openLoc() {
  const v = ST.view;
  if (!window.PASSAGES) { const b = $('g-loc'); if (b) b.classList.add('busy'); }
  loadPassages().then(() => nav('games', 'locintro')).catch(() => { toast('לא הצלחתי לטעון את הקטעים. בדוק את החיבור ונסה שוב'); const b = v && v.querySelector('#g-loc'); if (b) b.classList.remove('busy'); });
}
function locBest() { return S.best.locN; }
/* the scoring as a short table: a number never sits beside a full stop, so nothing wraps the wrong way round in RTL */
const LOC_RULES = [['דף מדויק', 100], ['דף אחד ממנו', 85], ['שני דפים ממנו', 70], ['שלושה דפים ממנו', 55], ['דף רחוק יותר בפרק', 40], ['פרק סמוך', 20]];
/* the range of a round (1.13): the whole tractate, or up to the page chosen in "מה מתרגלים" (SC.d1 when the range is by page).
   A round is always ten passages, so the score, the best and a friend's link stay as they were; when the range holds fewer
   than ten, the rest come from the nearest pages after it, and the screen says so */
function locMine() { return SC.by === 'daf' && Number.isInteger(SC.d1) ? SC.d1 : null; }
function locRange() { return S.settings.locRange === 'mine' && locMine() ? 'mine' : 'all'; }
function locInRange(p, d1) { return parseInt(p.s, 10) <= d1; }
function locRangeNote() {
  const d1 = locMine();
  if (!d1) return '<p class="small muted lrnote">כדי לשחק עד הדף שלך, בחרו דף ב"מה מתרגלים" במסך הלימוד.</p>';
  if (locRange() !== 'mine') return '';
  const n = window.PASSAGES.filter(p => locInRange(p, d1)).length;
  return '<p class="small lrnote">' + (n >= LOC_N ? 'עד דף ' + esc(gem(d1)) + ' יש ' + n + ' קטעים, והסבב יהיה מתוכם.'
    : 'עד דף ' + esc(gem(d1)) + ' יש ' + (n ? n + ' קטעים' : 'עדיין אין קטעים') + '. ' + (LOC_N - n) + ' הקטעים הנוספים יבואו מהדפים הקרובים שאחריו.') + '</p>';
}
function renderLocIntro() {
  const P = window.PASSAGES; if (!P) { renderGames(); return; }
  const bn = locBest(), d1 = locMine(), rg = locRange();
  ST.view.innerHTML = '<div class="row between"><h2>איפה בגמרא?</h2><button class="link" id="lm-back">חזרה למשחקים</button></div>' +
    '<p class="muted small" style="margin:0">קטע קצר ממסכת שבת: משנה, ברייתא מוכרת או מימרא ידועה מהדף. מזהים קודם את הפרק, ואחר כך את הדף.</p>' +
    '<section class="locintro"><div class="lihead"><b>עשרה קטעים</b><span>עד 100 נקודות לכל קטע</span></div>' +
    '<div class="seg grid2" id="lm-range" role="group" aria-label="טווח הקטעים"><button data-r="all" aria-pressed="' + (rg === 'all') + '">כל המסכת</button>' +
      '<button data-r="mine" aria-pressed="' + (rg === 'mine') + '"' + (d1 ? '' : ' disabled') + '>' + (d1 ? 'עד דף ' + esc(gem(d1)) : 'עד הדף שלי') + '</button></div>' +
    locRangeNote() +
    '<ul class="locrules">' + LOC_RULES.map(r => '<li><span>' + r[0] + '</span><b>' + r[1] + '</b></li>').join('') + '<li class="zero"><span>פרק אחר</span><b>0</b></li></ul>' +
    (Number.isInteger(bn) ? '<p class="locbest">השיא שלך: <b>' + locNum(bn) + '/1,000</b></p>' : '') +
    '<button class="btn wide" id="lm-go">התחלה</button></section>';
  $('lm-back').onclick = goBack;
  $('lm-go').onclick = () => startLoc();
  ST.view.querySelectorAll('#lm-range button').forEach(b => { b.onclick = () => { if (b.disabled) return; S.settings.locRange = b.dataset.r; save(); renderLocIntro(); }; });
}
/* ten passages from as many different chapters as possible, leaving out the passages of the last rounds */
function pickLoc() {
  const every = window.PASSAGES.map((p, i) => Object.assign({ i }, p)), d1 = locRange() === 'mine' ? locMine() : null;
  if (d1) {
    const inR = every.filter(p => locInRange(p, d1));
    /* fewer than ten up to the page: all of them, and the nearest pages after it (the same page in turn, at random) */
    if (inR.length < LOC_N) {
      const after = shuffle(every.filter(p => !locInRange(p, d1))).sort((x, y) => parseInt(x.s, 10) - parseInt(y.s, 10));
      return shuffle(inR.concat(after.slice(0, LOC_N - inR.length)));
    }
    return pickFrom(inR, 'mine');
  }
  return pickFrom(every, 'loc');
}
function pickFrom(all, rk) {
  const rec = (S.settings.locRecent && S.settings.locRecent[rk]) || [];
  const keep = Math.max(0, Math.min(rec.length, all.length - 3 * LOC_N));
  const recent = new Set(rec.slice(-keep));
  let src = shuffle(all.filter(p => !recent.has(p.i)));
  const out = [], pks = new Set();
  for (const p of src) { if (out.length === LOC_N) break; if (!pks.has(p.pk)) { out.push(p); pks.add(p.pk); } }
  for (const p of src) { if (out.length === LOC_N) break; if (out.indexOf(p) < 0) out.push(p); }
  for (const p of shuffle(all)) { if (out.length === LOC_N) break; if (!out.some(o => o.i === p.i)) out.push(p); }
  S.settings.locRecent = S.settings.locRecent || {};
  S.settings.locRecent[rk] = rec.concat(out.map(p => p.i)).slice(-Math.max(LOC_N, all.length - LOC_N));
  save();
  return shuffle(out);
}
/* a friend challenge (from 1.10): a link ?game=locator&seed=...&s=...&r=... gives a friend the same ten passages. The seed holds
   the ten passages themselves (two base-36 letters each, their place in passages.js, in the order played), so the round of
   the one who sends it is drawn as always (without the passages of the last rounds) and the friend's round is exactly the
   same; s is the score of the one who sent it and r a letter for each passage (LOC_CODE), to compare passage by passage */
const LOC_CODE = { 100: 'a', 85: 'b', 70: 'c', 55: 'd', 40: 'e', 20: 'f', 0: 'g' };
function locSeedOf(qs) { return qs.map(q => q.i.toString(36).padStart(2, '0')).join(''); }
function locFromSeed(seed) {
  const P = window.PASSAGES; if (!P || !/^[0-9a-z]+$/.test(seed || '') || seed.length !== 2 * LOC_N) return null;
  const idx = seed.match(/../g).map(x => parseInt(x, 36));
  if (idx.some(i => !(i >= 0 && i < P.length)) || new Set(idx).size !== LOC_N) return null;
  return idx.map(i => Object.assign({ i }, P[i]));
}
function locRival(ch) {
  const back = Object.keys(LOC_CODE).reduce((o, k) => (o[LOC_CODE[k]] = +k, o), {});
  const r = /^[a-g]+$/.test(ch.r || '') && ch.r.length === LOC_N ? ch.r.split('').map(c => back[c]) : null;
  const s = r ? r.reduce((a, b) => a + b, 0) : Number.isInteger(ch.s) && ch.s >= 0 && ch.s <= LOC_MAX ? ch.s : null;
  return s === null ? null : { s, r };
}
function locLink(g) {
  return APP_URL + '?game=locator&seed=' + locSeedOf(g.qs) + '&s=' + g.over.score + '&r=' + g.pts.map(p => LOC_CODE[p] || 'g').join('');
}
/* the challenge in the address, read once at start and taken out of the address so a reload does not start it again */
const LOC_CHAL = (() => {
  try {
    const q = new URLSearchParams(location.search); if (q.get('game') !== 'locator') return null;
    const ch = { seed: (q.get('seed') || '').toLowerCase(), s: parseInt(q.get('s'), 10), r: (q.get('r') || '').toLowerCase() };
    ['game', 'seed', 's', 'r'].forEach(k => q.delete(k));
    const rest = q.toString().replace(/=(?=&|$)/g, '');
    history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    return ch;
  } catch (e) { return null; }
})();
function openLocChallenge(ch) {
  loadPassages().then(() => {
    const qs = locFromSeed(ch.seed);
    if (!qs) { toast('הקישור לאתגר אינו תקין. אפשר לשחק משחק רגיל'); nav('games', 'locintro'); return; }
    track('locator_challenge_open', { rival: locRival(ch) ? locRival(ch).s : -1 });
    startLoc({ qs, rival: locRival(ch) });
  }).catch(() => toast('לא הצלחתי לטעון את הקטעים. בדוק את החיבור ונסה שוב'));
}
function startLoc(ch) {
  if (!window.PASSAGES) { openLoc(); return; }
  if (ch && ch.qs) {   /* the passages of a challenge count as played, as those of any round */
    const rec = (S.settings.locRecent && S.settings.locRecent.loc) || [];
    S.settings.locRecent = S.settings.locRecent || {};
    S.settings.locRecent.loc = rec.concat(ch.qs.map(p => p.i)).slice(-Math.max(LOC_N, window.PASSAGES.length - LOC_N)); save();
  }
  const range = ch && ch.qs ? 'all' : locRange();
  ST.game = { type: 'loc', qs: ch && ch.qs ? ch.qs : pickLoc(), pos: 0, pts: [], stage: 'pk', pk: null, daf: null, rival: ch && ch.rival || null, range };
  track('locator_start', { range });
  nav('games', 'loc', R.sub === 'locover' || R.sub === 'loc');
}
function locWhere(p) { return 'פרק ' + ordPk(p.pk - 1) + ', ' + PEREKS[p.pk - 1][0] + ', דף ' + p.d; }
function renderLoc() {
  const g = ST.game, q = g.qs[g.pos];
  if (!q) { finishLoc(); return; }
  const total = g.pts.reduce((a, b) => a + b, 0), done = g.stage === 'done';
  let h = '<div class="row between"><span class="small muted">קטע ' + (g.pos + 1) + ' מתוך ' + LOC_N + '</span>' +
    '<span class="locscore"><b>' + locNum(total) + '</b>/1,000</span></div>' +
    '<ol class="locbar">' + g.qs.map((x, i) => '<li class="' + (i < g.pts.length ? 'c-' + locColor(g.pts[i]) : i === g.pos ? 'cur' : '') + '">' + (i + 1) + '</li>').join('') + '</ol>' +
    (g.rival ? '<p class="locchal">אתגר מחבר: הוא השיג <b>' + locNum(g.rival.s) + '/1,000</b> על אותם קטעים</p>' : '') +
    '<section class="loccard"><p class="psg">' + esc(q.t) + '</p></section>';
  const k = q.pk - 1;
  if (g.stage === 'pk' || (done && g.pk !== k)) {
    h += '<div class="lochd">באיזה פרק?</div><div class="lpkgrid">' + PEREKS.map((p, i) => {
      let c = ''; if (done) { if (i === k) c = ' right'; else if (i === g.pk) c = ' wrong'; else return ''; }
      return '<button class="pkb' + c + '" data-k="' + i + '"' + (done ? ' disabled' : '') + '><i>' + ordPk(i) + '</i>' + esc(p[0]) + '</button>';
    }).join('') + '</div>';
  } else {
    const [d0, d1] = pkDafs(k), dq = parseInt(q.s, 10);
    h += '<div class="lochd">באיזה דף? <span class="muted">פרק ' + ordPk(k) + ', ' + esc(PEREKS[k][0]) + '</span></div><div class="dafgrid">';
    for (let d = d0; d <= d1; d++) {
      let c = ''; if (done) { if (d === dq) c = ' right'; else if (d === g.daf) c = ' wrong'; }
      h += '<button class="dfb' + c + '" data-d="' + d + '"' + (done ? ' disabled' : '') + '>' + hebNum(d) + '</button>';
    }
    h += '</div>';
  }
  if (done) {
    const p = g.pts[g.pos];
    h += '<div class="locres"><div class="locpts c-' + locColor(p) + '">+' + p + '</div><div><b>' + esc(locWhere(q)) + '</b>' +
      (q.c ? '<p>' + esc(q.c) + '</p>' : '') +
      '<a class="sflink" href="https://www.sefaria.org/Shabbat.' + esc(q.s) + '" target="_blank" rel="noopener">לפתיחה בספריא ↗</a></div></div>' +
      '<button class="btn wide" id="lc-next">' + (g.pos + 1 < LOC_N ? 'הבא' : 'לתוצאות') + '</button>';
  }
  h += '<button class="link" id="quit">סיום</button>';
  ST.view.innerHTML = h;
  $('quit').onclick = goBack;
  ST.view.querySelectorAll('.pkb').forEach(b => { b.onclick = () => {
    if (g.stage !== 'pk') return; const i = +b.dataset.k; g.pk = i;
    if (i === k) { g.stage = 'daf'; b.classList.add('right'); setTimeout(() => { if (ST.game === g && R.sub === 'loc') { renderLoc(); locScroll('.dafgrid'); } }, 260); return; }
    g.pts.push(Math.abs(i - k) === 1 ? LOC_NEAR : 0); g.stage = 'done'; renderLoc(); locScroll('.locres');
  }; });
  ST.view.querySelectorAll('.dfb').forEach(b => { b.onclick = () => {
    if (g.stage !== 'daf') return; const d = +b.dataset.d; g.daf = d;
    g.pts.push(dafPts(Math.abs(d - parseInt(q.s, 10)))); g.stage = 'done'; renderLoc(); locScroll('.locres');
  }; });
  const nx = $('lc-next'); if (nx) nx.onclick = () => { g.pos++; g.stage = 'pk'; g.pk = null; g.daf = null; renderLoc(); ST.view.scrollTop = 0; };
}
/* brings a part of the round into sight inside the panel: the heading before it and all of it when they fit (as much of the
   passage above stays in sight as can), otherwise from its heading down. The panel is scrolled by itself, never the rail */
function locScroll(sel) {
  const v = ST.view, el = v.querySelector(sel); if (!el) return;
  const top0 = (el.previousElementSibling && el.previousElementSibling.classList.contains('lochd') ? el.previousElementSibling : el);
  const vr = v.getBoundingClientRect(), y = n => n - vr.top + v.scrollTop;
  const nx = el.nextElementSibling && el.nextElementSibling.id === 'lc-next' ? el.nextElementSibling : el;
  const top = y(top0.getBoundingClientRect().top) - 8, bottom = y(nx.getBoundingClientRect().bottom) + 12;
  const want = bottom - top <= v.clientHeight ? Math.min(top, Math.max(v.scrollTop, bottom - v.clientHeight)) : top;
  if (Math.abs(want - v.scrollTop) < 2) return;
  if (v.scrollTo) v.scrollTo({ top: want, behavior: calm ? 'auto' : 'smooth' }); else v.scrollTop = want;
}
function finishLoc() {
  const g = ST.game; if (g.over) { nav('games', 'locover', true); return; }
  const score = g.pts.reduce((a, b) => a + b, 0), prev = locBest();
  const best = !Number.isInteger(prev) || score > prev;
  if (best) { S.best.locN = score; save(); }
  g.over = { score, best };
  track('locator_complete', { score, new_best: best ? 1 : 0 });
  nav('games', 'locover', true);
}
function locShareText() {
  const g = ST.game, o = g.over;
  return shareLines(['פשיטא: איפה בגמרא?',
    g.pts.map(p => ({ g: '🟩', y: '🟨', r: '🟥' })[locColor(p)]).join(''), '🎯 ' + locNum(o.score) + '/1,000']);
}
function renderLocOver() {
  const g = ST.game, o = g.over, rv = g.rival;
  let vs = '';
  if (rv) {
    const d = o.score - rv.s;
    vs = '<div class="locvs"><div><small>החבר</small><b>' + locNum(rv.s) + '</b></div><div class="me"><small>אתה</small><b>' + locNum(o.score) + '</b></div></div>' +
      '<p class="locverdict ' + (d > 0 ? 'win' : d < 0 ? 'lose' : 'tie') + '">' + (d > 0 ? 'ניצחת את החבר ב-' + locNum(d) + ' נקודות' : d < 0 ? 'החבר ניצח ב-' + locNum(-d) + ' נקודות' : 'תיקו') + '</p>';
  }
  ST.view.innerHTML = '<div class="result"><span class="tag">' + (rv ? 'איפה בגמרא? אתגר מחבר' : 'איפה בגמרא?') + '</span>' +
    '<div class="big">' + locNum(o.score) + '<small>/1,000</small></div>' +
    '<div class="progress locmeter"><i style="width:' + (o.score / LOC_MAX * 100) + '%"></i></div>' +
    '<ol class="locbar">' + g.pts.map((p, i) => '<li class="c-' + locColor(p) + '">' + (i + 1) + '</li>').join('') + '</ol>' +
    vs + (o.best ? '<p style="color:var(--gold);font-weight:700">שיא אישי חדש</p>' : '<p class="muted small">השיא שלך: ' + locNum(locBest()) + '/1,000</p>') +
    '<button class="btn wide" id="again">משחק נוסף</button><button class="btn line wide" id="lo-chal">' + (rv ? 'אתגר חבר נוסף על אותן 10 שאלות' : 'אתגר חבר על אותן 10 שאלות') + '</button>' +
    '<button class="btn line wide" id="lo-share">שיתוף תוצאה</button>' +
    '<ul class="loclist">' + g.qs.map((q, i) => '<li><span class="c-' + locColor(g.pts[i]) + '">' + g.pts[i] + '</span><div><b>' + esc(locWhere(q)) + '</b><small>' + esc(q.t) + '</small>' +
      (rv && rv.r ? '<em class="locrv">החבר: ' + rv.r[i] + '</em>' : '') + '</div></li>').join('') + '</ul>' +
    '<button class="link" id="back">חזרה למשחקים</button></div>';
  $('again').onclick = () => startLoc();
  $('back').onclick = goBack;
  $('lo-chal').onclick = () => {
    const link = locLink(g), t = '\u200fפשיטא: איפה בגמרא?\n\u200fהשגתי ' + locNum(o.score) + ' מתוך 1,000. תצליח יותר על אותם 10 קטעים?\n' + link;
    track('locator_challenge_share', { score: o.score });
    try { const w = window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank'); if (!w) copyText(t); } catch (e) { copyText(t); }
  };
  $('lo-share').onclick = () => {
    const t = locShareText();
    try { const w = window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank'); if (!w) copyText(t); } catch (e) { copyText(t); }
  };
}
function renderGameOver() {
  const o = ST.game.over, n = (ST.game.mistakes || []).length;
  ST.view.innerHTML = '<div class="result"><div class="big">' + o.big + '</div><p>' + esc(o.line) + '</p>' + (o.best ? '<p style="color:var(--gold);font-weight:700">שיא אישי חדש</p>' : '') +
    doneButtons(o.againLabel || 'עוד סיבוב', n) + '<button class="link" id="back">חזרה למשחקים</button></div>';
  $('again').onclick = () => o.again();
  $('back').onclick = goBack;
  const mb = $('mist'); if (mb) mb.onclick = () => nav('games', 'review');
}

export { LOC_CHAL, dafPts, locBest, locLink, locNum, locSeedOf, locShareText, openLoc, openLocChallenge, pkDafs, renderGameOver, renderLoc, renderLocIntro, renderLocOver };
