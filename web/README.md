# 연말 파티 실시간 퀴즈

| 주소 | 용도 |
| --- | --- |
| `/` | 참가자 휴대폰 |
| `/screen` | 대형 화면 (문제, 팀 점수, 개인 TOP 5, 접속 QR) |
| `/admin` | MC 조작, 문제 수정, 초기화 (비밀번호 없음, 주소를 공유하지 않는다) |

## Vercel 배포

1. Vercel에서 이 `web` 폴더를 Root Directory로 프로젝트를 만든다 (또는 `web`에서 `npx vercel --prod`).
2. Vercel Storage/Marketplace에서 Upstash Redis를 만들어 프로젝트에 연결한다. `KV_REST_API_URL`과 `KV_REST_API_TOKEN`(또는 `UPSTASH_REDIS_REST_*`)이 있어야 한다.
3. 다시 배포하고 `/admin`에 접속한다. Redis는 함수와 가까운 지역을 고른다.
4. 로그인 없이 휴대폰에서 열리는지 확인한다. 막히면 Vercel의 Deployment Protection을 확인한다.

## 행사 진행

1. `/admin`에서 문제와 팀 인원을 저장한다. 문제 수정은 참가자 접속 전에만 된다.
2. 대형 화면에 `/screen`을 띄우고 참가자가 QR로 들어온다.
3. 퀴즈 시작 → 정답 공개 → 순위 공개 → 다음 문제 순서로 버튼을 누른다.

## 시험

- 로컬: `npm run dev`, 다른 터미널에서 `npm test`
- 배포본: `BASE=https://주소 npm test`. **참가자와 점수가 초기화된다.** 끝나면 관리자 화면에서 초기화한다.
