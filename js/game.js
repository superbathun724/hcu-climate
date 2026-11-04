/* ==========================================================
   game.js — 게임 탭: 울산을 누른다 → 코인
   (un-summit 의 장면·스모그·탭 연출을 가져와 서버 저장으로 바꿈)

   누를 때마다 서버에 보내지 않는다. 2초마다 "몇 번 눌렀다"를 모아 보내고(submit_taps),
   코인은 서버가 계산한 값으로 맞춘다. 화면의 숫자는 그 사이를 잇는 어림값일 뿐이다.
   하루 한도는 없고, 많이 누를수록 한 번에 받는 코인이 절반씩 준다(sql/03_game.sql).
   ========================================================== */
import { db, SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { $, setBalance, getBalance, onProfile, tick } from "./ui.js";

const BAND = 300;                 // sql tap_band() 와 같게
const FLUSH_MS = 2000;

/* 오늘 taps 번 누른 상태가 몇 번째 구간인가 (구간마다 길이 2배, 효율 절반) */
function bandOf(taps) {
  let k = 0, start = 0, len = BAND;
  while (taps >= start + len) { start += len; len *= 2; k++; }
  return { k, start, len };
}
const rateAt = taps => 1 / 2 ** bandOf(taps).k;
/* sql tap_coins() 와 같은 계산 */
function coinsFor(start, n) {
  let c = 0;
  for (let i = 0; i < n; i++) c += rateAt(start + i);
  return c;
}

let ready = false;    // 서버에서 오늘 상태를 받기 전에는 누르지 않는다
let taps = 0;         // 오늘 누른 횟수 (보내지 않은 것 포함)
let pending = 0;      // 아직 서버에 안 보낸 횟수
let inflight = null;  // 보내는 중인 요청
let token = "";       // 페이지를 닫을 때 쓰는 로그인 토큰

function draw() {
  const b = bandOf(taps), r = rateAt(taps);
  $("taps").textContent = taps.toLocaleString();
  $("rate").textContent = `${r >= 0.01 ? r : "0.01 미만"}코인`;
  $("bandBar").style.width = ((taps - b.start) / b.len * 100) + "%";
  $("bandTxt").textContent = `${(b.start + b.len - taps).toLocaleString()}번 더 누르면 효율이 절반이 돼요`;
  document.querySelectorAll(".band div").forEach((d, i) => d.classList.toggle("now", i === Math.min(b.k, 3)));
  $("smog").style.opacity = Math.max(0.08, 0.6 - taps / 3000);
}

async function load() {
  ready = false;
  const { data, error } = await db.rpc("my_state");
  if (error) { tick("게임 기록을 불러오지 못했어요. 새로고침해 주세요.", "bad"); return; }
  taps = data.taps_today;
  pending = 0;
  setBalance(data.balance);
  ready = true;
  draw();
}

/* 모아 둔 탭을 보낸다. 다른 화면(지원·단어)은 코인을 쓰기 전에 이것을 먼저 부른다. */
async function flush() {
  if (inflight) await inflight;
  if (!pending) return;
  const n = pending;
  pending = 0;
  inflight = (async () => {
    const { data, error } = await db.rpc("submit_taps", { p_n: n });
    if (error) {
      pending += n;
      tick("누른 기록을 저장하지 못했어요. 인터넷 연결을 확인해 주세요.", "bad");
      return;
    }
    // 서버 값 + 보내는 동안 더 누른 것
    taps = data.taps_today + pending;
    setBalance(Number(data.balance) + coinsFor(data.taps_today, pending));
    if (data.accepted < n) tick("너무 빨리 눌렀어요. 일부는 세지 않았어요.", "bad");
    draw();
  })();
  await inflight;
  inflight = null;
}
window.hcuFlushTaps = flush;

$("scene").addEventListener("pointerdown", e => {
  if (!ready) return;
  const r = rateAt(taps);
  taps++; pending++;
  setBalance(getBalance() + r);
  draw();

  const p = document.createElement("div");
  p.className = "pop";
  p.textContent = r >= 1 ? "+1" : "+" + r;
  const box = $("scene").getBoundingClientRect();
  p.style.left = (e.clientX - box.left - 10) + "px";
  p.style.top = (e.clientY - box.top - 20) + "px";
  $("scene").appendChild(p);
  setTimeout(() => p.remove(), 700);
});

setInterval(flush, FLUSH_MS);

/* 탭을 닫거나 다른 앱으로 넘어갈 때 남은 것을 보낸다.
   이때는 기다릴 수 없어서 keepalive fetch 로 바로 쏜다. */
function flushOnLeave() {
  if (!pending || !token) return;
  const n = pending;
  pending = 0;
  fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_taps`, {
    method: "POST", keepalive: true,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_n: n }),
  }).catch(() => {});
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushOnLeave();
  else if (ready) load();                         // 돌아오면(자정을 넘겼을 수도) 서버 값으로 다시
});
window.addEventListener("pagehide", flushOnLeave);

db.auth.onAuthStateChange((_e, session) => { token = session?.access_token ?? ""; });
window.addEventListener("hcu:signout", () => { ready = false; taps = pending = 0; setBalance(0); draw(); });
onProfile(load);
draw();
