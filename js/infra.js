/* ==========================================================
   infra.js — 지원 탭 맨 위 "우리 지역 시설" 카드: 기금, 시설 3가지, 반 투표
   지역에 보낸 코인이 대비율 상한을 넘치면 그 지역 기금이 된다(sql/03_game.sql send_coins).
   맡은 반이 투표하고, 표가 가장 많은 시설이 최소 표를 넘고 기금이 모이면 서버가 저절로 짓는다(sql/06_infra.sql).
   숫자(효과·값)는 서버가 정하고 여기서는 보여 주기만 한다. 효과 문구만 서버 규칙을 그대로 옮겨 적었다.
   ========================================================== */
import { db } from "./config.js";
import { $, esc, tick, onProfile, serverMsg, num1 } from "./ui.js";

let me = null;
let state = null;

/* 시설 효과 문구 (sql/06_infra.sql 의 region_drain·region_cap·region_defense_bonus_pc 와 같게) */
const EFFECT = {
  warning: l => `재난이 깎는 대비율 ${num1(30 * (1 - 0.1 * l))}%`,
  wall:    l => `대비율 상한 ${150 + 20 * l}%`,
  shelter: l => `방어 성공 보너스 1인당 ${10 + 5 * l}점`,
};

function draw() {
  if (!state) return;
  const s = state, name = s.regionName;
  const items = s.items.map(it => {
    const mine = s.my_vote === it.key, maxed = it.level >= it.max;
    const pct = maxed ? 100 : Math.min(100, Number(s.fund) / it.cost * 100);
    return `<div class="fac${mine ? " voted" : ""}">
      <div class="fh"><b>${esc(it.name)}</b><span class="flv">${it.level} / ${it.max}단계${mine ? " · 내 표" : ""}</span></div>
      <div class="d">${EFFECT[it.key]?.(it.level) ?? ""}${maxed ? " · 최고 단계" : ` → 다음 단계 ${EFFECT[it.key]?.(it.level + 1).replace(/^.* /, "") ?? ""}`}</div>
      ${maxed ? "" : `<div class="bar"><i style="width:${pct}%"></i></div>
      <div class="d">기금 ${Math.floor(Number(s.fund)).toLocaleString()} / ${it.cost.toLocaleString()} · 표 ${it.votes}</div>`}
      ${s.can_vote && !maxed ? `<button class="btn ${mine ? "" : "ghost"} sm" data-vote="${it.key}">${mine ? "투표 취소" : "이걸 짓자"}</button>` : ""}
    </div>`;
  }).join("");
  $("infraBox").innerHTML = `
    <div class="rtop"><div class="t">${esc(name)} 시설</div><b class="fund">기금 ${Math.floor(Number(s.fund)).toLocaleString()}</b></div>
    <p class="d">대비율이 가득(${num1(s.cap)}%) 찬 뒤에 보낸 코인은 이 지역 기금이 돼요. ${s.can_vote
      ? `우리 ${me?.className === "교사" ? "팀" : "반"}이 투표해서, 표가 가장 많은 시설이 ${s.need_votes}표 이상이고 기금이 모이면 저절로 지어져요. 지을 때마다 순위 점수도 받아요.`
      : "이 지역을 맡은 반이 투표해서 지어요."}</p>
    <div class="facs">${items}</div>`;
  $("infraBox").hidden = false;
}

export async function loadInfra() {
  if (!me?.regionId) { $("infraBox").hidden = true; return; }
  const { data, error } = await db.rpc("infra_state", { p_region: me.regionId });
  if (error || !data) return;
  const { data: r } = await db.from("regions").select("name").eq("id", me.regionId).maybeSingle();
  state = { ...data, regionName: r?.name ?? "" };
  draw();
}

$("infraBox").addEventListener("click", async e => {
  const b = e.target.closest("[data-vote]"); if (!b) return;
  b.disabled = true;
  const { data, error } = await db.rpc("vote_infra", { p_key: b.dataset.vote });
  b.disabled = false;
  if (error) {
    if (/잠겨/.test(error.message)) window.dispatchEvent(new Event("hcu:locked"));
    return tick(serverMsg(error), "bad");
  }
  state = { ...data, regionName: state?.regionName ?? "" };
  draw();
  announce(data.built);
});

/* 지어진 시설 알림 (보내기·투표 결과의 built) */
export function announce(built) {
  for (const x of built ?? []) tick(`${x.name} ${x.level}단계를 지었어요! 순위 점수도 받았어요.`, "good");
  if (built?.length) window.dispatchEvent(new Event("hcu:infra"));
}

onProfile(p => { me = p; loadInfra(); });
window.addEventListener("hcu:tab", e => { if (e.detail === "send") loadInfra(); });
window.addEventListener("hcu:sent", loadInfra);
