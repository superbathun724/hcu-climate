/* ==========================================================
   quiz-core.js — 문제 유형 정하기와 채점. 순수 함수만.
   브라우저(js/study.js)와 서버 함수(functions/api/answer.js)가 같은 파일을 쓴다.
   그래야 "화면이 낸 문제"와 "서버가 채점하는 문제"가 어긋나지 않는다.

   단계(srs_level 0~5, 화면에는 1~6단계로 보인다)마다 문제 유형이 정해진다.
     1단계  뜻       영어 단어 → 한국어 뜻
     2단계  철자     한국어 뜻 → 영어 단어
     3단계  유의어   단어 → 유의어 하나 (없으면 반의어, 둘 다 없으면 뜻)
     4단계  표현     빈칸 표현 + 해석 → 빈칸 단어 (없으면 철자)
     5단계  예문     빈칸 예문 + 해석 → 빈칸 단어 (없으면 철자)
     6단계  종합     유의어·반의어·표현·예문 중 아무거나 (뜻·철자는 빼서 쉬운 문제로 8코인을 못 받게)
   스스로 채점하는 문제는 없다. 모두 자동 채점이라 코인을 줄 수 있다.
   ========================================================== */
import { checkMeaning, checkSpelling, checkRelated, normEn, meaningAnswer, relatedAnswer } from "./grade.js";

export const MAX_LEVEL = 5;
export const COINS = [1, 2, 3, 4, 5, 8];          // 단계별 코인 (sql/04_study.sql 의 word_coins 와 같게)

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 표현·예문에서 단어가 쓰인 자리를 찾는다. 활용형도 잡는다(mark → marked, study → studies).
 * 못 찾으면 null — 그 표현으로는 빈칸 문제를 못 낸다.
 */
export function cloze(text, word) {
  if (!text || !word) return null;
  const w = word.trim();
  const tries = [w];
  if (!w.includes(" ") && w.length >= 4 && /[ey]$/i.test(w)) tries.push(w.slice(0, -1));   // make→making, study→studies
  for (const base of tries) {
    const pattern = base.includes(" ")
      ? reEsc(base).replace(/\\? /g, "\\s+")                 // 여러 낱말 표현은 그대로
      : `${reEsc(base)}[a-z]*`;
    const m = new RegExp(`(^|[^A-Za-z])(${pattern})(?![A-Za-z])`, "i").exec(text);
    if (m) {
      const start = m.index + m[1].length;
      return { before: text.slice(0, start), answer: m[2], after: text.slice(start + m[2].length) };
    }
  }
  return null;
}

const firstCloze = (list, word) => {
  for (const it of list ?? []) {
    const c = cloze(it.text, word);
    if (c) return { ...c, meaning: it.meaning ?? "" };
  }
  return null;
};

/** 이 단어로 낼 수 있는 유형들 */
export function available(w) {
  const out = [];
  const hasSense = (w.senses ?? []).some(s => s.meaning);
  if (hasSense) out.push("meaning", "spelling");
  if ((w.synonyms ?? []).some(o => o.word)) out.push("synonym");
  if ((w.antonyms ?? []).some(o => o.word)) out.push("antonym");
  if (firstCloze(w.phrases, w.word)) out.push("phrase");
  if (firstCloze(w.sentences, w.word)) out.push("sentence");
  return out;
}

const WANT = [["meaning"], ["spelling"], ["synonym", "antonym"], ["phrase"], ["sentence"], ["synonym", "antonym", "phrase", "sentence"]];
const FALLBACK = [[], [], ["meaning"], ["spelling"], ["spelling"], ["spelling"]];

/** 이 단계에서 낼 수 있는 유형들. 빈 배열이면 이 단어는 문제를 낼 수 없다. */
export function typesForLevel(w, level) {
  const lv = Math.max(0, Math.min(MAX_LEVEL, level | 0));
  const avail = available(w);
  if (!avail.length) return [];
  let t = WANT[lv].filter(x => avail.includes(x));
  if (!t.length) t = FALLBACK[lv].filter(x => avail.includes(x));
  return t.length ? t : avail;
}

/** 채점 */
export function check(w, type, input) {
  const v = String(input ?? "").slice(0, 200);
  if (!v.trim()) return false;
  switch (type) {
    case "meaning":  return checkMeaning(w, v);
    case "spelling": return checkSpelling(w, v);
    case "synonym":  return checkRelated(w.synonyms, v);
    case "antonym":  return checkRelated(w.antonyms, v);
    case "phrase":   { const c = firstCloze(w.phrases, w.word);   return !!c && normEn(c.answer) === normEn(v); }
    case "sentence": { const c = firstCloze(w.sentences, w.word); return !!c && normEn(c.answer) === normEn(v); }
    default: return false;
  }
}

/** 화면에 보여줄 문제. 글자는 아직 이스케이프 전이다(화면이 esc 한다). */
export function question(w, type) {
  const senses = (w.senses ?? []).map(s => (s.pos ? `[${s.pos}] ` : "") + s.meaning).join("  /  ");
  switch (type) {
    case "meaning":  return { label: "뜻 쓰기",   big: w.word, sub: "", ask: "한국어 뜻", lang: "ko" };
    case "spelling": return { label: "철자 쓰기", big: senses, sub: "", ask: "영어 단어", lang: "en" };
    case "synonym":  return { label: "유의어 쓰기", big: w.word, sub: "비슷한 뜻의 영어 단어 하나", ask: "유의어", lang: "en" };
    case "antonym":  return { label: "반의어 쓰기", big: w.word, sub: "반대 뜻의 영어 단어 하나", ask: "반의어", lang: "en" };
    case "phrase":
    case "sentence": {
      const c = firstCloze(type === "phrase" ? w.phrases : w.sentences, w.word);
      return { label: type === "phrase" ? "표현 빈칸" : "예문 빈칸", cloze: c, sub: c?.meaning ?? "", ask: "빈칸에 들어갈 말", lang: "en" };
    }
  }
  return null;
}

/** 틀렸을 때 보여줄 답 */
export function answerText(w, type) {
  switch (type) {
    case "meaning":  return meaningAnswer(w);
    case "spelling": return w.word;
    case "synonym":  return relatedAnswer(w.synonyms);
    case "antonym":  return relatedAnswer(w.antonyms);
    case "phrase":   return firstCloze(w.phrases, w.word)?.answer ?? w.word;
    case "sentence": return firstCloze(w.sentences, w.word)?.answer ?? w.word;
  }
  return "";
}
