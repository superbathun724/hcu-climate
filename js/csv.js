/* ==========================================================
   csv.js — CSV 를 단어 목록으로 바꾸기만 한다. 화면도 DB 도 모른다.
   (voca-web js/csv.js 의 읽기 부분을 그대로 가져옴. 형식이 같아야 해서 손대지 않았다)

   열 구성
     word, senses, notes, synonyms, antonyms,
     phrase1, phrase1_ko, phrase2, phrase2_ko, sentence1, sentence1_ko

   칸 안의 구분자
     ;  항목과 항목      |  안쪽 조각
     senses    품사|뜻
     notes     단어|품사|뜻   (단어를 비우면 그냥 메모)
     synonyms  단어|뜻
     antonyms  단어|뜻
   ========================================================== */

export const MAX_ROWS = 1000;       // 서버(admin_upload_set)도 같은 수로 막는다

const BASE = ["word", "senses", "notes", "synonyms", "antonyms"];
const HEADERS = [...BASE, "phrase1", "phrase1_ko", "phrase2", "phrase2_ko", "sentence1", "sentence1_ko"];

/** RFC4180 파서 — 따옴표 안의 쉼표·줄바꿈·"" 를 처리 */
export function parseCSV(text) {
  text = text.replace(/^﻿/, "");            // 엑셀 BOM
  const rows = [];
  let row = [], cur = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += c;
    }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); cur = ""; rows.push(row); row = []; }
    else if (c !== "\r") cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

/* `;` 가 항목 구분자지만 뜻 안에도 자주 쓰여서, 파이프 없는 조각은 앞 뜻에 이어 붙인다. */
const items = (cell) => {
  const raw = (cell || "").split(";").map(s => s.trim()).filter(Boolean);
  if (!raw.some(x => x.includes("|"))) return raw;
  const out = [];
  for (const seg of raw) {
    if (seg.includes("|") || !out.length) out.push(seg);
    else out[out.length - 1] += ", " + seg;
  }
  return out;
};

const parsePairs = (cell, keyA, keyB, loneKey = keyB) =>
  items(cell).map(s => {
    const parts = s.split("|");
    if (parts.length < 2) return { [keyA]: "", [keyB]: "", [loneKey]: parts[0].trim() };
    return { [keyA]: parts[0].trim(), [keyB]: parts.slice(1).join("|").trim() };
  }).filter(o => o[keyA] || o[keyB]);

const parseTriples = (cell) =>
  items(cell).map(s => {
    const p = s.split("|").map(x => x.trim());
    return p.length >= 3
      ? { word: p[0], pos: p[1], meaning: p.slice(2).join("|") }
      : { word: p[0] ?? "", pos: "", meaning: p[1] ?? "" };
  }).filter(o => o.word || o.meaning);

/** CSV 글자 → [{word, senses, notes, synonyms, antonyms, phrases, sentences}] */
export function rowsToWords(text) {
  const rows = parseCSV(text);
  for (const row of rows)                        // 내보낼 때 붙인 수식 방지 작은따옴표 되돌리기
    for (let i = 0; i < row.length; i++)
      if (/^'[=+\-@]/.test(row[i])) row[i] = row[i].slice(1);
  if (!rows.length) return [];

  let head = rows[0].map(h => h.trim().toLowerCase());
  let start = 0;
  if (head.includes("word")) start = 1; else head = HEADERS;
  const at = (row, name) => { const i = head.indexOf(name); return i < 0 ? "" : (row[i] ?? ""); };

  const numbered = (row, stem) => {
    const out = [];
    for (let i = 1; ; i++) {
      if (!head.includes(`${stem}${i}`) && !head.includes(`${stem}${i}_ko`)) break;
      const t = at(row, `${stem}${i}`).trim(), m = at(row, `${stem}${i}_ko`).trim();
      if (t || m) out.push({ text: t, meaning: m });
    }
    return out;
  };

  return rows.slice(start).map(row => {
    const phrases = numbered(row, "phrase"), sentences = numbered(row, "sentence");
    return {
      word: at(row, "word").trim(),
      senses: parsePairs(at(row, "senses"), "pos", "meaning", "meaning"),
      notes: parseTriples(at(row, "notes") || at(row, "note")),
      synonyms: parseTriples(at(row, "synonyms")).map(({ word, meaning }) => ({ word, meaning })),
      antonyms: parseTriples(at(row, "antonyms")).map(({ word, meaning }) => ({ word, meaning })),
      phrases:   phrases.length   ? phrases   : parsePairs(at(row, "phrases"),   "text", "meaning", "text"),
      sentences: sentences.length ? sentences : parsePairs(at(row, "sentences"), "text", "meaning", "text"),
    };
  }).filter(w => w.word);
}

/** 파일 이름 → 단어장 이름. "Day01.csv" → "Day01" */
export const nameFromFile = (filename) =>
  filename.replace(/\.csv$/i, "").replace(/[_]+/g, " ").trim().slice(0, 60);

/** 같은 단어가 여러 번 나오면 서버는 마지막 것만 쓴다. 미리 세어서 알려 준다. */
export function countDuplicates(words) {
  const seen = new Set(); let dup = 0;
  for (const w of words) { if (seen.has(w.word)) dup++; else seen.add(w.word); }
  return dup;
}
