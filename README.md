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
| 화면 구조(상단바·탭·목록 행), 색·글꼴 토큰, 울산 장면 | un-summit `index.html`·`styles.css` | 도시 선택 → 반·동아리, 영어 UI → 한국어 |
| 재난 이벤트(빨간 고정, 2배), 대비율 50% 선, 매일 감소 | un-summit `app.js` (방벽·재난 이벤트) | 기기마다 따로 → 서버가 전교에 하나로. 대비율은 바깥 지역에만 |
| 1인당 평균 순위 | un-summit 하루 보드 | 도시 → 반·동아리 두 개 |
| 로그인, 계정별 데이터, publishable 키 규칙 | voca-web `js/auth.js`·`js/config.js` | 새 Supabase 프로젝트, 학교 도메인 검사 추가 |
| 단어 단계(SRS 1·3·7·16·35·90일), CSV 형식, 채점 | voca-web `js/srs.js`·`js/csv.js`·`js/grade.js` | 단계별 코인, 서버 채점 |
| 서버 함수 안에서만 값이 바뀌는 구조 | voca-web `execute_trade()` | 코인·대비율에 적용 |

가져오지 않은 것: un-summit 의 Voice 탭(건의함이 대신함), 광고, 가짜 외부 구호·가짜 순위, 업그레이드.

## DB 설정 (처음 한 번)

1. Supabase → SQL Editor → `sql/01_schema.sql` 붙여 넣고 Run
2. 관리자 계정으로 가입·인증을 마친 뒤, 그 파일 맨 아래의 관리자 등록 SQL 을 이메일만 바꿔 실행

## 파일

| 파일 | 내용 |
|---|---|
| `index.html` `styles.css` `app.js` | 화면 (지금은 목업, 서버 연결 전) |
| `js/config.js` | Supabase 주소와 publishable 키 |
| `sql/01_schema.sql` | 반·동아리·지역, 프로필, 가입 검사, 관리자 |

## 지킬 것

- 채팅 기능 없음. 건의함은 익명으로만 보인다.
- 미성년자 데이터. 이름·전화번호·위치를 받지 않는다.
- `sb_secret_…` 키는 저장소에 넣지 않는다.
- 코인·대비율 표에는 학생 쪽 쓰기 권한을 주지 않는다. 바뀌는 길은 서버 함수뿐이다.
