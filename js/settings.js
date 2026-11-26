/* פשיטא: sheets (settings, about, the first opening), backup and restore, protecting the progress, the daily
   reminder, the iPhone hint, and the cloud backup (sync.js) */
import './wordle.js';   /* first: keeps the modules running in order */
import { $, APP_URL, BETA, CN, CORE_N, D, FEEDBACK_EMAIL, INTERVALS, KEY, KNOWN_BOX, NATIVE, PEREKS, RESET_AT, RESET_KEY, S, SC, ST, STANDALONE, SYNC, VERSION, bindSeg, dpBind, dpHtml, dpPkOf, esc, hebNum, migrate, pid, restoreSc, save, saveSc, stats, toast, today, track } from './state.js';
import { dayOf, studyMode, xwStreakInfo } from './learn.js';
import { restoreTq, startDaily } from './quiz.js';
import { BK, XKEY, keyLetter, openArchWD, openArchXW, openArchive, restoreXw, xwEdition, xwStale } from './xw.js';
import { WKEY, streakInfo, wdDel, wdEnter, wdType } from './wordle.js';
import { IN_APP, IOS, IOS_OTHER, R, drawn, nav, render } from './main.js';

document.addEventListener('keydown', ev => {
  if (!(R.tab === 'games' && R.sub === 'wordle' && ST.wd) || sheetOpen || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.key === 'Enter') { ev.preventDefault(); wdEnter(); }
  else if (ev.key === 'Backspace') { ev.preventDefault(); wdDel(); }
  else if (keyLetter(ev)) { ev.preventDefault(); wdType(keyLetter(ev)); }
});

/* ---------- sheets: settings, about, onboarding ---------- */
let sheetOpen = false;
function openSheet(html, full) { $('sheet-host').innerHTML = '<div class="sheet' + (full ? ' full' : '') + '" id="sheet"><div>' + html + '</div></div>'; sheetOpen = true; if (!full) $('sheet').onclick = ev => { if (ev.target.id === 'sheet') closeSheet(); }; }
function closeSheet() { $('sheet-host').innerHTML = ''; sheetOpen = false; }
/* Escape closes a sheet, as a tap outside it does (not the full-screen first opening) */
document.addEventListener('keydown', ev => { if (ev.key !== 'Escape' || !sheetOpen) return; const sh = $('sheet'); if (sh && !sh.classList.contains('full') && !document.querySelector('.dpmodal')) closeSheet(); });
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
  if (R.tab === 'xw' && ST.xg && ST.xg.b) {
    const g = ST.xg, daily = g.arch || (g.day && g.b.anchor);
    out.push(daily ? 'התשחץ היומי #' + g.b.ed + (g.day ? ' (' + g.day.split('-').reverse().join('.') + ')' : '') : 'תשחץ אישי');
    const w = g.b.words[g.act]; if (w && !g.done) out.push('ההגדרה: "' + w.clue + '"');
  } else if (R.tab === 'games' && R.sub === 'wordle' && ST.wd) out.push('הוורדל היומי #' + xwEdition(ST.wd.day || localDay()));
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
    data: { prog: S.prog, edits: S.edits, best: S.best, fav: S.fav, miss: S.miss, settings: S.settings, schemaVersion: S.schemaVersion } });
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
  S.onboarded = true; S.schemaVersion = d.schemaVersion || 1; migrate(); save(); applyLook(); restoreSc(); restoreTq(); syncReminder(false);
  ST.session = null; ST.quiz = null; ST.game = null;
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
/* ---------- protecting the progress (1.7) ----------
   The progress lives in localStorage on this device. Three guards, all silent and all harmless where unsupported:
   1. persistent storage: the browser is asked once there is progress not to clear the site's data under storage pressure;
   2. a second copy in IndexedDB, written a moment after every save. When localStorage comes back empty while that copy
      holds progress (Safari and some cleaners clear one and not the other), the copy is put back and the app reloads;
   3. a backup file sent in one tap (the share sheet of the phone: WhatsApp, email, Drive), or downloaded where there is none.
   The tests seed localStorage themselves: under ?test the copy is neither written nor read unless the address asks (&idb) */
