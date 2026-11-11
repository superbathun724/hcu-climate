/* ==========================================================
   study.js — 고른 단어장으로 공부하기
   (voca-web js/quiz.js 의 단계별 유형 방식을 가져와, 자동 채점 문제만 남기고 서버 채점으로 바꿈)

   시작 전에 고른다: 어느 단계 문제로(내 단계대로 또는 1~6단계) 몇 개(10·20·30·전체) 풀지.
   1~6단계를 고르면 모든 단어를 그 단계 문제로 낸다. 낮은 단계를 거치지 않았어도 바로 도전할 수 있다.
     도전(고른 단계 ≥ 내 단계): 맞히면 고른 단계의 다음 단계로, 틀려도 단계 그대로
     복습(고른 단계 < 내 단계): 맞혀도 단계 그대로, 틀리면 한 단계 내려감
   코인은 고른 단계만큼, 같은 단어는 하루에 한 번. 실제 판정은 서버(sql/04_study.sql)가 한다.
   답은 /api/answer 로 보내고, 맞았는지·코인·새 단계는 서버가 정해서 돌려준다.

   단어 매크로 막기
     - 문제는 서버(/api/question)가 낸다. 화면은 유의어·반의어·예문 같은 답을 받지 않는다.
     - 문제 글자는 글자(DOM)가 아니라 그림(canvas)으로 그린다. 화면 글자를 긁는 확장 프로그램이 못 읽게.
     - 붙여넣기·끌어 놓기는 막고, 직접 타자를 쳤는지(typed)를 함께 보낸다. 안 쳤으면 코인 없이 채점만.
   ========================================================== */
import { db } from "./config.js";
import { $, esc, setBalance, getBalance, coinPop, tick, kstToday, mis, toTop } from "./ui.js";
import { COINS, ENERGY } from "./quiz-core.js";

const COUNTS = [10, 20, 30, 0];          // 0 = 전체
const TYPE_NAME = ["뜻", "철자", "유의어", "표현", "예문", "종합"];

let set = null;        // {id, name}
let queue = [];        // 이번 회차 단어들
let idx = 0;
let cur = null;        // {w, level, type, pay, keys} 또는 {retry: true}
let askSeq = 0;
let busy = false;
let stats = { right: 0, total: 0, coins: 0, energy: 0 };
let words = [];        // 이 단어장의 단어 (내 진도 포함)
let pickLevel = -1;    // -1 = 내 단계대로, 0~5 = 모든 단어를 그 단계 문제로
let pickCount = 20;    // 0 = 전체

const levelOf = w => w.progress?.[0]?.srs_level ?? 0;
const doneToday = w => w.progress?.[0]?.last_correct_day === kstToday();
const wrongToday = w => w.progress?.[0]?.last_wrong_day === kstToday();      // 오늘 한 번 틀린 단어: 코인은 내일
const noCoinToday = w => doneToday(w) || wrongToday(w);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

async function start(s) {
  set = s;
  $("study").hidden = false;
  $("stDone").hidden = true;
  $("stCard").hidden = true;
  $("stSetup").hidden = true;
  $("stBar").style.width = "0";
  $("stHead").innerHTML = mis(esc(s.name), "불러오는 중…");
  setBalance(getBalance());                 // 공부 화면 코인 칩을 지금 값으로

  // progress 는 RLS 때문에 내 것만 붙어 온다
  const { data, error } = await db.from("words")
    .select("id, word, senses, phrases, progress(srs_level, last_correct_day, last_wrong_day)")   // 답이 든 열은 못 읽는다(sql/02_words.sql)
    .eq("set_id", s.id)
    .order("position");
  if (error) { $("stHead").innerHTML = mis(esc(s.name), "불러오지 못했어요"); return; }
  words = data;
  setup();
}

/* ---------- 시작 전: 단계와 개수 고르기 ---------- */
const askLevel = w => (pickLevel < 0 ? levelOf(w) : pickLevel);          // 이 단어를 몇 단계 문제로 낼까
// 문제를 낼 자료(뜻이나 표현)가 있는 단어. 유의어·예문만 있는 드문 단어는 서버가 알려 주면 건너뛴다.
const usable = w => (w.senses ?? []).some(s => s.meaning) || (w.phrases ?? []).length > 0;

