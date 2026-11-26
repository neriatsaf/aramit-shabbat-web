/* מנוע החזרות המרווחות (FSRS, גרסה 5) בלי ספריות: לכל ערך יציבות (s, בימים: אחרי כמה ימים הסיכוי לזכור יורד ל-90%)
   וקושי (d, מ-1 עד 10). הדירוג: 1 לא ידעתי, 2 בקושי, 3 ידעתי, 4 בקלות. האפליקציה משתמשת היום ב-1 וב-3 בלבד.
   המשקלים הם ברירת המחדל של FSRS-5 (open-spaced-repetition). הקובץ נטען לפני js/main.js, ונבדק גם ב-node (tests/fsrs.js). */
(function (root) {
  'use strict';
  const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
    1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
  const DECAY = -0.5, FACTOR = 19 / 81; /* (0.9)^(1/DECAY) - 1 = FACTOR: at t = s the chance to remember is 90% */
  const S_MIN = 0.1, S_MAX = 36500;
  const clampD = d => Math.min(10, Math.max(1, d));
  const clampS = s => Math.min(S_MAX, Math.max(S_MIN, s));

  function initS(g) { return clampS(W[g - 1]); }
  function initD(g) { return clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1); }
  /* the chance to remember after t days with stability s */
  function retrievability(t, s) { return Math.pow(1 + FACTOR * Math.max(0, t) / s, DECAY); }
  /* the days until the chance falls to the retention asked for (0.9 gives back s itself) */
  function interval(s, retention, max) {
    const r = retention || 0.9, i = s / FACTOR * (Math.pow(r, 1 / DECAY) - 1);
    return Math.max(1, Math.min(max || S_MAX, Math.round(i)));
  }
  function nextD(d, g) {
    const dd = d + (-W[6] * (g - 3)) * (10 - d) / 9; /* linear damping: a hard item moves slower towards 10 */
    return clampD(W[7] * initD(4) + (1 - W[7]) * dd); /* mean reversion towards the "easy" start */
  }
  function recallS(d, s, r, g) {
    const hard = g === 2 ? W[15] : 1, easy = g === 4 ? W[16] : 1;
    return clampS(s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy));
  }
  function forgetS(d, s, r) {
    const f = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
    return clampS(Math.min(f, s));
  }
  /* a review on the same day as the one before (short-term) */
  function sameDayS(s, g) { return clampS(s * Math.exp(W[17] * (g - 3 + W[18]))); }

  /* the state after one review. card: { s, d } or null for a first review; t: whole days since the last review */
  function next(card, t, g) {
    g = Math.min(4, Math.max(1, Math.round(g)));
    if (!card || !(card.s > 0)) return { s: initS(g), d: initD(g) };
    const s = card.s, d = clampD(card.d || initD(3));
    if (t < 1) return { s: sameDayS(s, g), d: nextD(d, g) };
    const r = retrievability(t, s);
    return { s: g === 1 ? forgetS(d, s, r) : recallS(d, s, r, g), d: nextD(d, g) };
  }

  /* the Leitner stages of the versions up to 1.6 (0 to 6, a review after 0, 1, 3, 7, 14, 30, 60 days) as a matching
     starting point: the stability is the interval the stage had, so the next review stays on the day already planned;
     the difficulty starts from "good" and rises with the share of misses */
  const LEITNER = [0, 1, 3, 7, 14, 30, 60];
  function fromLeitner(box, lapses, reviews) {
    const b = Math.min(6, Math.max(0, box | 0));
    const s = b === 0 ? W[0] : LEITNER[b];
    const miss = reviews > 0 ? Math.min(1, (lapses || 0) / reviews) : 0;
    return { s: clampS(s), d: clampD(initD(3) + 4 * miss + Math.min(2, (lapses || 0) * 0.5)) };
  }
  /* the stage (0 to 6) that an interval of so many days matches, for the screens that show stages */
  function boxOf(days) { let b = 0; for (let i = 1; i < LEITNER.length; i++) if (days >= LEITNER[i]) b = i; return b; }

  const api = { W, initS, initD, retrievability, interval, next, fromLeitner, boxOf, LEITNER };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FSRS = api;
})(typeof window !== 'undefined' ? window : this);