const IDB_ON = !NATIVE && typeof indexedDB !== 'undefined' && (!/[?&]test\b/.test(location.search) || /[?&]idb\b/.test(location.search));
const IDB_DB = 'pshita', IDB_ST = 'kv';
/* nothing is written before the copy was checked at start, so an empty first screen never covers a good copy */
let idbChecked = false, mirrorTimer = null;
function idbOpen() {
  return new Promise((ok, fail) => {
    let rq; try { rq = indexedDB.open(IDB_DB, 1); } catch (e) { fail(e); return; }
    rq.onupgradeneeded = () => { try { rq.result.createObjectStore(IDB_ST); } catch (e) { /* already there */ } };
    rq.onsuccess = () => ok(rq.result); rq.onerror = () => fail(rq.error); rq.onblocked = () => fail(new Error('blocked'));
  });
}
function idbDo(mode, fn) {
  return idbOpen().then(db => new Promise((ok, fail) => {
    const tx = db.transaction(IDB_ST, mode), st = tx.objectStore(IDB_ST), rq = fn(st);
    tx.oncomplete = () => { db.close(); ok(rq && rq.result); }; tx.onerror = tx.onabort = () => { db.close(); fail(tx.error); };
  }));
}
function mirrorSoon() {
  if (!IDB_ON || !idbChecked) return;
  clearTimeout(mirrorTimer); mirrorTimer = setTimeout(mirrorNow, 1500);
}
function mirrorNow() {
  if (!IDB_ON || !idbChecked) return Promise.resolve();
  let o; try { o = { at: Date.now(), reset: RESET_AT, ver: VERSION, main: localStorage.getItem(KEY), xw: localStorage.getItem(XKEY), wd: localStorage.getItem(WKEY) }; } catch (e) { return Promise.resolve(); }
  if (!o.main) return Promise.resolve();
  return idbDo('readwrite', st => st.put(o, 'state')).catch(() => { /* private window or blocked: the copy is a bonus */ });
}
function hasProgress(raw) { try { const o = JSON.parse(raw); return !!(o && ((o.prog && Object.keys(o.prog).length) || (o.settings && ((o.settings.xwDays || []).length || (o.settings.wdDays || []).length)))); } catch (e) { return false; } }
/* at start: localStorage was empty (wasEmpty is read before load) and the copy holds progress: put it back and reload */
function idbCheck(wasEmpty) {
  if (!IDB_ON) return;
  const done = () => { idbChecked = true; if (localStorage.getItem(KEY)) mirrorSoon(); };
  idbDo('readonly', st => st.get('state')).then(o => {
    if (wasEmpty && o && o.reset === RESET_AT && hasProgress(o.main) && !Object.keys(S.prog).length) {
      try {
        localStorage.setItem(KEY, o.main);
        if (o.xw && !localStorage.getItem(XKEY)) localStorage.setItem(XKEY, o.xw);
        if (o.wd && !localStorage.getItem(WKEY)) localStorage.setItem(WKEY, o.wd);
        localStorage.setItem(RESET_KEY, RESET_AT);
        sessionStorage.setItem('pshita-restored', '1');
      } catch (e) { done(); return; }
      track('idb_restore'); location.reload(); return;
    }
    done();
  }, done);
}
/* persistent storage: asked once there is progress to keep. Chrome decides silently (granted to a site in use or added
   to the home screen); a browser that would ask the reader is asked only then, never on the first visit */
function askPersist() {
  try {
    if (NATIVE || !navigator.storage || !navigator.storage.persist || !Object.keys(S.prog).length) return;
    navigator.storage.persisted().then(p => p || navigator.storage.persist()).then(p => { if (p && !S.settings.persisted) { S.settings.persisted = 1; save(); } }).catch(() => { /* not here */ });
  } catch (e) { /* not here */ }
}
/* the backup in one tap: the share sheet with the file where the browser can share files, else the download (or the text) */
async function shareBackup() {
  const text = backupText(), name = 'pshita-backup-' + localDay() + '.json';
  let file = null; try { file = new File([text], name, { type: 'application/json' }); } catch (e) { /* an old browser */ }
  if (file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'גיבוי פשיטא', text: 'גיבוי ההתקדמות בפשיטא מתאריך ' + localDay().split('-').reverse().join('.') });
      S.settings.backupAt = Date.now(); save(); track('backup_share'); toast('הגיבוי נשלח'); return;
    } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  track('backup_download'); exportBackup();
}