function setup() {
  $("stHead").textContent = set.name;
  $("stCard").hidden = true;
  $("stDone").hidden = true;

  const chip = (lv, label, sub, note) =>
    `<button type="button" class="pick${pickLevel === lv ? " on" : ""}" data-lv="${lv}">
       <b>${label}</b><small>${sub}</small><span>${note}</span></button>`;
  const challenge = lv => words.filter(w => levelOf(w) <= lv).length;
  $("stSetup").innerHTML = `
    <div class="t">몇 단계 문제로 풀까요?</div>
    <div class="picks lvpick">
      ${chip(-1, "내 단계대로", "단어마다 지금 단계", `${words.length}개`)}
      ${COINS.map((c, i) => chip(i, `${i + 1}단계`, `${TYPE_NAME[i]}, ${c}코인`, `도전 ${challenge(i)}개`)).join("")}
    </div>
    <div class="t">몇 개 풀까요?</div>
    <div class="picks cnt">
      ${COUNTS.map(c => `<button type="button" class="pick${pickCount === c ? " on" : ""}" data-cnt="${c}"><b>${c ? c + "개" : "전체"}</b></button>`).join("")}
    </div>
    <p class="note" id="stPlan"></p>
    <button type="button" class="btn coin wide" id="stStart">공부 시작</button>`;
  plan();
  $("stSetup").hidden = false;
}

function pool() { return words.filter(usable); }
function plan() {
  const list = pool(), n = list.length, take = pickCount ? Math.min(pickCount, n) : n;
  const fresh = list.filter(w => !noCoinToday(w)).length;
  const how = pickLevel < 0
    ? "단어마다 지금 단계 문제가 나와요."
    : `모든 단어가 ${pickLevel + 1}단계(${TYPE_NAME[pickLevel]}) 문제로 나와요. 내 단계보다 높으면 도전이라 맞히면 ${pickLevel >= 4 ? "6단계가 되고" : `${pickLevel + 2}단계로 올라가고`}, 틀려도 단계는 그대로예요. 내 단계보다 낮으면 복습이에요.`;
  $("stPlan").textContent = n
    ? `${how} ${take}개, ${fresh ? `오늘 아직 코인을 안 받은 단어부터 나와요.` : "모두 오늘 코인을 이미 받은 단어라 연습만 돼요."}`
    : "이 단계로 낼 수 있는 문제가 없어요.";
  $("stStart").disabled = !n;
  $("stStart").textContent = n ? `공부 시작 (${take}개)` : "공부 시작";
}

$("stSetup").addEventListener("click", e => {
  const b = e.target.closest(".pick");
  if (b && !b.disabled) {
    if (b.dataset.lv !== undefined) pickLevel = Number(b.dataset.lv);
    if (b.dataset.cnt !== undefined) pickCount = Number(b.dataset.cnt);
    b.parentElement.querySelectorAll(".pick").forEach(x => x.classList.toggle("on", x === b));
    plan();
  }
  if (e.target.closest("#stStart")) begin();
});

async function begin() {
  const list = pool();
  // 오늘 아직 코인을 안 받은 단어부터, 그 안에서는 섞어서
  const fresh = shuffle(list.filter(w => !noCoinToday(w)));
  const done = shuffle(list.filter(w => noCoinToday(w)));
  queue = [...fresh, ...done];
  if (pickCount) queue = queue.slice(0, pickCount);
  idx = 0;
  stats = { right: 0, total: 0, coins: 0, energy: 0 };
  $("stSetup").hidden = true;
  if (!queue.length) { finish("이 단어장에는 낼 수 있는 문제가 없어요."); return; }
  await window.hcuFlushTaps?.();       // 코인 숫자를 서버와 맞춰 둔다
  ask();
}

/* ---------- 문제 글자를 그림으로 ----------
   글자를 DOM 에 두지 않고 canvas 에 그린다. 모양은 예전 .qword 와 같게(같은 글꼴·크기·색). */
