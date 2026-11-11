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
let mode = "login";          // "login" | "join" | "forgot" | "reset"
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
  if (s.includes("rate limit") || s.includes("429") || s.includes("for security purposes"))
    return "요청이 너무 많아요. 1분쯤 뒤에 다시 해 주세요.";
  if (s.includes("same_password") || s.includes("should be different"))
    return "지금 쓰는 비밀번호와 다른 비밀번호를 써 주세요.";
  if (s.includes("session") && (s.includes("missing") || s.includes("expired")))
    return "재설정 링크가 만료됐어요. 비밀번호 찾기를 처음부터 다시 해 주세요.";
  // 메일 서버(SMTP) 설정 문제. 학생이 고칠 수 있는 게 아니라 관리자가 봐야 한다.
  if (s.includes("sending") && s.includes("email"))
    return "메일을 보내지 못했어요. 잠시 뒤에 다시 해 보고, 계속 안 되면 관리자에게 알려 주세요.";
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

/* 학생·교사 구분 (서버 sql/01_schema.sql 의 email_role 과 같게. 진짜 검사는 서버가 한다)
   학생 아이디 = 2510 + 1학년 반번호 3자리. 숫자가 아닌 아이디는 교사. */
const STUDENT_ID = /^2510\d{3}$/;
function roleOf(email) {
  const id = email.split("@")[0];
  return STUDENT_ID.test(id) ? "student" : /^\d+$/.test(id) ? "other" : "teacher";
}
const isTeacherOpt = sel => sel.selectedOptions[0]?.textContent === "교사";

/* ---------- 화면 모드 ----------
   login  : 이메일 + 비밀번호
   join   : 이메일 + 비밀번호 + 반·동아리·동의
   forgot : 이메일만 → 재설정 메일
   reset  : 메일 링크로 돌아온 뒤 새 비밀번호 두 번 */
const BUTTON = { login: "Start", join: "Join", forgot: "재설정 메일 보내기", reset: "Save" };
function setMode(next) {
  mode = next;
  const tabs = mode === "login" || mode === "join";
  document.querySelectorAll("#gateSeg button")
    .forEach(b => b.classList.toggle("on", b.dataset.g === mode));
  $("gateSeg").hidden = !tabs;
  $("gateTitle").hidden = tabs;
  $("gateTitle").textContent = mode === "forgot" ? "비밀번호 찾기" : mode === "reset" ? "새 비밀번호 정하기" : "";

  $("mailRow").hidden = mode === "reset";
  $("pwRow").hidden = mode === "forgot";
  $("pw2Row").hidden = mode !== "reset";
  $("pwLbl").textContent = mode === "reset" ? "새 비밀번호" : "비밀번호";
  $("pw").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("joinOnly").hidden = mode !== "join";

  $("forgotLink").hidden = mode !== "login";
  $("backLink").hidden = mode !== "forgot";
  $("gateFine").textContent =
    mode === "forgot" ? "가입한 학교 이메일로 재설정 링크를 보내요. 스팸함도 확인해 주세요." :
    mode === "reset"  ? "저장하면 바로 로그인돼요." :
    `학교 이메일로만 가입할 수 있어요. 가입하면 확인 메일이 가요.`;

  $("gateBtn").textContent = BUTTON[mode];
  $("resendBtn").hidden = true;
  $("pw").value = $("pw2").value = "";
  say("");
}

/* ---------- 반·동아리 목록 (로그인 전에도 읽을 수 있게 열어 둠) ---------- */
async function loadChoices() {
  const [cls, clubs] = await Promise.all([
    db.from("classes").select("id, name").order("id"),
    db.from("clubs").select("id, name").order("id"),
  ]);
  if (cls.error || clubs.error) {
    $("selClass").innerHTML = $("selClub").innerHTML = `<option value="">목록을 못 불러왔어요</option>`;
    return;
  }
  $("selClass").innerHTML = `<option value="">반을 골라 주세요</option>` +
    cls.data.map(c => `<option value="${c.id}">${c.name ? escapeHtml(c.name) : `${c.id}반`}</option>`).join("");
  $("selClub").innerHTML = `<option value="">동아리를 골라 주세요</option>` +
    clubs.data.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
}
const escapeHtml = s => String(s).replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

/* ---------- 보내기 ---------- */
async function submit(e) {
  e.preventDefault();
  if (mode === "reset") return saveNewPassword();

  const { email, error } = emailFromInput();
  if (error) return say(error);
  if (mode === "forgot") return sendReset(email);

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
    const role = roleOf(email);
    if (role === "other") return say("이 게임은 아이디가 2510으로 시작하는 학생과 선생님만 참여할 수 있어요.");
    if (role === "teacher" && $("selClass").value && !isTeacherOpt($("selClass")))
      return say('선생님은 반에서 "교사"를 골라 주세요.');
    if (role === "student" && isTeacherOpt($("selClass"))) return say('학생은 "교사" 반을 고를 수 없어요. 내 반을 골라 주세요.');
    if (role === "student" && isTeacherOpt($("selClub"))) return say('학생은 "교사" 동아리를 고를 수 없어요. 내 동아리를 골라 주세요.');
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

/* ---------- 비밀번호 찾기 ---------- */
async function sendReset(email) {
  const btn = $("gateBtn");
  btn.disabled = true;
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname,
  });
  btn.disabled = false;
  if (error) return say(korean(error));
  // 가입하지 않은 이메일이어도 같은 문구. 누가 가입했는지 알아내는 데 쓰이지 않게.
  say(`${email} 로 가입한 계정이 있으면 재설정 메일이 가요. 메일함(스팸함 포함)을 확인해 주세요.`, "good");
}