/* ---------- a daily reminder in the calendar (1.7) ----------
   A calendar file (.ics) with one event a day at the chosen hour and an alert at its start. Every phone opens it in its
   own calendar: iPhone and filtered phones too, where web notifications do not reach. The time has no time zone, so it
   stays at the same hour wherever the phone is */
function icsFold(line) {
  /* lines of at most 75 bytes, a continuation starting with a space; a Hebrew letter is never cut in the middle */
  const enc = new TextEncoder(), out = []; let cur = '', n = 0;
  for (const ch of line) { const b = enc.encode(ch).length; if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; } cur += ch; n += b; }
  out.push(cur); return out.join('\r\n ');
}
function icsText(h, m) {
  const d = now(), at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
  if (at <= d) at.setDate(at.getDate() + 1);
  const p = n => (n < 10 ? '0' : '') + n, local = x => x.getFullYear() + p(x.getMonth() + 1) + p(x.getDate()) + 'T' + p(x.getHours()) + p(x.getMinutes()) + '00';
  const u = new Date(), utc = u.getUTCFullYear() + p(u.getUTCMonth() + 1) + p(u.getUTCDate()) + 'T' + p(u.getUTCHours()) + p(u.getUTCMinutes()) + p(u.getUTCSeconds()) + 'Z';
  const url = APP_URL + '?daily=1', esc2 = t => t.replace(/[\;,]/g, c => '\\' + c);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//pshita.tsafrir.com//Pshita//HE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', 'UID:pshita-daily-' + Date.now() + '@pshita.tsafrir.com', 'DTSTAMP:' + utc, 'DTSTART:' + local(at), 'DURATION:PT10M', 'RRULE:FREQ=DAILY',
    'SUMMARY:' + esc2('פשיטא: חזרה יומית'), 'DESCRIPTION:' + esc2('10 מילים ומושגים ממסכת שבת, והתשחץ והוורדל של היום') + '\\n' + url, 'URL:' + url,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc2('פשיטא: חזרה יומית'), 'TRIGGER:-PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].map(icsFold).join('\r\n') + '\r\n';
}
function downloadIcs(h, m) {
  const text = icsText(h, m), name = 'pshita-daily.ics';
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' })), a = document.createElement('a');
    a.href = url;
    /* Safari on the iPhone opens a calendar file it is shown and offers "הוסף ליומן"; elsewhere the file is downloaded and
       opened from the downloads */
    if (IOS) a.target = '_blank'; else a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    track('ics_reminder', { h }); toast('נוצר קובץ יומן לשעה ' + two(h) + ':' + two(m) + '. פתחו אותו והוסיפו ליומן');
  } catch (e) { toast('לא הצלחתי ליצור את קובץ היומן בדפדפן הזה'); }
}

/* ---------- the iPhone: a one-time hint to add the site to the home screen (1.7) ----------
   Only in Safari on an iPhone or iPad, outside the home screen app, after the first opening, once on each device. It
   points to the share button of Safari: on the bottom bar of an iPhone, at the top of an iPad */
const IOS_HINT_KEY = 'aramit-ios-hint';
function iosHint() {
  const forced = /[?&]ioshint\b/.test(location.search);
  if (!forced && (/[?&]test\b/.test(location.search) || NATIVE || STANDALONE || !IOS || IN_APP || IOS_OTHER || !S.onboarded)) return;
  try { if (localStorage.getItem(IOS_HINT_KEY) && !forced) return; localStorage.setItem(IOS_HINT_KEY, String(Date.now())); } catch (e) { return; }
  const pad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const share = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>';
  document.body.insertAdjacentHTML('beforeend', '<div class="ioshint' + (pad ? ' top' : '') + '" id="ioshint" role="dialog" aria-label="הוספה למסך הבית">' +
    '<button class="link" id="ioshint-x" aria-label="סגירה">✕</button><b>פשיטא כאפליקציה באייפון</b>' +
    '<p>לחצו על כפתור השיתוף <span class="ish">' + share + '</span> ' + (pad ? 'למעלה' : 'בתחתית המסך') + ', ואז על "הוסף למסך הבית". כך היא נפתחת במסך מלא ועובדת גם בלי רשת.</p></div>');
  const el = document.getElementById('ioshint'), close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 250); };
  requestAnimationFrame(() => el.classList.add('on'));
  document.getElementById('ioshint-x').onclick = close;
  /* any tap elsewhere puts it away too, so it never stands over a sheet or a game */
  setTimeout(() => document.addEventListener('pointerdown', function away(ev) { if (!el.contains(ev.target)) { document.removeEventListener('pointerdown', away, true); close(); } }, true), 400);
  setTimeout(() => { if (document.getElementById('ioshint')) close(); }, 20000);
  track('ios_hint');
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

