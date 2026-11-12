# hcu-climate

현대청운고 한 학년이 함께하는 웹 게임. 영어 단어 공부와 기후·재난 회복력 게임을 붙였다.
우리는 모두 울산(배출하는 쪽)에 산다. 탭과 단어 테스트로 번 코인은 울산에 쓸 수 없고,
반마다 맡은 바깥 재난 위험 지역 7곳으로만 보낼 수 있다.

- 사이트: https://hcu-climate.pages.dev
- 정적 사이트, 빌드 없음. Cloudflare Pages(Git 연결, `main`, 출력 디렉터리 `.`)
- DB·로그인: Supabase (Sydney). `sql/` 파일을 SQL Editor 에서 번호 순서로 실행

## 가져온 것

| 무엇 | 어디서 | 바꾼 점 |
|---|---|---|
| 화면 구조(상단바·탭·목록 행), 색·글꼴 토큰, 도시별 풍경·방벽 그림 | un-summit `index.html`·`styles.css`·`app.js`(SCENES) | 도시 선택 → 반·동아리, 한국 도시 → 바깥 지역 7곳, 영어 UI → 한국어 |
| 대비율 50% 선, 20코인 = 1% | un-summit `app.js` (방벽, DEF_PER_PCT) | 대비율은 바깥 지역에만, 서버가 계산 |
| 1인당 평균 순위 | un-summit 하루 보드 | 도시 → 반·동아리 두 개 |
| 로그인, 계정별 데이터, publishable 키 규칙 | voca-web `js/auth.js`·`js/config.js` | 새 Supabase 프로젝트, 학교 도메인 검사 추가 |
| 단어 단계, 단계별 문제 유형, CSV 형식, 채점 | voca-web `js/quiz.js`·`js/csv.js`·`js/grade.js` | 복습 날짜 대신 고른 단어장으로 공부, 자동 채점 유형만, 단계별 코인, 서버 채점 |
| 서버 함수 안에서만 값이 바뀌는 구조, 비밀 키 서버 함수 | voca-web `execute_trade()`·`functions/api/trade.js` | 코인·대비율·단어 채점에 적용 |

가져오지 않은 것: un-summit 의 Voice 탭(건의함이 대신함), 광고, 가짜 외부 구호·가짜 순위, 업그레이드.

## DB 설정

Supabase → SQL Editor 에서 `sql/` 파일을 **번호 순서대로** 붙여 넣고 Run. 몇 번을 돌려도 같은 상태가 된다.

| 파일 | 내용 |
|---|---|
| `01_schema.sql` | 반·동아리·지역, 프로필, 가입 검사(학교 도메인), 관리자 |
| `02_words.sql` | 단어장·단어·진도, 관리자 단어장 함수(올리기·덮어쓰기·이름·숨기기·삭제) |
| `03_game.sql` | 지갑, 탭(하루 무료 + 에너지, 속도 제한), 코인 보내기(150% 상한), 재난 이벤트와 결과·방어 보너스, 계정 잠금, 반·동아리 순위(주간) |
| `04_study.sql` | 단어 공부 기록과 코인·에너지(같은 단어는 하루 한 번), 자동 풀이 거르기, 서버 채점용 권한 |
| `05_voice.sql` | 건의함: 글(관리자 승인 후 공개), 공감, 학생회 답변, 숨기기 |
| `06_infra.sql` | 지역 기금과 시설(조기경보·방파제·대피소, 각 5단계), 반 투표로 짓기 |
| `08_audit.sql` | 보안 기록(누가·언제·어느 IP에서·무엇을). 고칠 수 없게 해시 사슬로 1년 보관, 관리 화면 "보안 기록" |
| `07_hardening.sql` | 보안 점검(Security Advisor) 경고 정리. **늘 마지막에**(08 다음), 다른 파일을 다시 돌렸으면 이것도 다시 |

관리자 추가는 `01_schema.sql` 맨 아래 SQL 을 이메일만 바꿔 실행한다. 여러 명이면 `where email in ('a@hcu.hs.kr', 'b@hcu.hs.kr')`.

관리자는 **2단계 인증**을 해야 관리 기능을 쓸 수 있다. 처음 관리 화면을 열면 휴대폰 인증 앱(Google Authenticator 등)으로 QR 을 찍어 연결하고,
그 뒤로는 로그인할 때마다 6자리를 넣는다. 휴대폰을 잃어버렸으면 SQL Editor 에서 연결을 지우고 다시 연결한다:
`delete from auth.mfa_factors where user_id = (select id from auth.users where email = '아이디@hcu.hs.kr');`

## Cloudflare 환경 변수 (단어 채점에 필요)

Workers & Pages → hcu-climate → Settings → Variables and Secrets (Production)

