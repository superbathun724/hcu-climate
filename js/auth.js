/* ==========================================================
   auth.js — 가입, 로그인, 로그아웃, 프로필
   (voca-web js/auth.js 를 바탕으로 가입·반/동아리·도메인 검사를 더함)

   진짜 검사는 서버가 한다 (sql/01_schema.sql 의 on_signup 트리거).
   여기서 하는 검사는 친절한 안내용이다. 서버가 거부하면 Supabase 는
   "Database error saving new user" 같은 영어 문구를 돌려주기 때문에,
   흔한 실수는 보내기 전에 화면에서 한국어로 먼저 알려 준다.
   ========================================================== */
import { db, SCHOOL_DOMAIN } from "./config.js";

const $ = id => document.getElementById(id);
let mode = "login";          // "login" | "join"
let lastEmail = "";          // 확인 메일 다시 보내기용

/* ---------- 안내 문구 ---------- */
function say(text, kind = "bad") {
  const m = $("gateMsg");
  m.textContent = text;
  m.className = "msg " + kind;
  m.hidden = !text;
}

/* Supabase 영어 오류 → 학생이 읽을 한국어 */
function korean(err) {
  const s = `${err?.code || ""} ${err?.message || ""}`.toLowerCase();
  if (s.includes("invalid login credentials"))      return "이메일 또는 비밀번호가 맞지 않아요.";
  if (s.includes("email not confirmed"))            return "아직 메일 확인을 안 했어요. 메일함(스팸함 포함)에서 확인 링크를 눌러 주세요.";
  if (s.includes("rate limit") || s.includes("429")) return "요청이 너무 많아요. 잠시 뒤에 다시 해 주세요.";
  if (s.includes("password") && s.includes("least")) return "비밀번호는 8자 이상이어야 해요.";
  if (s.includes("weak"))                           return "더 어려운 비밀번호를 써 주세요.";
  if (s.includes("database error") || s.includes("p0001"))
    return "가입할 수 없어요. 학교 이메일과 반·동아리를 다시 확인해 주세요.";
  if (s.includes("failed to fetch") || s.includes("network"))
    return "인터넷 연결을 확인해 주세요.";
  console.error(err);
  return "문제가 생겼어요. 잠시 뒤에 다시 해 주세요.";
}

/* 아이디 칸 → 학교 이메일. 전체 주소를 붙여 넣어도 받아 준다. */
function emailFromInput() {
  let id = $("mailId").value.trim().toLowerCase();
  const suffix = "@" + SCHOOL_DOMAIN;
  if (id.endsWith(suffix)) id = id.slice(0, -suffix.length);
  if (!id) return { error: "아이디를 입력해 주세요." };
  if (/[@\s]/.test(id)) return { error: `학교 이메일(@${SCHOOL_DOMAIN})만 쓸 수 있어요. @ 앞부분만 입력해 주세요.` };
  return { email: id + suffix };
}

/* ---------- 로그인 / 가입 전환 ---------- */
function setMode(next) {
  mode = next;
  document.querySelectorAll("#gateSeg button")
    .forEach(b => b.classList.toggle("on", b.dataset.g === mode));
  const join = mode === "join";
  $("joinOnly").hidden = !join;
  $("gateBtn").textContent = join ? "Join" : "Start";
  $("pw").autocomplete = join ? "new-password" : "current-password";
  $("resendBtn").hidden = true;
  say("");
}

/* ---------- 반·동아리 목록 (로그인 전에도 읽을 수 있게 열어 둠) ---------- */
async function loadChoices() {
  const [cls, clubs] = await Promise.all([
    db.from("classes").select("id").order("id"),
    db.from("clubs").select("id, name").order("id"),
  ]);
  if (cls.error || clubs.error) {
    $("selClass").innerHTML = $("selClub").innerHTML = `<option value="">목록을 못 불러왔어요</option>`;
    return;
  }
  $("selClass").innerHTML = `<option value="">반을 골라 주세요</option>` +
    cls.data.map(c => `<option value="${c.id}">${c.id}반</option>`).join("");
  $("selClub").innerHTML = `<option value="">동아리를 골라 주세요</option>` +
    clubs.data.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
}
const escapeHtml = s => String(s).replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

