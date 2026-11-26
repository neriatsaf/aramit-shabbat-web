/* פשיטא: the dictionary tab: search, entries, favourites, own definitions */
import './learn.js';   /* first: keeps the modules running in order */
import { norm, stripPrefix } from './rules.js';
import { $, BY, BYDAF, CN, CNBYDAF, D, PEREKS, S, ST, TOPICS, altLine, bindSeg, bindStars, cSource, countLine, dafName, dafNum, dafShort, dotColor, esc, exHtml, gloss, hebNum, isFav, markKnown, nConcepts, ordPk, recallNow, save, shuffle, stageName, starHtml, toast } from './state.js';
import { makeQ } from './quiz.js';
import { R, nav } from './main.js';

function drillOn(list, replace) {
  const go = () => { ST.quiz = { drill: true, qs: shuffle(list).map(e => makeQ(e, false, null)), pos: 0, right: 0, wrong: [], stage: 'ask', picked: null, again: go }; nav('quiz', 'run', replace || (R.tab === 'quiz' && R.sub === 'done')); replace = false; };
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
  ST.view.querySelectorAll('#dlist .item, #dother .item').forEach(bindItem);
  bindStars(ST.view, refill);
  const det = ST.view.querySelector('.detail'); if (!det) return;
  if (det.parentNode.dataset.w !== undefined) bindDetail(det, BY.get(det.parentNode.dataset.w)); else bindCDetail(CN[+det.parentNode.dataset.i]);
}
function bindSearch() {
  const qi = $('dq');
  let tm = null;
  qi.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { dict.q = qi.value; dict.limit = DICT_STEP; dict.open = null; cdict.open = null; refill(); }, 90); };
}
/* the delete key draws its own mark: the ⌫ character is missing from some phone fonts (24.11.2026) */
const DEL_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SEARCH_HINT = 'חיפוש במילים, בביטויים ובמושגים';
function renderCDict() {
  ST.view.innerHTML = kindSeg('dkind', 'concepts') +
    '<div class="dsearch"><input type="search" id="dq" placeholder="' + SEARCH_HINT + '" value="' + esc(dict.q) + '" autocomplete="off" enterkeyhint="search">' +
    '<button class="morebtn" id="dmore-opts" aria-expanded="' + !!dict.more + '">סינון ומיון ' + (dict.more ? '▴' : '▾') + (cdict.topic !== -1 || cdict.sort !== 'topic' ? ' •' : '') + '</button></div>' +
    (dict.more ? '<div class="dopts"><div class="seg" id="dsort"><button data-v="topic" aria-pressed="' + (cdict.sort === 'topic') + '">לפי נושאים</button><button data-v="daf" aria-pressed="' + (cdict.sort === 'daf') + '">לפי סדר הדפים</button></div>' +
    '<div class="chips" id="dchips"><button class="chip" data-v="-1" aria-pressed="' + (cdict.topic === -1) + '">הכול</button><button class="chip" data-v="-2" aria-pressed="' + (cdict.topic === -2) + '">מועדפים</button>' +
    TOPICS.map((t, k) => '<button class="chip" data-v="' + k + '" aria-pressed="' + (cdict.topic === k) + '">' + esc(t) + '</button>').join('') + '</div></div>' : '') +
    '<p class="small muted" id="dcount"></p><div class="list" id="dlist"></div><div class="list" id="dother"></div>';
  bindSeg('dkind', v => { dictKind = v; renderDict(); });
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
  ST.view.innerHTML = (CN.length ? kindSeg('dkind', 'words') : '') +
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
  const rc = recallNow(e);
  let h = '<div class="detail"><p class="small muted">' + esc(countLine(e)) + '. לראשונה ב' + dafName(e.a) + '.</p><p class="small muted">' + esc(stageName(e)) + (rc === null ? '' : '. סיכוי לזכור היום: ' + Math.round(rc * 100) + '%') + '</p>' + exHtml(e);
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

export { DEL_SVG, drillOn, renderDict };
