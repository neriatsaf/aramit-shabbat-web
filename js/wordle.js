/* פשיטא: the Wordle of the tractate: one word of five letters a day, six guesses */
import './xw.js';   /* first: keeps the modules running in order */
import { norm, xwLetters } from './rules.js';
import { $, APP_URL, CN, D, NATIVE, PEREKS, S, ST, XWN, cSource, countLine, dafName, esc, getGlossForMode, gloss, lazyWait, ordPk, pkOf, save, toast, track } from './state.js';
import { dayOf } from './learn.js';
import { DEL_SVG } from './dict.js';
import { BK, XE, XKEYS, bindLabNav, copyText, labNavHtml, openArchWD, shareLines, xwAns, xwEdition, xwEntry, xwSrc } from './xw.js';
import { localDay, now, shareBackup } from './settings.js';
import { goBack, nav } from './main.js';

/* ---------- Wordle of the tractate (וורדל מסכת שבת): one word of five letters a day, six guesses ----------
   The word of the day comes from the list prepared in daily-boards.js, so it is the same on every device.
   A guess may be any word of five letters in the app's dictionary, concepts and added terms.
   Final letters count as their plain form; the fifth letter, the leftmost, is shown in its final form */
const WKEY = 'aramit-shabbat-wordle';
const W_FIN = { 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' };
ST.wd = null; ST.WDICT = null;
/* a guess counts when it is a real word: any word of five letters in the app (the dictionary with its other spellings, the
   concepts, the general terms and the bank), or a Hebrew word of five letters from hewords.js. The word of the day is
   always from the Wordle list of the tractate (daily-boards.js); hewords.js only decides what may be guessed.
   hewords.js (about 150 KB) loads when the Wordle opens, not with the page */
function wdDict() {
  if (ST.WDICT) return ST.WDICT;
  ST.WDICT = new Set();
  const add = w => String(w).split(/\s+/).forEach(t => { if (/["'׳״]/.test(t)) return; const L = norm(xwLetters(t)); if (L.length === 5) ST.WDICT.add(L); });
  D.forEach(e => { add(e.w); e.v.forEach(add); }); CN.forEach(c => add(c.w)); XE.forEach(x => add(x.w)); BK.forEach(x => add(x.w));
  return ST.WDICT;
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
function wdSave() { if (ST.wd && ST.wd.arch) return; try { localStorage.setItem(WKEY, JSON.stringify({ day: ST.wd.day, ans: ST.wd.ans, rows: ST.wd.rows, hint: ST.wd.hint, done: ST.wd.done, won: ST.wd.won })); } catch (x) { /* storage blocked */ } }
/* the hint of the day: the meaning of the word without the word or its root (wdclues.js); the chapter only for a word with none */
const WDC = window.WD_CLUES || {};
function wdClue(e) { return WDC[xwSrc(e) + ':' + e.w] || wdChapter(e); }
/* the Wordle keyboard has no final letters: every letter is typed plain and the last tile shows its final form */
const WKEYS = XKEYS.map(r => r.replace(/[ךםןףץ]/g, ''));
function wdChapter(e) {
  if (e.bk) return 'מושג יסוד: ' + ((window.BANK_TOPICS || [])[e.t] || '');
  if (e.xe) return 'מונח כללי בהלכות שבת, לא מפרק אחד';
  const k = e.cn ? e.pk : (Number.isInteger(e.pk) ? e.pk : pkOf(e.a));
  return 'פרק ' + ordPk(k) + ': ' + PEREKS[k][0];
}
function startWordle() { if (lazyWait(XWN, startWordle)) return; ST.wd = wdToday(); if (!ST.wd) { toast('המילה היומית לא נמצאה'); return; } nav('games', 'wordle'); }
function renderWordle() {
  const g = ST.wd; heWordsLoad();
  ST.view.className = 'panel tight';
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
  ST.view.innerHTML = '<div class="wd"><div class="row between"><b class="wtitle">וורדל מסכת שבת #' + g.ed + (g.arch ? ' (ארכיון)' : '') + '</b><span>' + (g.done ? '' : '<button class="link" id="wd-hint"' + (g.hint ? ' disabled' : '') + '>רמז 💡</button> ') + '<button class="link" id="quit">חזרה</button></span></div>' +
    labNavHtml(g, g.ed, 'lw') +
    (g.peek ? '<p class="small wclue labpeek">🛠️ ' + esc(g.e.w) + ' (' + esc(g.ans) + '): ' + esc(getGlossForMode(g.e, 'dictionary')) + '</p>' : '') +
    (g.hint ? '<p class="small wclue">💡 ' + esc(wdClue(g.e)) + '</p>' : '') +
    '<div class="wgrid" id="wd-grid" dir="rtl">' + rows.join('') + '</div>' + end +
    (g.done ? '' : '<div class="xlow"><div class="xkb nofin" dir="ltr">' + WKEYS.map((row, i) => '<div class="r' + i + (i === 2 ? ' wide' : '') + '">' +
      (i === 2 ? '<button class="del enter" id="wd-enter">אישור</button>' : '') +
      row.split('').map(ch => '<button data-ch="' + ch + '"' + keyCls(ch) + '>' + ch + '</button>').join('') +
      (i === 0 ? '<button class="del" id="wd-del" aria-label="מחיקה">' + DEL_SVG + '</button>' : '') + '</div>').join('') + '</div></div>') + '</div>';
  wdFit();
  bindLabNav(g, g.ed, openArchWD, renderWordle, 'lw');
  $('quit').onclick = goBack;
  const hb = $('wd-hint'); if (hb) hb.onclick = () => { if (g.done || g.hint) return; g.hint = true; wdSave(); renderWordle(); };
  ST.view.querySelectorAll('.xkb [data-ch]').forEach(b => { b.onclick = () => wdType(b.dataset.ch); });
  const del = $('wd-del'); if (del) del.onclick = wdDel;
  const en = $('wd-enter'); if (en) en.onclick = wdEnter;
  const sh = $('wd-share'); if (sh) sh.onclick = () => copyText(wdShareText());
}
function wdFit() {
  const grid = $('wd-grid'); if (!grid) return;
  const tabs = document.getElementById('tabs'); if (tabs) ST.view.style.paddingBottom = (tabs.offsetHeight + 4) + 'px';
  const kb = ST.view.querySelector('.xkb'), box = ST.view.querySelector('.wd'), cs = getComputedStyle(ST.view), gap = parseFloat(getComputedStyle(box).rowGap) || 0;
  /* on a short or crowded screen the keys get lower before the tiles get too small to read */
  let free = 0;
  for (const kh of [50, 44, 38, 34]) {
    if (kb) kb.style.setProperty('--kh', kh + 'px');
    let others = 0, n = 0; for (const el of box.children) { if (el !== grid) { others += el.offsetHeight; n++; } }
    free = ST.view.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - others - gap * n - 4;
    if (!kb || (free - 30) / 6 >= 34) break;
  }
  const wide = ST.view.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const t = Math.floor(Math.max(24, Math.min((wide - 24) / 5, (free - 30) / 6, 62)));
  grid.style.setProperty('--wt', t + 'px');
}
/* the word of a day that has ended gives way to today's word as soon as the reader touches the board */
function wdRoll() { if (ST.wd && !ST.wd.arch && ST.wd.day !== localDay()) { ST.wd = wdToday(); if (ST.wd) { renderWordle(); toast('התחיל יום חדש: זו המילה של היום'); } return true; } return false; }
function wdType(ch) { if (wdRoll()) return; const g = ST.wd; if (g.done || g.cur.length >= 5) return; g.cur += norm(ch); renderWordle(); }
function wdDel() { if (wdRoll()) return; const g = ST.wd; if (g.done) return; g.cur = g.cur.slice(0, -1); renderWordle(); }
function wdEnter() {
  if (wdRoll()) return;
  const g = ST.wd; if (g.done) return;
  if (g.cur.length < 5) { toast('צריך חמש אותיות'); return; }
  /* the Hebrew words may still be loading: wait for them once, then check again */
  if (!wdValid(g.cur) && g.cur !== g.ans && !window.HE_WORDS5 && !HEW_FAIL) { const cur = g.cur; heWordsLoad().then(() => { if (ST.wd === g && g.cur === cur && !g.done) wdEnter(); }); return; }
  if (!wdValid(g.cur) && g.cur !== g.ans) { toast('המילה לא נמצאה במילון. נסו מילה אחרת'); const rr = ST.view.querySelectorAll('.wrow')[g.rows.length]; if (rr) { rr.classList.remove('shake'); void rr.offsetWidth; rr.classList.add('shake'); } return; }
  g.rows.push(g.cur); g.cur = '';
  if (g.rows[g.rows.length - 1] === g.ans) { g.done = true; g.won = true; }
  else if (g.rows.length >= 6) g.done = true;
  if (g.done) track('wordle_complete', { success: g.won, guesses: g.rows.length, hint: !!g.hint, archive: !!g.arch });
  if (g.done && g.arch) { if (!g.lab) { const a = S.settings.arch || { xw: {}, wd: {} }; if (g.won) a.wd[g.ed] = g.rows.length; S.settings.arch = a; save(); } }
  else if (g.done) {
    S.settings.wdLast = { day: g.day, n: g.rows.length, won: g.won, hint: g.hint };
    if (g.won) S.settings.wdDays = (S.settings.wdDays || []).filter(d => d !== g.day).concat([g.day]).sort().slice(-400);
    save();
  }
  wdSave(); renderWordle();
}
function wdEndHtml() {
  const g = ST.wd, e = g.e, word = g.ans.split('').map(wdShow).join('');
  const def = e.cn ? e.s + '. ' + e.m0 : e.xe ? e.m0 : gloss(e);
  const src = e.cn ? cSource(e) : e.xe ? 'מונח שנוסף לאפליקציה' : countLine(e) + ', לראשונה ב' + dafName(e.a);
  return '<div class="wend"><p class="wres">' + (g.won ? 'פתרת ב-' + g.rows.length + ' ניסיונות' : 'הפעם לא. המילה הייתה:') + '</p>' +
    '<b class="wword">' + esc(word) + '</b><p>' + esc(def) + '</p><p class="src">' + esc(src) + '</p>' +
    (g.arch ? '' : streakLineHtml(streakInfo(S.settings.wdDays), 'הרצף בוורדל')) +
    '<button class="btn wide" id="wd-share">שתף תוצאה</button></div>';
}
function wdShareText() {
  const g = ST.wd, link = APP_URL || (NATIVE ? '' : window.location.origin + window.location.pathname), n = streakOf(S.settings.wdDays);
  return shareLines(['פשיטא: הארמית של מסכת שבת', '🟩 וורדל מסכת שבת #' + g.ed + (g.arch ? ' (ארכיון)' : ''), '🎯 ניחושים: ' + (g.won ? g.rows.length : 'X') + '/6',
    '💡 ' + (g.hint ? 'רמזים: 1' : 'בלי רמזים')].concat(g.arch ? [] : ['🔥 רצף: ' + n],
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
  /* toward the next lifeline: the days solved in a row since the last one came back (7 bring one) */
  out.run = run; out.toward = out.n ? run % 7 : 0;
  return out;
}
function streakOf(list, extra) { return streakInfo(list, extra).n; }
/* the way to the next lifeline, as a row of seven marks: "4 מתוך 7 ימים לחבל הבא". With both lifelines in hand there is
   nothing to earn, and it says so. compact: the short form for the daily card */
function shieldMeterHtml(inf, compact) {
  const full = inf.shields >= 2, k = full ? 7 : inf.toward;
  const dots = '<span class="smd" aria-hidden="true">' + [0, 1, 2, 3, 4, 5, 6].map(i => '<i' + (i < k ? ' class="on"' : '') + '></i>').join('') + '</span>';
  const txt = full ? (compact ? 'שני החבלים בידך' : 'שני חבלי ההצלה בידך') : compact ? k + '/7 לחבל הבא' : k + ' מתוך 7 ימים לחבל הבא';
  return '<span class="smeter' + (full ? ' full' : '') + (compact ? ' compact' : '') + '" dir="rtl">' + dots + '<em>' + txt + '</em></span>';
}
function streakLineHtml(inf, name) {
  return '<div class="sline"><p>' + name + ': 🔥 ' + inf.n + (inf.n === 1 ? ' יום' : ' ימים') + ' ברצף · 🛡️ ' + inf.shields + '/2</p>' + shieldMeterHtml(inf) + '</div>';
}
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
  const at = ST.view.querySelector('.today'); (at || ST.view).insertAdjacentHTML(at ? 'beforebegin' : 'beforeend', '<div class="bk-note" id="bk-note"><p>עבר חודש מאז הגיבוי האחרון. ההתקדמות שמורה רק במכשיר הזה, וגיבוי שומר עליה אם המכשיר יוחלף או ינוקה.</p>' +
    '<div class="row"><button class="btn" id="bk-go">גיבוי עכשיו</button><button class="btn line" id="bk-later">לא עכשיו</button></div></div>');
  $('bk-go').onclick = () => { shareBackup(); const n = $('bk-note'); if (n) n.remove(); };
  $('bk-later').onclick = () => { S.settings.backupSnooze = Date.now(); save(); const n = $('bk-note'); if (n) n.remove(); };
}
function shieldNotice() {
  const y = (() => { const d = now(); d.setDate(d.getDate() - 1); return dayOf(d); })(), seen = S.settings.shieldSeen || {}, msgs = [];
  [['xw', 'בתשחץ היומי', streakInfo(S.settings.xwDays, S.settings.xwDaily && S.settings.xwDaily.day)], ['wd', 'בוורדל', streakInfo(S.settings.wdDays)]].forEach(([k, name, inf]) => {
    if (inf.used.indexOf(y) >= 0 && seen[k] !== y) { seen[k] = y; msgs.push('🛡️ חבל הצלה שמר על הרצף ' + name + ' (🔥 ' + inf.n + '). נשארו ' + inf.shields + '/2'); }
  });
  if (msgs.length) { S.settings.shieldSeen = seen; save(); toast(msgs.join('. ')); }
}

export { WDC, WKEY, backupDue, backupNote, renderWordle, shieldMeterHtml, shieldNotice, startWordle, streakInfo, streakLineHtml, streakOf, wdDel, wdDict, wdEnter, wdFor, wdScore, wdShareText, wdToday, wdType, wdValid };