/* ---------- 보내기 ---------- */
async function submit(e) {
  e.preventDefault();
  const { email, error } = emailFromInput();
  if (error) return say(error);
  const password = $("pw").value;
  if (password.length < 8) return say("비밀번호는 8자 이상이어야 해요.");
  lastEmail = email;

  const btn = $("gateBtn");
  btn.disabled = true;
  try {
    if (mode === "login") {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) {
        say(korean(error));
        $("resendBtn").hidden = !/not confirmed/i.test(error.message || "");
      } else {
        $("pw").value = "";
        say("");
      }
      return;
    }

    const class_id = Number($("selClass").value);
    const club_id = Number($("selClub").value);
    if (!class_id) return say("반을 골라 주세요.");
    if (!club_id) return say("동아리를 골라 주세요.");
    if (!$("agree").checked) return say("개인정보처리방침에 동의해 주세요.");

    const { data, error } = await db.auth.signUp({
      email, password,
      options: {
        data: { class_id, club_id },                       // on_signup 트리거가 읽는다
        emailRedirectTo: location.origin + location.pathname,
      },
    });
    if (error) return say(korean(error));

    if (data.session) return;   // 메일 확인을 꺼 둔 경우에만 여기로 온다
    $("pw").value = "";
    say(`${email} 로 확인 메일을 보냈어요. 메일함(스팸함 포함)에서 링크를 누르면 가입이 끝나요.`, "good");
    $("resendBtn").hidden = false;
  } catch (err) {
    say(korean(err));
  } finally {
    btn.disabled = false;
  }
}

async function resend() {
  if (!lastEmail) return;
  $("resendBtn").disabled = true;
  const { error } = await db.auth.resend({
    type: "signup", email: lastEmail,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  $("resendBtn").disabled = false;
  say(error ? korean(error) : "확인 메일을 다시 보냈어요.", error ? "bad" : "good");
}

/* ---------- 로그인된 뒤 ---------- */
async function onSignedIn() {
  const { data, error } = await db.from("profiles")
    .select("class_id, club_id, clubs(name)")
    .maybeSingle();

  if (error || !data) {
    // 계정은 있는데 프로필이 없다 = 서버 검사 전에 만들어진 계정. 들여보내지 않는다.
    await db.auth.signOut();
    return say("계정 정보를 찾을 수 없어요. 관리자에게 알려 주세요.");
  }

  const profile = { classId: data.class_id, clubId: data.club_id, clubName: data.clubs?.name ?? "" };
  window.hcuProfile = profile;
  $("chipTxt").textContent = `${profile.classId}반 · ${profile.clubName}`;
  $("gate").classList.remove("on");
  say("");

  // 관리자 링크는 서버가 관리자라고 할 때만 보인다. 숨겨도 관리 기능 자체는 서버가 막는다.
  const { data: admin } = await db.rpc("is_admin");
  $("adminLink").hidden = admin !== true;

  window.dispatchEvent(new CustomEvent("hcu:profile", { detail: profile }));
}

function onSignedOut() {
  window.hcuProfile = null;
  $("chipTxt").textContent = "";
  $("adminLink").hidden = true;
  $("gate").classList.add("on");
}

/* 메일 링크가 만료됐거나 이미 쓰인 경우, 주소 뒤에 오류가 붙어서 돌아온다. */
function readLinkError() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.get("error")) return;
  setMode("login");
  say(/expired|invalid/i.test(h.get("error_description") || "")
    ? "확인 링크가 만료됐거나 이미 쓰였어요. 로그인해 보고, 안 되면 확인 메일을 다시 받아 주세요."
    : "확인 링크에 문제가 있어요. 다시 시도해 주세요.");
  history.replaceState(null, "", location.pathname + location.search);
}

/* ---------- 시작 ---------- */
document.querySelectorAll("#gateSeg button").forEach(b => b.addEventListener("click", () => setMode(b.dataset.g)));
$("gate").addEventListener("submit", submit);
$("resendBtn").addEventListener("click", resend);
$("logoutBtn").addEventListener("click", e => { e.preventDefault(); db.auth.signOut(); });

readLinkError();
loadChoices();

let signedIn = null;       // 같은 상태로 두 번 그리지 않게
db.auth.onAuthStateChange((_event, session) => {
  const now = !!session;
  if (now === signedIn) return;
  signedIn = now;
  // 이 콜백 안에서 바로 DB 를 부르면 supabase-js 가 멈출 수 있어서 한 박자 뒤로 미룬다.
  setTimeout(() => (now ? onSignedIn() : onSignedOut()), 0);
});
