/* ==========================================================
   POST /api/answer — 단어 문제 채점 (Cloudflare Pages Function)
   (voca-web functions/api/trade.js 의 구조를 그대로 가져옴)

   본문(JSON): { word_id, type, answer, level }
               level: 학생이 고른 단계 0~5. 없으면(null) 그 단어의 지금 단계("내 단계대로")
   머리:       Authorization: Bearer <로그인한 학생의 access token>

   ── 이 파일이 있는 이유 ──────────────────────────────────
   채점을 브라우저가 하면 개발자도구로 "맞았다"만 보내 코인을 찍어 낼 수 있다.
   그래서 순서를 서버에서 지킨다.
     1. 토큰으로 학생이 누구인지 Supabase 에 확인
     2. 단어와 그 학생의 단계를 서버가 직접 읽는다
     3. 고른 단계(없으면 지금 단계)에 맞는 문제 유형인지 확인하고, 서버가 채점
     4. 비밀 키로 record_answer 를 불러 진도·코인을 한 번에 기록
   record_answer 는 학생 계정으로는 부를 수 없다(sql/04_study.sql).

   ── 필요한 환경 변수 (Cloudflare Pages → Settings → Variables and Secrets) ──
     SUPABASE_URL          https://ktsxgtnontktkrxdkfbw.supabase.co
     SUPABASE_SERVICE_KEY  sb_secret_… (Secret 으로 넣는다. 저장소·채팅에 절대 넣지 않는다)
   ========================================================== */
import { typesForLevel, check, answerText } from "../../js/quiz-core.js";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

/* sb_secret_… 는 apikey 머리에만, 옛 eyJ… 키는 Authorization 에도 (voca-web 과 같음) */
function authHeaders(key) {
  const h = { apikey: key };
  if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
}

async function whoIs(env, token) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_SERVICE_KEY },
  });
  if (!res.ok) return null;
  return (await res.json())?.id ?? null;
}

async function rest(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { ...authHeaders(env.SUPABASE_SERVICE_KEY), Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`DB 읽기 실패 (${res.status})`);
  return res.json();
}

export async function onRequestPost({ request, env }) {
  // 어느 변수가 빠졌는지 이름만 알려 준다(값은 절대 내보내지 않는다).
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"].filter(k => !env[k]);
  if (missing.length) {
    return json({ error: `서버 설정이 끝나지 않았어요(${missing.join(", ")} 없음). 관리자에게 알려 주세요.` }, 500);
  }
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(env.SUPABASE_URL)) {
    return json({ error: "서버 설정이 이상해요(SUPABASE_URL 모양이 달라요). 관리자에게 알려 주세요." }, 500);
  }
  if (!/^(sb_secret_|eyJ)/.test(env.SUPABASE_SERVICE_KEY)) {
    return json({ error: "서버 설정이 이상해요(SUPABASE_SERVICE_KEY 가 sb_secret_ 키가 아니에요). 관리자에게 알려 주세요." }, 500);
  }
  env = { ...env, SUPABASE_URL: env.SUPABASE_URL.replace(/\/+$/, "") };

  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "로그인이 필요해요." }, 401);
  const userId = await whoIs(env, token);
  if (!userId) return json({ error: "로그인이 만료됐어요. 새로고침해 주세요." }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: "요청을 읽지 못했어요." }, 400); }
  const wordId = Number(body?.word_id);
  const type = String(body?.type ?? "");
  const answer = String(body?.answer ?? "").slice(0, 200);
  if (!Number.isInteger(wordId) || wordId <= 0) return json({ error: "단어 번호가 이상해요." }, 400);
  const chosen = body?.level == null ? null : Number(body.level);
  if (chosen !== null && !(Number.isInteger(chosen) && chosen >= 0 && chosen <= 5)) {
    return json({ error: "단계가 이상해요." }, 400);
  }

  try {
    // 숨긴 단어장의 단어는 공부할 수 없다
    const [w] = await rest(env,
      `words?id=eq.${wordId}&select=id,word,senses,synonyms,antonyms,phrases,sentences,word_sets!inner(hidden)&word_sets.hidden=eq.false`);
    if (!w) return json({ error: "단어를 찾을 수 없어요." }, 404);

    const [pr] = await rest(env, `progress?user_id=eq.${userId}&word_id=eq.${wordId}&select=srs_level`);
    const level = pr?.srs_level ?? 0;
    const asked = chosen ?? level;            // 이번 문제의 단계

    // 화면이 낸 유형이 그 단계의 유형인지. ("내 단계대로"인데 다른 탭에서 단계가 바뀌었으면 다시 받게 한다)
    if (!typesForLevel(w, asked).includes(type)) {
      return json({ stale: true, level, error: "문제가 바뀌었어요. 다시 풀어 주세요." }, 409);
    }

    const correct = check(w, type, answer);

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/record_answer`, {
      method: "POST",
      headers: { ...authHeaders(env.SUPABASE_SERVICE_KEY), "Content-Type": "application/json" },
      body: JSON.stringify({ p_user: userId, p_word: wordId, p_correct: correct, p_level: asked }),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text; try { msg = JSON.parse(text).message || text; } catch { /* 그대로 */ }
      return json({ error: msg }, 400);
    }
    return json({ ...JSON.parse(text), answer: answerText(w, type) });
  } catch (e) {
    return json({ error: e.message || "서버 오류" }, 502);
  }
}
