/* פשיטא: the games tab: pairs, the 30-second challenge, fill in the word */
import './quiz.js';   /* first: keeps the modules running in order */
import { $, BY, CN, PHRASES, S, ST, countLine, dafName, distractors, esc, getGlossForMode, gloss, lev, makeQuestion, noteAnswer, optionsHtml, pickDistinct, pool, sample, save, shuffle, stopTimers, studyOk, timers, toast } from './state.js';
import { locBest, locNum, openLoc } from './locator.js';
import { R, goBack, nav } from './main.js';

/* ---------- games ---------- */
ST.game = null;
const gameCfg = { scope: 'all', kind: 'words' };
function renderGames() {
  const bm = S.best.match, bb = S.best.blitz30, bf = S.best.fill;
  gameCfg.scope = 'all'; gameCfg.kind = 'words';
  const lb = locBest();
  ST.view.innerHTML = '<h2>משחקים</h2><div class="menu">' +
    '<button id="g-loc" class="hot"><b>איפה בגמרא? <i class="new">חדש</i></b><span>קטע קצר ממסכת שבת: מאיזה פרק ומאיזה דף הוא? עשרה קטעים, עד 1,000 נקודות</span>' + (Number.isInteger(lb) ? '<em>שיא: ' + locNum(lb) + '/1,000</em>' : '') + '</button>' +
    '<button id="g-xw"><b>תשחץ אישי</b><span>לוח חדש מהמילים שתבחר: כל המאגר, מה שלמדת או לפי פרקים</span></button>' +
    '<button id="g-match"><b>התאמת זוגות</b><span>לחבר שש מילים בארמית לפירוש שלהן, כמה שיותר מהר</span>' + (bm ? '<em>שיא: ' + bm + ' שנ\'</em>' : '') + '</button>' +
    '<button id="g-blitz"><b>אתגר 30 שניות</b><span>לזהות כמה שיותר מילים לפני שהזמן נגמר, עם ניקוד ורצף</span>' + (bb ? '<em>שיא: ' + bb + '</em>' : '') + '</button>' +
    '<button id="g-fill"><b>השלמת ביטויים</b><span>ביטוי של שקלא וטריא עם מילה חסרה. איזו מילה משלימה אותו?</span>' + (bf ? '<em>שיא: ' + bf + '/10</em>' : '') + '</button></div>';
  $('g-xw').onclick = () => nav('xw', 'setup');
  $('g-match').onclick = () => startMatch();
  $('g-blitz').onclick = () => startBlitz();
  $('g-fill').onclick = () => startFill();
  $('g-loc').onclick = openLoc;
}
function noteMistake(e, picked) { const g = ST.game; g.mistakes = g.mistakes || []; if (!g.mistakes.some(m => m.e === e)) g.mistakes.push({ e, picked }); }
/* the games keep moving: from the whole store they leave out the rare words */
function gamePool(min) {
  const src = pool(gameCfg.scope).filter(e => studyOk(e) && (gameCfg.scope !== 'all' || !e.rare));
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
  ST.game = { type: 'match', cn, left: shuffle(picked), right: shuffle(picked), done: new Set(), selL: null, selR: null, miss: null, misses: 0, t0: Date.now(), secs: 0 };
  nav('games', 'match', R.sub === 'over');
  timers.push(setInterval(() => { ST.game.secs = Math.floor((Date.now() - ST.game.t0) / 1000); const el = $('m-time'); if (el) el.textContent = ST.game.secs; }, 500));
}
function renderMatch() {
  const g = ST.game; let h = '<div class="hud"><div><b id="m-time">' + g.secs + '</b><span>שניות</span></div><div><b>' + g.done.size + '/6</b><span>זוגות</span></div><div><b>' + g.misses + '</b><span>טעויות</span></div></div><div class="match">';
  for (let i = 0; i < 6; i++) {
    const l = g.left[i], r = g.right[i];
    h += '<button class="tile aram' + (g.done.has(l.w) ? ' done' : '') + (g.selL === i ? ' sel' : '') + (g.miss && g.miss[0] === i ? ' miss' : '') + '" data-s="L" data-i="' + i + '"' + (g.done.has(l.w) ? ' disabled' : '') + '>' + esc(l.w) + '</button>' +
         '<button class="tile' + (g.cn ? ' long' : '') + (g.done.has(r.w) ? ' done' : '') + (g.selR === i ? ' sel' : '') + (g.miss && g.miss[1] === i ? ' miss' : '') + '" data-s="R" data-i="' + i + '"' + (g.done.has(r.w) ? ' disabled' : '') + '>' + esc(getGlossForMode(r, 'pairs')) + '</button>';
  }
  ST.view.innerHTML = h + '</div><p class="small muted">' + (g.cn ? 'בוחרים מושג מהטור הימני ואת ההגדרה שלו מהטור השמאלי.' : 'בוחרים מילה מהטור הימני ואת הפירוש שלה מהטור השמאלי.') + '</p><button class="link" id="quit">סיום</button>';
  $('quit').onclick = goBack;
  ST.view.querySelectorAll('.tile').forEach(b => { b.onclick = () => {
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
  ST.game = { type: 'blitz', src, left: BLITZ_SECS, score: 0, streak: 0, top: 0, right: 0, total: 0, q: null, flash: null, lock: false };
  nextBlitz();
  nav('games', 'blitz', R.sub === 'over');
  timers.push(setInterval(() => {
    ST.game.left--; const el = $('b-time'); if (el) el.textContent = Math.max(0, ST.game.left);
    if (ST.game.left <= 0) {
      stopTimers(); const best = !S.best.blitz30 || ST.game.score > S.best.blitz30; if (best && ST.game.score) { S.best.blitz30 = ST.game.score; save(); }
      ST.game.over = { big: ST.game.score, line: 'נקודות. ' + ST.game.right + ' נכונות מתוך ' + ST.game.total + ', הרצף הארוך ביותר: ' + ST.game.top, best: best && ST.game.score > 0, again: startBlitz };
      nav('games', 'over', true);
    }
  }, 1000));
}
function nextBlitz() { const g = ST.game; let e; do { e = g.src[Math.floor(Math.random() * g.src.length)]; } while (g.q && g.src.length > 1 && e === g.q.e); g.q = makeQuestion(e, false); g.q.rev = false; g.q.gmode = 'speed'; g.q.opts = shuffle([e].concat(distractors(e, false))); g.flash = null; g.lock = false; }
function renderBlitz() {
  const g = ST.game, q = g.q;
  ST.view.innerHTML = '<div class="hud"><div><b id="b-time">' + Math.max(0, g.left) + '</b><span>שניות</span></div><div><b>' + g.score + '</b><span>נקודות</span></div><div><b>' + g.streak + '</b><span>רצף</span></div></div>' +
    '<section class="card"><div class="word' + (q.e.w.length > 14 ? ' md' : '') + '">' + esc(q.e.w) + '</div>' + optionsHtml(q, !!g.flash, g.flash ? g.flash.i : null) + '</section><button class="link" id="quit">סיום</button>';
  $('quit').onclick = goBack;
  ST.view.querySelectorAll('.opt').forEach(b => { b.onclick = () => {
    if (g.lock) return; g.lock = true; const i = +b.dataset.i; const ok = q.opts[i] === q.e; g.total++;
    if (ok) { g.right++; g.streak++; g.top = Math.max(g.top, g.streak); g.score += 10 + Math.min(10, (g.streak - 1) * 2); }
    else { g.streak = 0; noteMistake(q.e, getGlossForMode(q.opts[i], 'speed')); }
    noteAnswer(q.e, ok); save();
    g.flash = { i }; renderBlitz();
    setTimeout(() => { if (ST.game !== g || R.sub !== 'blitz') return; nextBlitz(); renderBlitz(); }, ok ? 220 : 900);
  }; });
}
/* phrase completion */
const FILLABLE = PHRASES.filter(e => e.w.indexOf('...') < 0);
const FILL_WORDS = Array.from(new Set([].concat.apply([], FILLABLE.map(e => e.w.split(' ')))));
function startFill() {
  let src = gameCfg.scope === 'learned' ? FILLABLE.filter(e => S.prog[e.w]) : FILLABLE;
  if (src.length < 4) { if (gameCfg.scope === 'learned') toast('עוד לא למדת מספיק ביטויים, לכן המשחק משתמש בכל הביטויים'); src = FILLABLE; }
  ST.game = { type: 'fill', qs: sample(src, Math.min(10, src.length)).map(makeFill), pos: 0, right: 0, stage: 'ask', picked: null };
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
  const g = ST.game, q = g.qs[g.pos];
  if (!q) {
    const best = g.qs.length === 10 && g.right > 0 && (!S.best.fill || g.right > S.best.fill); if (best) { S.best.fill = g.right; save(); }
    g.over = { big: g.right + '/' + g.qs.length, line: 'ביטויים הושלמו נכון', best, again: startFill }; nav('games', 'over', true); return;
  }
  const shown = g.stage === 'shown';
  const phrase = q.parts.map((p, i) => i === q.k ? '<span class="blank">' + (shown ? esc(q.ans) : '&nbsp;') + '</span>' : esc(p)).join(' ');
  ST.view.innerHTML = '<div class="row between"><span class="small muted">ביטוי ' + (g.pos + 1) + ' מתוך ' + g.qs.length + '</span><button class="link" id="quit">סיום</button></div>' +
    '<div class="progress"><i style="width:' + Math.round(g.pos / g.qs.length * 100) + '%"></i></div>' +
    '<section class="card"><span class="tag">איזו מילה חסרה?</span><div class="word md">' + phrase + '</div><p class="muted">' + esc(gloss(q.e)) + '</p>' +
    '<div class="opts">' + q.opts.map((o, i) => { let cls = 'opt aram'; if (shown) { if (o === q.ans) cls += ' right'; else if (g.picked === i) cls += ' wrong'; } return '<button class="' + cls + '" data-i="' + i + '"' + (shown ? ' disabled' : '') + '>' + esc(o) + '</button>'; }).join('') + '</div>' +
    (shown ? '<span class="src">' + esc(countLine(q.e)) + ' · לראשונה ב' + dafName(q.e.a) + '</span><button class="btn wide" id="next">הבא</button>' : '') + '</section>';
  $('quit').onclick = goBack;
  ST.view.querySelectorAll('.opt').forEach(b => { b.onclick = () => { g.picked = +b.dataset.i; g.stage = 'shown'; const ok = q.opts[g.picked] === q.ans; if (ok) g.right++; else noteMistake(q.e, q.parts.map((p, i) => i === q.k ? q.opts[g.picked] : p).join(' ')); noteAnswer(q.e, ok); save(); renderFill(); }; });
  const nx = $('next'); if (nx) nx.onclick = () => { g.pos++; g.stage = 'ask'; g.picked = null; renderFill(); };
}

export { gamePool, renderBlitz, renderFill, renderGames, renderMatch };
