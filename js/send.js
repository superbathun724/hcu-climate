/* ==========================================================
   send.js — 지원 탭: 바깥 지역에 코인 보내기
   (un-summit Support 탭의 카드·대비율 막대·50% 선·빨간 재난 카드를 가져와 서버 저장으로 바꿈)

   울산은 목록에 없다. 코인을 받을 수 있는 곳은 regions 표의 바깥 7곳뿐이다.
   순서: 재난 중인 지역(빨강, 맨 위) → 우리 반이 맡은 곳 → 나머지 반 번호 순.
   재난 중에는 보낸 코인이 2배로 들어가고, 그 지역 대비율이 재난 대응에 조금씩 쓰인다.
   대비율은 100% 를 넘어 지역 상한(기본 150%, 방파제를 지으면 더)까지 쌓인다. 막대는 100% 에서 멈추고 글자로 보여 준다.
   상한을 넘친 코인은 그 지역 기금이 되어 시설을 짓는다(js/infra.js, sql/06_infra.sql).
   재난 카드에는 그 지역의 실제 재난 사례와 효과가 있었던 대비를 출처와 함께 보여 준다(js/cases.js).
   ========================================================== */
import { db } from "./config.js";
import { $, esc, setBalance, getBalance, tick, onProfile, serverMsg, num1, shieldText } from "./ui.js";
import { currentEvent, leftMs, liveShield, liveDrained, mmss } from "./event.js";
import { CASES } from "./cases.js";
import { announce } from "./infra.js";

let regions = [];     // [{id, name, hazard, shield, cls}]
let myClass = 0;

const SAFE = 50;
const shieldLine = (v, cap = 150) => `대비율 ${shieldText(v)} · ` +
  (v >= cap ? `가득(${num1(cap)}%) · 더 보내면 기금이 돼요` : v >= SAFE ? "재난을 버틸 수 있어요" : `50%까지 ${num1(SAFE - v)}%`);
const capOf = id => regions.find(x => x.id === id)?.cap ?? 150;
const miniInfra = r => r.infra
  ? `<div class="d infra-mini">시설 · 조기경보 ${r.infra.warning}단계 · 방파제 ${r.infra.wall}단계 · 대피소 ${r.infra.shelter}단계 · 기금 ${Math.floor(r.infra.fund).toLocaleString()}</div>` : "";

/* 실제 사례 (재난 중인 카드에만) */
function caseBox(id) {
  const c = CASES[id];
  if (!c) return "";
  return `<div class="case"><b>실제로 있었던 일</b> ${esc(c.event)}<br><b>효과가 있었던 대비</b> ${esc(c.measure)}
    <div class="src">출처: ${c.src.map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`).join(" · ")}</div></div>`;
}

function card(r, ev) {
  const mine = r.cls === myClass;
  const hit = ev && ev.region_id === r.id;
  const sh = hit ? liveShield(ev) : r.shield;
  const tags = (hit ? `<span class="tag red">재난 · <b class="cd">${mmss(leftMs(ev))}</b> 남음</span><span class="tag x2">지원 ${ev.mult}배</span>` : "") +
    (r.cls ? `<span class="tag ${mine ? "blue" : "soft"}">${mine ? `우리 ${r.team ? "팀" : "반"}이 돕는 곳` : `${esc(r.clsName)}${r.team ? " 팀" : ""}이 돕는 곳`}</span>` : "");
  return `<div class="row reg${mine ? " mine" : ""}${hit ? " emg" : ""}" data-r="${r.id}">
    <div class="rtop"><div class="t">${esc(r.name)}</div><div class="tags">${tags}</div></div>
    <div class="d">${esc(r.hazard)}</div>
    <div class="shield"><div class="bar${sh > 100 ? " over" : ""}"><i style="width:${Math.min(100, sh)}%"></i><span class="safe"></span></div>
      <div class="d sv">${shieldLine(sh, r.cap)}</div>
      ${hit ? `<div class="d drain">재난 대응에 대비율이 쓰이고 있어요 · <b class="dr">−${num1(liveDrained(ev))}</b> / −${num1(ev.drain)}% · 끝날 때 50% 이상이면 방어 성공</div>` : ""}</div>
    ${miniInfra(r)}
    ${hit ? caseBox(r.id) : ""}
    <div class="give"><button class="btn coin" data-amt="10">10</button><button class="btn coin" data-amt="50">50</button><button class="btn coin" data-amt="100">100</button></div>
    <div class="give own"><input type="number" inputmode="numeric" min="1" step="1" placeholder="직접 입력"><button class="btn" data-amt="own">보내기</button></div>
  </div>`;
}

function render() {
  const ev = currentEvent();
  const order = r => (ev && ev.region_id === r.id ? 0 : r.cls === myClass ? 1 : 2);
  regions.sort((a, b) => order(a) - order(b) || a.cls - b.cls);
  // 입력 중인 숫자는 지키며 다시 그린다
  const typed = {};
  document.querySelectorAll("#sendList .row").forEach(el => { const v = el.querySelector(".own input")?.value; if (v) typed[el.dataset.r] = v; });
  $("sendList").innerHTML = regions.map(r => card(r, ev)).join("");
  for (const [id, v] of Object.entries(typed)) { const i = document.querySelector(`#sendList .row[data-r="${id}"] .own input`); if (i) i.value = v; }
}