let lastQ = null;
window.addEventListener("resize", () => { if (lastQ && !$("study").hidden) drawPrompt(lastQ); });
function drawPrompt(q) {
  lastQ = q;
  const box = $("stBig");
  const long = !!q.cloze || (q.big || "").length > 18;
  box.className = "qword" + (long ? " long" : "");
  let cv = box.querySelector("canvas");
  if (!cv) { box.textContent = ""; cv = document.createElement("canvas"); cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "문제"); box.append(cv); }
  const cs = getComputedStyle(box);
  const size = parseFloat(cs.fontSize), lh = size * (long ? 1.5 : 1.15);
  const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const avail = Math.max(160, box.parentElement.clientWidth - pad - 8);
  const ctx = cv.getContext("2d");
  let fsize = size;
  const setFont = () => { ctx.font = `${cs.fontWeight} ${fsize}px ${cs.fontFamily}`; };
  setFont();
  // 조각: 글자 또는 빈칸
  const toks = [];
  const push = text => text.split(/(\s+)/).forEach(t => t && toks.push({ t }));
  if (q.cloze) { push(q.cloze.before); toks.push({ blank: Math.max(3, q.cloze.len) }); push(q.cloze.after); }
  else push(q.big || "");
  if (!long) { while (ctx.measureText(q.big || "").width > avail && fsize > 14) { fsize -= 2; setFont(); } }
  const wOf = k => k.blank ? ctx.measureText("n").width * (k.blank + 1) : ctx.measureText(k.t).width;
  // 줄 나누기 (띄어쓰기가 없는 긴 조각은 글자 단위로)
  const lines = [[]]; let x = 0;
  for (const k of toks) {
    let w = wOf(k);
    if (!k.blank && w > avail) {
      for (const ch of k.t) { const cw = ctx.measureText(ch).width; if (x + cw > avail) { lines.push([]); x = 0; } lines.at(-1).push({ t: ch }); x += cw; }
      continue;
    }
    if (x + w > avail && x > 0) { lines.push([]); x = 0; if (/^\s+$/.test(k.t ?? "")) continue; }
    lines.at(-1).push(k); x += w;
  }
  const widths = lines.map(l => l.reduce((a, k) => a + wOf(k), 0));
  const W = long ? avail : Math.ceil(Math.max(...widths, 1)), H = Math.ceil(lines.length * lh);
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
  cv.style.width = W + "px"; cv.style.height = H + "px"; cv.style.display = "block";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); setFont();
  ctx.fillStyle = cs.color; ctx.strokeStyle = cs.color; ctx.textBaseline = "middle"; ctx.lineWidth = 2;
  lines.forEach((l, i) => {
    let px = long ? 0 : (W - widths[i]) / 2; const py = i * lh + lh / 2;
    for (const k of l) {
      const w = wOf(k);
      if (k.blank) { ctx.beginPath(); ctx.moveTo(px + 2, py + fsize * 0.45); ctx.lineTo(px + w - 2, py + fsize * 0.45); ctx.stroke(); }
      else ctx.fillText(k.t, px, py);
      px += w;
    }
  });
}

