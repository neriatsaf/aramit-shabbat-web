/* פשיטא: the learn tab: the round of the day, the learning card, page prep (הכנה לדף), the daily hub */
import './state.js';   /* first: keeps the modules running in order */
import { $, BETA, CN, D, INTERVALS, KNOWN_BOX, KNOWN_RUN, S, SC, ST, TOPICS, afterHtml, altLine, cSource, countLine, dafName, dafNum, esc, exHtml, explainHtml, fsrsOf, gloss, grade, hebNum, isDue, isKnown, markKnown, newToday, noteAnswer, openProgress, openScope, optionsHtml, pid, promptHtml, save, saveSc, scopeBar, scopeItems, shuffle, srcHtml, stats, studyOk, toast, today, track } from './state.js';
import { drillOn } from './dict.js';
import { makeQ } from './quiz.js';
import { copyText, dailyShareText, shareResult, mmss, openArchive, startXWDaily, xwDailyBoard, xwEdition, xwLoad } from './xw.js';
import { WKEY, backupNote, shieldMeterHtml, shieldNotice, startWordle, streakInfo, streakOf } from './wordle.js';
import { closeSheet, localDay, openSheet, two } from './settings.js';
import { R, bindInstall, goBack, installHtml, nav, render } from './main.js';

/* ---------- learn ---------- */
ST.session = null;
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
      '<span class="hs' + (d ? ' ok' : '') + '" dir="rtl">' + (d ? 'הושלם ב-' + mmss(d.secs) + ' ✓' : going ? 'בתהליך' : 'פתור עכשיו') + '</span><span class="hf" dir="rtl">\u200f🔥 ' + n + ' <em>🛡️ ' + xi.shields + '/2</em></span>' + shieldMeterHtml(xi, true) + '</button>' +
    '<button class="hcard" id="h-wd"><span class="hico wd" aria-hidden="true"><i class="g"></i><i></i><i class="y"></i><i></i><i class="g"></i></span><b>וורדל #' + ed + '</b><span class="ht">מילה יומית בחמש אותיות</span>' +
      '<span class="hs' + (wl && wl.won ? ' ok' : '') + '" dir="rtl">' + (wl ? '\u200f' + (wl.won ? wl.n + '/6 ✓' : 'X/6') : wgo ? 'בתהליך' : 'פתור עכשיו') + '</span><span class="hf" dir="rtl">\u200f🔥 ' + wn + ' <em>🛡️ ' + wi.shields + '/2</em></span>' + shieldMeterHtml(wi, true) + '</button>' +
    '</div><div class="hubx">' + (ed > 1 || BETA ? '<button class="hlink" id="h-arch">ארכיון ‹</button>' : '') + (d && tb ? '<button class="hlink" id="h-share">שתף את התשחץ</button>' : '') + '</div></div>';
}
/* where the learner holds in the tractate: a page range (מדף עד דף) chosen in "מה מתרגלים" or in the quiz.
   It filters the daily learning, the quiz and the personal crossword; "+ דף" moves the last page on by one */
