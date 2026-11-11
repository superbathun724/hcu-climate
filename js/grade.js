/* ==========================================================
   grade.js — 채점 규칙. 순수 함수만 있습니다.
   (voca-web js/grade.js 그대로. 브라우저와 서버 함수 functions/api/answer.js 가 같이 쓴다)

   한국어 뜻은 이렇게 느슨하게 봅니다.
     · senses 의 모든 뜻이 정답 후보
     · 쉼표·가운뎃점으로 한 번 더 쪼갬   "명료한, 두드러진" → 둘 다 정답
     · 대괄호는 바꿔 쓸 수 있는 말        "~에 대응[대처]하다"
                                          → "대응하다" · "대처하다" 둘 다 정답
     · 괄호는 있어도 없어도 정답          "(문제가) 생기다"
                                          → "생기다" · "문제가 생기다" 둘 다 정답
     · 물결표는 있어도 없어도 정답      "~에 대응하다" → "대응하다" 도 정답
     · 공백·문장부호는 무시
   ========================================================== */

/** 비교용으로 다듬기 (한국어) */
export const normKo = (s) => (s ?? "")
  .replace(/\([^)]*\)/g, " ")          // 괄호 설명 제거
  .replace(/[~\-–—.,·;:'"!?()[\]]/g, " ")
  .replace(/\s+/g, "")
  .trim();

/** 비교용으로 다듬기 (영어) — 관사와 부호를 무시 */
export const normEn = (s) => (s ?? "")
  .toLowerCase()
  .replace(/[.,!?;:'"()[\]]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .replace(/^(a|an|the)\s+/, "");

/* ==========================================================
   대괄호 풀기

   사전은 바꿔 쓸 수 있는 말을 대괄호로 묶습니다.
       ~에 대응[대처]하다     대응하다 · 대처하다
       알다[알아보다]         알다 · 알아보다
   앞말을 몇 글자까지 갈아 끼우는지는 표기마다 다르므로,
   생길 수 있는 형태를 모두 만들어 두고 그중 하나라도 맞으면 정답으로 봅니다.
   ========================================================== */

const MAX_VARIANTS = 64;

/** 대괄호 앞의 한 낱말 (공백·문장부호 전까지) */
const dropLastToken = (head) => head.replace(/[^\s,·;:/()]+$/, "");

/** 대괄호 하나를 풀어 여러 갈래로 벌립니다 */
function expandBrackets(s) {
  const m = /\[([^\]]*)\]/.exec(s);
  if (!m) return [s];

  const head = s.slice(0, m.index);
  const alt  = m[1].trim();
  const tail = s.slice(m.index + m[0].length);

  const forms = new Set([
    head + tail,                                              // 묶인 말을 뺀 것
    head + alt + tail,                                        // 그대로 이어 읽은 것
    dropLastToken(head) + alt + tail,                         // 앞 낱말을 갈아 끼운 것
  ]);
  if (alt && head.length >= alt.length) {
    forms.add(head.slice(0, head.length - alt.length) + alt + tail);  // 앞 몇 글자만
  }

  const out = [];
  for (const f of forms) {
    for (const more of expandBrackets(f)) {                   // 대괄호가 또 있으면 계속
      out.push(more);
      if (out.length >= MAX_VARIANTS) return out;
    }
  }
  return out;
}

/**
 * 물결표는 자리를 비워 둔 표시입니다. "~에 대응하다" 처럼 조사가 붙어 있어도
 * 학생은 보통 "대응하다" 만 씁니다. 물결 덩어리를 뗀 형태도 인정합니다.
 */
function expandTilde(s) {
  if (!s.includes("~")) return [s];
  return [s, s.replace(/~[^\s,·;\/]*\s*/g, "")];
}

/** 괄호는 지운 것과 살린 것을 모두 인정합니다 */
function expandParens(s) {
  if (!s.includes("(")) return [s];
  return [s, s.replace(/[()]/g, " ")];
}

/**
 * 물결표·대괄호·괄호를 모두 풀어 나올 수 있는 표기를 전부 만듭니다.
 * 저장된 뜻(정답 후보)과 학생이 적어 낸 답에 똑같이 씁니다 —
 * 예전에는 이 3중 루프를 koKeys 와 inputForms 가 따로 들고 있었습니다.
 */
const allForms = (raw) => {
  const out = [];
  for (const withT of expandTilde(raw ?? "")) {
    for (const withB of expandBrackets(withT)) {
      for (const form of expandParens(withB)) out.push(form);
    }
  }
  return out;
};

/**
 * 한국어 뜻 하나에서 나올 수 있는 정답 열쇠 전부.
 * 통째로도, 쉼표로 쪼갠 조각도 인정합니다.
 */
export function koKeys(raw) {
  const out = new Set();
  for (const form of allForms(raw)) {
    out.add(normKo(form));                                // 통째로
    for (const part of form.split(/[,\u00b7;]/)) {            // 쪼갠 것
      const k = normKo(part);
      if (k) out.add(k);
    }
  }
  out.delete("");
  return out;
}

/** 적어 낸 답 한 조각이 가질 수 있는 모양들 (대괄호를 따라 쓴 경우까지) */
function inputForms(part) {
  const out = new Set();
  for (const form of allForms(part)) {
    const k = normKo(form);
    if (k) out.add(k);
  }
  return out;
}

/** 한 단어가 가질 수 있는 한국어 정답 목록 */
export function meaningKeys(word) {
  const out = new Set();
  for (const s of word.senses ?? []) {
    for (const k of koKeys(s.meaning ?? "")) out.add(k);
  }
  return [...out];
}

/** 쉼표로 나눈 답이 순서와 상관없이 모두 정답 후보 안에 드는지 */
function everyPartMatches(keys, input) {
  const parts = (input ?? "").split(/[,·;\/]/).map(p => p.trim()).filter(Boolean);
  if (!parts.length) return false;
  return parts.every(p => {
    const forms = inputForms(p);
    if (!forms.size) return false;
    for (const f of forms) if (keys.has(f)) return true;
    return false;
  });
}

/**
 * 영어 → 한국어 뜻 채점.
 * 쉼표로 여러 개를 쓰면 순서와 상관없이 각각을 따로 봅니다.
 *   저장: "명료한, 두드러진"  →  "두드러진, 명료한" 도 정답
 * 하나라도 정답 후보에 없으면 오답입니다.
 */
export function checkMeaning(word, input) {
  return everyPartMatches(new Set(meaningKeys(word)), input);
}

/** 한국어 → 영어 단어 채점 */
export const checkSpelling = (word, input) =>
  normEn(word.word) === normEn(input);

/** 유의어·반의어 채점 — 여러 개 중 하나만 맞아도 정답 */
export const checkRelated = (list, input) =>
  (list ?? []).some(o => normEn(o.word) === normEn(input));

/**
 * 정답 문장 하나와 입력을 비교합니다.
 * 표현·문장 해석과 관련어 뜻에 모두 씁니다.
 * 통째로 같아도 되고, 쉼표로 나눈 조각이 전부 들어맞아도 정답입니다.
 */
export function checkTranslation(expected, input) {
  const keys = koKeys(expected);
  if (!keys.size) return false;
  return everyPartMatches(keys, input);
}

/** 관련어(원형·파생어)의 뜻 채점 */
export const checkNoteMeaning = (note, input) =>
  checkTranslation(note?.meaning, input);

/* ---------- 화면에 보여줄 모범 답안 ---------- */

export const meaningAnswer = (word) =>
  (word.senses ?? []).map(s => (s.pos ? `[${s.pos}] ` : "") + s.meaning).join("  /  ");

/** "noticeable 눈에 띄는 · pronounced 두드러진" */
export const relatedAnswer = (list) =>
  (list ?? []).map(o => o.meaning ? `${o.word} ${o.meaning}` : o.word).join(";  ");
