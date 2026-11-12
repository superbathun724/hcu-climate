/* ==========================================================
   admin.js — 관리 화면: 2단계 인증, 단어 CSV 올리기(덮어쓰기)·내려받기, 단어장 이름 바꾸기·숨기기·
   삭제(7일 대기)·복구, 잠긴 계정, 건의함 내보내기, 보안 기록(sql/08_audit.sql)
   모든 변경은 서버 함수(sql/02_words.sql 의 admin_…)로만 한다.
   그 함수들이 관리자인지, 이번 로그인에서 2단계 인증을 했는지 다시 확인하므로,
   이 파일을 고쳐도 학생은 아무것도 못 바꾸고, 비밀번호만 알아낸 사람도 못 바꾼다.
   ========================================================== */
import { db } from "./config.js";
import { $, esc, say, serverMsg, onProfile, mis } from "./ui.js";
import { rowsToWords, nameFromFile, countDuplicates, MAX_ROWS, wordsToCSV } from "./csv.js";

let sets = [];          // 지금 있는 단어장 [{id, name, hidden, count}]
let pending = null;     // 올리기 전 미리보기 중인 단어 목록

const changed = () => window.dispatchEvent(new Event("hcu:sets-changed"));

/* ---------- 단어장 목록 ---------- */
async function loadAdminSets() {
  const { data, error } = await db.from("word_sets")
    .select("id, name, hidden, deleted_at, word_count")   // word_count: sql/02_words.sql 계산 열
    .order("name");
  if (error) { $("setAdmin").innerHTML = `<p class="d">불러오지 못했어요.</p>`; return; }
  sets = data.map(s => ({ id: s.id, name: s.name, hidden: s.hidden, deleted_at: s.deleted_at, count: s.word_count ?? 0 }));
  $("setAdmin").innerHTML = sets.length ? sets.map(adminRow).join("") : `<p class="d">아직 단어장이 없어요.</p>`;
}

/* 삭제 대기 중이면 완전히 지워지기까지 남은 날 */
const daysLeft = iso => Math.max(0, Math.ceil((new Date(iso).getTime() + 7 * 864e5 - Date.now()) / 864e5));

