/* פשיטא: the quiz tab: the quiz on words and concepts, and the content quiz on the course of the sugyot */
import './dict.js';   /* first: keeps the modules running in order */
import { $, CN, D, KINDS, PEREKS, S, SC, ST, afterHtml, bindScope, bindSeg, dafName, dafNum, dpRangeBind, dpRangeHtml, esc, hebNum, isDue, lazyHas, makeCQuestion, makeQuestion, need, noteAnswer, optionsHtml, ordPk, pid, pkOf, promptHtml, qCard, sample, save, saveSc, scopeHtml, scopeItems, shuffle, toast, track } from './state.js';
import { doneButtons, reviewHtml } from './learn.js';
import { drillOn } from './dict.js';
import { closeSheet, sheetOpen } from './settings.js';
import { R, goBack, nav } from './main.js';

/* ---------- quiz ---------- */
ST.quiz = null;
const quizCfg = { len: 10, mode: 'lex' };
/* in a choice by chapters or by pages, wrong answers for a concept come from the chosen part first, and a small part is completed from the rest of the glossary.
   For a word the wrong answers always come from the whole deck: that is what makes a look-alike a look-alike */
function narrowed() { return (SC.by === 'perek' && SC.pereks.length > 0) || SC.by === 'daf'; }
function makeQ(e, tough, cpool) { return e.cn ? makeCQuestion(e, tough, cpool) : makeQuestion(e, tough); }
function startQuiz(items, extra) {
  const cpool = narrowed() && !(extra && extra.daily) ? items.filter(e => e.cn) : null;
  ST.quiz = Object.assign({ kind: SC.kind, qs: items.map(e => makeQ(e, false, cpool && cpool.length ? cpool : null)), pos: 0, right: 0, wrong: [], stage: 'ask', picked: null }, extra || {});
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
  if (quizCfg.mode === 'content' && !lazyHas(['content'])) {
    const v = ST.view; v.innerHTML = '<p class="loading">טוען...</p>';
    need(['content']).then(() => { if (R.tab === 'quiz' && !R.sub) { const k = ST.view; ST.view = v; try { renderQuizSetup(); } finally { ST.view = k; } } }, () => { v.innerHTML = '<p class="loading">לא הצלחתי לטעון את הנתונים. בדקו את החיבור לרשת ונסו שוב.</p>'; });
    return;
  }
  if (quizCfg.mode === 'content' && CT.length) return renderTQSetup();
  if (SC.kind === 'both') { SC.kind = 'words'; saveSc(); }
  const src = quizItems(), n = src.length, key = { words: 'quiz-', concepts: 'cquiz-', both: 'mquiz-' }[SC.kind] + 'mid', b = S.best[key];
  const few = narrowed() && SC.kind !== 'words' && src.filter(e => e.cn).length < 4 && src.some(e => e.cn);
  ST.view.innerHTML = '<div class="qsetup"><h2>חידון אמריקאי</h2>' + modeSeg() + scopeHtml(true, true) +
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
  const z = ST.quiz, q = z.qs[z.pos];
  if (!q) { finishQuiz(); return; }
  if (q.ct) { renderTQ(); return; }
  const shown = z.stage === 'shown';
  ST.view.innerHTML = '<div class="row between"><span class="small muted">' + (z.daily ? 'חזרה יומית, ' : '') + 'שאלה ' + (z.pos + 1) + ' מתוך ' + z.qs.length + '</span><button class="link" id="quit">סיום</button></div>' +
    '<div class="progress"><i style="width:' + Math.round(z.pos / z.qs.length * 100) + '%"></i></div>' +
    '<section class="card">' + promptHtml(q) + optionsHtml(q, shown, z.picked) +
    (shown ? afterHtml(q.e) + '<button class="btn wide" id="next">' + (z.pos + 1 < z.qs.length ? 'הבא' : 'לתוצאות') + '</button>' : '') + '</section>';
  $('quit').onclick = finishQuiz;
  ST.view.querySelectorAll('.opt').forEach(b => { b.onclick = () => {
    z.picked = +b.dataset.i; z.stage = 'shown'; const ok = q.opts[z.picked] === q.e;
    if (ok) z.right++; else z.wrong.push(q.e);
    noteAnswer(q.e, ok); save(); renderQuiz();
    if (!ok && q.e.cn) { const ex = ST.view.querySelector('.explain'); if (ex && ex.scrollIntoView) ex.scrollIntoView({ block: 'nearest' }); }
  }; });
  const nx = $('next'); if (nx) nx.onclick = () => { z.pos++; z.stage = 'ask'; z.picked = null; renderQuiz(); ST.view.scrollTop = 0; };
}
function finishQuiz() {
  const z = ST.quiz; z.answered = z.pos + (z.stage === 'shown' ? 1 : 0);
  if (z.answered) track('quiz_complete', { topic: z.kind === 'content' ? 'content' : z.daily ? 'daily' : z.drill ? 'mistakes' : (z.kind || 'words'), score: Math.round(z.right / z.answered * 100), right: z.right, answered: z.answered, total: z.qs.length });
  if (z.bestKey && z.answered === z.qs.length) { const pct = Math.round(z.right / z.qs.length * 100); if (!S.best[z.bestKey] || pct > S.best[z.bestKey]) { S.best[z.bestKey] = pct; save(); } }
  nav('quiz', 'done', true);
}
function renderQuizDone() {
  const z = ST.quiz, n = z.answered || 0, m = z.wrong.length;
  ST.view.innerHTML = '<div class="result"><div class="big">' + z.right + '/' + n + '</div><p>' + (n ? Math.round(z.right / n * 100) + '% נכון' + (z.kind === 'content' ? ', חידון תוכן' : z.daily ? ', חזרה יומית' : '') : 'לא נענו שאלות') + '</p>' +
    (m && z.kind !== 'content' ? '<p class="small muted">הערכים שטעית בהם נכנסו לרשימת הטעויות החוזרות, ואפשר לתרגל אותה בחידון ובלימוד.</p>' : '') +
    doneButtons('עוד סיבוב', m) + '<button class="link" id="back">' + (z.drill ? 'חזרה לרשימת הטעויות' : 'חזרה') + '</button></div>';
  $('again').onclick = () => { if (z.again) z.again(); else { ST.quiz = null; goBack(); } };
  const mb = $('mist'); if (mb) mb.onclick = () => nav('quiz', 'review');
  $('back').onclick = () => { ST.quiz = null; goBack(); };
}
function renderQuizReview() {
  const z = ST.quiz;
  ST.view.innerHTML = '<div class="row between"><h2>הטעויות בחידון</h2><button class="link" id="back">חזרה</button></div>' +
    (z.kind === 'content'
      ? '<div class="review">' + z.wrong.map(x => '<div><b>' + esc(x.q) + '</b><br><span>' + esc(x.ans) + '</span><br><span class="src">' + esc(ctSource(x)) + '</span></div>').join('') + '</div>'
      : reviewHtml(z.wrong.map(e => ({ e }))) + '<button class="btn wide" id="drill">חידון קצר על הטעויות האלה</button>');
  $('back').onclick = goBack;
  const dr = $('drill'); if (dr) dr.onclick = () => drillOn(z.wrong.slice(), true);
}

