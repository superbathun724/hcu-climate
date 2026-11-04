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
| `03_game.sql` | 지갑, 탭(구간마다 효율 절반, 속도 제한), 코인 보내기, 반·동아리 순위(주간) |
| `04_study.sql` | 단어 공부 기록과 코인(같은 단어는 하루 한 번), 서버 채점용 권한 |
| `05_voice.sql` | 건의함: 글(관리자 승인 후 공개), 공감, 학생회 답변, 숨기기 |

관리자 추가는 `01_schema.sql` 맨 아래 SQL 을 이메일만 바꿔 실행한다. 여러 명이면 `where email in ('a@hcu.hs.kr', 'b@hcu.hs.kr')`.

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
| `privacy.html` | 개인정보처리방침 (초안) |
| `js/config.js` | Supabase 주소와 publishable 키 |
| `js/ui.js` | 공용 도구: 글자 이스케이프, 안내, 코인 칩, 알림 줄 |
| `js/nav.js` | 탭 전환 |
| `js/auth.js` | 가입·로그인·로그아웃·비밀번호 찾기 |
| `js/game.js` | 게임 탭: 탭 → 서버(2초마다 모아서), 우리 반 지역 풍경과 대비율 |
| `js/scenes.js` | 지역 7곳 풍경 SVG, 방파제·제방 그림 (un-summit SCENES 방식) |
| `js/words.js` | 단어 탭: 단어장 목록·보기 |
| `js/study.js` | 고른 단어장으로 공부 (20개씩) |
| `js/quiz-core.js` | 단계별 문제 유형과 채점 — 브라우저와 서버가 같이 씀 |
| `js/grade.js` | 한국어 뜻 채점 규칙 (voca-web 그대로) |
| `js/csv.js` | 단어 CSV 읽기 (voca-web 형식 그대로) |
| `js/send.js` | 지원 탭: 바깥 지역에 코인 보내기 |
| `js/rank.js` | 순위 탭: 이번 주 반·동아리 1인당 평균, 남은 시간 |
| `js/voice.js` | 건의함 |
| `js/admin.js` | 관리: 단어장, 건의함 내보내기 |
| `functions/api/answer.js` | 단어 채점 서버 함수 (Cloudflare Pages Functions) |
| `sql/01~05` | DB |

## 정해 둔 것 (바꾸려면 한 곳만)

- 순위 기간: 매주 월요일 0시(한국) 새로 시작. `03_game.sql` 의 `rank_unit()` 에서 `'week'` → `'day'`/`'month'`
- 건의: 새 글은 관리자 승인 후 공개. 거절은 숨기기
- 게임 배경: 우리 반이 돕는 지역. 방파제·제방 높이 = 그 지역 대비율

## 아직 정하지 않은 것

- 재난 이벤트(빨간 고정·2배): 아직 없음 (`send_coins` 의 `v_mult`)
- 대비율 매일 감소: 아직 없음
- 20코인 = 대비율 1% (`coins_per_pct`, un-summit 값을 임시로 씀)

## 지킬 것

- 채팅 기능 없음. 건의함은 익명으로만 보인다.
- 미성년자 데이터. 이름·전화번호·위치를 받지 않는다.
- `sb_secret_…` 키는 저장소에 넣지 않는다.
- 코인·대비율 표에는 학생 쪽 쓰기 권한을 주지 않는다. 바뀌는 길은 서버 함수뿐이다.
