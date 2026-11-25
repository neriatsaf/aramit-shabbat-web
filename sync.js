/* גיבוי בענן וסנכרון בין מכשירים (אופציונלי): התחברות עם חשבון Google בלבד, והנתונים נשמרים במסמך אחד ב-Cloud Firestore.
   The app stays offline-first: localStorage is the source of truth on every device, and the cloud is only a meeting point.
   Nothing here runs unless FIREBASE_CONFIG below is filled in. Even then, the Firebase SDK is fetched from the CDN only when
   someone signs in, or on start for someone who signed in before, and only while the browser is online. Offline, with the
   CDN blocked (a filtered network) or with any error, the app goes on exactly as before and syncs the next time it can.
   One document per person: users/{uid} = { data: the state as JSON text, gen, at, ver, updated }. firestore.rules lets each
   signed-in person read and write only their own document. mergeState() is pure and is tested in node (tests/sync.js). */
(function (root) {
  'use strict';

  /* ההגדרות של פרויקט פיירבייס של פשיטא (נמסרו על ידי נריה, 25.11.2026). אינן סוד: כל אתר שמשתמש בפיירבייס חושף אותן,
     וההגנה על הנתונים היא בכללי firestore.rules. אם מרוקנים אותן, אזור הגיבוי בענן נעלם ושום דבר לא נטען מהרשת. */
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDtNvtz8KQrCLQ5YftSo0GMqG-Hb_ZhoQQ',
    authDomain: 'pshita-e8712.firebaseapp.com',
    projectId: 'pshita-e8712',
    storageBucket: 'pshita-e8712.firebasestorage.app',
    messagingSenderId: '475456670677',
    appId: '1:475456670677:web:7d68dd399a715fa2678b5c'
  };

  const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const FLAG = 'pshita-sync'; /* { uid, name, email, last }: who signed in on this device and when the last sync ended */
  const BACK = 'pshita-sync-back'; /* set before going to Google's sign-in page, so the SDK loads on the way back */
  const PUSH_WAIT = 15000;    /* a burst of saves is sent once, this long after the last of them */
  const NET_WAIT = 15000;     /* a read or write that takes longer counts as offline */

  /* the settings that travel between devices. Everything else (the look, text size, the reminder, file backups, hints
     already shown) belongs to the device and is never taken from the cloud */
  const SHARED_SETTINGS = ['order', 'newPerDay', 'smode', 'sc', 'tq', 'cq', 'xw', 'locRecent',
    'xwDays', 'wdDays', 'xwDaily', 'wdLast', 'arch', 'shieldSeen'];
  /* the best scores where a lower number is the better one (moves or seconds) */
  const LOWER_BEST = new Set(['match', 'cmatch']);

  /* ---------- the merge (pure) ---------- */
  const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const obj = x => (isObj(x) ? x : {});
  const num = x => (Number.isFinite(x) ? x : -Infinity);
  const clone = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

  /* which of two records of the same entry is further on: the higher stage, then the higher stability, then the later
     review, then more reviews. A tie keeps the first (the device's own) */
  function betterProg(p, q) {
    if (num(p.b) !== num(q.b)) return num(p.b) > num(q.b) ? p : q;
    if (num(p.s) !== num(q.s)) return num(p.s) > num(q.s) ? p : q;
    if (num(p.ls) !== num(q.ls)) return num(p.ls) > num(q.ls) ? p : q;
    if (num(p.n) !== num(q.n)) return num(p.n) > num(q.n) ? p : q;
    return p;
  }
  function mergeProg(a, b) {
    const out = {};
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    keys.forEach(k => {
      const p = isObj(a[k]) ? a[k] : null, q = isObj(b[k]) ? b[k] : null;
      if (!p || !q) { out[k] = clone(p || q); return; }
      const w = clone(betterProg(p, q));
      /* a free recall (a turned card) on either device counts on the way to "known" */
      if (p.fr || q.fr) w.fr = 1;
      out[k] = w;
    });
    return out;
  }
  function mergeBest(a, b) {
    const out = Object.assign({}, b, a);
    for (const k in b) {
      if (!(k in a)) continue;
      const x = a[k], y = b[k];
      if (!Number.isFinite(x)) { if (Number.isFinite(y)) out[k] = y; continue; }
      if (!Number.isFinite(y)) continue;
      if (LOWER_BEST.has(k)) out[k] = x > 0 && (y <= 0 || x <= y) ? x : y;
      else out[k] = Math.max(x, y);
    }
    return out;
  }
  const unionDays = (x, y) => [...new Set([].concat(Array.isArray(x) ? x : [], Array.isArray(y) ? y : []).filter(d => typeof d === 'string'))].sort().slice(-400);
  /* the archive marks: the editions solved anywhere, each with its better result (fewer seconds, fewer guesses) */
  function mergeArch(x, y) {
    const out = { xw: {}, wd: {} };
    ['xw', 'wd'].forEach(t => {
      const p = obj(obj(x)[t]), q = obj(obj(y)[t]);
      for (const k in q) out[t][k] = q[k];
      for (const k in p) out[t][k] = Number.isFinite(q[k]) && q[k] > 0 && !(p[k] > 0 && p[k] <= q[k]) ? q[k] : p[k];
    });
    return out;
  }
  const laterDay = (x, y) => (!isObj(y) || !y.day ? x : !isObj(x) || !x.day ? y : String(y.day) > String(x.day) ? y : x);

  /* local: the state on this device; remote: the state in the cloud. Each is { prog, edits, best, fav, miss, settings,
     schemaVersion, onboarded, gen, at }. Returns a new state; neither input is changed.
     gen rises when someone resets all their progress, and then the side with the higher gen is taken as it is.
     Otherwise: per entry the further record, the union of favourites, mistakes, edited glosses and solved days, the better
     best scores, and for plain settings the side saved last (opts.remoteFirst: the cloud's, on a device's first sync, so a
     new phone with default settings does not undo the choices made elsewhere). The device's own settings always stay. */
  function mergeState(local, remote, opts) {
    const a = obj(local), b = obj(remote);
    const ga = Number.isFinite(a.gen) ? a.gen : 0, gb = Number.isFinite(b.gen) ? b.gen : 0;
    const sa = obj(a.settings), sb = obj(b.settings);
    let out;
    if (!isObj(remote) || ga > gb) out = clone(a);
    else if (gb > ga) out = clone(b);
    else {
      const newer = (opts && opts.remoteFirst) || num(b.at) > num(a.at) ? 'b' : 'a';
      out = {
        prog: mergeProg(obj(a.prog), obj(b.prog)),
        edits: Object.assign({}, newer === 'b' ? obj(a.edits) : obj(b.edits), newer === 'b' ? obj(b.edits) : obj(a.edits)),
        best: mergeBest(obj(a.best), obj(b.best)),
        fav: Object.assign({}, obj(b.fav), obj(a.fav)),
        miss: Object.assign({}, obj(b.miss), obj(a.miss)),
        settings: {},
        schemaVersion: Math.max(a.schemaVersion || 1, b.schemaVersion || 1),
        onboarded: !!(a.onboarded || b.onboarded),
        gen: ga,
        at: Math.max(num(a.at), num(b.at), 0)
      };
      const st = out.settings, first = newer === 'b' ? sb : sa, second = newer === 'b' ? sa : sb;
      SHARED_SETTINGS.forEach(k => { if (k in first) st[k] = clone(first[k]); else if (k in second) st[k] = clone(second[k]); });
      if (sa.xwDays || sb.xwDays) st.xwDays = unionDays(sa.xwDays, sb.xwDays);
      if (sa.wdDays || sb.wdDays) st.wdDays = unionDays(sa.wdDays, sb.wdDays);
      if (sa.arch || sb.arch) st.arch = mergeArch(sa.arch, sb.arch);
      if (sa.shieldSeen || sb.shieldSeen) st.shieldSeen = Object.assign({}, obj(sb.shieldSeen), obj(sa.shieldSeen));
      if (sa.xwDaily || sb.xwDaily) st.xwDaily = clone(laterDay(sa.xwDaily, sb.xwDaily));
      if (sa.wdLast || sb.wdLast) {
        const x = sa.wdLast, y = sb.wdLast;
        st.wdLast = clone(isObj(x) && isObj(y) && x.day === y.day ? (y.won && !x.won ? y : x) : laterDay(x, y));
      }
    }
    /* whatever side won, the settings of this device that do not travel stay this device's */
    out.settings = obj(out.settings);
    for (const k in sa) if (!SHARED_SETTINGS.includes(k)) out.settings[k] = clone(sa[k]);
    for (const k in out.settings) if (!SHARED_SETTINGS.includes(k) && !(k in sa)) delete out.settings[k];
    ['prog', 'edits', 'best', 'fav', 'miss'].forEach(k => { out[k] = obj(out[k]); });
    return out;
  }

  /* the same text for the same content, whatever the order of the keys */
  function stable(x) {
    if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']';
    if (isObj(x)) return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + stable(x[k])).join(',') + '}';
    return JSON.stringify(x === undefined ? null : x);
  }
  /* what goes to the cloud: the state with only the settings that travel */
  function cloudForm(x) {
    const o = Object.assign({}, x), s = {}, from = obj(o.settings);
    SHARED_SETTINGS.forEach(k => { if (k in from) s[k] = from[k]; });
    o.settings = s; return o;
  }
  /* what is compared: the state without the moment of saving */
  function body(x) { const o = Object.assign({}, x); delete o.at; return stable(o); }

  /* ---------- the connection ---------- */
  const configured = () => !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.authDomain && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
  const online = () => root.navigator.onLine !== false;
  function readFlag() { try { const f = JSON.parse(root.localStorage.getItem(FLAG) || 'null'); return isObj(f) && f.uid ? f : null; } catch (e) { return null; } }
  function writeFlag(f) { try { if (f) root.localStorage.setItem(FLAG, JSON.stringify(f)); else root.localStorage.removeItem(FLAG); } catch (e) { /* ignore */ } }
  const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(Object.assign(new Error('timeout'), { code: 'timeout' })), ms))]);

  /* the real backend, from the Firebase SDK on the CDN. Tests put a fake one in its place (setBackend) */
  async function firebaseBackend() {
    const [A, U, F] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore-lite.js')]);
    const app = A.getApps().length ? A.getApps()[0] : A.initializeApp(FIREBASE_CONFIG);
    const auth = U.getAuth(app), db = F.getFirestore(app);
    auth.languageCode = 'he';
    const who = u => (u ? { uid: u.uid, name: u.displayName || '', email: u.email || '' } : null);
    return {
      onAuth: cb => { U.getRedirectResult(auth).catch(() => {}); U.onAuthStateChanged(auth, u => cb(who(u))); },
      signIn: async () => {
        const pr = new U.GoogleAuthProvider(); pr.setCustomParameters({ prompt: 'select_account' });
        try { await U.signInWithPopup(auth, pr); }
        catch (e) {
          const c = String(e && e.code);
          /* a blocked popup, or a home-screen app that cannot open one: go to Google's page and come back */
          if (/popup-blocked|operation-not-supported|web-storage-unsupported/.test(c)) {
            try { root.sessionStorage.setItem(BACK, '1'); } catch (x) { /* ignore */ }
            return U.signInWithRedirect(auth, pr);
          }
          throw e;
        }
      },
      signOut: () => U.signOut(auth),
      read: async uid => { const s = await F.getDoc(F.doc(db, 'users', uid)); return s.exists() ? s.data() : null; },
      write: (uid, d) => F.setDoc(F.doc(db, 'users', uid), Object.assign({}, d, { updated: F.serverTimestamp() }))
    };
  }

  let hooks = null, backend = null, booting = null, makeBackend = firebaseBackend;
  const st = { user: null, busy: false, again: false, offline: false, error: '', last: 0 };
  let pushT = 0;
  function changed() { if (hooks && hooks.changed) try { hooks.changed(); } catch (e) { /* ignore */ } }

  function boot() {
    if (backend) return Promise.resolve(backend);
    if (!booting) {
      booting = makeBackend().then(b => {
        backend = b;
        let was = null; /* the account of the last call: a sync starts on the first call of each page and on a new account */
        b.onAuth(u => {
          const first = was === null; was = u ? u.uid : '';
          const prev = st.user && st.user.uid;
          st.user = u;
          if (u) { const f = readFlag(); writeFlag({ uid: u.uid, name: u.name, email: u.email, last: f && f.uid === u.uid ? f.last : 0 }); if (first || prev !== u.uid) syncNow(); }
          else writeFlag(null);
          changed();
        });
        return b;
      }).catch(e => { booting = null; st.offline = true; changed(); throw e; });
    }
    return booting;
  }

  async function syncNow() {
    if (!st.user || !backend) return false;
    if (st.busy) { st.again = true; return false; }
    if (!online()) { st.offline = true; changed(); return false; }
    st.busy = true; st.error = ''; changed();
    let ok = false;
    try {
      const uid = st.user.uid, doc = await timeout(backend.read(uid), NET_WAIT);
      let remote = null;
      if (doc && typeof doc.data === 'string') { try { remote = JSON.parse(doc.data); } catch (e) { remote = null; } }
      const local = hooks.get(), merged = mergeState(local, remote, { remoteFirst: !st.last });
      if (body(merged) !== body(local)) hooks.put(merged);
      const up = cloudForm(merged);
      if (!remote || body(up) !== body(cloudForm(remote))) {
        up.at = Math.max(num(merged.at), Date.now());
        await timeout(backend.write(uid, { data: JSON.stringify(up), gen: up.gen || 0, at: up.at, ver: hooks.version || '' }), NET_WAIT);
      }
      st.last = Date.now(); st.offline = false; ok = true;
      const f = readFlag(); if (f && f.uid === uid) writeFlag(Object.assign(f, { last: st.last }));
    } catch (e) {
      const c = String((e && (e.code || e.message)) || e);
      if (/timeout|unavailable|network|offline|failed to fetch/i.test(c)) st.offline = true;
      else st.error = /permission/i.test(c) ? 'אין הרשאה לשמור בענן' : 'הסנכרון נכשל, ננסה שוב בהמשך';
    }
    st.busy = false; changed();
    if (st.again) { st.again = false; setTimeout(syncNow, 500); }
    return ok;
  }

  const Sync = {
    mergeState, stable,
    configured,
    /* hooks: { get() the state now, put(state) take a merged state in, changed() redraw, version } */
    init(h) {
      hooks = h;
      if (!configured()) return;
      const f = readFlag(); if (f) { st.user = { uid: f.uid, name: f.name, email: f.email }; st.last = f.last || 0; }
      let back = false; try { back = !!root.sessionStorage.getItem(BACK); root.sessionStorage.removeItem(BACK); } catch (e) { /* ignore */ }
      const start = () => { if ((readFlag() || back) && online()) boot().catch(() => {}); };
      start();
      root.addEventListener('online', () => { st.offline = false; if (backend) syncNow(); else start(); changed(); });
      root.addEventListener('offline', () => { st.offline = true; changed(); });
      root.document.addEventListener('visibilitychange', () => {
        if (root.document.visibilityState === 'hidden' && pushT) { clearTimeout(pushT); pushT = 0; syncNow(); }
        else if (root.document.visibilityState === 'visible' && backend && st.user && Date.now() - st.last > 60000) syncNow();
      });
    },
    /* called after every save: a short while later the change goes up (with a merge first, so another device's work stays) */
    dirty() {
      if (!configured() || !st.user) return;
      clearTimeout(pushT); pushT = setTimeout(() => { pushT = 0; if (backend) syncNow(); else boot().catch(() => {}); }, PUSH_WAIT);
    },
    async signIn() {
      if (!configured()) return false;
      if (!online()) { st.offline = true; changed(); throw Object.assign(new Error('offline'), { code: 'offline' }); }
      const b = await boot();
      await b.signIn();
      return true;
    },
    async signOut() {
      clearTimeout(pushT); pushT = 0;
      if (st.user && backend) { await syncNow(); try { await backend.signOut(); } catch (e) { /* ignore */ } }
      st.user = null; st.last = 0; writeFlag(null); changed();
    },
    syncNow: () => (!configured() ? Promise.resolve(false) : backend ? syncNow() : boot().then(syncNow, () => false)),
    status: () => ({ configured: configured(), user: st.user, busy: st.busy, offline: st.offline || !online(), error: st.error, last: st.last }),
    /* tests only: a fake backend instead of Firebase, and a config that turns the feature on */
    _test: {
      setBackend: f => { makeBackend = f; backend = null; booting = null; },
      config: c => Object.assign(FIREBASE_CONFIG, c),
      /* ?test&syncfake: a pretend cloud kept in localStorage ('pshita-fake-cloud'), with one pretend Google account */
      fake: () => {
        Object.assign(FIREBASE_CONFIG, { apiKey: 'test', authDomain: 'test', projectId: 'test', appId: 'test' });
        const K = 'pshita-fake-cloud', get = () => { try { return JSON.parse(root.localStorage.getItem(K) || '{}'); } catch (e) { return {}; } };
        const put = o => root.localStorage.setItem(K, JSON.stringify(o));
        makeBackend = async () => {
          let cb = () => {};
          return {
            onAuth: c => { cb = c; setTimeout(() => c(get().user || null), 0); },
            signIn: async () => { const o = get(); o.user = { uid: 'u1', name: 'בודק', email: 'tester@example.com' }; put(o); cb(o.user); },
            signOut: async () => { const o = get(); delete o.user; put(o); cb(null); },
            read: async uid => { const o = get(); if (o.offline) throw Object.assign(new Error('x'), { code: 'unavailable' }); return (o.docs || {})[uid] || null; },
            write: async (uid, d) => { const o = get(); if (o.offline) throw Object.assign(new Error('x'), { code: 'unavailable' }); o.docs = o.docs || {}; o.docs[uid] = d; o.writes = (o.writes || 0) + 1; put(o); }
          };
        };
      }
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sync;
  else root.PshitaSync = Sync;
})(typeof window !== 'undefined' ? window : globalThis);
