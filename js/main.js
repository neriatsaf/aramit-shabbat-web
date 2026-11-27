/* פשיטא: the entry point (index.html loads it as a module): navigation between the tabs, the offline cache and the
   update bar, adding to the home screen, and the boot. It imports every other module */
import './settings.js';   /* first: keeps the modules running in order */
import { answerInGloss, rootLeak } from './rules.js';
import { $, BETA, BYID, CN, D, KEY, NATIVE, PANEL, RAIL, S, SC, ST, STANDALONE, SYNC, VERSION, XWN, exHtml, getGlossForMode, grade, isKnown, lazyHas, load, markKnown, need, newToday, pid, restoreSc, save, short, shuffle, stopTimers, studyOk, toast, today, track, ver } from './state.js';
import { groupQueue, holdLabel, openPrep, pickMode, planMode, renderLearn, renderLearnReview, renderMore, renderSession, renderSessionDone, studyMode } from './learn.js';
import { renderDict } from './dict.js';
import { quizItems, renderQuiz, renderQuizDone, renderQuizReview, renderQuizSetup, restoreTq, startDaily } from './quiz.js';
import { gamePool, renderBlitz, renderFill, renderGames, renderMatch } from './games.js';
import { LOC_CHAL, dafPts, locLink, locSeedOf, locShareText, openLocChallenge, pkDafs, renderGameOver, renderLoc, renderLocIntro, renderLocOver } from './locator.js';
import { BK, XKEY, XW_ALL, XW_TWO, archMax, lazyFor, openArchWD, openArchXW, openArchive, renderGameReview, renderXW, renderXWReview, renderXWSetup, restoreXw, xwCfg, xwDailyBoard, xwEdition, xwEntry, xwFromRefs, xwGame, xwLoad, xwOpen, xwOv, xwPaint, xwPool, xwSave, xwSrc, xwStale, xwStopClock, xwTry } from './xw.js';
import { WDC, backupDue, renderWordle, streakInfo, streakOf, wdDict, wdScore, wdShareText, wdToday, wdValid } from './wordle.js';
import { applyBackup, applyLook, askPersist, backupText, closeSheet, idbCheck, iosHint, localDay, openSettings, openWelcome, plug, sheetOpen, syncPut, syncRedraw, syncReminder, syncState } from './settings.js';

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
  const keepView = ST.view, sub = tab === R.tab ? R.sub : null;
  ST.view = PANEL[tab]; ST.view.className = 'panel'; ST.view.style.paddingBottom = '';
  const req = lazyFor(tab, sub);
  if (!lazyHas(req)) {
    ST.view.innerHTML = '<p class="loading">טוען...</p>'; delete drawn[tab]; ST.view = keepView;
    need(req).then(() => { if (!drawn[tab] || drawn[tab].ver !== ver) { if (tab === R.tab) render(false); else paint(tab); } },
      () => { PANEL[tab].innerHTML = '<p class="loading">לא הצלחתי לטעון את הנתונים. בדקו את החיבור לרשת ונסו שוב.</p>'; });
    return;
  }
  try {
    if (tab === 'dict') renderDict();
    else if (tab === 'quiz') { if (sub === 'run' && ST.quiz) renderQuiz(); else if (sub === 'done' && ST.quiz) renderQuizDone(); else if (sub === 'review' && ST.quiz) renderQuizReview(); else renderQuizSetup(); }
    else if (tab === 'xw') { if (sub === 'board' && ST.xg) renderXW(); else if (sub === 'review' && ST.xg) renderXWReview(); else renderXWSetup(); }
    else if (tab === 'games') {
      if (sub === 'wordle') { if (!ST.wd || (!ST.wd.arch && ST.wd.day !== localDay())) ST.wd = wdToday(); if (ST.wd) renderWordle(); else renderGames(); }
      else if (sub === 'match' && ST.game) renderMatch();
      else if (sub === 'blitz' && ST.game) renderBlitz();
      else if (sub === 'fill' && ST.game) renderFill();
      else if (sub === 'locintro' || sub === 'locmode') renderLocIntro();
      else if (sub === 'loc' && ST.game && ST.game.type === 'loc') renderLoc();
      else if (sub === 'locover' && ST.game && ST.game.over && ST.game.type === 'loc') renderLocOver();
      else if (sub === 'over' && ST.game) renderGameOver();
      else if (sub === 'review' && ST.game) renderGameReview();
      else renderGames();
    }
    else if (sub === 'session' && ST.session) renderSession();
    else if (sub === 'done' && ST.session) renderSessionDone();
    else if (sub === 'review' && ST.session) renderLearnReview();
    else if (sub === 'more') renderMore();
    else renderLearn();
  } finally {
    drawn[tab] = { ver, sub: sub && R.tab === tab ? R.sub : null, day: localDay() };
    ST.view = tab === R.tab ? PANEL[tab] : keepView;
  }
}
/* keep: a plain move between two main screens, which keeps the panel as it is when nothing changed since it was drawn */
function render(keep) {
  if (R.tab === 'xw' && R.sub === 'board' && xwStale()) {
    xwStopClock(); ST.xg = null; R = { tab: 'learn', sub: null };
    try { history.replaceState(R, ''); } catch (e) { /* ignore */ }
    toast('התחיל יום חדש: הלוח היומי של היום מחכה'); keep = false;
  }
  const lit = R.tab === 'xw' ? 'games' : R.tab;   /* the crossword belongs to the games tab */
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === lit)));
  const from = shownTab;
  document.body.classList.toggle('xwmode', R.tab === 'xw' && R.sub === 'board');
  /* a screen with its own keyboard on the bottom edge (the crossword and the Wordle): the gold mark of the open tab would
     stick out from under the last row of keys, so it is not drawn there (reported 24.11.2026) */
  document.body.classList.toggle('kbmode', (R.tab === 'xw' && R.sub === 'board') || (R.tab === 'games' && R.sub === 'wordle'));
  if (!(R.tab === 'xw' && R.sub === 'board') && ST.xg && ST.xg.open) { ST.xg.open = false; xwSave(); }
  ST.view = PANEL[R.tab];
  if (!keep || !fresh(R.tab)) { paint(R.tab); if (!keep) ST.view.scrollTop = 0; }
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
  if (shownTab !== tab) track('tab_switch', { tab_name: tab });
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
/* the bar "גרסה חדשה זמינה" floats over the bottom of the screen: screens and open sheets get room under their content for
   it (body.has-upd and --upd-h in style.css), so it never hides the end of a sheet such as the version line of settings (1.10.2) */
