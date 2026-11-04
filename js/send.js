/* ==========================================================
   send.js — 지원 탭: 바깥 지역에 코인 보내기
   (un-summit Support 탭의 카드·대비율 막대·50% 선을 가져와 서버 저장으로 바꿈)

   울산은 목록에 없다. 코인을 받을 수 있는 곳은 regions 표의 바깥 7곳뿐이다.
   우리 반이 맡은 곳이 맨 위, 나머지는 반 번호 순.
   재난(빨간 고정·2배)은 재난 규칙을 정한 뒤 붙인다.
   ========================================================== */
import { db } from "./config.js";
import { $, esc, setBalance, getBalance, tick, onProfile, serverMsg, num1 } from "./ui.js";

let regions = [];     // [{id, name, hazard, shield, cls}]
let myClass = 0;

const SAFE = 50;
const shieldTxt = v => `대비율 ${num1(v)}% · ` + (v >= SAFE ? "재난을 버틸 수 있어요" : `50%까지 ${num1(SAFE - v)}%`);

function card(r) {
  const mine = r.cls === myClass;
  return `<div class="row reg${mine ? " mine" : ""}" data-r="${r.id}">
    <div class="rtop"><div class="t">${esc(r.name)}</div>
      <span class="tag ${mine ? "blue" : "soft"}">${mine ? "우리 반이 돕는 곳" : `${r.cls}반이 돕는 곳`}</span></div>
    <div class="d">${esc(r.hazard)}</div>
    <div class="shield"><div class="bar"><i style="width:${Math.min(100, r.shield)}%"></i><span class="safe"></span></div>
      <div class="d sv">${shieldTxt(r.shield)}</div></div>
    <div class="give"><button class="btn coin" data-amt="10">10</button><button class="btn coin" data-amt="50">50</button><button class="btn coin" data-amt="100">100</button></div>
    <div class="give own"><input type="number" inputmode="numeric" min="1" step="1" placeholder="직접 입력"><button class="btn" data-amt="own">보내기</button></div>
  </div>`;
}

export async function loadRegions() {
  const [rg, cl] = await Promise.all([
    db.from("regions").select("id, name, hazard, shield"),
    db.from("classes").select("id, region_id"),
  ]);
  if (rg.error || cl.error) { $("sendList").innerHTML = `<p class="note">지역을 불러오지 못했어요.</p>`; return; }
  const clsOf = new Map(cl.data.map(c => [c.region_id, c.id]));
  regions = rg.data.map(r => ({ ...r, shield: Number(r.shield), cls: clsOf.get(r.id) ?? 0 }))
    .sort((a, b) => (b.cls === myClass) - (a.cls === myClass) || a.cls - b.cls);
  $("sendList").innerHTML = regions.map(card).join("");
}

$("sendList").addEventListener("click", async e => {
  const b = e.target.closest("[data-amt]"); if (!b) return;
  const el = b.closest(".row"), r = regions.find(x => x.id === Number(el.dataset.r));
  const inp = el.querySelector(".own input");
  const amt = b.dataset.amt === "own" ? Number(inp.value) : Number(b.dataset.amt);
  if (!Number.isInteger(amt) || amt < 1) { inp.focus(); return tick("보낼 코인 수를 1 이상의 정수로 적어 주세요.", "bad"); }

  el.querySelectorAll("button").forEach(x => x.disabled = true);
  await window.hcuFlushTaps?.();                       // 방금 누른 탭까지 서버 잔액에 넣고 보낸다
  if (amt > Math.floor(getBalance())) {
    el.querySelectorAll("button").forEach(x => x.disabled = false);
    return tick(`코인이 부족해요. 지금 ${Math.floor(getBalance())}코인 있어요.`, "bad");
  }
  const { data, error } = await db.rpc("send_coins", { p_region: r.id, p_amount: amt });
  el.querySelectorAll("button").forEach(x => x.disabled = false);
  if (error) return tick(serverMsg(error), "bad");

  r.shield = Number(data.shield);
  el.querySelector(".bar i").style.width = Math.min(100, r.shield) + "%";
  el.querySelector(".sv").textContent = shieldTxt(r.shield);
  inp.value = "";
  setBalance(data.balance);
  tick(`${r.name}에 ${amt}코인을 보냈어요.`, "good");
  window.dispatchEvent(new Event("hcu:sent"));
});

onProfile(p => { myClass = p.classId; loadRegions(); });
window.addEventListener("hcu:tab", e => { if (e.detail === "send") loadRegions(); });   // 다른 학생이 보낸 것까지 새로
