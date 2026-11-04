/* ==========================================================
   admin.js — 관리 화면: 단어 CSV 올리기(덮어쓰기), 단어장 이름 바꾸기·숨기기·삭제
   모든 변경은 서버 함수(sql/02_words.sql 의 admin_…)로만 한다.
   그 함수들이 관리자인지 다시 확인하므로, 이 파일을 고쳐도 학생은 아무것도 못 바꾼다.
   ========================================================== */
import { db } from "./config.js";
import { $, esc, say, serverMsg, onProfile } from "./ui.js";
import { rowsToWords, nameFromFile, countDuplicates, MAX_ROWS } from "./csv.js";

let sets = [];          // 지금 있는 단어장 [{id, name, hidden, count}]
let pending = null;     // 올리기 전 미리보기 중인 단어 목록

const changed = () => window.dispatchEvent(new Event("hcu:sets-changed"));

/* ---------- 단어장 목록 ---------- */
async function loadAdminSets() {
  const { data, error } = await db.from("word_sets")
    .select("id, name, hidden, words(count)")
    .order("name");
  if (error) { $("setAdmin").innerHTML = `<p class="d">불러오지 못했어요.</p>`; return; }
  sets = data.map(s => ({ id: s.id, name: s.name, hidden: s.hidden, count: s.words?.[0]?.count ?? 0 }));
  $("setAdmin").innerHTML = sets.length ? sets.map(adminRow).join("") : `<p class="d">아직 단어장이 없어요.</p>`;
}

function adminRow(s) {
  return `<div class="arow${s.hidden ? " is-hidden" : ""}" data-id="${s.id}">
    <div class="ahead">
      <div class="m"><b>${esc(s.name)}</b> <span class="d">${s.count}단어${s.hidden ? " · 숨김" : ""}</span></div>
    </div>
    <div class="abtns">
      <button class="btn ghost sm" data-act="rename">이름</button>
      <button class="btn ghost sm" data-act="hide">${s.hidden ? "보이기" : "숨기기"}</button>
      <button class="btn danger sm" data-act="delete">삭제</button>
    </div>
    <div class="aedit" hidden>
      <input maxlength="60" value="${esc(s.name)}">
      <button class="btn sm" data-act="save">저장</button>
      <button class="btn ghost sm" data-act="cancel">취소</button>
    </div>
  </div>`;
}

/* 삭제는 두 번 눌러야 한다. 처음 누르면 버튼이 "정말 삭제"로 바뀌고 4초 뒤 되돌아간다.
   브라우저 확인창(confirm)은 폰에서 놓치기 쉬워 쓰지 않는다. */
const armed = new Map();
function armDelete(btn) {
  if (armed.has(btn)) return true;
  btn.textContent = "정말 삭제";
  btn.classList.add("armed");
  armed.set(btn, setTimeout(() => {
    armed.delete(btn); btn.textContent = "삭제"; btn.classList.remove("armed");
  }, 4000));
  return false;
}

$("setAdmin").addEventListener("click", async e => {
  const btn = e.target.closest("[data-act]"); if (!btn) return;
  const row = btn.closest(".arow"), id = Number(row.dataset.id);
  const s = sets.find(x => x.id === id);
  const msg = $("setMsg");
  const act = btn.dataset.act;

  if (act === "rename") { row.querySelector(".aedit").hidden = false; row.querySelector(".aedit input").focus(); return; }
  if (act === "cancel") { row.querySelector(".aedit").hidden = true; return; }

  let call;
  if (act === "save") {
    const name = row.querySelector(".aedit input").value;
    call = db.rpc("admin_rename_set", { p_set: id, p_name: name });
  } else if (act === "hide") {
    call = db.rpc("admin_set_hidden", { p_set: id, p_hidden: !s.hidden });
  } else if (act === "delete") {
    if (!armDelete(btn)) return;
    clearTimeout(armed.get(btn)); armed.delete(btn);
    call = db.rpc("admin_delete_set", { p_set: id });
  } else return;

  row.querySelectorAll("button").forEach(b => b.disabled = true);
  const { error } = await call;
  if (error) {
    row.querySelectorAll("button").forEach(b => b.disabled = false);
    return say(msg, serverMsg(error));
  }
  say(msg,
    act === "save"   ? "이름을 바꿨어요." :
    act === "hide"   ? (s.hidden ? `「${s.name}」 단어장을 다시 보이게 했어요.` : `「${s.name}」 단어장을 숨겼어요.`) :
                       `「${s.name}」 단어장을 삭제했어요.`, "good");
  await loadAdminSets();
  changed();
});

/* ---------- CSV 올리기 ---------- */
function resetUpload() {
  pending = null;
  $("upFile").value = "";
  $("upPreview").hidden = true;
}

function describe() {
  const name = $("upName").value.trim();
  const same = sets.find(s => s.name === name);
  const dup = countDuplicates(pending);
  const first = pending.slice(0, 3).map(w => w.word).join(", ");
  $("upInfo").innerHTML =
    `${pending.length}줄 · 처음 단어: ${esc(first)}${pending.length > 3 ? " …" : ""}` +
    (dup ? `<br>같은 단어가 ${dup}번 겹쳐요. 뒤에 나온 줄을 써요.` : "") +
    (same ? `<br><b class="warn">「${esc(name)}」 단어장이 이미 있어요. 덮어쓰면 CSV에 없는 단어는 지워지고, 같은 단어는 학생 진도가 그대로 남아요.</b>` : "");
  $("upGo").textContent = same ? "덮어쓰기" : "올리기";
}

$("upFile").addEventListener("change", async () => {
  const f = $("upFile").files[0];
  say($("upMsg"), "");
  if (!f) return;
  if (f.size > 2_000_000) { resetUpload(); return say($("upMsg"), "파일이 너무 커요(2MB까지)."); }

  let words;
  try { words = rowsToWords(await f.text()); }
  catch { resetUpload(); return say($("upMsg"), "CSV를 읽지 못했어요. 형식을 확인해 주세요."); }

  if (!words.length) { resetUpload(); return say($("upMsg"), "단어가 하나도 없어요. 첫 줄이 word,senses,… 로 시작하는지 확인해 주세요."); }
  if (words.length > MAX_ROWS) { resetUpload(); return say($("upMsg"), `한 번에 ${MAX_ROWS.toLocaleString()}줄까지 올릴 수 있어요. 지금 ${words.length.toLocaleString()}줄이에요.`); }

  pending = words;
  $("upName").value = nameFromFile(f.name);
  $("upPreview").hidden = false;
  describe();
});

$("upName").addEventListener("input", () => pending && describe());
$("upCancel").addEventListener("click", () => { resetUpload(); say($("upMsg"), ""); });

$("upGo").addEventListener("click", async () => {
  if (!pending) return;
  const btn = $("upGo");
  btn.disabled = true;
  const { data, error } = await db.rpc("admin_upload_set", { p_name: $("upName").value, p_words: pending });
  btn.disabled = false;
  if (error) return say($("upMsg"), serverMsg(error));

  say($("upMsg"), data.created
    ? `「${data.name}」 단어장을 만들었어요. 단어 ${data.added}개.`
    : `「${data.name}」 단어장을 덮어썼어요. 추가 ${data.added} · 바뀜 ${data.updated} · 삭제 ${data.removed}`, "good");
  resetUpload();
  await loadAdminSets();
  changed();
});

/* 관리자에게만 목록을 읽는다. 학생에게는 관리 화면 링크도 안 보인다. */
onProfile(p => { if (p.isAdmin) loadAdminSets(); });