function updBar(onTap) {
  document.body.insertAdjacentHTML('beforeend', '<button class="upd" id="upd" type="button">גרסה חדשה זמינה: לחצו לרענון</button>');
  const u = document.getElementById('upd'), fit = () => { if (u.isConnected) document.documentElement.style.setProperty('--upd-h', (u.offsetHeight + 12) + 'px'); };
  fit(); document.body.classList.add('has-upd'); window.addEventListener('resize', fit);
  u.onclick = onTap;
}
if (!NATIVE) {
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); installEv = ev; if (R.tab === 'learn' && !R.sub) { const keep = ST.view; ST.view = PANEL.learn; const b = $('install'); if (b) b.remove(); PANEL.learn.insertAdjacentHTML('beforeend', installHtml()); bindInstall(); ST.view = keep; } });
  window.addEventListener('appinstalled', () => { track('appinstalled'); const b = document.getElementById('install'); if (b) b.remove(); });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    const had = !!navigator.serviceWorker.controller;
    let asked = false;
    /* a new version waits in the background: a bar at the bottom offers it, and a tap lets it take over and reloads */
    const offer = w => {
      if (!w || !navigator.serviceWorker.controller || document.getElementById('upd')) return;
      updBar(() => { asked = true; w.postMessage({ type: 'skip-waiting' }); setTimeout(() => location.reload(), 3000); });
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

/* ---------- boot ---------- */
let lsEmpty = false; try { lsEmpty = localStorage.getItem(KEY) === null; } catch (e) { /* storage blocked */ }
load(); applyLook(); restoreSc(); restoreTq(); restoreXw();
if (BETA) { const h = document.querySelector('header h1'); if (h) { const sm = h.querySelector('small'); (sm || h).insertAdjacentHTML(sm ? 'beforebegin' : 'beforeend', '<span class="beta">BETA</span>'); } }
document.querySelectorAll('#tabs button').forEach(b => { b.onclick = () => turnTo(b.dataset.tab); });
$('btn-settings').onclick = () => openSettings();
$('btn-theme').onclick = () => {
  S.settings.theme = S.settings.theme === 'dark' ? 'light' : 'dark'; save(); applyLook();
  if (R.tab === 'xw' && R.sub === 'board' && ST.xg) { ST.xg._fsAt = null; xwPaint(); }
};
try { history.replaceState(R, ''); } catch (e) { /* ignore */ }
render();
TABS.forEach(t => { if (t !== R.tab) paint(t); });
if (!S.onboarded && D.concat(CN).some(isKnown)) { S.onboarded = true; save(); }
/* a friend's challenge opens the game right away; a first visit sees the welcome on the next visit */
if (LOC_CHAL) openLocChallenge(LOC_CHAL);
else if (!S.onboarded) openWelcome(0);
else if (/"open":true/.test(localStorage.getItem(XKEY) || '')) need(XWN).then(() => { const sv = xwLoad(); if (sv && sv.open && !R.sub && !sheetOpen) { ST.xg = sv; nav('xw', 'board'); } });
/* the files of the main screens, right after the first one is drawn; the screen shown is drawn again with them */
setTimeout(() => need(['occ'].concat(XWN)).then(() => { if (!R.sub && !sheetOpen && !(drawn[R.tab] && drawn[R.tab].ver === ver)) render(false); }, () => { /* offline before the first visit ended */ }), 0);
idbCheck(lsEmpty); askPersist();
if (SYNC) {
  if (/[?&]test\b/.test(location.search) && /[?&]syncfake\b/.test(location.search)) SYNC._test.fake();
  SYNC.init({ get: syncState, put: syncPut, changed: syncRedraw, version: VERSION });
}
try { if (sessionStorage.getItem('pshita-restored')) { sessionStorage.removeItem('pshita-restored'); toast('ההתקדמות שוחזרה מהעותק השמור במכשיר'); } } catch (e) { /* ignore */ }
setTimeout(iosHint, 2500);
/* a read-only look inside, for the automated tests only */
if (/[?&]test\b/.test(location.search)) window.__t = { pools: () => { const r = { quiz: quizItems(), xw: xwPool() }; r.games = gamePool(0); r.xwSrc = xwCfg.src; r.by = SC.by; r.kind = SC.kind; return r; }, wdScore: (a, b) => wdScore(a, b), wdClues: () => window.DAILY.wordle.map(r => { const e = xwEntry(r[0], r[1]), c = WDC[xwSrc(e) + ':' + e.w] || ''; return [e.w, c, c && rootLeak(e.w, c.replace(/_+/g, ' ')), !!c && answerInGloss(e.w, c)]; }), wdShare: () => wdShareText(), streak: l => streakOf(l), streakInfo: l => streakInfo(l), hold: () => holdLabel(), grade: (w, ok, rc) => grade(BYID.get(w), ok, rc), newToday: () => newToday(), backupDue: () => backupDue(), prog: w => S.prog[pid(BYID.get(w))], known: w => isKnown(BYID.get(w)), game: () => ST.game, xw: () => ST.xg, wd: () => ST.wd, wdDict: () => [...wdDict()], wdValid: w => wdValid(w), heLoaded: () => !!window.HE_WORDS5, openDaily: day => { const b = xwDailyBoard(day); const g = xwGame(b); g.day = day; xwOpen(g); }, R: () => R, shown: () => shownTab, session: () => ST.session, edition: d => xwEdition(d || localDay()), allDaily: () => window.DAILY.boards.map((d, i) => !!xwFromRefs(d.R, d.C, d.words)).filter(x => !x).length, glossFor: (w, m) => { const e = BYID.get(w) || BK.find(b => b.w === w); return e ? getGlossForMode(e, m) : ''; }, xwTry: () => xwTry(shuffle(xwPool())), xwPool: () => xwPool(), xwCfg: () => xwCfg, xwGloss: e => getGlossForMode(e, 'crossword'), archXW: n => openArchXW(n), archWD: n => openArchWD(n), archMax: () => archMax(), openArchive: () => openArchive(), openSettings: () => openSettings(), updBar: () => updBar(() => {}), openPrep: d => openPrep(d), leak: e => { const o = xwOv(e); return !o && rootLeak(e.w, String(e.cn || e.xe ? e.s : short(e)).replace(/\s*\([^)]*\)/g, '')); }, cards: () => [...BYID.keys()], pkDafs: k => pkDafs(k), locShare: () => locShareText(), locLink: () => locLink(ST.game), locSeed: () => locSeedOf(ST.game.qs), dafPts: d => dafPts(d), xwTwo: () => XW_TWO.map(e => e.w), xwExt: () => XW_ALL.concat(XW_TWO).filter(e => e.ext).map(e => [e.w, e.m0, e.i]),
  today: () => today(), applyBackup: o => applyBackup(o), backupText: () => backupText(), setProg: (w, p) => { S.prog[pid(BYID.get(w))] = p; save(); }, pickMode: w => pickMode({ e: BYID.get(w), isNew: false }), markKnown: w => markKnown(BYID.get(w)), studyOk: w => studyOk(BYID.get(w)), exHtml: i => exHtml(D[i]), studyMode: () => studyMode(), groupQueue: l => groupQueue(l.map(x => ({ e: BYID.get(x.w), isNew: !!x.n }))), planMode: (w, isNew) => planMode({ e: BYID.get(w), isNew: !!isNew }), nav: (t, s) => nav(t, s) };

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

export { IN_APP, IOS, IOS_OTHER, R, bindInstall, calm, drawn, goBack, installHtml, nav, render };