| 이름 | 값 | 종류 |
|---|---|---|
| `SUPABASE_URL` | `https://ktsxgtnontktkrxdkfbw.supabase.co` | Text |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API Keys 의 `sb_secret_…` | **Secret** |

넣은 뒤에는 한 번 다시 배포해야 적용된다(빈 커밋 push 또는 Deployments → Retry).

## Supabase 대시보드 설정 (처음 한 번)

- Authentication → Sign In / Providers → Email: Confirm email 켬, 최소 비밀번호 8자
- Authentication → URL Configuration: Site URL `https://hcu-climate.pages.dev`,
  Redirect URLs `https://hcu-climate.pages.dev/**`, `http://localhost:8788/**`
- Authentication → Emails → SMTP Settings: 외부 SMTP (기본 메일은 팀원에게만, 시간당 2통)
- Authentication → Rate Limits: 메일 시간당 상한을 SMTP 하루 한도에 맞게 올림
- Authentication → Emails → Templates → Confirm signup, Reset Password: 한국어 문구

## 파일

| 파일 | 내용 |
|---|---|
| `index.html` `styles.css` | 화면 (폰·태블릿·PC 적응형) |
| `_headers` | 보안 헤더(CSP: 이 사이트의 스크립트만 실행, 데이터는 우리 Supabase 로만, iframe 금지). Supabase 주소가 바뀌면 여기도 |
| `vendor/supabase-js-2.45.4/` | supabase-js (npm 원본 그대로). CDN 대신 저장소에 둔다 |
| `privacy.html` | 개인정보처리방침 (초안) |
| `js/config.js` | Supabase 주소와 publishable 키 |
| `js/ui.js` | 공용 도구: 글자 이스케이프, 안내, 코인 칩, 알림 줄 |
| `js/nav.js` | 탭 전환 |
| `js/auth.js` | 가입·로그인·로그아웃·비밀번호 찾기 |
| `js/game.js` | 게임 탭: 탭 → 서버(2초마다 모아서), 우리 반 지역 풍경과 대비율 |
| `js/scenes.js` | 지역 8곳 풍경 SVG(실제 풍경 사진 참고), 방파제·제방 그림 (un-summit SCENES 방식) |
| `js/words.js` | 단어 탭: 단어장 목록·보기 |
| `js/study.js` | 고른 단어장으로 공부 (20개씩) |
| `js/quiz-core.js` | 단계별 문제 유형과 채점 — 브라우저와 서버가 같이 씀 |
| `js/grade.js` | 한국어 뜻 채점 규칙 (voca-web 그대로) |
| `js/csv.js` | 단어 CSV 읽기 (voca-web 형식 그대로) |
| `js/send.js` | 지원 탭: 바깥 지역에 코인 보내기, 재난 카드 |
| `js/infra.js` | 지원 탭 맨 위 "우리 지역 시설": 기금, 시설, 반 투표 |
| `js/cases.js` | 지역마다 실제 재난 사례·효과 있던 대비·출처 (재난 카드에 보임) |
| `js/event.js` | 재난 이벤트를 15초마다 묻고 다른 화면에 알림 |
| `js/rank.js` | 순위 탭: 이번 주 반·동아리 1인당 평균, 남은 시간 |
| `js/voice.js` | 건의함 |
| `js/admin.js` | 관리: 2단계 인증, 단어장(올리기·내려받기·삭제 대기·복구), 잠긴 계정, 건의함 내보내기 |
| `functions/api/answer.js` | 단어 채점 서버 함수 (Cloudflare Pages Functions) |
| `sql/01~05` | DB |
| `tests/run.mjs` | 문제 유형·코인·채점·CSV 검사. `node tests/run.mjs` (설치할 것 없음). 규칙을 고치면 같이 고친다 |

## 정해 둔 것 (바꾸려면 한 곳만)

- 순위 기간: 매주 월요일 0시(한국) 새로 시작. `03_game.sql` 의 `rank_unit()` 에서 `'week'` → `'day'`/`'month'`
- 건의: 새 글은 관리자 승인 후 공개. 거절은 숨기기
- 게임 배경: 우리 반이 돕는 지역. 방파제·제방 높이 = 그 지역 대비율
- 탭: 한 번에 1코인(줄지 않음). 하루 무료 1,000번 + 에너지만큼 누를 수 있다. 에너지는 단어를 맞혀 얻고(코인의 100배:
  1단계 100 … 6단계 800) 다음 날에도 남는다. `03_game.sql` 의 `tap_free_daily()`, `04_study.sql` 의 `word_energy()`
- 가입: 아이디가 `2510`+3자리면 학생(학생 반·동아리만), 숫자가 아닌 아이디는 교사("교사" 반만, 동아리는 자유),
  그 밖의 숫자 아이디(다른 학년)는 가입 불가. `01_schema.sql` 의 `student_id_pattern()`