export async function loadRegions() {
  const [rg, cl, inf] = await Promise.all([
    db.from("regions").select("id, name, hazard, shield"),
    db.from("classes").select("id, region_id, name"),
    db.rpc("infra_all"),
  ]);
  const infOf = new Map((inf.data ?? []).map(x => [x.region_id, { ...x, fund: Number(x.fund) }]));
  if (rg.error || cl.error) { $("sendList").innerHTML = `<p class="note">지역을 불러오지 못했어요.</p>`; return; }
  const clsOf = new Map(cl.data.filter(c => c.region_id).map(c => [c.region_id, c]));
  regions = rg.data.map(r => {
    const c = clsOf.get(r.id);
    const f = infOf.get(r.id);
    return { ...r, shield: Number(r.shield), cls: c?.id ?? 0, clsName: c ? (c.name ?? `${c.id}반`) : "", team: !!c?.name,
             cap: f ? Number(f.cap) : 150, infra: f ?? null };
  });
  render();
}

/* 1초마다 재난 카드의 남은 시간·대비율만 고친다(카드를 다시 그리지 않아 버튼이 씹히지 않는다) */
window.addEventListener("hcu:second", e => {
  const ev = e.detail, el = document.querySelector(`#sendList .row[data-r="${ev.region_id}"]`);
  if (!el) return;
  const sh = liveShield(ev);
  el.querySelector(".cd").textContent = mmss(leftMs(ev));
  el.querySelector(".bar i").style.width = Math.min(100, sh) + "%";
  el.querySelector(".sv").textContent = shieldLine(sh, capOf(ev.region_id));
  el.querySelector(".dr").textContent = "−" + num1(liveDrained(ev));
});
/* 15초마다 재난 정보가 오면: 재난이 시작·끝났을 때만 목록 순서를 다시 짜고,
   그 밖에는 이미 있는 카드의 숫자만 고친다. (un-summit "목록을 다시 그리지 않는다": 누르던 버튼이 바뀌면 탭이 씹힌다) */
let shownEv = null;
window.addEventListener("hcu:event", async e => {
  const id = e.detail?.id ?? null;
  if (id !== shownEv) { shownEv = id; return loadRegions(); }
  const { data } = await db.from("regions").select("id, shield");
  for (const row of data ?? []) {
    const r = regions.find(x => x.id === row.id); if (!r) continue;
    r.shield = Number(row.shield);
    if (e.detail && e.detail.region_id === r.id) continue;      // 재난 카드는 1초마다 따로 그린다
    const el = document.querySelector(`#sendList .row[data-r="${r.id}"]`); if (!el) continue;
    el.querySelector(".bar i").style.width = Math.min(100, r.shield) + "%";
    el.querySelector(".bar").classList.toggle("over", r.shield > 100);
    el.querySelector(".sv").textContent = shieldLine(r.shield, r.cap);
  }
});

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
  if (error) {
    if (/잠겨/.test(error.message)) window.dispatchEvent(new Event("hcu:locked"));
    return tick(serverMsg(error), "bad");
  }

  r.shield = Number(data.shield);
  const ev = currentEvent();
  if (ev && ev.region_id === r.id) { ev.shield = r.shield; ev.drained = liveDrained(ev); }   // 다음 1초 계산이 새 값에서 이어지게
  el.querySelector(".bar i").style.width = Math.min(100, r.shield) + "%";
  el.querySelector(".bar").classList.toggle("over", r.shield > 100);
  el.querySelector(".sv").textContent = shieldLine(r.shield, r.cap);
  if (r.infra) { r.infra.fund = Number(data.fund); const mini = el.querySelector(".infra-mini"); if (mini) mini.outerHTML = miniInfra(r); }
  inp.value = "";
  setBalance(data.balance);
  const toFund = Math.floor(Number(data.to_fund) || 0);
  const toShield = amt * data.mult - toFund;
  const fundTxt = toFund ? ` · 기금 +${toFund.toLocaleString()}` : "";
  tick(data.mult > 1
    ? `${r.name}에 ${amt}코인 → 재난 중이라 ${data.mult}배! 대비율 +${num1(toShield / 20)}%${fundTxt}`
    : `${r.name}에 ${amt}코인을 보냈어요. 대비율 +${num1(toShield / 20)}%${fundTxt}`, "good");
  announce(data.built);
  window.dispatchEvent(new Event("hcu:sent"));
});

onProfile(p => { myClass = p.classId; loadRegions(); });
window.addEventListener("hcu:infra", () => loadRegions());          // 시설을 지으면 상한·단계가 바뀐다
window.addEventListener("hcu:tab", e => { if (e.detail === "send") loadRegions(); });   // 다른 학생이 보낸 것까지 새로