/* ---------- the cloud backup (sync.js, optional) ----------
   Signed in with Google, the state is merged with the copy in the cloud after a change and when the app comes back to the
   front; signed out, or with no config, nothing here does anything. localStorage stays the source of truth */
function syncState() { return { prog: S.prog, edits: S.edits, best: S.best, fav: S.fav, miss: S.miss, settings: S.settings, schemaVersion: S.schemaVersion, onboarded: S.onboarded, gen: S.gen || 0, at: S.at || 0 }; }
function syncPut(m) {
  S.prog = m.prog; S.edits = m.edits; S.best = m.best; S.fav = m.fav; S.miss = m.miss;
  S.settings = Object.assign({ order: 'freq', newPerDay: 10, size: 'm' }, m.settings);
  S.onboarded = S.onboarded || !!m.onboarded; S.schemaVersion = m.schemaVersion || S.schemaVersion; S.gen = m.gen || 0;
  migrate(); save(true); applyLook(); restoreSc(); restoreTq(); restoreXw();
  /* a round, quiz or game in play goes on; the screens are drawn again when nothing is in the middle */
  if (!ST.session && !ST.quiz && !ST.game && !R.sub && !sheetOpen) render(true);
}
function syncWhen(ms) {
  const d = new Date(ms), t = two(d.getHours()) + ':' + two(d.getMinutes());
  return dayOf(d) === dayOf(new Date()) ? 'היום ב־' + t : 'ב־' + d.getDate() + '.' + (d.getMonth() + 1) + ' ב־' + t;
}
function syncHtml() {
  const z = SYNC.status();
  if (!z.user) return '<span class="label">גיבוי בענן</span><button class="btn wide" id="s-sync-in">התחברות עם Google</button>' +
    '<p class="small muted">לא חובה. אחרי ההתחברות ההתקדמות נשמרת גם בענן ומסתנכרנת בין המכשירים שלך, למשל בין הטלפון למחשב. בלי התחברות הכול נשמר במכשיר בלבד, כמו עד היום.</p>';
  const line = z.busy ? 'מסנכרן...' : z.offline ? 'אין חיבור לרשת. הסנכרון ימשיך כשהרשת תחזור' : z.error ? z.error : z.last ? 'סונכרן לאחרונה ' + syncWhen(z.last) : 'עוד לא סונכרן';
  return '<span class="label">גיבוי בענן</span>' +
    '<p>החשבון המחובר' + (z.user.name ? ': <b>' + esc(z.user.name) + '</b>' : '') + '</p>' +
    (z.user.email ? '<p class="small muted sync-mail" dir="ltr">' + esc(z.user.email) + '</p>' : '') +
    '<p class="small muted" id="s-sync-st">' + line + '</p>' +
    '<div class="two"><button class="btn line" id="s-sync-now">סנכרון עכשיו</button><button class="btn line" id="s-sync-out">התנתקות</button></div>';
}
function bindSync() {
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('s-sync-in', () => {
    SYNC.signIn().then(ok => { if (ok) track('sync_signin'); }, e => {
      const c = String((e && (e.code || e.message)) || e);
      if (/popup-closed|cancelled-popup/.test(c)) return;
      toast(/offline/.test(c) ? 'אין חיבור לרשת. אפשר להתחבר כשהרשת תחזור' : 'לא הצלחתי להתחבר. ייתכן שהרשת חוסמת את שירותי גוגל');
    });
  });
  on('s-sync-now', () => { SYNC.syncNow().then(ok => { const z = SYNC.status(); toast(ok ? 'הנתונים סונכרנו' : z.offline ? 'אין חיבור לרשת. הסנכרון ימשיך כשהרשת תחזור' : z.error || 'הסנכרון לא הצליח, ננסה שוב בהמשך'); }); });
  on('s-sync-out', () => { SYNC.signOut().then(() => { track('sync_signout'); toast('התנתקת. ההתקדמות נשארת במכשיר'); }); });
}
function syncWhere() { return SYNC && SYNC.status().user ? 'ההתקדמות נשמרת במכשיר, ועותק שלה נשמר בגיבוי בענן בחשבון הגוגל שלך.' : 'ההתקדמות נשמרת במכשיר, ואפשר לגבות אותה בענן בחשבון גוגל.'; }
function syncRedraw() {
  const el = document.querySelector('#sheet-host #s-sync'); if (el) { el.innerHTML = syncHtml(); bindSync(); }
  const wh = document.querySelector('#sheet-host #s-where'); if (wh) wh.textContent = syncWhere();
}

