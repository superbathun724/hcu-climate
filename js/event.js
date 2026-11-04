/* ==========================================================
   event.js — 재난 이벤트 알림
   15초마다 서버에 지금 재난을 묻는다(current_event). 서버는 그때 재난을 진행시키고,
   때가 됐으면 새 재난을 일으킨다(sql/03_game.sql world_tick).
   다른 화면은 "hcu:event" 이벤트로 받는다. 남은 시간·쓰인 대비율은 1초마다 여기서 계산한다.
   ========================================================== */
import { db } from "./config.js";
import { $, tick, onProfile, num1 } from "./ui.js";

const POLL_MS = 15000;
let ev = null;            // 지금 재난 (없으면 null)
let lastId = null;
let timer = 0;

/** 지금 이 순간의 남은 시간(ms) */
export const leftMs = e => Math.max(0, new Date(e.ends).getTime() - Date.now());
/** 지금 이 순간까지 쓰인 대비율 (서버는 15초마다만 반영하므로 그 사이를 이어 그린다) */
export function liveDrained(e) {
  const s = new Date(e.starts).getTime(), t = new Date(e.ends).getTime();
  return Number(e.drain) * Math.min(1, Math.max(0, (Date.now() - s) / (t - s)));
}
export const liveShield = e => Math.max(0, Number(e.shield) - (liveDrained(e) - Number(e.drained)));
export const mmss = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
export const currentEvent = () => ev;

async function poll() {
  if (!window.hcuProfile) return;
  const { data, error } = await db.rpc("current_event");
  if (error) return;
  const prev = ev;
  ev = data?.active ? data : null;

  // 새 재난 알림 (한 번만)
  if (ev && ev.id !== lastId) {
    lastId = ev.id;
    const mine = window.hcuProfile?.regionId === ev.region_id;
    tick(mine
      ? `우리 반이 돕는 ${ev.region_name}에 재난(${ev.hazard})! ${mmss(leftMs(ev))} 동안 보내는 코인은 ${ev.mult}배예요.`
      : `${ev.region_name}에 재난(${ev.hazard})이 닥쳤어요. 지원 탭에서 ${ev.mult}배로 도울 수 있어요.`, "bad");
  }
  // 재난이 끝남
  if (prev && !ev) tick(`${prev.region_name} 재난이 끝났어요. 모은 대비율에서 ${num1(prev.drain)}%가 대응에 쓰였어요.`);

  document.querySelector('#tabs [data-tab="send"]').classList.toggle("alert", !!ev);
  window.dispatchEvent(new CustomEvent("hcu:event", { detail: ev }));
}

/* 1초마다: 남은 시간·대비율을 그리는 화면들에게 알린다 */
setInterval(() => { if (ev) window.dispatchEvent(new CustomEvent("hcu:second", { detail: ev })); }, 1000);

onProfile(() => { poll(); clearInterval(timer); timer = setInterval(poll, POLL_MS); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") poll(); });
window.addEventListener("hcu:sent", poll);
window.addEventListener("hcu:signout", () => { clearInterval(timer); ev = null; lastId = null;
  document.querySelector('#tabs [data-tab="send"]').classList.remove("alert"); });