function adminRow(s) {
  if (s.deleted_at) return `<div class="arow is-hidden" data-id="${s.id}">
    <div class="ahead">
      <div class="m"><b>${esc(s.name)}</b> <span class="d">${mis(`${s.count}단어`, "삭제 대기", `${daysLeft(s.deleted_at)}일 뒤 완전히 지워져요`)}</span></div>
    </div>
    <div class="abtns">
      <button class="btn sm" data-act="restore">복구</button>
      <button class="btn ghost sm" data-act="csv">CSV</button>
    </div>
  </div>`;
  return `<div class="arow${s.hidden ? " is-hidden" : ""}" data-id="${s.id}">
    <div class="ahead">
      <div class="m"><b>${esc(s.name)}</b> <span class="d">${mis(`${s.count}단어`, s.hidden ? "숨김" : "")}</span></div>
    </div>
    <div class="abtns">
      <button class="btn ghost sm" data-act="rename">이름</button>
      <button class="btn ghost sm" data-act="hide">${s.hidden ? "보이기" : "숨기기"}</button>
      <button class="btn ghost sm" data-act="csv">CSV</button>
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
  if (act === "csv") return downloadSet(s, btn);
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
  } else if (act === "restore") {
    call = db.rpc("admin_restore_set", { p_set: id });
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
    act === "restore" ? `「${s.name}」 단어장을 복구했어요.` :
                       `「${s.name}」 단어장을 삭제 대기로 옮겼어요. 7일 안에 복구할 수 있어요.`, "good");
  await loadAdminSets();
  changed();
});

/* ---------- 단어장 내려받기 (백업) ----------
   올리기와 같은 형식이라 그대로 다시 올릴 수 있다. 학생 진도는 들어가지 않는다. */
function saveFile(text, filename) {
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);          // 문서에 붙여야 파일 이름(download)이 지켜지는 브라우저가 있다
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function downloadSet(s, btn) {
  btn.disabled = true;
  // 학생 계정이 못 읽는 열(유의어·반의어·예문)까지 담아야 해서 관리자 함수로 받는다(sql/02_words.sql)
  const { data, error } = await db.rpc("admin_export_set", { p_set: s.id });
  btn.disabled = false;
  if (error || data?.error) return say($("setMsg"), error ? serverMsg(error) : data.error);
  saveFile(wordsToCSV(data), `${s.name.replace(/[\\/:*?"<>|]/g, "_")}.csv`);
  say($("setMsg"), `「${s.name}」 ${data.length}단어를 내려받았어요.`, "good");
}

/* ---------- CSV 올리기 ---------- */
// 여러 파일을 한 번에: 파일마다 단어장 하나. [{name, words, file, error}]
const MAX_FILES = 30;
function resetUpload() {
  pending = null;
  $("upFile").value = "";
  $("upPreview").hidden = true;
  $("upList").innerHTML = "";
}

function describe() {
  const ok = pending.filter(f => !f.error);
  $("upList").innerHTML = pending.map((f, i) => {
    if (f.error) return `<div class="arow"><div class="m"><b>${esc(f.file)}</b></div><div class="d warn">${esc(f.error)} 이 파일은 건너뛰어요.</div></div>`;
    const same = sets.find(s => s.name === f.name.trim());
    const dupNames = pending.filter(g => !g.error && g.name.trim() === f.name.trim()).length > 1;
    const dup = countDuplicates(f.words);
    const first = f.words.slice(0, 3).map(w => w.word).join(", ");
    return `<div class="arow">
      <label class="lbl" for="upName${i}">단어장 이름 (${esc(f.file)})</label>
      <input id="upName${i}" data-i="${i}" maxlength="60" value="${esc(f.name)}">
      <div class="d">${f.words.length}줄, 처음 단어: ${esc(first)}${f.words.length > 3 ? " …" : ""}${dup ? `, 같은 단어 ${dup}번 겹침(뒤에 나온 줄을 써요)` : ""}</div>
      ${same ? `<div class="d warn">「${esc(f.name.trim())}」 단어장이 이미 있어요. 덮어쓰면 CSV에 없는 단어는 지워지고, 같은 단어는 학생 진도가 그대로 남아요.</div>` : ""}
      ${dupNames ? `<div class="d warn">같은 이름이 두 번 있어요. 나중 파일이 앞 파일을 덮어써요. 이름을 바꿔 주세요.</div>` : ""}
    </div>`;
  }).join("");
  const over = ok.filter(f => sets.some(s => s.name === f.name.trim())).length;
  $("upInfo").textContent = ok.length ? `단어장 ${ok.length}개를 올려요${over ? ` (그중 ${over}개는 덮어쓰기)` : ""}.` : "올릴 수 있는 파일이 없어요.";
  $("upGo").disabled = !ok.length;
  $("upGo").textContent = ok.length > 1 ? `${ok.length}개 올리기` : over ? "덮어쓰기" : "올리기";
}

$("upFile").addEventListener("change", async () => {
  const files = [...$("upFile").files];
  say($("upMsg"), "");
  if (!files.length) return;
  if (files.length > MAX_FILES) { resetUpload(); return say($("upMsg"), `한 번에 ${MAX_FILES}개 파일까지 올릴 수 있어요.`); }
  pending = [];
  for (const f of files) {
    const item = { file: f.name, name: nameFromFile(f.name), words: [], error: null };
    if (f.size > 2_000_000) item.error = "파일이 너무 커요(2MB까지).";
    else {
      try { item.words = rowsToWords(await f.text()); }
      catch { item.error = "CSV를 읽지 못했어요. 형식을 확인해 주세요."; }
      if (!item.error && !item.words.length) item.error = "단어가 하나도 없어요. 첫 줄이 word,senses,… 로 시작하는지 확인해 주세요.";
      if (!item.error && item.words.length > MAX_ROWS) item.error = `한 파일에 ${MAX_ROWS.toLocaleString()}줄까지예요. 지금 ${item.words.length.toLocaleString()}줄.`;
    }
    pending.push(item);
  }
  $("upPreview").hidden = false;
  describe();
});

$("upList").addEventListener("input", e => {
  const i = e.target.dataset?.i; if (i == null || !pending) return;
  pending[i].name = e.target.value;
  clearTimeout(describe.t); describe.t = setTimeout(() => {          // 입력 중에는 다시 그리지 않고, 멈추면 경고만 새로
    const at = document.activeElement?.id, pos = document.activeElement?.selectionStart;
    describe();
    if (at) { const el = $(at); el?.focus(); el?.setSelectionRange?.(pos, pos); }
  }, 400);
});
$("upCancel").addEventListener("click", () => { resetUpload(); say($("upMsg"), ""); });

$("upGo").addEventListener("click", async () => {
  if (!pending) return;
  const todo = pending.filter(f => !f.error);
  const btn = $("upGo"); btn.disabled = true; $("upCancel").disabled = true;
  const done = [], failed = [];
  for (const [k, f] of todo.entries()) {
    say($("upMsg"), `올리는 중… ${k + 1} / ${todo.length} 「${f.name.trim()}」`);
    const { data, error } = await db.rpc("admin_upload_set", { p_name: f.name, p_words: f.words });
    if (error || data?.error) { failed.push(`「${f.name.trim()}」: ${error ? serverMsg(error) : data.error}`); continue; }
    done.push(data.created ? `「${data.name}」 새로 ${data.added}단어` : `「${data.name}」 덮어씀(추가 ${data.added}, 바뀜 ${data.updated}, 삭제 ${data.removed})`);
  }
  btn.disabled = false; $("upCancel").disabled = false;
  say($("upMsg"), [done.length ? `${done.length}개 올렸어요. ${done.join(", ")}` : "", failed.length ? `실패 ${failed.length}개: ${failed.join(" / ")}` : ""].filter(Boolean).join("  "), failed.length ? "" : "good");
  resetUpload();
  await loadAdminSets();
  changed();
});

/* ---------- 건의함 내보내기 (학교에 전달할 때) ----------
   글쓴이는 서버가 아예 돌려주지 않으므로 내보내기에도 없다. */
const deFormula = v => /^[=+\-@\t\r]/.test(v) ? "'" + v : v;          // 엑셀 수식 방지 (voca-web 과 같음)
const cell = v => { const s = deFormula(String(v ?? "")); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const day = iso => iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";

async function suggestions() {
  const { data, error } = await db.rpc("list_suggestions", { p_sort: "top" });
  if (error) { say($("exMsg"), serverMsg(error)); return null; }
  return data;
}

$("exCsv").addEventListener("click", async () => {
  const rows = await suggestions(); if (!rows) return;
  const head = ["번호", "올린 때", "건의", "공감", "답변", "답변한 때", "숨김"];
  const lines = [head.join(","), ...rows.map(r =>
    [r.id, day(r.created_at), r.body, r.votes, r.answer ?? "", day(r.answered_at), r.hidden ? "숨김" : ""].map(cell).join(","))];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `건의함_${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })}.csv`;
  document.body.appendChild(a);          // 문서에 붙여야 파일 이름(download)이 지켜지는 브라우저가 있다
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  say($("exMsg"), `${rows.length}개를 내려받았어요(공감순).`, "good");
});

$("exCopy").addEventListener("click", async () => {
  const rows = await suggestions(); if (!rows) return;
  const text = rows.filter(r => !r.hidden).map((r, i) =>
    `${i + 1}. ${r.body} (공감 ${r.votes})${r.answer ? `\n   → 답변: ${r.answer}` : ""}`).join("\n");
  try { await navigator.clipboard.writeText(text); say($("exMsg"), `숨기지 않은 글 ${rows.filter(r => !r.hidden).length}개를 복사했어요.`, "good"); }
  catch { say($("exMsg"), "복사하지 못했어요. CSV 내려받기를 써 주세요."); }
});

/* ---------- 잠긴 계정 ---------- */
const REASON = {
  "tap-pattern": "누르는 패턴이 기계 같음",
  "too-fast": "사람 속도보다 훨씬 많이 보냄(서버)",
  "too-many": "하루에 사람이 낼 수 없는 만큼 누름(서버)",
  "quiz-pattern": "단어 문제 답하는 간격이 기계처럼 일정함(서버)",
};
const DETAIL = d => !d ? "" :
  d.reason === "regular-interval" ? `간격이 일정함 · 평균 ${d.mean_ms}ms · 흔들림 ${Math.round(d.cv * 100)}%` :
  d.reason === "same-spot-fast" ? `같은 자리, 초당 ${d.per_sec}번` :
  d.reason === "synthetic" ? "스크립트가 만든 누름" :
  d.sent ? `${d.sent}번을 보냄(허용 ${d.allowed}), ${d.strikes}회` :
  d.mean_s ? `최근 ${d.n}번 · 평균 ${d.mean_s}초 간격 · 흔들림 ${Math.round(d.cv * 100)}%` :
  d.taps_today ? `오늘 ${Number(d.taps_today).toLocaleString()}번(기준 ${Number(d.max).toLocaleString()}번)` : "";

async function loadLocks() {
  const { data, error } = await db.rpc("admin_locked");
  if (error) { $("lockList").innerHTML = `<p class="d">불러오지 못했어요.</p>`; return; }
  $("lockList").innerHTML = data.length ? data.map(u => `
    <div class="arow" data-u="${u.user_id}">
      <div class="m"><b>${esc(u.email)}</b> <span class="d">${mis(`${u.class_id ?? "?"}반`, esc(u.club_name ?? ""))}</span></div>
      <div class="d">${mis(esc(REASON[u.reason] ?? u.reason), esc(DETAIL(u.detail)), new Date(u.locked_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }), u.flags > 1 ? `지금까지 ${u.flags}번` : "")}</div>
      <div class="abtns"><button class="btn sm" data-unlock>잠금 풀기</button></div>
    </div>`).join("") : `<p class="d">잠긴 계정이 없어요.</p>`;
  const n = data.length;
  document.querySelector("#adminLink a").classList.toggle("dot", n > 0);
}

$("lockList").addEventListener("click", async e => {
  const b = e.target.closest("[data-unlock]"); if (!b) return;
  const row = b.closest(".arow");
  b.disabled = true;
  const { error } = await db.rpc("admin_unlock", { p_user: row.dataset.u });
  if (error) { b.disabled = false; return say($("lockMsg"), serverMsg(error)); }
  say($("lockMsg"), "잠금을 풀었어요. 그 학생은 새로고침하면 다시 쓸 수 있어요.", "good");
  loadLocks();
});
window.addEventListener("hcu:tab", e => { if (e.detail === "admin" && window.hcuProfile?.adminOk) loadLocks(); });

/* ---------- 보안 기록 (sql/08_audit.sql) ----------
   사고가 났을 때 증거로 쓰는 기록. 서버 함수 admin_audit 이 관리자·2단계 인증을 확인하고,
   찾아본 사실도 기록에 남긴다. 화면에서는 고치거나 지울 수 없다(DB 가 막는다). */
const ACTION = {
  visit: "접속", admin_call: "관리 기능 사용", admin_denied: "관리 기능 시도(거부됨)",
  admin_added: "관리자 추가", admin_removed: "관리자 삭제", lock: "계정 잠김", unlock: "잠금 풀림",
  tap_flag: "탭 이상 표시", quiz_pause: "단어 코인 쉬어 감", send: "코인 보내기",
  infra_vote: "시설 투표", infra_build: "시설 지음", suggestion_post: "건의 글", suggestion_mod: "건의 관리",
  wordset_create: "단어장 만듦", wordset_update: "단어장 바뀜", wordset_delete: "단어장 지움", audit_purge: "오래된 기록 지움",
  survey_pre: "사전 설문", final_submit: "최종 제출(사후 설문)", final_open: "최종 제출 열림", final_close: "최종 제출 닫힘·순위 확정",
  launch_reset: "배포 초기화",
};
let auditRows = [];
const auditArgs = limit => {
  const days = Number($("auPeriod").value);
  return { p_since: new Date(Date.now() - days * 864e5).toISOString(), p_until: new Date().toISOString(),
           p_query: $("auQuery").value.trim() || null, p_limit: limit };
};
const detailText = d => Object.entries(d || {}).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ");

async function loadAudit() {
  $("auFind").disabled = true;
  const { data, error } = await db.rpc("admin_audit", auditArgs(300));
  $("auFind").disabled = false;
  if (error) return say($("auMsg"), serverMsg(error));
  auditRows = data ?? [];
  $("auList").innerHTML = auditRows.length ? auditRows.map(r => `
    <div class="arow${r.action === "admin_denied" ? " warn" : ""}">
      <div class="m"><b>${esc(ACTION[r.action] ?? r.action)}</b> <span class="d">${mis(esc(day(r.at)), esc(r.who ?? "시스템"), esc(r.ip ?? "IP 없음"))}</span></div>
      <div class="d">${esc(detailText(r.detail)).slice(0, 300)}</div>
    </div>`).join("") : `<p class="d">이 기간에 맞는 기록이 없어요.</p>`;
  say($("auMsg"), `${auditRows.length}줄${auditRows.length === 300 ? " (최근 300줄만 보여요. 전부는 CSV로)" : ""}`, "good");
}
$("auFind").addEventListener("click", loadAudit);
$("auQuery").addEventListener("keydown", e => { if (e.key === "Enter") loadAudit(); });

$("auCsv").addEventListener("click", async () => {
  const b = $("auCsv"); b.disabled = true;
  const { data, error } = await db.rpc("admin_audit", auditArgs(5000));
  b.disabled = false;
  if (error) return say($("auMsg"), serverMsg(error));
  const head = ["id", "시각(한국)", "시각(UTC)", "누구(학생은 계정 코드)", "종류", "내용", "IP(학생은 앞 세 자리)", "브라우저", "앞 줄 해시", "해시"];
  const lines = [head.join(",")].concat((data ?? []).slice().reverse().map(r =>
    [r.id, day(r.at), r.at, r.who, `${ACTION[r.action] ?? ""} (${r.action})`, JSON.stringify(r.detail), r.ip, r.user_agent, r.prev_hash, r.hash].map(cell).join(",")));
  const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(/[: ]/g, "-");
  saveFile(lines.join("\n"), `보안기록_${stamp}.csv`);
  say($("auMsg"), `${(data ?? []).length}줄을 내려받았어요. 파일을 고치지 말고 그대로 보관하세요.`, "good");
});

$("auVerify").addEventListener("click", async () => {
  const b = $("auVerify"); b.disabled = true;
  const { data, error } = await db.rpc("audit_verify");
  b.disabled = false;
  if (error || data?.error) return say($("auMsg"), error ? serverMsg(error) : data.error);
  say($("auMsg"), data.ok
    ? `무결성 확인: ${data.checked}줄 모두 이어져 있어요. 마지막 해시 ${String(data.last_hash ?? "").slice(0, 16)}…`
    : `무결성 문제: ${data.broken_at}번 줄에서 끊겼어요. ${data.why}. 지금 CSV를 내려받아 보관하고 관리자들에게 알려 주세요.`, data.ok ? "good" : "");
});


/* ---------- 설문과 최종 제출 (sql/09_survey.sql) ---------- */
const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : "0%";
const fx = v => v == null ? "–" : Number(v).toFixed(2);
async function loadSurveyAdmin() {
  const { data, error } = await db.rpc("admin_survey_summary");
  if (error || data?.error) { $("svAdm").innerHTML = `<p class="d">${esc(error ? "설문 기능이 아직 없어요(sql/09_survey.sql 을 돌려 주세요)." : data.error)}</p>`; return; }
  const f = data.final || {};
  $("finOpen").disabled = !!f.open;
  $("finClose").disabled = !f.open;
  $("svAdm").innerHTML = `
    <p class="d">${mis(`최종 제출 ${f.open ? "<b>열림</b>" : f.closed ? "닫힘(확정됨)" : "아직 안 열림"}`,
      `가입 ${data.members}명`, `사전 ${data.pre}명 (${pct(data.pre, data.members)})`, `사후 ${data.post}명`, `둘 다 ${data.paired}명`,
      `교사 ${data.teachers}명`, `배포 전 가입 ${data.late}명`, data.fast ? `30초 안에 낸 응답 ${data.fast}개` : "")}</p>
    <div class="svsum">
      <div class="svr svh"><span>문항</span><span>사전</span><span>사후</span><span>같은 사람 변화</span></div>
      ${(data.items ?? []).map(it => `<div class="svr"><span>${it.pos}. ${esc(it.body)}</span>
        <span>${fx(it.pre_mean)} <small>(${it.pre_n})</small></span><span>${fx(it.post_mean)} <small>(${it.post_n})</small></span>
        <span>${it.paired_change == null ? "–" : (it.paired_change > 0 ? "+" : "") + Number(it.paired_change).toFixed(2)} <small>(${it.paired_n})</small></span></div>`).join("")}
    </div>
    <p class="d">평균은 1(전혀 아니다)~5(매우 그렇다), “응답하지 않음”은 빼고 계산해요. 괄호는 응답 수예요. 반별 응답 수: ${(data.by_class ?? []).map(c => `${esc(c.name)} ${c.pre}/${c.post}`).join(", ")} (사전/사후)</p>`;
}

const armClose = { t: 0 };
$("finOpen").addEventListener("click", async () => {
  const b = $("finOpen"); b.disabled = true;
  const { data, error } = await db.rpc("admin_final_set", { p_open: true });
  if (error || data?.error) { b.disabled = false; return say($("svAdmMsg"), error ? serverMsg(error) : data.error); }
  say($("svAdmMsg"), "최종 제출을 열었어요. 학생 화면에는 몇 분 안에(또는 새로고침하면 바로) 사후 설문 안내가 떠요.", "good");
  loadSurveyAdmin();
});
$("finClose").addEventListener("click", async () => {
  const b = $("finClose");
  if (!armClose.t) {
    b.textContent = "정말 닫고 확정"; b.classList.add("armed");
    armClose.t = setTimeout(() => { armClose.t = 0; b.textContent = "닫고 확정"; b.classList.remove("armed"); }, 4000);
    return;
  }
  clearTimeout(armClose.t); armClose.t = 0; b.textContent = "닫고 확정"; b.classList.remove("armed");
  b.disabled = true;
  const { data, error } = await db.rpc("admin_final_set", { p_open: false });
  if (error || data?.error) { b.disabled = false; return say($("svAdmMsg"), error ? serverMsg(error) : data.error); }
  const top = data.result?.classes?.[0];
  say($("svAdmMsg"), `최종 순위를 확정했어요.${top ? ` 1등: ${top.name} (한 사람당 ${top.per_capita ?? 0})` : ""} 순위 탭 맨 위에 보여요.`, "good");
  loadSurveyAdmin();
});
$("svRefresh").addEventListener("click", loadSurveyAdmin);
window.addEventListener("hcu:tab", e => { if (e.detail === "admin" && window.hcuProfile?.adminOk && !$("adminTools").hidden) loadSurveyAdmin(); });
$("svCsv").addEventListener("click", async () => {
  const b = $("svCsv"); b.disabled = true;
  const { data, error } = await db.rpc("admin_survey_export");
  b.disabled = false;
  if (error) return say($("svAdmMsg"), serverMsg(error));
  const rows = data ?? [];
  const ids = [...new Set(rows.flatMap(r => [...Object.keys(r.pre_answers ?? {}), ...Object.keys(r.post_answers ?? {})]))].map(Number).sort((a, b) => a - b);
  const head = ["계정코드", "반", "동아리", "교사", "배포전가입", "사전_걸린초", "사전_시각", "사후_걸린초", "사후_시각", "최종점수",
    ...ids.map(i => `사전_${i}`), ...ids.map(i => `사후_${i}`)];
  const sec = ms => ms == null ? "" : Math.round(ms / 1000);
  const lines = [head.join(",")].concat(rows.map(r => [r.code, r.class_id, r.club, r.is_teacher ? 1 : 0, r.late ? 1 : 0,
    sec(r.pre_ms), day(r.pre_at), sec(r.post_ms), day(r.post_at), r.final_score ?? "",
    ...ids.map(i => r.pre_answers?.[i] ?? ""), ...ids.map(i => r.post_answers?.[i] ?? "")].map(cell).join(",")));
  const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(/[: ]/g, "-");
  saveFile(lines.join("\n"), `설문응답_${stamp}.csv`);
  say($("svAdmMsg"), `${rows.length}명의 응답을 내려받았어요. 0 은 “응답하지 않음”, 빈칸은 안 낸 것이에요. 문항 번호는 sql/09_survey.sql 에 있어요.`, "good");
});

/* ---------- 2단계 인증 (휴대폰 인증 앱의 6자리) ----------
   관리자는 비밀번호 + 인증 앱 6자리를 둘 다 알아야 관리 기능을 쓴다(서버 admin_ok 가 확인).
   처음 한 번은 인증 앱에 이 사이트를 연결(QR 찍기)하고, 그 뒤로는 로그인할 때마다 6자리만 넣는다. */
let factorId = null;

function mfaDone() {
  $("mfaBody").innerHTML = `<p class="d">이번 로그인은 2단계 인증을 마쳤어요. 관리 기능을 쓸 수 있어요.</p>`;
  $("adminTools").hidden = false;
  if (window.hcuProfile && !window.hcuProfile.adminOk) {
    window.hcuProfile.adminOk = true;
    window.dispatchEvent(new Event("hcu:admin-ok"));
  }
  loadAdminSets(); loadLocks(); loadSurveyAdmin();
}

const codeForm = (label, btn) => `
  <label class="lbl" for="mfaCode">${label}</label>
  <div class="frow"><input id="mfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="6자리">
  <button class="btn" id="mfaGo">${btn}</button></div>`;

async function mfaInit() {
  $("adminTools").hidden = true;
  say($("mfaMsg"), "");
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") return mfaDone();

  const { data: f, error } = await db.auth.mfa.listFactors();
  if (error) return say($("mfaMsg"), serverMsg(error));
  const ready = (f?.totp ?? []).find(x => x.status === "verified");
  if (ready) {
    factorId = ready.id;
    $("mfaBody").innerHTML = `<p class="d">휴대폰 인증 앱에 보이는 "hcu-climate" 6자리를 넣어 주세요.</p>` + codeForm("인증 앱 6자리", "확인");
  } else {
    factorId = null;
    $("mfaBody").innerHTML = `<p class="d">관리 기능을 쓰려면 먼저 휴대폰 인증 앱(Google Authenticator, Microsoft Authenticator 등)을 연결해야 해요.
      비밀번호가 새어 나가도 이 휴대폰이 없으면 관리 기능을 쓸 수 없게 돼요.</p>
      <button class="btn" id="mfaEnroll">인증 앱 연결하기</button>`;
  }
}

async function enroll() {
  say($("mfaMsg"), "");
  // 연결하다 만 것(확인 전)이 남아 있으면 지우고 새로 만든다
  const { data: f } = await db.auth.mfa.listFactors();
  for (const x of (f?.all ?? []).filter(x => x.factor_type === "totp" && x.status !== "verified"))
    await db.auth.mfa.unenroll({ factorId: x.id });
  const { data, error } = await db.auth.mfa.enroll({ factorType: "totp", friendlyName: "hcu-climate", issuer: "hcu-climate" });
  if (error) return say($("mfaMsg"), serverMsg(error));
  factorId = data.id;
  const qr = data.totp.qr_code.startsWith("data:") ? data.totp.qr_code
           : "data:image/svg+xml;utf-8," + encodeURIComponent(data.totp.qr_code);
  $("mfaBody").innerHTML = `
    <p class="d">1. 휴대폰 인증 앱에서 "QR 코드 스캔"으로 아래를 찍어요. 찍을 수 없으면 키를 직접 넣어요.</p>
    <img class="mfaqr" alt="인증 앱 연결용 QR 코드" src="${esc(qr)}">
    <p class="d">키: <code>${esc(data.totp.secret)}</code></p>
    <p class="d">2. 앱에 생긴 "hcu-climate" 6자리를 넣으면 연결이 끝나요.</p>` + codeForm("인증 앱 6자리", "연결 마치기");
}

async function verify() {
  const code = ($("mfaCode")?.value ?? "").trim();
  if (!/^\d{6}$/.test(code)) return say($("mfaMsg"), "6자리 숫자를 넣어 주세요.");
  $("mfaGo").disabled = true;
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code });
  $("mfaGo").disabled = false;
  if (error) return say($("mfaMsg"), /invalid|expired/i.test(error.message) ? "6자리가 맞지 않아요. 앱에 지금 보이는 숫자로 다시 넣어 주세요." : serverMsg(error));
  say($("mfaMsg"), "");
  mfaDone();
}

$("mfaCard").addEventListener("click", e => {
  if (e.target.id === "mfaEnroll") enroll();
  if (e.target.id === "mfaGo") verify();
});
$("mfaCard").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "mfaCode") verify(); });

/* 관리자에게만. 학생에게는 관리 화면 링크도 안 보인다. */
onProfile(p => { if (p.isAdmin) mfaInit(); });
window.addEventListener("hcu:signout", () => { $("adminTools").hidden = true; factorId = null; });
