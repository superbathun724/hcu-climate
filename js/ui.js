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
  const before = Math.floor(balance);
  balance = Number(v) || 0;
  const txt = Math.floor(balance).toLocaleString();
  $("coins").textContent = txt;
  const st = document.getElementById("stCoins");          // 공부 화면에도 같은 숫자
  if (st) st.textContent = txt;
  return Math.floor(balance) - before;
}
/** 코인 칩 옆에 "+3" 이 떠오른다. 공부 중에 코인이 실제로 들어왔다는 표시. */
export function coinPop(chipId, n) {
  const chip = document.getElementById(chipId);
  if (!chip || !n) return;
  const p = document.createElement("span");
  p.className = "cpop";
  p.textContent = `+${n}`;
  chip.appendChild(p);
  chip.classList.remove("bump"); void chip.offsetWidth; chip.classList.add("bump");
  setTimeout(() => p.remove(), 1100);
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

/* 자정(한국 시각)을 넘기면 "hcu:newday" 를 한 번 알린다.
   화면을 켜 둔 채 밤을 넘기거나, 폰에서 잠들었던 탭이 아침에 깨어나도 하루 기록(누른 횟수·무료 탭·
   오늘 받은 단어 코인)을 새로 읽게 하려는 것. 브라우저가 백그라운드 타이머를 멈추므로
   화면으로 돌아올 때도 한 번 더 본다. */
let today = kstToday();
function checkDay() {
  const d = kstToday();
  if (d !== today) { today = d; window.dispatchEvent(new CustomEvent("hcu:newday", { detail: d })); }
}
setInterval(checkDay, 15000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkDay(); });

/** 소수 한 자리까지, 끝의 .0 은 뗀다 */
export const num1 = v => (Math.round(Number(v) * 10) / 10).toLocaleString();

/* 로그아웃하면 알림 줄을 비운다(다음 사람에게 앞사람 알림이 남지 않게) */
window.addEventListener("hcu:signout", () => tick(""));

/** 대비율 글자. 100% 를 넘으면 비축분을 따로 적는다. */
export const shieldText = v => {
  const n = Number(v) || 0;
  return n > 100 ? `${num1(n)}% (비축 ${num1(n - 100)}%)` : `${num1(n)}%`;
};

/* 계정 잠금 화면. 서버가 잠겼다고 하면 어느 화면에서든 이 이벤트를 보낸다. */
window.addEventListener("hcu:locked", () => { $("lockScreen").hidden = false; });
window.addEventListener("hcu:signout", () => { $("lockScreen").hidden = true; });