function gem(n) { const h = hebNum(n); return h.length === 1 ? h + '׳' : h.slice(0, -1) + '״' + h.slice(-1); }
function holdLabel() { return SC.d0 === SC.d1 ? 'דף ' + gem(SC.d0) : 'דפים ' + gem(SC.d0) + '–' + gem(SC.d1); }
/* outside a page range (all the tractate, a chapter, a topic...): a compact row to open "הכנה לדף" for any page (1.9) */
function prepDaf() { const d = S.settings.prepDaf; return Number.isInteger(d) && d >= 2 && d <= 157 ? d : 2; }
function holdHtml() {
  if (SC.by !== 'daf') {
    let o = ''; for (let d = 2; d <= 157; d++) o += '<option value="' + d + '"' + (d === prepDaf() ? ' selected' : '') + '>דף ' + gem(d) + '</option>';
    return '<div class="hold prepq"><span class="holdl">הכנה לדף<small>מה שמופיע לראשונה בדף</small></span><select id="prep-d" aria-label="בחירת דף">' + o + '</select><button class="btn line" id="prep-go">פתיחה</button></div>';
  }
  return '<div class="hold"><button class="holdl" id="hold-open">אוחז ב' + esc(holdLabel()) + '<small>הכנה לדף ' + esc(gem(SC.d1)) + '</small></button><button class="btn line" id="hold-plus"' + (SC.d1 >= 157 ? ' disabled' : '') + '>+ דף</button></div>';
}
/* הכנה לדף: the words and concepts that appear for the first time on the last page of the range, to read before the lesson */
function openPrep(pick) {
  const free = Number.isInteger(pick), d = free ? pick : SC.d1, ws = D.filter(e => dafNum(e.a) === d).sort((x, y) => x.a - y.a || y.c - x.c), cs = CN.filter(e => dafNum(e.a) === d);
  /* a row: the word, then its gloss in a column of its own, and "נדיר" as a small tag at the end of the row (1.10.2) */
  const row = e => '<div><b>' + esc(e.w) + '</b><span class="pg">' + esc(e.cn ? e.s : gloss(e)) + '</span>' + (e.rare ? '<span class="rare">נדיר</span>' : '') + '</div>';
  /* the new words of the page: what is not known yet (never studied, or still on the way), the words first, in the order of the page */
  const fresh = ws.concat(cs).filter(e => studyOk(e) && !isKnown(e));
  openSheet('<div class="row between shead" id="pr-head"><h2>הכנה לדף ' + esc(gem(d)) + '</h2><button class="link" id="pr-close">סגירה</button></div>' +
    '<p class="small muted">מה שמופיע לראשונה במסכת בדף ' + esc(gem(d)) + ': ' + ws.length + ' מילים וביטויים' + (cs.length ? ' ו-' + cs.length + ' מושגים' : '') + '.</p>' +
    (fresh.length ? '<button class="btn wide" id="pr-new">תרגל את המילים החדשות של הדף (' + fresh.length + ')</button>' : '') +
    (cs.length ? '<h3>מושגים</h3><div class="review prep">' + cs.map(row).join('') + '</div>' : '') +
    (ws.length ? '<h3>מילים וביטויים</h3><div class="review prep">' + ws.map(row).join('') + '</div>' : '<p>בדף הזה אין מילים חדשות.</p>') +
    (!fresh.length && (ws.length || cs.length) ? '<p class="small muted">כל מה שמופיע לראשונה בדף הזה כבר ידוע לך.</p>' : '') +
    ((ws.length || cs.length) ? '<button class="btn ' + (fresh.length ? 'line' : '') + ' wide" id="pr-go">תרגול כל מילות הדף (' + (ws.length + cs.length) + ')</button>' : '') +
    (free ? (d < 157 ? '<button class="btn line wide" id="pr-next">הכנה לדף הבא (' + esc(gem(d + 1)) + ')</button>' : '')
      : '<button class="btn line wide" id="pr-scope">שינוי הטווח</button>'));
  const pg = $('pr-go'); if (pg) pg.onclick = () => { closeSheet(); startSession('prep', cs.concat(ws).map(e => ({ e, isNew: !S.prog[pid(e)] }))); };
  const pn = $('pr-new'); if (pn) pn.onclick = () => { closeSheet(); track('prep_new', { daf: d, n: fresh.length }); startSession('prep', fresh.map(e => ({ e, isNew: !S.prog[pid(e)] }))); };
  $('pr-close').onclick = closeSheet;
  const ps = $('pr-scope'); if (ps) ps.onclick = () => { closeSheet(); openScope(renderLearn); };
  const nx = $('pr-next'); if (nx) nx.onclick = () => { S.settings.prepDaf = d + 1; save(); const sl = ST.view.querySelector('#prep-d'); if (sl) sl.value = String(d + 1); openPrep(d + 1); };
}
function renderLearn() {
  const list = scopeItems(), st = stats(list), room = Math.max(0, S.settings.newPerDay - newToday());
  const seg = [['var(--soft)', st.fresh], ['var(--gold)', st.boxes[0] + st.boxes[1]], ['var(--brand)', st.boxes[2] + st.boxes[3]], ['var(--good)', st.boxes[4] + st.boxes[5] + st.boxes[6]]];
  const drill = drillScope(), fresh = Math.min(room, st.fresh), todo = drill ? Math.min(list.length, 40) : st.due + fresh;
  const fem = SC.kind === 'words';
  ST.view.innerHTML = scopeBar() +
    '<div class="today"><div class="ring" style="--p:' + (st.total ? (st.learned / st.total).toFixed(3) : 0) + '"><span><b>' + st.learned + '</b><small>מתוך ' + st.total + '</small></span></div>' +
    '<div class="tlist"><h3>הלימוד של היום</h3><div><span>לחזרה היום</span><b>' + st.due + '</b></div>' +
    '<div><span>' + (fem ? 'חדשות להיום' : 'חדשים להיום') + '</span><b>' + fresh + '</b></div>' +
    '<div><span>ידועים</span><b>' + st.learned + '</b></div></div>' +
    '<button class="btn wide" id="go"' + (list.length ? '' : ' disabled') + '>' + (!list.length ? 'אין ערכים בבחירה הזו' : drill ? 'תרגול הרשימה (' + todo + ')' : todo ? 'התחלת הלימוד של היום (' + todo + ')' : 'להמשיך ללמוד') + '</button></div>' +
    (list.length ? '<div class="stack"><div class="bar">' + seg.map(s => s[1] ? '<i style="background:' + s[0] + ';width:' + (s[1] / st.total * 100) + '%"></i>' : '').join('') + '</div>' +
    '<div class="legend"><span style="--c:var(--good)">ידועים ' + seg[3][1] + '</span><span style="--c:var(--brand)">בתהליך ' + seg[2][1] + '</span><span style="--c:var(--gold)">בתחילת הדרך ' + seg[1][1] + '</span><span style="--c:var(--line)">עוד לא נלמדו ' + st.fresh + '</span></div>' +
    '<button class="link start" id="pg-open">פירוט ההתקדמות לפי פרקים ונושאים</button></div>' : '') +
    (drill ? '<p class="note">' + (SC.by === 'fav' ? 'תרגול של הערכים שסימנת בכוכב.' : 'תרגול של הערכים שטעית בהם. ערך יוצא מהרשימה אחרי שתי תשובות נכונות ברצף.') + ' תשובה נכונה כאן לא משנה את לוח החזרות, וטעות מחזירה את הערך להתחלה.</p>' :
    '<p class="small muted">תשובה נכונה מרחיקה את החזרה הבאה לפי כמה הערך כבר יציב אצלך בזיכרון, מיום אחד ועד חצי שנה. טעות מחזירה את הערך להתחלה. ' + (studyMode() === 'mcq' ? 'ערך נחשב ידוע כשהוא יציב אצלך בזיכרון שבועיים ומעלה.' : 'ערך נחשב ידוע רק אחרי שזכרת אותו בעצמך לפחות פעם אחת, בכרטיס שהופכים.') + '</p>');
  ST.view.insertAdjacentHTML('afterbegin', dailyCardHtml() + holdHtml()); $('h-xw').onclick = startXWDaily; $('h-wd').onclick = startWordle;
  /* on the first day there is nothing in the archive yet */
  if ($('h-arch')) $('h-arch').onclick = openArchive;
  const hs = $('h-share'); if (hs) hs.onclick = () => { const day = localDay(), d = S.settings.xwDaily, tb = xwDailyBoard(day); if (d && d.day === day && tb) shareResult(dailyShareText(tb, d.secs, d.hints || 0, d.checks || 0, day), 'crossword'); };
  const hp = $('hold-plus'); if (hp) hp.onclick = () => { if (SC.d1 < 157) { SC.d1++; saveSc(); render(false); toast('אוחז עד דף ' + hebNum(SC.d1)); } };
  const ho = $('hold-open'); if (ho) ho.onclick = () => openPrep();
  const pd = $('prep-d'); if (pd) pd.onchange = () => { S.settings.prepDaf = +pd.value; save(); };
  const pgo = $('prep-go'); if (pgo) pgo.onclick = () => { const d = pd ? +pd.value : prepDaf(); S.settings.prepDaf = d; save(); track('prep_open', { daf: d, scope: SC.by }); openPrep(d); };
  shieldNotice(); backupNote();
  ST.view.insertAdjacentHTML('beforeend', installHtml()); bindInstall();
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
  const q = groupQueue(list || buildQueue(kind));
  if (!q.length) {
    if (kind) { toast(kind === 'free' ? 'עוד לא למדת ערכים מהבחירה הזו' : 'כל הערכים בבחירה הזו כבר נלמדו'); return; }
    if (drillScope()) { toast('הרשימה ריקה'); return; }
    nav('learn', 'more', R.sub === 'done' || R.sub === 'review'); return;
  }
  ST.session = { kind: kind || (drillScope() ? 'free' : 'due'), queue: q, pos: 0, right: 0, wrong: 0, stage: 'ask', picked: null, mode: null, q: null, missed: [], review: null, list: list ? q.map(x => x.e) : null };
  nav('learn', 'session', R.sub === 'more' || R.sub === 'done' || R.sub === 'review');
}
function renderMore() {
  const st = stats(scopeItems());
  ST.view.innerHTML = '<div class="result"><h2>סיימת את מה שתוכנן להיום</h2>' +
    '<p class="muted">אין כרגע ערכים לחזרה בבחירה הזו, והמכסה היומית של ערכים חדשים נוצלה. אפשר להמשיך בכל זאת.</p>' +
    '<button class="btn wide" id="more"' + (st.fresh ? '' : ' disabled') + '>עוד 10 ' + nounNew() + '</button>' +
    '<button class="btn ghost wide" id="free"' + (st.seen ? '' : ' disabled') + '>חזרה חופשית על מה שלמדתי</button>' +
    '<p class="small muted">בחזרה חופשית, תשובה נכונה לא משנה את לוח החזרות. טעות מחזירה את הערך להתחלה.</p>' +
    '<button class="link" id="back">חזרה</button></div>';
  $('more').onclick = () => startSession('more');
  $('free').onclick = () => startSession('free');
  $('back').onclick = goBack;
}
/* how a review is asked, by the setting "אופן התרגול בלימוד" (S.settings.smode): 'mix' (the default) by the FSRS
   stability, below 3 days four answers to pick from and from 3 days a turned card; 'flip' always a turned card;
   'mcq' always four answers. In 'mix' a card one step before known with no free recall yet is turned, so the step can be taken */
