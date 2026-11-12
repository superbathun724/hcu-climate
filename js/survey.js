/* ==========================================================
   survey.js — 인식 변화 설문 (sql/09_survey.sql)
   - 사전 설문: 로그인하면 아직 안 낸 사람에게 화면 전체로 뜬다. 내기 전에는 닫을 수 없고,
     서버도 탭·보내기·단어 코인을 막는다(sql assert_surveyed). 이미 가입한 사람도 다음 로그인 때 뜬다.
   - 사후 설문: 관리자가 최종 제출을 열면 위에 띠가 뜨고, 설문을 내는 순간의 점수가 최종 점수가 된다.
   - 최종 결과: 관리자가 닫으면 순위 탭 맨 위에 최종 순위가 보인다.
   ========================================================== */
import { db } from "./config.js";
import { $, esc, say, serverMsg, onProfile, num1, mis, tick } from "./ui.js";

const SCALE = [[1, "전혀 아니다"], [2, "아니다"], [3, "보통"], [4, "그렇다"], [5, "매우 그렇다"], [0, "응답하지 않음"]];
let state = null;       // survey_state() 결과
let phase = null;       // 지금 화면에 띄운 설문 'pre' | 'post'
let openedAt = 0;
let busy = false;

async function check() {
  if (!window.hcuProfile) return;
  const { data, error } = await db.rpc("survey_state");
  if (error) return;                       // 09 를 아직 안 돌린 서버면 설문 없이 그대로
  state = data;
  drawBar();
  if (data.need === "pre") open("pre");
  else if (phase === "pre") close();
}

function drawBar() {
  const bar = $("finalBar");
  if (!state?.final_open) { bar.hidden = true; return; }
  bar.hidden = false;
  if (state.post_done) {
    $("finalTxt").textContent = `최종 제출을 마쳤어요. 내 최종 점수 ${Number(state.final_score ?? 0).toLocaleString()}`;
    $("finalGo").hidden = true;
  } else {
    $("finalTxt").textContent = "최종 제출 기간이에요. 사후 설문을 내야 내 점수가 최종 순위에 들어가요.";
    $("finalGo").hidden = false;
  }
}

function question(q, i) {
  const n = i + 1, name = `sv${q.id}`;
  if (q.kind === "text") return `<div class="svq" data-id="${q.id}" data-kind="text">
      <label class="svt" for="${name}"><span class="svn">${n}</span>${esc(q.body)}${q.required ? "" : ` <small>(선택)</small>`}</label>
      <textarea id="${name}" maxlength="500" rows="2"></textarea>
    </div>`;
  return `<fieldset class="svq" data-id="${q.id}" data-kind="likert">
      <legend class="svt"><span class="svn">${n}</span>${esc(q.body)}</legend>
      <div class="lks">${SCALE.map(([v, t]) => `<label class="lk${v === 0 ? " skip" : ""}"><input type="radio" name="${name}" value="${v}"><span>${t}</span></label>`).join("")}</div>
    </fieldset>`;
}

function open(p) {
  if (phase === p && !$("surveyScreen").hidden) return;
  phase = p;
  const qs = state?.questions ?? [];
  $("svTitle").textContent = p === "pre" ? "시작하기 전에, 사전 설문" : "최종 제출, 사후 설문";
  $("svLead").textContent = p === "pre"
    ? `게임을 시작하기 전에 지금 생각을 알려 주세요. ${qs.length}문항, 2분 정도 걸려요. 한 번만 내면 돼요.`
    : `처음에 답했던 문항을 한 번 더 묻고, 몇 가지를 더 물어요. 제출하는 순간의 점수(지금 ${Number(state?.score_now ?? 0).toLocaleString()})가 최종 점수로 고정돼요.`;
  $("svList").innerHTML = qs.map(question).join("");
  $("svAgree").checked = false;
  $("svClose").hidden = p === "pre";
  $("svGo").textContent = p === "pre" ? "제출하고 시작하기" : "제출하고 최종 제출하기";
  say($("svMsg"), "");
  openedAt = Date.now();
  $("surveyScreen").hidden = false;
}

function close() {
  $("surveyScreen").hidden = true;
  phase = null;
}

