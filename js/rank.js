/* ==========================================================
   rank.js — 순위 탭: 반 순위, 동아리 순위 (이번 기간 기여의 1인당 평균)
   기여 = 보낸 코인 × 그때 배수(재난 중 2배). 반 순위에는 재난 방어 보너스도 더한다(sql rank_classes).
   기간(주·일·월)은 서버(sql/03_game.sql 의 rank_unit)가 정하고, 화면은 남은 시간만 센다.
   맨 위 카드는 우리 반이 돕는 지역의 대비율(팀 페이지 역할).
   서버는 팀 단위 숫자만 준다. 학생 개인 이름·이메일은 오지 않는다.
   ========================================================== */
import { db } from "./config.js";
import { $, esc, onProfile, num1, shieldText, mis } from "./ui.js";

let kind = "class";
let me = null;
let roundEnd = 0;          // 이번 기간이 끝나는 시각(ms)
let unit = "week";         // 서버가 정한 순위 기간(rank_round)
const UNIT = { day: "오늘", week: "이번 주", month: "이번 달" };

function left(ms) {
  if (ms <= 0) return "곧 새 기간";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600),
        m = Math.floor(s % 3600 / 60), sec = s % 60;
  if (d) return `${d}일 ${h}시간 ${m}분 남음`;
  if (h) return `${h}시간 ${m}분 남음`;
  return `${m}분 ${String(sec).padStart(2, "0")}초 남음`;
}
function drawClock() {
  if (!roundEnd) return;
  const ms = roundEnd - Date.now();
  $("roundLeft").textContent = left(ms);
  if (ms <= 0 && $("rank").classList.contains("on")) { roundEnd = 0; setTimeout(load, 3000); }   // 새 기간으로 다시 읽기
}
setInterval(drawClock, 1000);

async function load() {
  if (!me) return;
  const [cls, clubs, reg, round] = await Promise.all([
    db.rpc("rank_classes"),
    kind === "club" ? db.rpc("rank_clubs") : Promise.resolve({ data: null }),
    db.from("regions").select("id, name, shield"),
    db.rpc("rank_round"),
  ]);
  if (cls.error || reg.error) { $("rankList").innerHTML = `<p class="note">순위를 불러오지 못했어요.</p>`; return; }
  if (round.data) {
    roundEnd = new Date(round.data.ends).getTime();
    unit = round.data.unit;
    $("roundName").textContent = `${UNIT[round.data.unit] ?? "이번 기간"} 순위`;
    const end = new Date(round.data.ends);
    $("round").title = `${end.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "numeric" })}에 새로 시작`;
    drawClock();
  }

  // 우리 반 카드 (교사 팀은 맡은 지역이 없어 팀 기록만)
  const mine = cls.data.find(r => r.class_id === me.classId);
  const region = reg.data.find(r => r.name === mine?.region_name);
  const sh = Number(region?.shield ?? 0);
  if (mine && !mine.region_name) {
    $("myRegion").innerHTML = `
      <small>${esc(mine.class_name)} 팀, 맡은 지역 없이 어디든 도와요</small>
      <div class="big">${UNIT[unit] ?? "이번 기간"} 기여 ${Number(mine.sent).toLocaleString()}</div>
      <small>${mis(`가입 ${mine.members}명`, `한 사람당 ${mine.per_capita == null ? "없음" : num1(mine.per_capita)}`, `오늘 ${Number(mine.sent_today).toLocaleString()}코인`)}</small>`;
  } else $("myRegion").innerHTML = `
    <small>우리 ${me.className === "교사" ? "팀" : "반"}이 돕는 곳, <b>${esc(mine?.region_name ?? "")}</b></small>
    <div class="big">대비율 ${shieldText(sh)}</div>
    <div class="bar"><i style="width:${Math.min(100, sh)}%"></i><span class="safe"></span></div>
    <small>${mis(sh >= 50 ? "재난을 버틸 수 있어요" : `50%까지 ${num1(50 - sh)}% 남았어요`,
      `오늘 우리 ${me.className === "교사" ? "팀" : "반"} 기여 ${Number(mine?.sent_today ?? 0).toLocaleString()}`,
      Number(mine?.bonus) ? `이번 기간 보너스(방어와 시설) ${Number(mine.bonus).toLocaleString()}` : "")}</small>`;

  const rows = kind === "class"
    ? cls.data.map(r => ({ id: r.class_id, t: r.class_name, rg: r.region_name ?? "", m: r.members, sent: r.sent, bonus: Number(r.bonus) || 0, v: r.per_capita, me: r.class_id === me.classId }))
    : (clubs.data ?? []).map(r => ({ id: r.club_id, t: r.club_name, m: r.members, sent: r.sent, v: r.per_capita, me: r.club_id === me.clubId }));

  // 같은 평균이면 같은 등수
  let rank = 0, prev = null;
  $("rankList").innerHTML = rows.map((r, i) => {
    if (r.v !== prev) { rank = i + 1; prev = r.v; }
    return `<div class="rk${r.me ? " me" : ""}"><span class="n">${r.v == null ? "–" : rank}</span>
      <div class="m"><div class="t">${esc(r.t)}${r.rg ? `<span class="rg">${esc(r.rg)}</span>` : ""}</div><div class="d">${mis(`가입 ${r.m}명`, `이번 기간 기여 ${Number(r.sent).toLocaleString()}`, r.bonus ? `보너스(방어와 시설) ${r.bonus.toLocaleString()}` : "")}</div></div>
      <span class="v">${r.v == null ? "–" : num1(r.v)}</span></div>`;
  }).join("") || `<p class="note">아직 기록이 없어요.</p>`;
}

document.querySelectorAll("#rankSeg button").forEach(b => b.addEventListener("click", () => {
  kind = b.dataset.r;
  document.querySelectorAll("#rankSeg button").forEach(x => x.classList.toggle("on", x === b));
  load();
}));
window.addEventListener("hcu:tab", e => { if (e.detail === "rank") load(); });
window.addEventListener("hcu:sent", () => { if ($("rank").classList.contains("on")) load(); });
onProfile(p => { me = p; load(); });
window.addEventListener("hcu:newday", () => load());          // "오늘 우리 반 지원"을 0부터