const SMODES = ['mix', 'flip', 'mcq'], MIX_S = 3;
function studyMode() { return SMODES.indexOf(S.settings.smode) >= 0 ? S.settings.smode : 'mix'; }
function planMode(item) {
  if (item.isNew) return 'intro';
  const m = studyMode(); if (m !== 'mix') return m;
  const p = S.prog[pid(item.e)]; if (!p) return 'mcq';
  if (!p.fr && p.b < KNOWN_BOX && (p.b >= KNOWN_BOX - 1 || (p.r || 0) >= KNOWN_RUN - 1)) return 'flip';
  fsrsOf(p);
  return (p.s > 0 ? p.s : INTERVALS[Math.min(6, p.b | 0)]) >= MIX_S ? 'flip' : 'mcq';
}
function pickMode(item) { return { type: planMode(item) }; }
/* in 'mix' the round keeps one kind together: the turned cards first, then the questions with four answers and the new entries */
function groupQueue(q) {
  if (studyMode() !== 'mix') return q;
  const rank = { flip: 0, mcq: 1, intro: 2 };
  return q.map((x, i) => [rank[planMode(x)], i, x]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(a => a[2]);
}
function wordCls(t) { return 'word' + (t.length > 14 ? ' md' : ''); }
function renderSession() {
  const s = ST.session;
  if (s.review) return renderSessionReview();
  const item = s.queue[s.pos];
  if (!item) {
    if (s.missed.length) { s.review = { qs: shuffle(s.missed).map(e => makeQ(e, false, null)), pos: 0, right: 0, stage: 'ask', picked: null }; ST.view.scrollTop = 0; return renderSessionReview(); }
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
        '<div class="answer">' + esc(gloss(e)) + '</div>' + (e.v.length ? '<span class="src">' + esc(altLine(e)) + '</span>' : '') + srcHtml(e) + exHtml(e) +
        '<div class="two"><button class="btn ghost" id="known">כבר מכיר ✓</button><button class="btn" id="learn">ללמוד אותה</button></div>';
  } else if (m.type === 'flip') {
    const front = s.rev ? '<span class="tag">' + (cn ? 'איזה מושג מתאים להגדרה?' : 'איזו מילה מתאימה לפירוש?') + '</span><div class="word sm">' + esc(cn ? e.s : gloss(e)) + '</div>'
                        : '<span class="tag">' + (cn ? 'מה פירוש המושג?' : 'מה הפירוש?') + '</span><div class="' + wordCls(e.w) + '">' + esc(e.w) + '</div>';
    const back = cn ? '<div class="answer">' + (s.rev ? '<span class="word md">' + esc(e.w) + '</span>' : esc(e.s)) + '</div>' + explainHtml(e)
                    : '<div class="answer">' + (s.rev ? '<span class="word md">' + esc(e.w) + '</span>' : esc(gloss(e))) + '</div>' + srcHtml(e) + exHtml(e);
    inner = front + (s.stage === 'ask' ? '<button class="btn wide" id="show">הצגת התשובה</button>'
      : back + '<div class="two"><button class="btn bad" id="no">לא ידעתי</button><button class="btn good" id="yes">ידעתי</button></div>') +
      '<div class="knownrow"><button class="link" id="known">כבר מכיר ✓</button></div>';
  } else {
    const shown = s.stage === 'shown';
    inner = promptHtml(s.q) + optionsHtml(s.q, shown, s.picked) + (shown ? afterHtml(e) + '<button class="btn wide" id="next">הבא</button>' : '<div class="knownrow"><button class="link" id="known">כבר מכיר ✓</button></div>');
  }
  ST.view.innerHTML = '<div class="row between"><span class="small muted">' + (s.pos + 1) + ' מתוך ' + s.queue.length + (p ? ' · שלב ' + p.b + ' מתוך 6' : '') + '</span><button class="link" id="quit">סיום</button></div>' +
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
  ST.view.querySelectorAll('.opt').forEach(b => { b.onclick = () => { s.picked = +b.dataset.i; s.stage = 'shown'; apply(item, s.q.opts[s.picked] === e); renderSession(); }; });
  /* the card follows the thumb. Right: remembered; left: back for review; up: already known. A question with four answers
     takes only the upward gesture, and one already answered takes none */
  const acts = {
    known: () => { markKnown(e); if (item.isNew) topUpNew(); advance(); },
    yes: m.type === 'intro' ? () => { const t = today(); S.prog[pid(e)] = { b: 0, d: t, n: 0, x: 0, f: t }; save(); requeue(item, 2); advance(); } : m.type === 'flip' ? () => { apply(item, true); advance(); } : null,
    no: m.type === 'intro' ? () => { const t = today(); S.prog[pid(e)] = { b: 0, d: t, n: 0, x: 0, f: t }; save(); requeue(item, 2); advance(); } : m.type === 'flip' ? () => { apply(item, false); advance(); } : null
  };
  /* answered: the card lets go of touch altogether, and the screen scrolls so "הבא" is in sight above the tab bar (1.10.2) */
  if (m.type === 'mcq' && s.stage === 'shown') { $('lcard').classList.add('free'); keepNext(); return; }
  cardSwipe($('lcard'), acts);
}
/* an answered card: "הבא" scrolled into sight (again once the context sentence arrives and makes the card taller) */
function keepNext() { const nx = document.querySelector('#lcard.free #next'); if (nx && nx.scrollIntoView) nx.scrollIntoView({ block: 'nearest' }); }
function cardSwipe(card, acts) {
  if (!card) return;
  const hint = card.querySelector('.swhint'), LABEL = { yes: 'זוכר', no: 'לחזרה', known: 'כבר מכיר ✓' };
  /* the card takes horizontal moves only (touch-action: pan-y), so the screen always scrolls up and down under the thumb.
     A move that scrolled the screen is a scroll, never "כבר מכיר" (1.10.2) */
  const pane = card.closest('.panel') || document.scrollingElement;
  let x0 = 0, y0 = 0, dx = 0, dy = 0, on = false, kind = null, st0 = 0;
  const scrolled = () => Math.abs(pane.scrollTop - st0) > 2;
  const which = () => scrolled() ? null : (-dy > 70 && -dy > Math.abs(dx)) ? 'known' : dx > 80 ? 'yes' : dx < -80 ? 'no' : null;
  card.addEventListener('touchstart', ev => { if (ev.touches.length !== 1 || ev.target.closest('button,a,input')) return; const t = ev.touches[0]; x0 = t.clientX; y0 = t.clientY; dx = dy = 0; st0 = pane.scrollTop; on = true; card.classList.add('drag'); }, { passive: true });
  card.addEventListener('touchmove', ev => {
    if (!on) return; const t = ev.touches[0]; dx = t.clientX - x0; dy = t.clientY - y0;
    if (scrolled()) { dx = dy = 0; }
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
  const s = ST.session; if (!s || s.kind === 'free' || s.kind === 'prep' || drillScope()) return;
  const inQ = new Set(s.queue.map(x => x.e)), next = orderedScope().find(e => !S.prog[pid(e)] && !inQ.has(e));
  if (next) s.queue.push({ e: next, isNew: true });
}
function apply(item, ok) {
  const s = ST.session;
  noteAnswer(item.e, ok);
  if (!(s.kind === 'free' && ok)) grade(item.e, ok, s.mode && s.mode.type === 'flip'); else save();
  if (ok) s.right++; else { s.wrong++; if (s.missed.indexOf(item.e) < 0) s.missed.push(item.e); }
}
/* the end of a round: what was marked as not known comes back once, as a question with four answers.
   This round is for practice only; the review schedule already counted the miss */
function renderSessionReview() {
  const s = ST.session, r = s.review, q = r.qs[r.pos];
  if (!q) { nav('learn', 'done', true); return; }
  const shown = r.stage === 'shown';
  ST.view.innerHTML = '<div class="row between"><span class="small muted">חזרה על מה שלא ידעת: ' + (r.pos + 1) + ' מתוך ' + r.qs.length + '</span><button class="link" id="quit">סיום</button></div>' +
    '<div class="progress"><i style="width:' + Math.round(r.pos / r.qs.length * 100) + '%"></i></div>' +
    '<section class="card">' + promptHtml(q) + optionsHtml(q, shown, r.picked) +
    (shown ? afterHtml(q.e) + '<button class="btn wide" id="next">' + (r.pos + 1 < r.qs.length ? 'הבא' : 'לסיכום') + '</button>' : '') + '</section>';
  $('quit').onclick = () => nav('learn', 'done', true);
  ST.view.querySelectorAll('.opt').forEach(b => { b.onclick = () => {
    r.picked = +b.dataset.i; r.stage = 'shown'; if (q.opts[r.picked] === q.e) r.right++;
    renderSessionReview();
    const ex = ST.view.querySelector('.explain, .answer'); if (ex && ex.scrollIntoView) ex.scrollIntoView({ block: 'nearest' });
  }; });
  const nx = $('next'); if (nx) nx.onclick = () => { r.pos++; r.stage = 'ask'; r.picked = null; ST.view.scrollTop = 0; renderSessionReview(); };
}
function requeue(item, gap) { const s = ST.session; if (s.queue.length > 400) return; s.queue.splice(Math.min(s.pos + 1 + gap, s.queue.length), 0, { e: item.e, isNew: false }); }
function advance() { const s = ST.session; s.pos++; s.mode = null; s.q = null; s.stage = 'ask'; s.picked = null; renderSession(); }
function renderSessionDone() {
  const s = ST.session, n = s.missed.length, r = s.review;
  if (!s.tracked) { s.tracked = true; track('study_complete', { kind: s.kind, right: s.right, wrong: s.wrong, finished: !s.queue[s.pos] }); }
  ST.view.innerHTML = '<div class="result"><div class="big">' + s.right + '</div><p>תשובות נכונות, ' + s.wrong + ' טעויות</p>' +
    (r && r.pos ? '<p class="small">בחזרה בסוף הסבב: ' + r.right + ' נכונות מתוך ' + Math.min(r.pos, r.qs.length) + '.</p>' : '') +
    (n ? '<p class="muted small">ערכים שטעית בהם יחזרו מחר, ונכנסו לרשימת הטעויות החוזרות.</p>' : '') +
    doneButtons('עוד סיבוב', n) + '<button class="link" id="home">חזרה למסך הלימוד</button></div>';
  $('again').onclick = () => { if (s.list) { startSession(s.kind, s.list.map(e => ({ e, isNew: !S.prog[pid(e)] }))); return; } const k = s.kind === 'due' ? undefined : s.kind; startSession(k); };
  const mb = $('mist'); if (mb) mb.onclick = () => nav('learn', 'review');
  $('home').onclick = () => { ST.session = null; goBack(); };
}
function renderLearnReview() {
  const ms = ST.session.missed;
  ST.view.innerHTML = '<div class="row between"><h2>הטעויות בסבב</h2><button class="link" id="back">חזרה</button></div>' + reviewHtml(ms.map(e => ({ e }))) +
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

export { dayOf, doneButtons, groupQueue, holdLabel, keepNext, openPrep, pickMode, planMode, renderLearn, renderLearnReview, renderMore, renderSession, renderSessionDone, reviewHtml, studyMode, xwStreak, xwStreakInfo };
