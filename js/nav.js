/* ==========================================================
   nav.js — 탭 전환과 패널 열고 닫기
   탭을 바꾸면 "hcu:tab" 이벤트를 보낸다. 순위·건의함은 그때 새로 읽는다.
   ========================================================== */
import { $ } from "./ui.js";

const SECTIONS = ["game", "word", "send", "rank", "voice", "admin"];

export function show(id) {
  SECTIONS.forEach(s => $(s).classList.toggle("on", s === id));
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === id));
  window.scrollTo(0, 0);
  window.dispatchEvent(new CustomEvent("hcu:tab", { detail: id }));
}

document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => show(b.dataset.tab)));

document.addEventListener("click", e => {
  const o = e.target.closest("[data-open]");
  if (o) { e.preventDefault(); show(o.dataset.open); }
  const c = e.target.closest("[data-close]");
  if (c) $(c.dataset.close).hidden = true;
});

/* 로그아웃하면 게임 탭으로 돌려놓는다 */
window.addEventListener("hcu:signout", () => show("game"));
