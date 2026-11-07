/* ==========================================================
   game.js — 게임 탭: 화면을 누른다 → 코인
   (un-summit 의 장면·방벽·탭 연출을 가져와 서버 저장으로 바꿈)
   배경은 우리 반이 돕는 지역의 풍경(js/scenes.js). 방파제·제방 높이가 그 지역의 실제 대비율이고,
   대비율이 오를수록 폭풍·홍수 그림이 옅어진다. 코인을 보내면(지원 탭) 그림이 바로 바뀐다.

   누를 때마다 서버에 보내지 않는다. 2초마다 "몇 번 눌렀다"를 모아 보내고(submit_taps),
   코인은 서버가 계산한 값으로 맞춘다. 화면의 숫자는 그 사이를 잇는 어림값일 뿐이다.
   하루 한도는 없고, 많이 누를수록 한 번에 받는 코인이 절반씩 준다(sql/03_game.sql).

   매크로 감지: 최근 30번의 누름을 보고
     - 간격이 기계처럼 일정함(평균 250ms 미만, 흔들림 6% 미만)
     - 같은 자리(3px 안)를 사람이 못 낼 속도(초당 14번 넘게)로 누름
     - 스크립트가 만든 가짜 누름(isTrusted=false)
   이면 더 받지 않고 서버에 알린다(submit_taps 의 p_flag). 사람도 리듬을 타다 가끔 걸릴 수 있어서 바로 잠그지 않고
   5분 동안 탭을 쉬게 한다. 24시간 안에 3번째면 서버가 잠그고 관리자가 풀어 준다.
   이 검사는 화면 쪽이라 우회할 수 있다. 서버도 따로 "사람 속도보다 훨씬 많이"를 본다.
   ========================================================== */
import { db, SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { $, setBalance, getBalance, onProfile, tick, num1, shieldText } from "./ui.js";
import { currentEvent, liveShield } from "./event.js";
import { SCENES, wallSVG, WALL_FOOT, WALL_RISE } from "./scenes.js";

const BAND = 300;                 // sql tap_band() 와 같게
const FLUSH_MS = 2000;
const CHECK_N = 30;               // 매크로 검사에 쓰는 최근 누름 수

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
}

/* ---------- 지역 풍경 ---------- */
let region = null;      // {id, name, shield}

function drawShield() {
  if (!region) return;
  const ev = currentEvent(), hit = ev && ev.region_id === region.id;
  const real = hit ? liveShield(ev) : Math.max(0, Number(region.shield) || 0);
  const sh = Math.min(100, real);                       // 그림은 100% 에서 멈춘다(넘친 것은 글자로)
  $("scene").classList.toggle("hit", !!hit);
  const h = 6 + sh * WALL_RISE;
  const body = document.getElementById("wallBody"), cap = document.getElementById("wallCap");
  if (body) { body.setAttribute("y", WALL_FOOT - h); body.setAttribute("height", h); }
  if (cap) { cap.setAttribute("y", WALL_FOOT - h - 3); cap.setAttribute("fill", sh >= 50 ? "#8FE3A0" : cap.dataset.base); }
  $("hazard").style.opacity = hit ? 0.95 : 0.08 + 0.8 * (1 - Math.min(sh, 50) / 50);
  $("sceneName").textContent = region.name;
  $("sceneShield").textContent = hit ? `재난 중 · 대비율 ${shieldText(real)}` : `대비율 ${shieldText(real)}${real >= 50 ? " · 버틸 수 있어요" : ""}`;
  $("sceneTag").hidden = false;
}

function drawScene() {
  const sc = SCENES[region?.id];
  if (!sc) return;
  $("scene").style.background = `linear-gradient(${sc.sky[0]}, ${sc.sky[1]} 68%, ${sc.water} 68%)`;
  $("sceneSvg").innerHTML = sc.art() + wallSVG(sc.wall);
  const cap = document.getElementById("wallCap");
  if (cap) cap.dataset.base = cap.getAttribute("fill");
  $("hazard").className = sc.hazard;
  drawShield();
}

async function loadRegion(classId) {
  const { data: cls } = await db.from("classes").select("region_id").eq("id", classId).maybeSingle();
  if (!cls) return;
  let rid = cls.region_id;
  if (!rid) {
    // 맡은 지역이 없는 팀이면(지금은 없음): 재난 중인 곳, 없으면 지금 대비율이 가장 낮은 곳을 보여 준다
    const ev = currentEvent();
    if (ev) rid = ev.region_id;
    else {
      const { data: low } = await db.from("regions").select("id").order("shield").limit(1);
      rid = low?.[0]?.id;
    }
    if (!rid) return;
  }
  const { data: r } = await db.from("regions").select("id, name, shield").eq("id", rid).maybeSingle();
  if (!r) return;
  const changed = region?.id !== r.id;
  region = r;
  changed ? drawScene() : drawShield();
}