async function ask() {
  const w = queue[idx], seq = ++askSeq;
  cur = null;
  $("stHead").innerHTML = mis(esc(set.name), `<span class="num">${idx + 1} / ${queue.length}</span>`);
  $("stBar").style.width = (idx / queue.length * 100) + "%";
  $("stType").textContent = "문제를 불러오는 중…";
  $("stSub").textContent = "";
  const inp = $("stInput");
  inp.value = ""; inp.disabled = true;
  $("stGo").disabled = $("stSkip").disabled = true;
  $("stRes").hidden = true; $("stNext").hidden = true;
  $("stCard").hidden = false;
  toTop($("stCard"));

  let res, body;
  try {
    const { data: { session } } = await db.auth.getSession();
    res = await fetch("/api/question", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ word_id: w.id, level: pickLevel < 0 ? null : pickLevel }),
    });
    body = await res.json().catch(() => ({}));
  } catch { body = { error: "인터넷 연결을 확인해 주세요." }; }
  if (seq !== askSeq) return;                                  // 그사이 창을 닫았거나 다음으로 넘어감

  if (res?.status === 422 && body.skip) {                       // 이 단어로는 문제를 낼 수 없음 → 건너뛰기
    queue.splice(idx, 1);
    return idx < queue.length ? ask() : queue.length ? finish() : finish("이 단어장에는 낼 수 있는 문제가 없어요.");
  }
  if (!res?.ok) {
    if (/잠겨/.test(body.error || "")) window.dispatchEvent(new Event("hcu:locked"));
    cur = { retry: true };
    showResult("bad", body.error || "문제를 불러오지 못했어요.");
    $("stNext").textContent = "다시 불러오기";
    return;
  }

  const { q, level, type, pay, mine } = body;
  w.progress = [{ ...(w.progress?.[0] ?? {}), srs_level: mine }];
  cur = { w, level, type, pay, keys: 0 };
  const mode = level > mine ? "도전" : level < mine ? "복습" : "";
  $("stType").innerHTML = mis(`${level + 1}단계${mode ? ` ${mode}` : ""}`, esc(q.label),
    doneToday(w) ? "오늘은 이 단어 코인을 이미 받았어요"
      : wrongToday(w) ? "오늘 한 번 틀린 단어라 코인은 내일 받아요"
      : `맞히면 ${COINS[pay]}코인, 에너지 ${ENERGY[pay]}`);
  drawPrompt(q);
  $("stSub").textContent = q.sub || "";
  inp.placeholder = q.ask;
  inp.lang = q.lang;
  inp.disabled = false;
  $("stGo").disabled = $("stSkip").disabled = false;
  inp.focus({ preventScroll: true });
}

async function submit(answer) {
  if (busy || !cur || cur.retry) return;
  busy = true;
  $("stInput").disabled = $("stGo").disabled = $("stSkip").disabled = true;

  let res, body;
  try {
    const { data: { session } } = await db.auth.getSession();
    res = await fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ word_id: cur.w.id, type: cur.type, answer, typed: cur.keys > 0 }),
    });
    body = await res.json().catch(() => ({}));
  } catch {
    body = { error: "인터넷 연결을 확인해 주세요." };
  }
  busy = false;

  if (res?.status === 409 && body.stale) {          // 다른 창에서 같은 단어 문제를 새로 받았음 → 새로 받기
    ask();
    return;
  }
  if (!res?.ok) {
    if (/잠겨/.test(body.error || "")) window.dispatchEvent(new Event("hcu:locked"));
    showResult("bad", body.error || "채점하지 못했어요. 잠시 뒤에 다시 해 주세요.");
    $("stInput").disabled = $("stGo").disabled = $("stSkip").disabled = false;
    $("stNext").hidden = true;
    return;
  }

  if (body.locked) {                                  // 답 간격이 기계 같아 잠김
    window.dispatchEvent(new Event("hcu:locked"));
    return;
  }
  if (body.throttled) {                               // 코인 없이 채점만. 단계·날짜는 그대로라 다시 풀면 받는다
    stats.total++; stats.right++;
    showResult("good", {
      fast: "맞았어요! 다만 너무 빨리 답해서 이번엔 코인이 없어요. 다음에 다시 풀면 받을 수 있어요.",
      busy: "맞았어요! 코인은 1분에 20문제까지 받아요. 잠깐 쉬었다가 다시 풀면 받을 수 있어요.",
      typed: "맞았어요! 다만 직접 입력한 답이 아니라 코인이 없어요. 붙여넣지 말고 직접 쳐서 다시 풀면 받을 수 있어요.",
      pause: "맞았어요! 아주 빠르게 연달아 맞혀서 10분 동안 코인만 쉬어 가요. 연습은 그대로 돼요.",
    }[body.throttled] ?? "맞았어요!", body.answer);
    return;
  }

  // 화면의 단계·날짜를 서버 값으로
  const p = cur.w.progress?.[0] ?? {};
  cur.w.progress = [{ ...p, srs_level: body.level,
    last_correct_day: body.correct && body.coins ? kstToday() : p.last_correct_day,
    last_wrong_day: body.correct ? p.last_wrong_day : kstToday() }];
  // 코인은 맞힐 때마다 서버 지갑에 바로 들어간다(record_answer). 중간에 그만둬도 이미 받은 코인은 그대로.
  if (body.balance != null) setBalance(body.balance);
  if (body.coins) coinPop("stCoinChip", body.coins);
  if (body.energy != null) window.dispatchEvent(new CustomEvent("hcu:energy", { detail: body.energy }));   // 게임 탭의 남은 탭 수
  stats.total++;
  if (body.correct) { stats.right++; stats.coins += body.coins; stats.energy += body.energy_gain ?? 0; }

  const moved = body.level > body.level_before ? `${body.level + 1}단계로 올랐어요.`
              : body.level < body.level_before ? `${body.level + 1}단계로 한 단계 내려가요.` : `단계는 ${body.level + 1}단계 그대로예요.`;
  if (body.correct) {
    showResult("good", body.already_today
      ? `맞았어요! 이 단어는 오늘 코인을 이미 받았어요.`
      : body.after_wrong
      ? `맞았어요! 오늘 한 번 틀린 단어라 코인과 단계는 내일 다시 도전해요.`
      : `맞았어요! +${body.coins}코인, 에너지 +${body.energy_gain ?? 0}(탭 ${body.energy_gain ?? 0}번). ${moved}`, body.answer);
  } else {
    showResult("bad", `${answer ? "틀렸어요." : "괜찮아요."} ${moved}`, body.answer);
  }
}

