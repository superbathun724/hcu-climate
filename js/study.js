/* ==========================================================
   study.js — 고른 단어장으로 공부하기
   (voca-web js/quiz.js 의 단계별 유형 방식을 가져와, 자동 채점 문제만 남기고 서버 채점으로 바꿈)

   한 번에 20개. 문제 유형은 단어의 단계가 정한다(js/quiz-core.js).
   답은 /api/answer 로 보내고, 맞았는지·코인·새 단계는 서버가 정해서 돌려준다.
   ========================================================== */
import { db } from "./config.js";
import { $, esc, setBalance, tick, kstToday } from "./ui.js";
import { typesForLevel, question, COINS } from "./quiz-core.js";

const ROUND = 20;

let set = null;        // {id, name}
let queue = [];        // 이번 회차 단어들
let idx = 0;
let cur = null;        // {w, level, type}
let busy = false;
let stats = { right: 0, total: 0, coins: 0 };

const levelOf = w => w.progress?.[0]?.srs_level ?? 0;
const doneToday = w => w.progress?.[0]?.last_correct_day === kstToday();
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

async function start(s) {
  set = s;
  $("study").hidden = false;
  $("stDone").hidden = true;
  $("stCard").hidden = true;
  $("stHead").textContent = `${s.name} · 불러오는 중…`;

  // progress 는 RLS 때문에 내 것만 붙어 온다
  const { data, error } = await db.from("words")
    .select("id, word, senses, synonyms, antonyms, phrases, sentences, progress(srs_level, last_correct_day)")
    .eq("set_id", s.id)
    .order("position");
  if (error) { $("stHead").textContent = `${s.name} · 불러오지 못했어요`; return; }

  const usable = data.filter(w => typesForLevel(w, levelOf(w)).length);
  // 오늘 아직 코인을 안 받은 단어부터, 그 안에서는 섞어서
  const fresh = shuffle(usable.filter(w => !doneToday(w)));
  const done = shuffle(usable.filter(w => doneToday(w)));
  queue = [...fresh, ...done].slice(0, ROUND);
  idx = 0;
  stats = { right: 0, total: 0, coins: 0 };
  if (!queue.length) { finish("이 단어장에는 낼 수 있는 문제가 없어요."); return; }
  await window.hcuFlushTaps?.();       // 코인 숫자를 서버와 맞춰 둔다
  ask();
}

function ask() {
  const w = queue[idx];
  const level = levelOf(w);
  const type = pick(typesForLevel(w, level));
  const q = question(w, type);
  cur = { w, level, type };

  $("stHead").textContent = `${set.name} · ${idx + 1} / ${queue.length}`;
  $("stBar").style.width = (idx / queue.length * 100) + "%";
  $("stType").textContent = `${level + 1}단계 · ${q.label} · ` +
    (doneToday(w) ? "오늘은 이 단어 코인을 이미 받았어요" : `맞히면 ${COINS[level]}코인`);

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
  inp.focus();
}

async function submit(answer) {
  if (busy || !cur) return;
  busy = true;
  $("stInput").disabled = $("stGo").disabled = $("stSkip").disabled = true;

  let res, body;
  try {
    const { data: { session } } = await db.auth.getSession();
    res = await fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ word_id: cur.w.id, type: cur.type, answer }),
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
    showResult("bad", body.error || "채점하지 못했어요. 잠시 뒤에 다시 해 주세요.");
    $("stInput").disabled = $("stGo").disabled = $("stSkip").disabled = false;
    $("stNext").hidden = true;
    return;
  }

  // 화면의 단계·날짜를 서버 값으로
  const p = cur.w.progress?.[0] ?? {};
  cur.w.progress = [{ ...p, srs_level: body.level, last_correct_day: body.correct && !body.already_today ? kstToday() : p.last_correct_day }];
  if (body.balance != null) setBalance(body.balance);
  stats.total++;
  if (body.correct) { stats.right++; stats.coins += body.coins; }

  if (body.correct) {
    showResult("good", body.already_today
      ? `맞았어요! 이 단어는 오늘 코인을 이미 받았어요.`
      : `맞았어요! +${body.coins}코인 · ${body.level + 1}단계로 올랐어요.`, body.answer);
  } else {
    showResult("bad", answer ? "틀렸어요. 1단계로 돌아가요." : "괜찮아요. 1단계부터 다시 해요.", body.answer);
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
    <p class="note">맞힌 단어 · 이번에 받은 코인 <b>+${stats.coins}</b></p>
    <div class="qbtns"><button class="btn ghost" id="stQuit">닫기</button><button class="btn coin" id="stAgain">한 번 더</button></div>`;
  $("stDone").hidden = false;
  $("stAgain")?.addEventListener("click", () => start(set));
  $("stQuit")?.addEventListener("click", close);
  if (!note && stats.coins) tick(`단어 공부로 ${stats.coins}코인을 받았어요.`, "good");
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
