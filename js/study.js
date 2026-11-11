/* ==========================================================
   study.js — 고른 단어장으로 공부하기
   (voca-web js/quiz.js 의 단계별 유형 방식을 가져와, 자동 채점 문제만 남기고 서버 채점으로 바꿈)

   시작 전에 고른다: 어느 단계 문제로(내 단계대로 또는 1~6단계) 몇 개(10·20·30·전체) 풀지.
   1~6단계를 고르면 모든 단어를 그 단계 문제로 낸다. 낮은 단계를 거치지 않았어도 바로 도전할 수 있다.
     도전(고른 단계 ≥ 내 단계): 맞히면 고른 단계의 다음 단계로, 틀려도 단계 그대로
     복습(고른 단계 < 내 단계): 맞혀도 단계 그대로, 틀리면 한 단계 내려감
   코인은 고른 단계만큼, 같은 단어는 하루에 한 번. 실제 판정은 서버(sql/04_study.sql)가 한다.
   답은 /api/answer 로 보내고, 맞았는지·코인·새 단계는 서버가 정해서 돌려준다.
   ========================================================== */
import { db } from "./config.js";
import { $, esc, setBalance, getBalance, coinPop, tick, kstToday, mis, toTop } from "./ui.js";
import { typesForLevel, question, COINS, ENERGY, coinLevel } from "./quiz-core.js";

const COUNTS = [10, 20, 30, 0];          // 0 = 전체
const TYPE_NAME = ["뜻", "철자", "유의어", "표현", "예문", "종합"];

let set = null;        // {id, name}
let queue = [];        // 이번 회차 단어들
let idx = 0;
let cur = null;        // {w, level, type}
let busy = false;
let stats = { right: 0, total: 0, coins: 0, energy: 0 };
let words = [];        // 이 단어장의 단어 (내 진도 포함)
let pickLevel = -1;    // -1 = 내 단계대로, 0~5 = 모든 단어를 그 단계 문제로
let pickCount = 20;    // 0 = 전체

const levelOf = w => w.progress?.[0]?.srs_level ?? 0;
const doneToday = w => w.progress?.[0]?.last_correct_day === kstToday();
const wrongToday = w => w.progress?.[0]?.last_wrong_day === kstToday();      // 오늘 한 번 틀린 단어: 코인은 내일
const noCoinToday = w => doneToday(w) || wrongToday(w);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
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
    .select("id, word, senses, synonyms, antonyms, phrases, sentences, progress(srs_level, last_correct_day, last_wrong_day)")
    .eq("set_id", s.id)
    .order("position");
  if (error) { $("stHead").innerHTML = mis(esc(s.name), "불러오지 못했어요"); return; }
  words = data;
  setup();
}

/* ---------- 시작 전: 단계와 개수 고르기 ---------- */
const askLevel = w => (pickLevel < 0 ? levelOf(w) : pickLevel);          // 이 단어를 몇 단계 문제로 낼까
const usable = w => typesForLevel(w, askLevel(w)).length > 0;

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

/* 문제를 낸 시각을 서버에 남긴다(너무 빠른 자동 풀이 거르기, sql/04_study.sql). 실패하면 한 번 더.
   끝내 실패하면 false — 답할 때 다시 남기고, 학생에게 "연결" 문제라고 알린다(코인을 못 받는 이유가 엉뚱하지 않게). */
async function issue(id, tries = 2) {
  for (let i = 0; i < tries; i++) {
    const { error } = await db.rpc("issue_question", { p_word: id });
    if (!error) return true;
  }
  return false;
}

function ask() {
  const w = queue[idx];
  const mine = levelOf(w);
  const level = askLevel(w);
  const type = pick(typesForLevel(w, level));
  const q = question(w, type);
  // 문제를 낸 시각을 서버에 남긴다(너무 빠른 자동 풀이 거르기, sql/04_study.sql). 답하기 전에 끝나 있으면 된다.
  cur = { w, level, type, issued: issue(w.id) };
  const mode = level > mine ? "도전" : level < mine ? "복습" : "";

  $("stHead").innerHTML = mis(esc(set.name), `<span class="num">${idx + 1} / ${queue.length}</span>`);
  $("stBar").style.width = (idx / queue.length * 100) + "%";
  $("stType").innerHTML = mis(`${level + 1}단계${mode ? ` ${mode}` : ""}`, esc(q.label),
    doneToday(w) ? "오늘은 이 단어 코인을 이미 받았어요"
      : wrongToday(w) ? "오늘 한 번 틀린 단어라 코인은 내일 받아요"
      : `맞히면 ${COINS[coinLevel(level, type)]}코인, 에너지 ${ENERGY[coinLevel(level, type)]}`);

  if (q.cloze) {
    $("stBig").innerHTML = `${esc(q.cloze.before)}<span class="blank">${"_".repeat(Math.max(3, q.cloze.answer.length))}</span>${esc(q.cloze.after)}`;
    $("stBig").className = "qword long";
  } else {
    $("stBig").textContent = q.big;
    $("stBig").className = "qword" + (q.big.length > 18 ? " long" : "");
  }
  $("stSub").textContent = q.sub || "";
  const inp = $("stInput");
  inp.value = "";
  inp.placeholder = q.ask;
  inp.lang = q.lang;
  inp.disabled = false;
  $("stGo").disabled = $("stSkip").disabled = false;
  $("stRes").hidden = true;
  $("stNext").hidden = true;
  $("stCard").hidden = false;
  toTop($("stCard"));                       // 다음 문제도 맨 위에서 (문제 카드는 계속 보이는 채라 감시로는 안 잡힌다)
  inp.focus({ preventScroll: true });
}

async function submit(answer) {
  if (busy || !cur) return;
  busy = true;
  $("stInput").disabled = $("stGo").disabled = $("stSkip").disabled = true;

  let res, body;
  try {
    if (!(await cur.issued)) {
      busy = false;
      cur.issued = issue(cur.w.id);
      showResult("bad", "인터넷 연결이 불안정해서 문제를 서버에 기록하지 못했어요. 잠시 뒤에 같은 답을 다시 보내 주세요.");
      $("stInput").disabled = $("stGo").disabled = $("stSkip").disabled = false;
      $("stNext").hidden = true;
      return;
    }
    const { data: { session } } = await db.auth.getSession();
    res = await fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ word_id: cur.w.id, type: cur.type, answer, level: pickLevel < 0 ? null : pickLevel }),
    });
    body = await res.json().catch(() => ({}));
  } catch {
    body = { error: "인터넷 연결을 확인해 주세요." };
  }
  busy = false;

  if (res?.status === 409 && body.stale) {          // 다른 곳에서 단계가 바뀜 → 새 단계로 다시
    cur.w.progress = [{ ...(cur.w.progress?.[0] ?? {}), srs_level: body.level }];
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
    showResult("good", body.throttled === "fast"
      ? "맞았어요! 다만 너무 빨리 답해서 이번엔 코인이 없어요. 다음에 다시 풀면 받을 수 있어요."
      : "맞았어요! 코인은 1분에 20문제까지 받아요. 잠깐 쉬었다가 다시 풀면 받을 수 있어요.", body.answer);
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
  cur = null;
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
$("stNext").addEventListener("click", next);
$("stClose").addEventListener("click", close);
window.addEventListener("hcu:study", e => start(e.detail));
window.addEventListener("hcu:signout", () => { $("study").hidden = true; });