$("svForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (busy) return;
  const answers = {};
  let missing = null;
  for (const el of $("svList").querySelectorAll(".svq")) {
    const id = el.dataset.id;
    if (el.dataset.kind === "text") {
      const v = el.querySelector("textarea").value.trim();
      if (v) answers[id] = v;
    } else {
      const c = el.querySelector("input:checked");
      if (c) answers[id] = Number(c.value);
      else if (!missing) missing = el;
    }
  }
  if (missing) {
    say($("svMsg"), `${missing.querySelector(".svn").textContent}번 문항에 답해 주세요. 답하기 싫으면 “응답하지 않음”을 고르면 돼요.`);
    missing.classList.add("need");
    missing.scrollIntoView({ block: "center" });
    return;
  }
  if (!$("svAgree").checked) return say($("svMsg"), "맨 아래 동의에 표시해 주세요.");

  busy = true; $("svGo").disabled = true;
  const p = phase;
  const { data, error } = await db.rpc("submit_survey", { p_phase: p, p_answers: answers, p_ms: Date.now() - openedAt });
  busy = false; $("svGo").disabled = false;
  if (error) {
    if (/이미 낸/.test(error.message)) { close(); return check(); }
    return say($("svMsg"), serverMsg(error));
  }
  close();
  if (p === "pre") window.dispatchEvent(new Event("hcu:surveyed"));
  tick(p === "pre" ? "고마워요. 이제 게임을 시작할 수 있어요." : `최종 제출을 마쳤어요. 최종 점수 ${Number(data.score ?? 0).toLocaleString()}`, "good");
  await check();
});

$("svList").addEventListener("change", e => e.target.closest(".svq")?.classList.remove("need"));
$("svClose").addEventListener("click", close);
$("finalGo").addEventListener("click", async () => {
  await check();
  if (state?.need === "post") open("post");
});
$("svLogout").addEventListener("click", e => { e.preventDefault(); $("logoutBtn").click(); });

/* ---------- 최종 결과 (순위 탭 맨 위) ---------- */
async function loadFinal() {
  const card = $("finalCard");
  const { data, error } = await db.rpc("final_results");
  if (error || !data) { card.hidden = true; return; }
  const me = window.hcuProfile ?? {};
  const list = (rows, mine, isClass) => {
    let rank = 0, prev = null;
    return rows.map((r, i) => {
      if (r.per_capita !== prev) { rank = i + 1; prev = r.per_capita; }
      return `<div class="rk${r.id === mine ? " me" : ""}"><span class="n">${r.per_capita == null ? "–" : rank}</span>
        <div class="m"><div class="t">${esc(r.name)}${r.region ? `<span class="rg">${esc(r.region)}</span>` : ""}</div>
        <div class="d">${mis(`최종 제출 ${r.submitted}/${r.members}명`, `점수 ${Number(r.score).toLocaleString()}`, isClass && Number(r.bonus) ? `보너스 ${Number(r.bonus).toLocaleString()}` : "")}</div></div>
        <span class="v">${r.per_capita == null ? "–" : num1(r.per_capita)}</span></div>`;
    }).join("");
  };
  const at = new Date(data.closed_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  card.innerHTML = `<div class="t">최종 순위</div>
    <div class="d">${esc(at)}에 확정했어요. 사후 설문을 내며 최종 제출한 사람의 점수만 더하고, 가입한 사람 수로 나눴어요. 반 점수에는 지금까지의 방어·시설 보너스도 들어가요.</div>
    <div class="t">반</div>${list(data.classes ?? [], me.classId, true)}
    <div class="t">동아리</div>${list(data.clubs ?? [], me.clubId, false)}`;
  card.hidden = false;
}

/* 서버가 "사전 설문을 먼저" 라고 하면(다른 기기에서 지웠거나 화면이 오래된 경우) 다시 확인 */
window.addEventListener("hcu:needsurvey", check);
window.addEventListener("hcu:tab", e => { check(); if (e.detail === "rank") loadFinal(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
setInterval(() => { if (document.visibilityState === "visible") check(); }, 5 * 60 * 1000);
window.addEventListener("hcu:signout", () => { close(); state = null; $("finalBar").hidden = true; $("finalCard").hidden = true; });
onProfile(() => { check(); loadFinal(); });
