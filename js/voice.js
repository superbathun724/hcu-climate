/* ==========================================================
   voice.js — 건의함: 글 올리기, 공감, 학생회 답변 보기
   글쓴이는 누구에게도 보이지 않는다(서버가 "내 글인지"만 알려 준다).
   관리자에게는 글마다 답변 칸과 숨기기 버튼이 붙는다. 그것도 서버가 관리자인지 다시 확인한다.
   ========================================================== */
import { db } from "./config.js";
import { $, esc, say, serverMsg, onProfile, tick } from "./ui.js";

let sort = "top";
let admin = false;

function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

function post(p) {
  const adminBox = admin ? `
    <div class="adm">
      <textarea rows="2" maxlength="1000" placeholder="학생회가 받아 온 답변">${esc(p.answer ?? "")}</textarea>
      <div class="frow">
        <button class="btn ghost sm" data-act="hide">${p.hidden ? "다시 보이기" : "숨기기"}</button>
        <button class="btn sm" data-act="answer">${p.answer ? "답변 고치기" : "답변 달기"}</button>
      </div>
    </div>` : "";
  return `<div class="post${p.hidden ? " is-hidden" : ""}" data-id="${p.id}">
    <button class="up${p.voted ? " on" : ""}" data-act="vote" ${p.mine ? "disabled title='내 글'" : ""} aria-label="공감">
      ▲<span>${p.votes}</span><small>${p.mine ? "내 글" : "공감"}</small></button>
    <div class="b">${esc(p.body)}
      <div class="meta">익명 · ${ago(p.created_at)}${p.answer ? " · 답변 완료" : ""}${p.hidden ? " · <b>숨김</b>" : ""}</div>
      ${p.answer ? `<div class="ans"><b>학생회 답변</b>${esc(p.answer)}</div>` : ""}
      ${adminBox}
    </div>
  </div>`;
}

async function load() {
  const { data, error } = await db.rpc("list_suggestions", { p_sort: sort });
  if (error) { $("posts").innerHTML = `<p class="note">건의함을 불러오지 못했어요.</p>`; return; }
  $("posts").innerHTML = data.map(post).join("") ||
    `<p class="note">${sort === "answered" ? "아직 답변이 달린 글이 없어요." : "아직 올라온 건의가 없어요. 첫 건의를 올려 보세요."}</p>`;
}

$("vForm").addEventListener("submit", async e => {
  e.preventDefault();
  const body = $("vBody").value.trim();
  if (body.length < 2) return say($("vMsg"), "두 글자 이상 적어 주세요.");
  $("vSend").disabled = true;
  const { error } = await db.rpc("post_suggestion", { p_body: body });
  $("vSend").disabled = false;
  if (error) return say($("vMsg"), serverMsg(error));
  $("vBody").value = "";
  say($("vMsg"), "올렸어요. 다른 학생에게는 이름 없이 보여요.", "good");
  sort = "new";
  document.querySelectorAll("#voiceSeg button").forEach(x => x.classList.toggle("on", x.dataset.s === sort));
  load();
});

$("posts").addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const el = b.closest(".post"), id = Number(el.dataset.id);
  b.disabled = true;

  if (b.dataset.act === "vote") {
    const { data, error } = await db.rpc("toggle_vote", { p_id: id });
    b.disabled = false;
    if (error) return tick(serverMsg(error), "bad");
    b.classList.toggle("on", data.voted);
    b.querySelector("span").textContent = data.votes;
    return;
  }
  if (b.dataset.act === "answer") {
    const text = el.querySelector(".adm textarea").value;
    const { error } = await db.rpc("admin_answer_suggestion", { p_id: id, p_answer: text });
    b.disabled = false;
    if (error) return tick(serverMsg(error), "bad");
    tick(text.trim() ? "답변을 달았어요." : "답변을 지웠어요.", "good");
    return load();
  }
  if (b.dataset.act === "hide") {
    const hidden = !el.classList.contains("is-hidden");
    const { error } = await db.rpc("admin_hide_suggestion", { p_id: id, p_hidden: hidden });
    b.disabled = false;
    if (error) return tick(serverMsg(error), "bad");
    tick(hidden ? "글을 숨겼어요. 학생에게는 안 보여요." : "글을 다시 보이게 했어요.", "good");
    return load();
  }
});

document.querySelectorAll("#voiceSeg button").forEach(b => b.addEventListener("click", () => {
  sort = b.dataset.s;
  document.querySelectorAll("#voiceSeg button").forEach(x => x.classList.toggle("on", x === b));
  load();
}));
window.addEventListener("hcu:tab", e => { if (e.detail === "voice") load(); });
onProfile(p => { admin = p.isAdmin; load(); });