/* ---------- content quiz: questions on the course of the sugyot ---------- */
/* content.js loads when the content quiz is first needed (see LAZY below) */
let CTOPICS = [], CT = [], CT_D0 = 2, CT_D1 = 2;
function ctInit() {
  CTOPICS = (window.CTOPICS || []).map(t => Array.isArray(t) ? { n: t[0], pk: t[1] } : { n: t, pk: -1 });
  CT = (window.CQ || []).map((r, i) => ({ i, a: r[0], t: r[1], lv: r[2], q: r[3], ans: r[4], dis: [r[5], r[6], r[7]], quote: r[8], src: r[9], basis: r[10], note: r[11], pk: Number.isInteger(r[12]) ? r[12] : pkOf(r[0]) }));
  CT_D0 = CT.length ? dafNum(Math.min.apply(null, CT.map(x => x.a))) : 2; CT_D1 = CT.length ? dafNum(Math.max.apply(null, CT.map(x => x.a))) : 2;
  restoreTq();
}
const TQ = { by: 'all', topic: -1, d0: CT_D0, d1: CT_D1, pereks: [] };
function saveTq() { S.settings.tq = { by: TQ.by, topic: TQ.topic, d0: TQ.d0, d1: TQ.d1, pereks: TQ.pereks.slice() }; save(); }
function restoreTq() {
  const c = S.settings.tq || {};
  TQ.by = c.by === 'topic' || c.by === 'daf' || c.by === 'perek' ? c.by : 'all';
  TQ.pereks = (Array.isArray(c.pereks) ? c.pereks : []).filter((k, i, l) => Number.isInteger(k) && k >= 0 && k < PEREKS.length && l.indexOf(k) === i).sort((x, y) => x - y);
  TQ.topic = Number.isInteger(c.topic) && c.topic >= 0 && c.topic < CTOPICS.length ? c.topic : -1;
  TQ.d0 = Number.isInteger(c.d0) && c.d0 >= CT_D0 && c.d0 <= CT_D1 ? c.d0 : CT_D0;
  TQ.d1 = Number.isInteger(c.d1) && c.d1 >= TQ.d0 && c.d1 <= CT_D1 ? c.d1 : CT_D1;
  /* before content.js has loaded, a content quiz chosen last time stays chosen; the screen waits for the file */
  quizCfg.mode = S.settings.qmode === 'content' && (CT.length || !lazyHas(['content'])) ? 'content' : 'lex';
}
function tqWhere(x) { return TQ.by === 'perek' ? (!TQ.pereks.length || TQ.pereks.indexOf(x.pk) >= 0) : TQ.by === 'topic' ? (TQ.topic < 0 || x.t === TQ.topic) : TQ.by === 'daf' ? (dafNum(x.a) >= TQ.d0 && dafNum(x.a) <= TQ.d1) : true; }
function tqItems() { return CT.filter(tqWhere); }
function nQuestions(n) { return n === 1 ? 'שאלה אחת' : n + ' שאלות'; }
function ctSource(x) { return ['גמרא', 'משנה', 'משנה וגמרא'][x.src] + ', ' + dafName(x.a) + ', פרק ' + ordPk(x.pk) + ' (' + PEREKS[x.pk][0] + ')'; }
/* the switch at the top of the quiz screen: the three stores of the lexicon, and the content of the sugya */
function modeSeg() {
  const cur = quizCfg.mode === 'content' ? 'content' : SC.kind;
  const opts = [['words', KINDS.words]].concat(CN.length ? [['concepts', KINDS.concepts]] : [], CT.length || !lazyHas(['content']) ? [['content', 'תוכן הסוגיה']] : []);
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
  ST.view.innerHTML = '<div class="qsetup"><h2>חידון אמריקאי</h2>' + modeSeg() +
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
    ST.quiz = { kind: 'content', qs: sample(src, Math.min(len, src.length)).map(x => ({ ct: x, opts: shuffle([x.ans].concat(x.dis)) })), pos: 0, right: 0, wrong: [], stage: 'ask', picked: null, bestKey: 'tquiz', again: go };
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
  const z = ST.quiz, q = z.qs[z.pos], x = q.ct, shown = z.stage === 'shown';
  ST.view.innerHTML = '<div class="row between"><span class="small muted">שאלה ' + (z.pos + 1) + ' מתוך ' + z.qs.length + '</span><button class="link" id="quit">סיום</button></div>' +
    '<div class="progress"><i style="width:' + Math.round(z.pos / z.qs.length * 100) + '%"></i></div>' +
    '<section class="card"><span class="tag">' + esc(CTOPICS[x.t].n) + '</span><p class="qtext">' + esc(x.q) + '</p>' +
    '<div class="opts">' + q.opts.map((o, i) => {
      let cls = 'opt long'; if (shown) { if (o === x.ans) cls += ' right'; else if (z.picked === i) cls += ' wrong'; }
      return '<button class="' + cls + '" data-i="' + i + '"' + (shown ? ' disabled' : '') + '>' + esc(o) + '</button>';
    }).join('') + '</div>' +
    (shown ? ctAfterHtml(x) + '<button class="btn wide" id="next">' + (z.pos + 1 < z.qs.length ? 'הבא' : 'לתוצאות') + '</button>' : '') + '</section>';
  $('quit').onclick = finishQuiz;
  ST.view.querySelectorAll('.opt').forEach(b => { b.onclick = () => {
    z.picked = +b.dataset.i; z.stage = 'shown';
    if (q.opts[z.picked] === x.ans) z.right++; else z.wrong.push(x);
    renderTQ();
    const ex = ST.view.querySelector('.explain'); if (ex && ex.scrollIntoView) ex.scrollIntoView({ block: 'nearest' });
  }; });
  const nx = $('next'); if (nx) nx.onclick = () => { z.pos++; z.stage = 'ask'; z.picked = null; renderQuiz(); ST.view.scrollTop = 0; };
}

export { ctInit, makeQ, quizCfg, quizItems, renderQuiz, renderQuizDone, renderQuizReview, renderQuizSetup, restoreTq, startDaily };
