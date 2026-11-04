/* ==========================================================
   rank.js — 순위 탭: 반 순위, 동아리 순위 (1인당 평균 보낸 코인)
   맨 위 카드는 우리 반이 돕는 지역의 대비율(팀 페이지 역할).
   서버는 팀 단위 숫자만 준다. 학생 개인 이름·이메일은 오지 않는다.
   ========================================================== */
import { db } from "./config.js";
import { $, esc, onProfile, num1 } from "./ui.js";

let kind = "class";
let me = null;

async function load() {
  if (!me) return;
  const [cls, clubs, reg] = await Promise.all([
    db.rpc("rank_classes"),
    kind === "club" ? db.rpc("rank_clubs") : Promise.resolve({ data: null }),
    db.from("regions").select("id, name, shield"),
  ]);
  if (cls.error || reg.error) { $("rankList").innerHTML = `<p class="note">순위를 불러오지 못했어요.</p>`; return; }

  // 우리 반 카드
  const mine = cls.data.find(r => r.class_id === me.classId);
  const region = reg.data.find(r => r.name === mine?.region_name);
  const sh = Number(region?.shield ?? 0);
  $("myRegion").innerHTML = `
    <small>우리 반이 돕는 곳 · <b>${esc(mine?.region_name ?? "")}</b></small>
    <div class="big">대비율 ${num1(sh)}%</div>
    <div class="bar"><i style="width:${Math.min(100, sh)}%"></i><span class="safe"></span></div>
    <small>${sh >= 50 ? "재난을 버틸 수 있어요" : `50%까지 ${num1(50 - sh)}% 남았어요`} · 오늘 우리 반 지원 ${Number(mine?.sent_today ?? 0).toLocaleString()}코인</small>`;

  const rows = kind === "class"
    ? cls.data.map(r => ({ id: r.class_id, t: `${r.class_id}반 · ${r.region_name}`, m: r.members, sent: r.sent, v: r.per_capita, me: r.class_id === me.classId }))
    : (clubs.data ?? []).map(r => ({ id: r.club_id, t: r.club_name, m: r.members, sent: r.sent, v: r.per_capita, me: r.club_id === me.clubId }));

  // 같은 평균이면 같은 등수
  let rank = 0, prev = null;
  $("rankList").innerHTML = rows.map((r, i) => {
    if (r.v !== prev) { rank = i + 1; prev = r.v; }
    return `<div class="rk${r.me ? " me" : ""}"><span class="n">${r.v == null ? "–" : rank}</span>
      <div class="m"><div class="t">${esc(r.t)}</div><div class="d">가입 ${r.m}명 · 모두 ${Number(r.sent).toLocaleString()}코인</div></div>
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
