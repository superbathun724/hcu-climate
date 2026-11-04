/* ==========================================================
   ui.js — 여러 화면이 같이 쓰는 작은 도구
   ========================================================== */

export const $ = id => document.getElementById(id);

/** 화면에 넣기 전에 반드시 거친다. 단어 CSV·건의 글은 사람이 쓴 글이라 < 하나로 화면이 깨질 수 있다. */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

/** 안내 상자(.msg)에 글을 띄운다. 빈 글이면 숨긴다. */
export function say(el, text, kind = "bad") {
  el.textContent = text;
  el.className = "msg " + kind;
  el.hidden = !text;
}

/** 서버 함수 오류 → 화면 문구.
 *  우리 SQL 함수는 한국어로 이유를 적어 던진다. 그건 그대로 보여 주고,
 *  영어(라이브러리·네트워크) 오류만 일반 문구로 바꾼다. */
export function serverMsg(err) {
  const m = err?.message || "";
  if (/[가-힣]/.test(m)) return m;
  if (/failed to fetch|network/i.test(m)) return "인터넷 연결을 확인해 주세요.";
  console.error(err);
  return "문제가 생겼어요. 잠시 뒤에 다시 해 주세요.";
}

/** 로그인과 프로필 확인이 끝나면 할 일. auth.js 가 hcu:profile 을 보낸다. */
export function onProfile(fn) {
  if (window.hcuProfile) fn(window.hcuProfile);
  window.addEventListener("hcu:profile", e => fn(e.detail));
}

/* ---------- 코인 (상단 노란 칩) ----------
   여러 화면이 서버에서 받은 잔액을 여기로 넣는다. 화면에는 정수만 보인다. */
let balance = 0;
export function setBalance(v) {
  balance = Number(v) || 0;
  $("coins").textContent = Math.floor(balance).toLocaleString();
}
export const getBalance = () => balance;

/* ---------- 한 줄 알림 (탭 밑) ---------- */
let tickTimer = 0;
export function tick(text, kind = "") {
  const t = $("ticker");
  t.textContent = text;
  t.className = kind;
  clearTimeout(tickTimer);
  if (text) tickTimer = setTimeout(() => { t.textContent = ""; t.className = ""; }, 6000);
}

/** 한국 날짜 "YYYY-MM-DD" (서버 kst_today() 와 같은 날짜) */
export const kstToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

/** 소수 한 자리까지, 끝의 .0 은 뗀다 */
export const num1 = v => (Math.round(Number(v) * 10) / 10).toLocaleString();

/* 로그아웃하면 알림 줄을 비운다(다음 사람에게 앞사람 알림이 남지 않게) */
window.addEventListener("hcu:signout", () => tick(""));