let recovering = false;      // 재설정 링크로 들어온 상태. 이때는 로그인돼도 게임으로 안 넘어간다.

async function saveNewPassword() {
  const pw = $("pw").value, pw2 = $("pw2").value;
  if (pw.length < 8) return say("비밀번호는 8자 이상이어야 해요.");
  if (pw !== pw2) return say("두 비밀번호가 달라요.");
  const btn = $("gateBtn");
  btn.disabled = true;
  const { error } = await db.auth.updateUser({ password: pw });
  btn.disabled = false;
  if (error) return say(korean(error));
  recovering = false;
  signedIn = true;           // 곧 올 USER_UPDATED 이벤트가 onSignedIn 을 한 번 더 부르지 않게
  setMode("login");
  onSignedIn();
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
    .select("class_id, club_id, clubs(name), classes(region_id, name)")
    .maybeSingle();

  if (error || !data) {
    // 계정은 있는데 프로필이 없다 = 서버 검사 전에 만들어진 계정. 들여보내지 않는다.
    await db.auth.signOut();
    return say("계정 정보를 찾을 수 없어요. 관리자에게 알려 주세요.");
  }

  // 관리자 링크는 서버가 관리자라고 할 때만 보인다. 숨겨도 관리 기능 자체는 서버가 막는다.
  const { data: admin } = await db.rpc("is_admin");
  // 관리 기능은 2단계 인증(aal2)까지 마친 로그인에서만 열린다(sql admin_ok). 학생은 부를 필요가 없다.
  const adminOk = admin === true && (await db.rpc("admin_ok")).data === true;
  const profile = { classId: data.class_id, clubId: data.club_id, clubName: data.clubs?.name ?? "",
                    className: data.classes?.name ?? `${data.class_id}반`,
                    regionId: data.classes?.region_id ?? null, isAdmin: admin === true, adminOk };
  window.hcuProfile = profile;
  const chip = $("chipTxt");
  chip.replaceChildren(...[profile.className, profile.clubName].map(t => { const s = document.createElement("span"); s.className = "mi"; s.textContent = t; return s; }));
  chip.className = "mis";
  $("adminLink").hidden = !profile.isAdmin;
  $("gate").classList.remove("on");
  say("");

  window.dispatchEvent(new CustomEvent("hcu:profile", { detail: profile }));
}

function onSignedOut() {
  window.hcuProfile = null;
  window.dispatchEvent(new Event("hcu:signout"));
  $("chipTxt").textContent = "";
  $("adminLink").hidden = true;
  $("gate").classList.add("on");
}

/* 메일 링크로 돌아오면 주소 뒤(#)에 정보가 붙는다.
   - type=recovery : 비밀번호 재설정 링크 → 새 비밀번호 화면
   - error=…       : 링크가 만료됐거나 이미 쓰임
   supabase-js 가 이 # 를 곧 지우므로, 모듈이 시작되자마자 먼저 읽는다. */
function readLinkError() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("type") === "recovery" && h.get("access_token")) {
    recovering = true;
    setMode("reset");
    return;
  }
  if (!h.get("error")) return;
  setMode("login");
  say(/expired|invalid/i.test(h.get("error_description") || "")
    ? "확인 링크가 만료됐거나 이미 쓰였어요. 로그인해 보고, 안 되면 확인 메일을 다시 받아 주세요."
    : "확인 링크에 문제가 있어요. 다시 시도해 주세요.");
  history.replaceState(null, "", location.pathname + location.search);
}

/* ---------- 시작 ---------- */
document.querySelectorAll("#gateSeg button").forEach(b => b.addEventListener("click", () => setMode(b.dataset.g)));
$("forgotLink").addEventListener("click", e => { e.preventDefault(); setMode("forgot"); });
$("backLink").addEventListener("click", e => { e.preventDefault(); setMode("login"); });
$("gate").addEventListener("submit", submit);
$("resendBtn").addEventListener("click", resend);
$("logoutBtn").addEventListener("click", e => { e.preventDefault(); db.auth.signOut(); });
$("lockLogout").addEventListener("click", e => { e.preventDefault(); db.auth.signOut(); });

readLinkError();
loadChoices();

let signedIn = null;       // 같은 상태로 두 번 그리지 않게
db.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") { recovering = true; setMode("reset"); }
  if (recovering) { $("gate").classList.add("on"); return; }   // 새 비밀번호를 정할 때까지 게이트에 머문다
  const now = !!session;
  if (now === signedIn) return;
  signedIn = now;
  // 이 콜백 안에서 바로 DB 를 부르면 supabase-js 가 멈출 수 있어서 한 박자 뒤로 미룬다.
  setTimeout(() => (now ? onSignedIn() : onSignedOut()), 0);
});