function openSettings(confirmReset) {
  const st = stats(D.concat(CN)), r = S.settings.remind || { on: false, h: 20, m: 0 }, native = !!plug('App');
  openSheet('<div class="row between shead"><h2>הגדרות</h2><button class="link" id="s-close">סגירה</button></div>' +
    '<div class="field"><span class="label">ערכים חדשים ביום</span><div class="seg" id="s-npd">' + [5, 10, 20, 30, 50].map(n => '<button data-v="' + n + '" aria-pressed="' + (S.settings.newPerDay === n) + '">' + n + '</button>').join('') + '</div></div>' +
    '<div class="field"><span class="label">אופן התרגול בלימוד</span><div class="seg" id="s-smode">' + [['mix', 'משולב'], ['flip', 'כרטיסיות'], ['mcq', 'אמריקאי']].map(o => '<button data-v="' + o[0] + '" aria-pressed="' + (studyMode() === o[0]) + '">' + o[1] + '</button>').join('') + '</div>' +
    '<p class="small muted">' + { mix: 'מילים בתחילת הדרך נשאלות עם ארבע תשובות, ומילים שכבר יציבות אצלך שלושה ימים ומעלה בכרטיס שהופכים. בכל סבב קודם הכרטיסים ואחר כך השאלות והמילים החדשות.', flip: 'כל החזרות בכרטיס שהופכים: נזכרים בעצמך ואומרים אם ידעת.', mcq: 'כל החזרות בשאלות עם ארבע תשובות. מילה נעשית ידועה לפי מידת היציבות שלה בזיכרון.' }[studyMode()] + '</p></div>' +
    '<div class="field"><span class="label">סדר הערכים החדשים</span><div class="seg" id="s-ord"><button data-v="freq" aria-pressed="' + (S.settings.order !== 'daf') + '">מהשכיחה לנדירה</button><button data-v="daf" aria-pressed="' + (S.settings.order === 'daf') + '">לפי סדר הדפים</button></div></div>' +
    '<div class="field"><span class="label">גודל הכתב</span><div class="seg" id="s-size"><button data-v="m" aria-pressed="' + (S.settings.size === 'm') + '">רגיל</button><button data-v="l" aria-pressed="' + (S.settings.size === 'l') + '">גדול</button><button data-v="xl" aria-pressed="' + (S.settings.size === 'xl') + '">גדול מאוד</button></div></div>' +
    '<div class="field"><span class="label">תזכורת יומית</span><div class="seg" id="s-rem"><button data-v="off" aria-pressed="' + !r.on + '">כבויה</button><button data-v="on" aria-pressed="' + !!r.on + '">פעילה</button></div>' +
    (r.on ? '<label for="s-time">באיזו שעה</label><input type="time" id="s-time" value="' + two(r.h) + ':' + two(r.m) + '">' : '') +
    '<p class="small muted">התראה אחת ביום, "חזרה יומית: 10 מילים ומושגים". לחיצה עליה פותחת חידון קצר. היא פועלת בלי רשת.' + (native ? '' : ' התזכורת פועלת כאשר האתר מוצמד למסך הבית (באנדרואיד).') + '</p>' +
    '<button class="link start" id="s-daily">לפתוח את החידון היומי עכשיו</button></div>' +
    '<div class="field"><span class="label">תזכורת יומית ביומן</span><div class="two ics"><input type="time" id="s-ics-time" value="' + two(r.h) + ':' + two(r.m) + '" aria-label="שעת התזכורת ביומן"><button class="btn line" id="s-ics">הוספה ליומן</button></div>' +
      '<p class="small muted">אירוע שחוזר כל יום בשעה שבחרת, עם התראה, ביומן של הטלפון. עובד בכל מכשיר, גם באייפון ובמכשיר מסונן, ובלי רשת. (קובץ ics)</p></div>' +
    '<div class="field"><span class="label">גיבוי ושחזור</span>' + (native ? '' : '<button class="btn wide" id="s-share">שליחת גיבוי בלחיצה</button><p class="small muted">שולחים את קובץ הגיבוי לעצמכם, בוואטסאפ, במייל או לכונן, וכך הוא שמור גם מחוץ למכשיר.</p>') +
    '<div class="two"><button class="btn line" id="s-export">ייצוא גיבוי</button><button class="btn line" id="s-import">ייבוא גיבוי</button></div>' +
    '<input type="file" id="s-file" accept=".json,application/json,text/plain" hidden>' +
    '<p class="small muted">קובץ הגיבוי כולל את ההתקדמות, המועדפים, רשימת הטעויות, השיאים, ההגדרות והפירושים שערכת.</p>' +
    '<button class="link start" id="s-text">גיבוי ושחזור כטקסט</button></div>' +
    (SYNC && SYNC.configured() ? '<div class="field" id="s-sync">' + syncHtml() + '</div>' : '') +
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
    '<p>האפליקציה פועלת גם בלי רשת. <span id="s-where">' + syncWhere() + '</span> האתר אוסף נתוני שימוש אנונימיים כדי לשפר את החוויה. גרסה ' + VERSION + '</p>' +
    '<p class="credit">נוסח הגמרא על פי מהדורת ויליאם דוידסון בספריא (CC-BY-NC)</p></div>');
  $('s-close').onclick = closeSheet;
  bindSeg('s-npd', v => { S.settings.newPerDay = +v; save(); openSettings(); render(); });
  bindSeg('s-ord', v => { S.settings.order = v; save(); openSettings(); render(); });
  bindSeg('s-smode', v => { S.settings.smode = v; save(); track('study_mode', { mode: v }); openSettings(); render(); });
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
  if ($('s-share')) $('s-share').onclick = () => { shareBackup(); };
  $('s-ics').onclick = () => { const mt = /^(\d{1,2}):(\d{2})/.exec($('s-ics-time').value || ''); if (!mt) { toast('בחרו שעה'); return; } downloadIcs(Math.min(23, +mt[1]), Math.min(59, +mt[2])); };
  $('s-import').onclick = () => $('s-file').click();
  $('s-file').onchange = () => {
    const f = $('s-file').files && $('s-file').files[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = () => importText(rd.result); rd.onerror = () => toast('לא הצלחתי לקרוא את הקובץ'); rd.readAsText(f);
  };
  $('s-text').onclick = () => openBackupText('');
  $('s-help').onclick = () => openOnboarding(0);
  bindBetaLab(); bindSync();
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('s-reset', () => openSettings(true));
  on('s-reset-no', () => openSettings());
  on('s-reset-yes', () => { S.prog = {}; S.edits = {}; S.best = {}; S.fav = {}; S.miss = {}; S.gen = (S.gen || 0) + 1; save(); closeSheet(); toast('ההתקדמות אופסה'); ST.session = null; ST.quiz = null; ST.game = null; nav('learn', null, true); });
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
  const apply = n => { setShift(n); ST.wd = null; if (xwStale()) ST.xg = null; Object.keys(drawn).forEach(k => delete drawn[k]); openSettings(); render(false); toast('התאריך המדומה: ' + localDay().split('-').reverse().join('.') + ', מהדורה #' + xwEdition(localDay())); };
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
    '<p>מילה שעונים עליה נכון חוזרת אחרי זמן שהולך ומתארך, לפי כמה היא כבר יציבה אצלך בזיכרון: מיום אחד ועד חצי שנה. טעות מחזירה אותה להתחלה.</p>' +
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

export { applyBackup, applyLook, askPersist, backupText, closeSheet, idbCheck, iosHint, localDay, mirrorSoon, now, openSettings, openSheet, openWelcome, plug, shareBackup, sheetOpen, syncPut, syncRedraw, syncReminder, syncState, two };
