/* ==========================================================
   config.js — 설정과 Supabase 클라이언트
   (voca-web js/config.js 를 가져와 이 프로젝트 값으로 바꿈)

   ★ 여기에는 publishable 키(sb_publishable_…)만 넣습니다.
     sb_secret_… 키는 RLS 를 통과하므로 브라우저에 들어가는 순간
     DB 전체가 열립니다. 그 키는 Cloudflare Pages 환경 변수에만 둡니다.

   이 파일은 ES 모듈입니다. index.html 에서 supabase-js 를 먼저 읽어야 합니다:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>
     <script type="module" src="js/auth.js"></script>
   ========================================================== */

export const SUPABASE_URL = "https://ktsxgtnontktkrxdkfbw.supabase.co";
export const SUPABASE_KEY = "sb_publishable_8zR8KIoEa3VcS7tsDlhvDw_fe_A92Vf";

/* 학교 이메일 도메인. 서버(sql/01_schema.sql 의 school_domain())가 진짜로 막고,
   이 값은 화면에서 미리 알려 주는 데만 씁니다. 둘을 같이 바꾸세요. */
export const SCHOOL_DOMAIN = "hcu.hs.kr";

/* 한글이 남아 있으면 fetch 가 헤더를 만들다 실패합니다. (voca-web 과 같은 검사) */
for (const [name, value] of [["SUPABASE_URL", SUPABASE_URL], ["SUPABASE_KEY", SUPABASE_KEY]]) {
  if (/[^\x00-\xFF]/.test(value)) {
    document.body.innerHTML =
      `<pre style="padding:24px;font:15px/1.7 monospace">js/config.js 의 ${name} 에 한글이 남아 있습니다.
Supabase 대시보드의 실제 값으로 다시 쓰세요.</pre>`;
    throw new Error(`${name}: placeholder not replaced`);
  }
}
/* secret 키를 잘못 붙여 넣었으면 아예 시작하지 않습니다. */
if (SUPABASE_KEY.startsWith("sb_secret_")) {
  document.body.innerHTML =
    `<pre style="padding:24px;font:15px/1.7 monospace">js/config.js 에 secret 키가 들어 있습니다.
지금 바로 Supabase 대시보드에서 그 키를 폐기하고, publishable 키로 바꾸세요.</pre>`;
  throw new Error("secret key in browser");
}

/* supabase-js 를 못 받았으면(망 문제, CDN 주소 오타) 화면이 "불러오는 중…"에서 그냥 멈춘다.
   그러지 않게 무엇이 문제인지 가입 화면에 적는다. */
if (!window.supabase?.createClient) {
  const m = document.getElementById("gateMsg");
  if (m) { m.textContent = "로그인 기능을 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요."; m.className = "msg bad"; m.hidden = false; }
  throw new Error("supabase-js not loaded");
}

export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
