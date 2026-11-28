/* פשיטא: the rules for words and definitions, with no screen and no browser in them, so tools/ can load the same file:
   letters and spelling (norm, xwLetters), and when a crossword definition gives its answer away (answerInGloss, rootLeak, xwVague).
   The same rules as tools/make-daily.js; tools/check-data.js checks that the two agree on every board and definition */
/* ---------- letters ---------- */
const FIN = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
function norm(s) {
  return String(s).replace(/[֑-ׇ]/g, '').replace(/["'׳״־-]/g, '').replace(/[ךםןףץ]/g, c => FIN[c]).replace(/\s+/g, ' ').trim();
}
function stripPrefix(s) { return s.replace(/^(וד|ו|ד)(?=.{2,})/, ''); }
function xwLetters(s) { return String(s).replace(/[\u0591-\u05C7]/g, '').replace(/[^\u05d0-\u05ea]/g, ''); }
/* the answer must not show in its own definition: a whole word of the definition, once the prefixes ה ו ב ל כ מ ש
   and the endings ים ות ין are taken off, may not be the answer (so "טל" is not caught by "טלטול"). The same rule as tools/make-daily.js */
function answerInGloss(ans, text) {
  const ENDS = ['ימ', 'ות', 'ינ'];   /* ים ות ין, with the final letters made plain */
  const forms = t => { const out = new Set([t]); let x = t;
    /* one prefix letter may leave two letters (הטל); two or three must leave three (מונח is not מ+ו+נח) */
    for (let i = 0; i < 3 && /^[הובלכמש]/.test(x) && x.length > (i === 0 ? 2 : 3); i++) { x = x.slice(1); out.add(x); }
    for (const v of [...out]) for (const end of ENDS) if (v.endsWith(end) && v.length - 2 >= 2) out.add(v.slice(0, -2));
    const k = t.replace(/[וי]/g, ''); if (k.length >= 3) out.add('~' + k);   /* a spelling with or without ו and י */
    return out; };
  const words = String(ans).split(/\s+/).map(x => norm(xwLetters(x))).filter(w => w.length >= 2).map(w => {
    const f = new Set([w]); for (const end of ENDS) if (w.endsWith(end) && w.length - 2 >= 2) f.add(w.slice(0, -2));
    const k = w.replace(/[וי]/g, ''); if (k.length >= 3) f.add('~' + k); return f; });
  const toks = (String(text).match(/[\u05d0-\u05ea]+/g) || []).map(norm);
  const WORDS_A = String(ans).split(/\s+/).map(x => norm(xwLetters(x)));
  /* an Aramaic noun or word that ends in א, and its Hebrew translation without the א: שבתא and שבת, דמא and דם, בשרא and בשר.
     The stem is compared as written and with ו and י left out on both sides */
  const stems = WORDS_A.filter(w => w.length >= 3 && w.endsWith('א')).map(w => { const s = w.slice(0, -1); return [s, s.replace(/[וי]/g, '')]; });
  if (stems.length && toks.some(t => { const f = [t]; let x = t; for (let i = 0; i < 2 && /^[הובלכמשד]/.test(x) && x.length > 2; i++) { x = x.slice(1); f.push(x); }
    return f.some(v => stems.some(([s, ks]) => v === s || (ks.length >= 2 && v.replace(/[וי]/g, '') === ks))); })) return true;
  return toks.some(t => { const f = forms(t); return words.some(ws => [...ws].some(w => f.has(w))); });
}
/* for each letter of a word as written: F a final letter, R one of כ מ נ פ צ written plain, a dot for the rest.
   A final letter may stand only where the crossing word ends too, written final (the same rule as tools/make-daily.js) */
/* a definition that cannot be solved without guessing: only small words, or for two or three letters fewer than two words of content */
const XSMALL = new Set(('של על אל את עם מן לו לה להם להן לנו לי לך לכם אותו אותה אותם אותן אותי אותנו זה זו זאת זהו זוהי אלה אלו הוא היא הם הן ' +
  'אני אנחנו אתה אתם גם אף אם כי כאשר כש כמו אך רק לא אין יש הרי האם וכי מה מי איך כך כן כאן שם עוד כבר אז עד בין אחר אחרי לפני ' +
  'ש ה ו ב ל מ כ ד שהוא שהיא שלו שלה שלהם עליו עליה עליהם ממנו ממנה בו בה בהם לפי אצל').split(' '));
function xwVague(ans, clue) {
  const toks = (String(clue).replace(/\([^)]*\)/g, ' ').match(/[\u05d0-\u05ea"׳״']+/g) || []).map(t => t.replace(/["׳״']/g, ''));
  const content = toks.filter(t => !XSMALL.has(t));
  return !content.length || (norm(xwLetters(ans)).length <= 3 && content.length < 2);
}
/* the root of the answer in its definition: the same test as tools/make-daily.js (rootLeak), so a personal board leaves out
   exactly the entries the daily pool leaves out: a dictionary meaning that gives the Hebrew form of the same word (אדליק: הדליק),
   unless xwclues.js has a definition of its own for it */
const LFIN = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const lwords = s => String(s).replace(/[֑-ׇ]/g, '').replace(/[^א-ת ]/g, ' ').replace(/[ךםןףץ]/g, c => LFIN[c]).split(/\s+/).filter(Boolean);
const LSKIP = /^(בלשונ|הגמרא|בגמרא|המשנה|במשנה|בארמית|ארמית|לשונ|מילת|שאלה)$/;
const LSTOP2 = new Set('של על אל את עם מן כל זה זו זאת לא כי אם גם מה מי הוא היא הם הן לו לה בו בה מסכת אמורא תנא ספר רבי רב בן בר'.split(' '));
const LENDS = ['יהו', 'יהמ', 'יה', 'יו', 'הו', 'נו', 'ות', 'ימ', 'ינ', 'תי', 'ה', 'ת', 'ו', 'א'];
function lcores(w) {
  const out = new Set(), starts = [w]; let x = w;
  for (let i = 0; i < 3 && /^[הובלכמשדנתאי]/.test(x) && x.length > 3; i++) { x = x.slice(1); starts.push(x); }
  for (const s of starts) { const ends = [s]; for (const e of LENDS) if (s.endsWith(e) && s.length - e.length >= 2) ends.push(s.slice(0, -e.length));
    for (const t of ends) { const k = t.replace(/[ויא]/g, ''); if (k.length >= 2) out.add(k.length >= 3 ? k.slice(0, 3) : k); } }
  return out;
}
function lroot2(w) { const o = new Set(); for (const s of [w, /^[הובלכמשדנתאי]/.test(w) && w.length > 3 ? w.slice(1) : null]) { if (!s) continue;
  const ends = [s]; for (const e of LENDS) if (s.endsWith(e) && s.length - e.length >= 2) ends.push(s.slice(0, -e.length));
  for (const t of ends) { const k = t.replace(/[ויא]/g, ''); if (k.length === 2) o.add(k); } } return o; }
const lskel = w => w.replace(/[ויא]/g, '').replace(/ה$/, '');
const lstrips = t => { const o = new Set([t]); let x = t; for (let i = 0; i < 2 && /^[הובלכמשד]/.test(x) && x.length > 3; i++) { x = x.slice(1); o.add(x); } return o; };
const lcommon = (a, b) => { for (let i = 0; i + 3 <= a.length; i++) if (b.includes(a.slice(i, i + 3))) return true; return false; };
function rootLeak(ans, clue) {
  const aw = lwords(ans), multi = aw.length > 1, tw = lwords(clue).filter(t => !LSKIP.test(t));
  for (const a0 of aw) {
    if (!(multi && a0.length <= 2)) { const A = lcores(a0), A2 = lroot2(a0);
      for (const t0 of tw) { if (t0.length < 2) continue;
        for (const t of lcores(t0)) if (A.has(t) && (t.length === 3 || (t0.length <= 5 && !LSTOP2.has(t0) && A2.has(t)))) return t0; } }
    const S = [...lstrips(a0)].map(lskel);
    for (const t0 of tw) for (const t of [...lstrips(t0)].map(lskel)) for (const a of S) {
      if (a.length >= 3 && lcommon(a, t)) return t0;
      if (a.length === 2 && !(multi && a0.length <= 2) && !LSTOP2.has(t0) && t.length >= 2 && t.length <= 4 && t.includes(a)) return t0;
    }
  }
  return '';
}

/* a plain Hebrew word (27.11.2026, after "עיניהן" on daily #4): an entry of the expanded store whose whole dictionary meaning
   is one Hebrew word that is the entry itself in another spelling, full or short (בצוארו: בצווארו, דיעות: דעות), or with the
   ending ן ין יהן for ם ים יהם (עיניהן: עיניהם, אגוזין: אגוזים). Such a word is Hebrew, not the Aramaic of the Gemara, and the
   crossword never asks for it. The key leaves out ו and י, makes the final letters plain and reads a last נ as מ.
   The callers ask it of the expanded store only (the chosen store and the concepts are never left out by it), and the words
   of HE_KEEP are Aramaic or Talmudic forms of their own that only look so (פריש, אריך, ביך, אבוהון, נייחן, לרכוכי...).
   An entry whose meaning is more than one word (חכים: "מחכים, נעשה חכם") is never caught, and needs no place in the list */
const HE_KEEP = new Set(('פריש אריך ביך ידיע תשעין חכימת אבוהון נייחן תלמידיהון אבוך הוית אמרית קריבית שאילית קבעית ידעיתון תרצת שליף פסיל שליט טריד סתיר חליש קביע צליל זקיף מהיל חתים פשיט גביל לקיט גניב סביל עניש נגיב נקיל מית טב טמיא ניגזר ניגמור ניפרוס ותיפשיט מיגליין גליין מיפקיד מידביק מיגבל מיסתכן מיקיל מישך מידק מצלח מסרח מקפד מפקר פנק כוויץ לינק איכרך ומושיף וקביר לרכוכי לקרורי לקבולי לזילזולי להרהורי מזוני בחמימי חרדלי נרדי עפרי ארנקי בנייני ציחצוחי בישולי ספוקי טיבותיך שקיך אחריני חברין לידן ידעין נבחין כאיבין הוויין מאיסן').split(' '));
const heKey = w => { let k = String(w).replace(/[\u0591-\u05C7]/g, '').replace(/[ךםןףץ]/g, c => FIN[c]).replace(/[וי]/g, ''); if (k.endsWith('נ')) k = k.slice(0, -1) + 'מ'; return k; };
function plainHebrew(w, gloss) {
  const a = String(w).replace(/[\u0591-\u05C7]/g, '').trim(), g = String(gloss).replace(/[\u0591-\u05C7]/g, '').trim();
  if (HE_KEEP.has(a) || !/^[א-ת]+$/.test(a) || !/^[א-ת]+$/.test(g)) return false;
  return heKey(a) === heKey(g);
}

export { HE_KEEP, answerInGloss, norm, plainHebrew, rootLeak, stripPrefix, xwLetters, xwVague };