async function load(retry = 1) {
  if (pending || inflight) await flush();            // 아직 안 보낸 누름을 먼저 보낸다(버리지 않게)
  ready = false;
  const { data, error } = await db.rpc("my_state");
  if (error) {
    // 폰이 오래 잠들었다 깨면 로그인 토큰이 갱신되기 전에 부를 수 있다. 잠깐 뒤 한 번 더.
    if (retry > 0) return setTimeout(() => load(retry - 1), 2000);
    tick("게임 기록을 불러오지 못했어요. 새로고침해 주세요.", "bad"); return;
  }
  taps = data.taps_today + pending;
  if (pending) setBalance(Number(data.balance) + coinsFor(data.taps_today, pending));
  else setBalance(data.balance);
  if (data.locked) return window.dispatchEvent(new Event("hcu:locked"));
  ready = true;
  draw();
  if (data.paused_until) pauseUntil(data.paused_until);       // 쉬는 중에 새로고침해도 이어서
}

/* 모아 둔 탭을 보낸다. 다른 화면(지원·단어)은 코인을 쓰기 전에 이것을 먼저 부른다. */
let flag = null;          // 매크로로 보인 근거 (한 번 잡히면 서버에 알리고 끝)

async function flush() {
  if (inflight) await inflight;
  if (!pending && !flag) return;
  const n = pending;
  pending = 0;
  const f = flag;
  inflight = (async () => {
    const { data, error } = await db.rpc("submit_taps", f ? { p_n: n, p_flag: f } : { p_n: n });
    if (error) {
      pending += n;
      tick("누른 기록을 저장하지 못했어요. 인터넷 연결을 확인해 주세요.", "bad");
      return;
    }
    if (data.locked) {
      ready = false; pending = 0; flag = null;
      setBalance(data.balance); taps = data.taps_today; draw();
      window.dispatchEvent(new Event("hcu:locked"));
      return;
    }
    if (data.paused_until) {
      pending = 0; flag = null;
      setBalance(data.balance); taps = data.taps_today; draw();
      pauseUntil(data.paused_until);
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

/* 화면이 매크로 같다고 본 뒤 잠깐 쉬기. 시간이 지나면 저절로 다시 누를 수 있다. */
let pauseTimer = null;
function pauseUntil(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (!(ms > 0)) return;
  ready = false;
  log.length = 0;
  const mins = Math.ceil(ms / 60000);
  tick(`기계처럼 너무 일정하게 눌린 것 같아요. ${mins}분 동안 쉬었다가 다시 눌러 주세요. (하루에 여러 번 반복되면 계정이 잠겨요)`, "bad");
  clearTimeout(pauseTimer);
  pauseTimer = setTimeout(() => { ready = true; tick("다시 누를 수 있어요."); }, ms + 500);
}

/* ---------- 매크로 검사 ---------- */
const log = [];           // 최근 누름 {t, x, y}
function suspicious(e) {
  if (!e.isTrusted) return { reason: "synthetic" };
  log.push({ t: e.timeStamp, x: Math.round(e.clientX), y: Math.round(e.clientY) });
  if (log.length > CHECK_N) log.shift();
  if (log.length < CHECK_N) return null;

  const gaps = [];
  for (let i = 1; i < log.length; i++) gaps.push(log[i].t - log[i - 1].t);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
  const cv = sd / mean;
  const span = log[log.length - 1].t - log[0].t;
  const sameSpot = log.every(p => Math.abs(p.x - log[0].x) <= 3 && Math.abs(p.y - log[0].y) <= 3);
  const perSec = (CHECK_N - 1) / (span / 1000);
  const detail = { n: CHECK_N, mean_ms: Math.round(mean), cv: Math.round(cv * 1000) / 1000, per_sec: Math.round(perSec * 10) / 10, same_spot: sameSpot };

  if (mean < 250 && cv < 0.06) return { reason: "regular-interval", ...detail };
  if (sameSpot && perSec > 14) return { reason: "same-spot-fast", ...detail };
  return null;
}

$("scene").addEventListener("pointerdown", e => {
  if (!ready) return;
  const bad = suspicious(e);
  if (bad) {
    ready = false;
    flag = { ...bad, at: new Date().toISOString(), ua: navigator.userAgent.slice(0, 120) };
    flush();
    return;
  }
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
/* 자정이 지나면 누른 횟수·효율을 서버 값(0부터)으로 다시. 켜 둔 채 밤을 넘긴 화면도 */
window.addEventListener("hcu:newday", () => { if (window.hcuProfile) { load(); tick("새 날이에요. 누를 때 받는 코인이 다시 1코인이에요."); } });
window.addEventListener("pagehide", flushOnLeave);

db.auth.onAuthStateChange((_e, session) => { token = session?.access_token ?? ""; });
window.addEventListener("hcu:signout", () => { ready = false; taps = pending = 0; region = null; flag = null; log.length = 0; setBalance(0); draw(); $("sceneTag").hidden = true; });
/* 재난: 1초마다 우리 지역 그림을 다시 (제방이 조금씩 낮아진다) */
window.addEventListener("hcu:second", e => { if (region && e.detail.region_id === region.id) drawShield(); });
window.addEventListener("hcu:event", () => { if (window.hcuProfile) loadRegion(window.hcuProfile.classId); });
onProfile(p => { load(); loadRegion(p.classId); });
// 코인을 보낸 뒤나 게임 탭으로 돌아올 때 대비율을 새로 (다른 학생이 보낸 것까지)
window.addEventListener("hcu:tab", e => { if (e.detail === "game" && window.hcuProfile) loadRegion(window.hcuProfile.classId); });
window.addEventListener("hcu:sent", () => { if (window.hcuProfile) loadRegion(window.hcuProfile.classId); });
draw();
