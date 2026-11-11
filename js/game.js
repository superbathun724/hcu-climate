/* ==========================================================
   game.js — 게임 탭: 화면을 누른다 → 코인
   (un-summit 의 장면·방벽·탭 연출을 가져와 서버 저장으로 바꿈)
   배경은 우리 반이 돕는 지역의 풍경(js/scenes.js). 방파제·제방 높이가 그 지역의 실제 대비율이고,
   대비율이 오를수록 폭풍·홍수 그림이 옅어진다. 코인을 보내면(지원 탭) 그림이 바로 바뀐다.

   누를 때마다 서버에 보내지 않는다. 2초마다 "몇 번 눌렀다"를 모아 보내고(submit_taps),
   코인은 서버가 계산한 값으로 맞춘다. 화면의 숫자는 그 사이를 잇는 어림값일 뿐이다.
   한 번에 1코인. 하루 무료 1,000번 + 단어를 맞혀 모은 에너지만큼 누를 수 있다(sql/03_game.sql, 04_study.sql).

   매크로·속도 검사로 잠그지 않는다. 누를 수 있는 횟수가 무료 탭 + 에너지로 정해져 있어서
   빨리 누르든 자동 클릭을 쓰든 더 벌 수 없다. 스크립트가 만든 가짜 누름(isTrusted=false)만 조용히 세지 않는다.
   서버는 한 번에 받는 양에 넉넉한 상한만 둔다(잠그지 않음).
   ========================================================== */
import { db, SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { $, setBalance, getBalance, onProfile, tick, num1, shieldText, mis } from "./ui.js";
import { currentEvent, liveShield } from "./event.js";
import { SCENES, wallSVG, WALL_FOOT, WALL_RISE, infraSVG } from "./scenes.js";

const FLUSH_MS = 2000;
const FREE_DAILY = 1000;           // 하루 무료 탭 (sql tap_free_daily 와 같게. 막대 그림에만 쓴다 — 실제 수는 서버 값)

let ready = false;    // 서버에서 오늘 상태를 받기 전에는 누르지 않는다
let taps = 0;         // 오늘 누른 횟수 (보내지 않은 것 포함)
let freeLeft = 0;     // 오늘 남은 무료 탭 (서버 값 - 아직 안 보낸 것)
let energy = 0;       // 에너지 = 무료를 다 쓴 뒤 누를 수 있는 횟수 (단어를 맞혀 얻는다)
let pending = 0;      // 아직 서버에 안 보낸 횟수
let inflight = null;  // 보내는 중인 요청
let token = "";       // 페이지를 닫을 때 쓰는 로그인 토큰

function draw() {
  $("taps").textContent = taps.toLocaleString();
  $("left").textContent = (freeLeft + energy).toLocaleString();
  $("freeBar").style.width = Math.min(100, freeLeft / FREE_DAILY * 100) + "%";
  $("leftTxt").innerHTML = mis(`오늘 무료 ${freeLeft.toLocaleString()}`, `에너지 ${energy.toLocaleString()}`);
}
/* 서버가 알려 준 남은 수에서, 그 뒤로 더 누른(아직 안 보낸) 만큼 뺀다. 무료부터 쓴다. */
function setLeft(free, en, used) {
  const fromFree = Math.min(free, used);
  freeLeft = free - fromFree;
  energy = Math.max(0, en - (used - fromFree));
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
  $("sceneShield").textContent = hit ? `재난 중, 대비율 ${shieldText(real)}` : `대비율 ${shieldText(real)}${real >= 50 ? ", 버틸 수 있어요" : ""}`;
  $("sceneTag").hidden = false;
}

function drawScene() {
  const sc = SCENES[region?.id];
  if (!sc) return;
  $("scene").style.background = `linear-gradient(${sc.sky[0]}, ${sc.sky[1]} 68%, ${sc.water} 68%)`;
  $("sceneSvg").innerHTML = sc.art() + wallSVG(sc.wall) + `<g id="infraG"></g>`;
  drawInfra();
  const cap = document.getElementById("wallCap");
  if (cap) cap.dataset.base = cap.getAttribute("fill");
  $("hazard").className = sc.hazard;
  drawShield();
}

/* 지은 시설을 풍경에 (조기경보 철탑·대피소·테트라포드) */
let infraLv = {};
function drawInfra() {
  const g = document.getElementById("infraG");
  if (g) g.innerHTML = infraSVG(infraLv);
}
async function loadInfraLv() {
  if (!region) return;
  const { data } = await db.from("region_infra").select("key, level").eq("region_id", region.id);
  infraLv = Object.fromEntries((data ?? []).map(x => [x.key, x.level]));
  drawInfra();
}
window.addEventListener("hcu:infra", loadInfraLv);

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
  loadInfraLv();
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
  setBalance(Number(data.balance) + pending);
  setLeft(data.free_left, data.energy, pending);
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
    setBalance(Number(data.balance) + pending);
    setLeft(data.free_left, data.energy, pending);
    if (data.accepted < n) tick("너무 빨리 눌렀거나 남은 탭보다 많이 눌렀어요. 일부는 세지 않았어요.", "bad");
    draw();
  })();
  await inflight;
  inflight = null;
}
window.hcuFlushTaps = flush;
/* 단어를 맞혀 에너지가 늘면(study.js) 남은 탭을 바로 늘린다. 정확한 값은 다음 저장 때 서버 값으로 맞춰진다. */
window.addEventListener("hcu:energy", e => { energy = Math.max(0, Number(e.detail) || 0); if (ready) draw(); });

