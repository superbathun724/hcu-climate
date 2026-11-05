/* ==========================================================
   admin.js — 관리 화면: 2단계 인증, 단어 CSV 올리기(덮어쓰기)·내려받기, 단어장 이름 바꾸기·숨기기·
   삭제(7일 대기)·복구, 잠긴 계정, 건의함 내보내기
   모든 변경은 서버 함수(sql/02_words.sql 의 admin_…)로만 한다.
   그 함수들이 관리자인지, 이번 로그인에서 2단계 인증을 했는지 다시 확인하므로,
   이 파일을 고쳐도 학생은 아무것도 못 바꾸고, 비밀번호만 알아낸 사람도 못 바꾼다.
   ========================================================== */
import { db } from "./config.js";
import { $, esc, say, serverMsg, onProfile } from "./ui.js";
import { rowsToWords, nameFromFile, countDuplicates, MAX_ROWS, wordsToCSV } from "./csv.js";

let sets = [];          // 지금 있는 단어장 [{id, name, hidden, count}]
let pending = null;     // 올리기 전 미리보기 중인 단어 목록

const changed = () => window.dispatchEvent(new Event("hcu:sets-changed"));

/* ---------- 단어장 목록 ---------- */
async function loadAdminSets() {
  const { data, error } = await db.from("word_sets")
    .select("id, name, hidden, deleted_at, words(count)")
    .order("name");
  if (error) { $("setAdmin").innerHTML = `<p class="d">불러오지 못했어요.</p>`; return; }
  sets = data.map(s => ({ id: s.id, name: s.name, hidden: s.hidden, deleted_at: s.deleted_at, count: s.words?.[0]?.count ?? 0 }));
  $("setAdmin").innerHTML = sets.length ? sets.map(adminRow).join("") : `<p class="d">아직 단어장이 없어요.</p>`;
}

/* 삭제 대기 중이면 완전히 지워지기까지 남은 날 */
const daysLeft = iso => Math.max(0, Math.ceil((new Date(iso).getTime() + 7 * 864e5 - Date.now()) / 864e5));

function adminRow(s) {
  if (s.deleted_at) return `<div class="arow is-hidden" data-id="${s.id}">
    <div class="ahead">
      <div class="m"><b>${esc(s.name)}</b> <span class="d">${s.count}단어 · 삭제 대기 · ${daysLeft(s.deleted_at)}일 뒤 완전히 지워져요</span></div>
    </div>
    <div class="abtns">
      <button class="btn sm" data-act="restore">복구</button>
      <button class="btn ghost sm" data-act="csv">CSV</button>
    </div>
  </div>`;
  return `<div class="arow${s.hidden ? " is-hidden" : ""}" data-id="${s.id}">
    <div class="ahead">
      <div class="m"><b>${esc(s.name)}</b> <span class="d">${s.count}단어${s.hidden ? " · 숨김" : ""}</span></div>
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
  const { data, error } = await db.from("words")
    .select("word, senses, notes, synonyms, antonyms, phrases, sentences")
    .eq("set_id", s.id).order("position");
  btn.disabled = false;
  if (error) return say($("setMsg"), serverMsg(error));
  saveFile(wordsToCSV(data), `${s.name.replace(/[\\/:*?"<>|]/g, "_")}.csv`);
  say($("setMsg"), `「${s.name}」 ${data.length}단어를 내려받았어요.`, "good");
}

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
};
const DETAIL = d => !d ? "" :
  d.reason === "regular-interval" ? `간격이 일정함 · 평균 ${d.mean_ms}ms · 흔들림 ${Math.round(d.cv * 100)}%` :
  d.reason === "same-spot-fast" ? `같은 자리 · 초당 ${d.per_sec}번` :
  d.reason === "synthetic" ? "스크립트가 만든 누름" :
  d.sent ? `${d.sent}번을 보냄(허용 ${d.allowed}) · ${d.strikes}회` :
  d.taps_today ? `오늘 ${Number(d.taps_today).toLocaleString()}번(기준 ${Number(d.max).toLocaleString()}번)` : "";

async function loadLocks() {
  const { data, error } = await db.rpc("admin_locked");
  if (error) { $("lockList").innerHTML = `<p class="d">불러오지 못했어요.</p>`; return; }
  $("lockList").innerHTML = data.length ? data.map(u => `
    <div class="arow" data-u="${u.user_id}">
      <div class="m"><b>${esc(u.email)}</b> <span class="d">${u.class_id ?? "?"}반 · ${esc(u.club_name ?? "")}</span></div>
      <div class="d">${esc(REASON[u.reason] ?? u.reason)} · ${esc(DETAIL(u.detail))} · ${new Date(u.locked_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}${u.flags > 1 ? ` · 지금까지 ${u.flags}번` : ""}</div>
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
  loadAdminSets(); loadLocks();
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
