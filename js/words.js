/* ==========================================================
   words.js — 단어 탭: 단어장 목록과 단어 보기 (학생은 보기만). 공부는 js/study.js
   숨긴 단어장은 서버(RLS)가 학생에게 아예 보내지 않는다.
   관리자에게는 보이고, "숨김" 표시가 붙는다.
   ========================================================== */
import { db } from "./config.js";
import { $, esc, onProfile } from "./ui.js";

export async function loadSets() {
  const box = $("sets");
  const { data, error } = await db.from("word_sets")
    .select("id, name, hidden, word_count")   // word_count: sql/02_words.sql 계산 열
    .is("deleted_at", null)             // 삭제 대기 중인 것은 관리자에게도 단어 탭에서는 안 보인다
    .order("name");
  if (error) { box.innerHTML = `<p class="note">단어장을 불러오지 못했어요.</p>`; return; }
  if (!data.length) { box.innerHTML = `<p class="note">아직 단어장이 없어요.</p>`; return; }

  box.innerHTML = data.map(s => `
    <div class="row">
      <div class="m"><div class="t">${esc(s.name)}${s.hidden ? ` <span class="tag hid">숨김</span>` : ""}</div>
        <div class="d">${s.word_count ?? 0}단어</div></div>
      <div class="btns">
        <button class="btn ghost" data-view="${s.id}" data-name="${esc(s.name)}">보기</button>
        <button class="btn coin" data-study="${s.id}" data-name="${esc(s.name)}">공부하기</button>
      </div>
    </div>`).join("");
}

/* 단어 한 줄: 단어 · 뜻 · 첫 표현 */
const senseText = w => (w.senses || []).map(s => [s.pos, s.meaning].filter(Boolean).join(" ")).join("; ");
function wordRow(w) {
  const ph = (w.phrases || [])[0];
  return `<div class="wrow">
    <div class="w">${esc(w.word)}</div>
    <div class="s">${esc(senseText(w)) || "<span class='d'>뜻 없음</span>"}</div>
    ${ph ? `<div class="p">${esc(ph.text)}${ph.meaning ? ` — ${esc(ph.meaning)}` : ""}</div>` : ""}
  </div>`;
}

async function openSet(id, name) {
  $("setViewName").textContent = name;
  $("setViewList").innerHTML = `<p class="note">불러오는 중…</p>`;
  $("setView").hidden = false;
  const { data, error } = await db.from("words")
    .select("word, senses, phrases")
    .eq("set_id", id)
    .order("position");
  $("setViewList").innerHTML = error
    ? `<p class="note">단어를 불러오지 못했어요.</p>`
    : data.map(wordRow).join("") || `<p class="note">단어가 없어요.</p>`;
}

$("sets").addEventListener("click", e => {
  const v = e.target.closest("[data-view]");
  if (v) openSet(v.dataset.view, v.dataset.name);
  const st = e.target.closest("[data-study]");
  if (st) window.dispatchEvent(new CustomEvent("hcu:study", { detail: { id: Number(st.dataset.study), name: st.dataset.name } }));
});

onProfile(() => loadSets());
window.addEventListener("hcu:newday", () => { if (window.hcuProfile) loadSets(); });   // "오늘 받음" 표시를 새로
window.addEventListener("hcu:sets-changed", () => loadSets());   // 관리자가 바꾸면 다시 읽는다