- 재난: 8분마다 한 지역, 4분 동안. 그동안 그 지역 대비율 30%가 조금씩 쓰이고, 보낸 코인은 2배.
  `03_game.sql` 의 `disaster_every`·`disaster_length`·`disaster_drain`·`disaster_mult`.
  cron 없이, 접속한 학생 화면이 15초마다 부를 때 진행된다(아무도 없으면 멈춤)
- 대비율은 지역 상한(기본 150%, 방파제 단계마다 +20%)까지 쌓이고, 넘친 코인(재난 중이면 2배)은 그 지역 **기금**이 된다
- 기금으로 시설을 짓는다(`06_infra.sql`). 맡은 반이 투표하고, 표가 가장 많은 시설이 3표 이상(반 인원이 적으면 인원 수)이고
  기금이 모이면 저절로 지어진다. 값 10,000 → 20,000 → 40,000 → 80,000 → 160,000.
  조기경보: 재난이 깎는 대비율 30% → 단계마다 10%씩 덜 / 방파제: 상한 +20% / 대피소: 방어 보너스 1인당 +5점.
  지을 때마다 그 반 순위에 1인당 20 × 단계 점수. 풍경에도 철탑·대피소·테트라포드로 보인다
- 재난이 끝날 때 대비율이 50% 이상이면 방어 성공 → 그 지역을 맡은 반에 1인당 10점(`defense_bonus_pc()`)
- 순위 = (보낸 코인 × 그때 배수 + 방어 보너스) ÷ 메일 인증한 인원. 재난 때 보내면 순위에도 2배
- 복습에서 틀리면 한 단계만 내려간다
- 단어 코인은 맞힐 때마다 바로 지갑에 들어간다(중간에 그만둬도 그대로)
- 단어 코인은 고른 단계가 아니라 **실제로 나온 문제 유형**으로 매긴다(뜻 1 · 철자 2 · 유의어 3 · 표현 4 · 예문 5 · 6단계 종합 8).
  자료가 없어 6단계에서 철자 문제가 나오면 2코인. `js/quiz-core.js` 의 `coinLevel`
- 그날 한 번 틀리거나 건너뛴 단어는 정답을 본 뒤라 그날 다시 맞혀도 코인·단계가 그대로(다음 날 다시)
- 순위 분모는 메일 인증까지 마친 계정 수
- 교사 참가: 반 목록의 "교사"(8번)와 동아리 목록의 "교사". 교사 팀은 8번 지역 바누아투(사이클론·쓰나미)를 맡는다.
  학생 팀과 같은 1인당 평균으로 겨룬다. 지도하는 동아리가 있으면 그 동아리를 골라도 된다
- 탭 매크로·속도로는 잠그지 않는다. 누를 수 있는 횟수가 무료 탭 + 에너지로 정해져 있어 빨리 누르거나 자동 클릭을 써도
  더 벌 수 없기 때문이다. 스크립트가 만든 가짜 누름만 조용히 세지 않고, 서버는 한 번에 받는 양에 넉넉한 상한만 둔다.
  (단어 답 간격 잠금은 남아 있다. 관리자 화면 "잠긴 계정"에서 푼다)
- 단어장 삭제는 7일 동안 "삭제 대기"(학생에게 안 보임, 관리자가 복구 가능). 그 뒤 단어·진도까지 지운다
- 관리 기능은 2단계 인증한 로그인에서만(`01_schema.sql` 의 `admin_ok()`)
- 단어 채점 서버는 우리가 쓴 한국어 안내만 그대로 보여 주고, 그 밖의 DB 오류 내용은 숨긴다
- 단어 자동 풀이 대비(`04_study.sql`): 문제를 받은 지 1.5초 안의 정답과 1분에 20개를 넘는 정답은 코인 없이 채점만 하고
  단계·날짜를 그대로 둔다(다시 풀면 받는다). 최근 30번 답 간격이 기계처럼 일정하면(평균 8초 미만, 흔들림 3% 미만) 잠금.
  `quiz_min_ms()`·`quiz_paid_per_min()`

## 아직 정하지 않은 것

- 대비율 매일 감소: 없음 (재난이 그 역할을 한다)
- 20코인 = 대비율 1% (`coins_per_pct`, un-summit 값을 임시로 씀)

## 지킬 것

- 채팅 기능 없음. 건의함은 익명으로만 보인다.
- 미성년자 데이터. 이름·전화번호·위치를 받지 않는다.
- `sb_secret_…` 키는 저장소에 넣지 않는다.
- 코인·대비율 표에는 학생 쪽 쓰기 권한을 주지 않는다. 바뀌는 길은 서버 함수뿐이다.