/* 화면이 매크로 같다고 본 뒤 잠깐 쉬기. 시간이 지나면 저절로 다시 누를 수 있다. */
let pauseTimer = null;
let emptyAt = 0;          // "남은 탭이 없어요" 안내를 너무 자주 띄우지 않게
function pauseUntil(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (!(ms > 0)) return;
  ready = false;
  log.length = 0;
  const mins = Math.ceil(ms / 60000);
  tick(`프로그램이 누른 것 같은 입력이 감지됐어요. ${mins}분 동안 쉬었다가 다시 눌러 주세요. (하루에 여러 번 반복되면 계정이 잠겨요)`, "bad");
  clearTimeout(pauseTimer);
  pauseTimer = setTimeout(() => { ready = true; tick("다시 누를 수 있어요."); }, ms + 500);
}

/* ---------- 누름 ----------
   매크로 검사는 하지 않는다. 누를 수 있는 횟수가 무료 탭 + 에너지로 정해져 있어서
   빨리 누르든 자동 클릭을 쓰든 더 벌 수 없기 때문이다. 스크립트가 만든 가짜 누름만 조용히 세지 않는다. */
const log = [];

$("scene").addEventListener("pointerdown", e => {
  if (!ready) return;
  if (!e.isTrusted) return;
  if (freeLeft + energy <= 0) {                      // 남은 탭이 없음: 세지 않고 안내만
    if (Date.now() - emptyAt > 4000) { emptyAt = Date.now(); tick("남은 탭이 없어요. 단어를 맞혀 에너지를 모으면 더 누를 수 있어요."); }
    return;
  }
  const r = 1;
  if (freeLeft > 0) freeLeft--; else energy--;
  taps++; pending++;
  setBalance(getBalance() + r);
  draw();

  const p = document.createElement("div");
  p.className = "pop";
  p.textContent = "+" + r;
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
/* 자정이 지나면 누른 횟수·무료 탭을 서버 값으로 다시. 켜 둔 채 밤을 넘긴 화면도 */
window.addEventListener("hcu:newday", () => { if (window.hcuProfile) { load(); tick("새 날이에요. 무료 탭 1,000번이 다시 채워졌어요."); } });
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