function showResult(kind, text, answerText) {
  const r = $("stRes");
  r.className = "qres " + kind;
  r.innerHTML = esc(text) + (answerText ? `<div class="ans">정답: <b>${esc(answerText)}</b></div>` : "");
  r.hidden = false;
  $("stNext").hidden = false;
  $("stNext").textContent = idx + 1 < queue.length ? "다음" : "결과 보기";
  $("stNext").focus();
}

function next() {
  if (cur?.retry) return ask();                       // 문제를 못 불러왔을 때: 같은 단어 다시
  idx++;
  if (idx < queue.length) ask();
  else finish();
}

function finish(note) {
  $("stCard").hidden = true;
  $("stBar").style.width = "100%";
  $("stHead").textContent = set ? set.name : "";
  $("stDone").innerHTML = note ? `<p class="note">${esc(note)}</p>` : `
    <div class="big">${stats.right} / ${stats.total}</div>
    <p class="note">맞힌 단어 수예요. ${mis(`이번에 받은 코인 <b>+${stats.coins}</b>`, `에너지 <b>+${stats.energy}</b>`)}</p>
    <div class="qbtns"><button class="btn ghost" id="stQuit">닫기</button><button class="btn coin" id="stAgain">다시 고르기</button></div>`;
  $("stDone").hidden = false;
  $("stAgain")?.addEventListener("click", setup);
  $("stQuit")?.addEventListener("click", close);
  if (!note && stats.coins) tick(`단어 공부로 ${stats.coins}코인과 에너지 ${stats.energy}(탭 ${stats.energy}번)를 받았어요.`, "good");
}

function close() {
  $("study").hidden = true;
  cur = null; askSeq++;
  window.dispatchEvent(new Event("hcu:sets-changed"));
}

$("stCard").addEventListener("submit", e => {
  e.preventDefault();
  if (!$("stNext").hidden) return next();          // 결과를 본 뒤 Enter = 다음
  const v = $("stInput").value.trim();
  if (!v) { $("stInput").focus(); return; }
  submit(v);
});
$("stSkip").addEventListener("click", () => submit(""));
// 답은 직접 친다: 붙여넣기·끌어 놓기 막기, 진짜 타자(isTrusted)만 센다
["paste", "drop"].forEach(ev => $("stInput").addEventListener(ev, e => { e.preventDefault(); tick("답은 직접 입력해 주세요."); }));
["keydown", "input"].forEach(ev => $("stInput").addEventListener(ev, e => { if (e.isTrusted && cur && !cur.retry) cur.keys++; }));
$("stNext").addEventListener("click", next);
$("stClose").addEventListener("click", close);
window.addEventListener("hcu:study", e => start(e.detail));
window.addEventListener("hcu:signout", () => { $("study").hidden = true; });
