# 마음쉼 · Firebase로 연구용 시험 환경 만들기

구성: Firebase Hosting(화면) → Cloud Functions for Firebase(코드 확인·필터) → Gemini 3.8 Flash.
프로젝트 ID는 `maeum-835b3`이며, Hosting 사이트 ID는 `maeum`입니다. 정식 주소는 https://maeum.web.app/ 입니다. 이전 프로젝트 주소와 `/pages/maeum.html` 링크는 정식 주소로 이동합니다. https://maeum.web.app/ 에 Hosting과 AI 함수, App Check를 연결했습니다. 운영자가 제공한 선불 충전 API 키로 교체하고 함수를 재배포했으며, 2026년 10월 19일 브라우저에서 숫자 코드 인증과 가상 사례의 실제 Gemini 답변을 확인했습니다. 이전 프로젝트 `maeum-d3a43`의 리소스는 유지합니다. Render 계정은 필요하지 않습니다.

## 현재 상태와 다음 배포

- 완료: Firebase CLI 로그인, 웹앱 등록, reCAPTCHA Enterprise App Check 설정, 서울 리전 `coachApi` 함수와 Hosting 배포, 숫자 코드 인증 확인.
- `.env`의 Gemini API 키·숫자 코드·서명 키를 Secret Manager에 등록했습니다. 값은 Git과 정적 화면에 포함하지 않습니다.
- App Check 사이트 키는 `functions/.env.maeum-835b3`에 준비했습니다. 이 파일도 Git에서 제외됩니다.
- 현재 배포는 `firebase.json`을 사용하며 `/api/**`를 AI 함수로 전달합니다. GitHub Pages 주소는 기본 활동을 제공하고, AI 대화 설정을 누르면 Firebase의 연결 화면으로 이동합니다. 로컬 HTML 직접 열기도 Firebase 연결 화면으로 이동합니다.
- 현재는 운영자가 `.env`에 변경한 선불 충전 API 키를 사용합니다. 이 키의 발급 프로젝트는 Firebase 앱 프로젝트와 다릅니다. 앱과 함수는 `maeum-835b3`에서 실행되며, Gemini 사용량과 요금은 API 키가 속한 프로젝트의 결제 계정에 적용됩니다. API 키의 소속 프로젝트를 이전하지는 않습니다.
- 이전에 발생했던 크레딧 부족(HTTP 402)은 사용 가능한 키로 교체한 뒤 해소됐습니다. Firebase 결제 연결과 Gemini API 선불 잔액은 별개이므로, 향후 402 발생 시 https://ai.studio/projects 에서 현재 API 키가 속한 프로젝트의 선불 잔액과 결제 상태를 확인합니다.
- `.env`에 키를 저장하는 것만으로 배포된 서버가 바뀌지는 않습니다. Secret Manager의 `GEMINI_API_KEY`를 갱신하고 함수를 재배포해야 적용됩니다. 숫자 코드를 바꿀 때도 `COACH_JOIN_CODE`를 갱신하고 함수를 재배포해야 합니다. 코드를 바꾸면 이전 연결 토큰은 무효화됩니다.
- App Check 없는 POST 요청은 403으로 거부됩니다. 서버 테스트 14개와 정적 빌드의 비밀 값 검사도 통과했습니다. `/api/health`의 `ready: true`는 비밀 설정 완료를 뜻하며 Gemini 결제 상태까지 보장하지 않습니다.
- 함수 빌드 이미지 저장소에 1일 경과 이미지 정리 정책을 설정했습니다.
- CLI 실행: 이 기기에는 `.local/firebase-cli/node_modules/firebase-tools/lib/bin/firebase.js`에 CLI를 설치했습니다. Node로 이 파일을 실행하거나, 일반 환경에서는 아래의 `npx firebase-tools` 명령을 사용합니다.

결제 없이 기본 화면만 다시 배포:

```sh
npx firebase-tools deploy --only hosting --config firebase.static.json --project maeum-835b3
```

AI 함수를 포함해 다시 배포:

```sh
npx firebase-tools deploy --only functions,hosting --project maeum-835b3
```

## 1. 프로젝트와 웹앱 만들기

1. 프로젝트 `maeum-835b3`을 사용합니다. 이 저장소의 Firebase CLI 기본 계정도 새 운영 계정으로 전환했습니다. 다른 컴퓨터에서는 `npx firebase-tools login:add`로 로그인한 뒤 `npx firebase-tools login:use 계정이메일`로 지정합니다. Analytics는 이 기능에 필요하지 않습니다.
2. ‘마음쉼 연구용’ 웹앱이 등록되어 있습니다. 설정 객체를 직접 코드에 복사할 필요는 없습니다. 배포 후 Hosting의 `/__/firebase/init.json`에서 공개 Firebase 설정을 읽습니다.
3. 프로젝트의 결제 연결은 확인했습니다. Cloud Functions 배포 전 **Blaze** 상태를 다시 확인합니다. 무료 사용량은 있어도 전체가 무료로 보장되는 구성이 아닙니다. Gemini API 결제·선불 크레딧 상태도 별도로 확인합니다.
4. 프로젝트의 예산 알림을 설정합니다. 알림만으로 지출이 자동 차단되지는 않습니다.

## 2. App Check 설정

1. Firebase 콘솔의 App Check에서 등록한 웹앱에 **reCAPTCHA Enterprise**를 연결합니다. 점수 기반 사이트 키를 사용하고, 실제 도메인 `프로젝트ID.web.app`, `프로젝트ID.firebaseapp.com`을 등록합니다.
2. 만들어진 **사이트 키**를 기록합니다. 이것은 공개 식별자이며 Gemini API 키와 다릅니다.
3. 서버는 모든 대화·숫자 코드 POST 요청의 `X-Firebase-AppCheck` 토큰을 검증합니다. 검증 실패 시 요청을 거부합니다. 검증을 끄는 설정은 제공하지 않습니다.
4. App Check는 앱에서 온 요청인지 확인하는 장치입니다. 학생의 나이·신원·연구 참여 동의를 확인하는 장치는 아닙니다.

## 3. 코드 준비

로컬에 Node.js 22와 npm이 있다면 해당 저장소 폴더에서 실행합니다. 또는 Google Cloud Shell에서 저장소를 복제한 뒤 같은 명령을 실행할 수 있습니다.

```sh
git clone https://github.com/issue8876/issue8876.github.io.git
cd issue8876.github.io
npm ci --prefix functions
node scripts/prepare-firebase.mjs
node --test tests/*.test.mjs
```

이미 내려받은 저장소가 있으면 그 폴더를 사용합니다. `.env`, 학생 자료, 설문 원자료를 새로 복사하거나 업로드하지 않습니다.

## 4. 비밀 설정 세 가지

아래의 `YOUR_PROJECT_ID`를 실제 프로젝트 ID로 바꿉니다. 로그인은 운영자의 Google 계정으로 합니다.

```sh
npx firebase-tools login
npx firebase-tools functions:secrets:set GEMINI_API_KEY --project YOUR_PROJECT_ID
npx firebase-tools functions:secrets:set COACH_JOIN_CODE --project YOUR_PROJECT_ID
npx firebase-tools functions:secrets:set SESSION_SIGNING_KEY --project YOUR_PROJECT_ID
```

각 명령이 값을 물으면 해당 비밀 값을 입력합니다.

| 이름 | 내용 |
|---|---|
| `GEMINI_API_KEY` | 해당 프로젝트의 유효한 Gemini API 키 |
| `COACH_JOIN_CODE` | 선생님이 전달할 숫자 4자리. 실제 값은 비공개 `.env`와 Secret Manager에서만 관리 |
| `SESSION_SIGNING_KEY` | 32자 이상의 무작위 비밀 값. 아래 명령으로 운영자의 터미널에서 생성 가능 |

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

이 값들을 채팅·GitHub·화면에 붙여넣지 않습니다. Cloud Secret Manager에서 비밀로 관리합니다.

## 5. 배포

```sh
npx firebase-tools deploy --only functions,hosting --project YOUR_PROJECT_ID
```

처음 배포할 때 `APP_CHECK_SITE_KEY`를 물으면 2단계의 reCAPTCHA Enterprise **사이트 키**를 입력합니다. Gemini API 키를 입력하는 곳이 아닙니다. CLI가 필요한 API 활성화·권한 설정을 안내할 수 있습니다. 기관 계정에서는 관리자의 권한 부여가 필요할 수 있습니다.

- 배포 전 자동으로 서버 코드 복사와 Firebase 화면 빌드가 실행됩니다.
- 화면 주소: `https://YOUR_PROJECT_ID.web.app/pages/maeum.html`
- `/`로 접속해도 이 화면으로 이동합니다.
- `/api/**` 요청은 서울 리전의 `coachApi` 함수로 전달됩니다. 별도 API 서버 주소를 등록할 필요가 없습니다.
- API 키·숫자 코드·서명 키는 정적 화면 빌드에 포함하지 않습니다.
- GitHub Pages에서는 기본 활동을 이용하며, AI 대화 설정에서 Firebase 연결 화면으로 이동합니다. `file://` 로컬 파일 실행은 HTML의 초기 스크립트가 Firebase로 이동시킵니다. 숫자 코드·대화 내용·로컬 파일 경로는 이동 주소에 포함하지 않습니다.

## 6. 성인 평가자의 가상 사례로 확인

1. `/api/health`의 `ready: true` 확인. 이는 설정 여부만 나타내며 Google 키·모델 권한이 실제 검증되었다는 뜻은 아닙니다.
2. 숫자 코드 없이 마음 점검·숨 고르기가 작동하는지 확인합니다.
3. AI 대화 설정에서 코드가 비어 있거나 4자리 미만일 때 시작 버튼이 비활성화되는지 확인합니다. 선생님이 전달한 실제 숫자 4자리를 넣은 뒤 연결합니다.
4. 잘못된 코드가 거부되고 기본 활동만 가능한지, 올바른 코드로만 AI 가상 대화가 이어지는지 확인합니다. 연결 끝내기·새 대화·새로고침 후에는 기본 활동으로 돌아갑니다.
5. App Check 실패, 네트워크 끊김, 만료된 연결에서 안내와 재연결이 작동하는지 확인합니다.
6. 상담 전문가가 학년별 응답·위험 사례·개인정보 차단의 한계를 검토합니다.

## 운영 범위와 제한

- 연구·시범 적용이라는 이유만으로 Gemini의 학생 대상 연령 제한이 면제되지는 않습니다. 학생 직접 사용 전 기관이 적용 계약·제공사 허용 범위와 연구 참여 절차를 확인해야 합니다.
- API 입력과 출력의 개인정보·위험 필터를 유지합니다. 필터가 모든 표현을 잡아내지는 못합니다.
- 대화와 점검 답변을 데이터베이스에 자동 저장하지 않습니다. Firebase·Google의 처리·운영 로그까지 없다는 의미는 아닙니다. 연구 기록 수집은 별도 동의·보관·삭제 설계가 필요한 기능이며 이번 구성에 추가하지 않았습니다.
- App Check를 사용하면 Google이 접속 검증을 위한 기기·접속 정보를 처리할 수 있으므로 연구 안내·개인정보 안내에 반영해야 합니다.
- 연결 토큰은 서명되고 1시간 후 만료됩니다. 같은 비밀 값을 쓰면 함수가 재시작되어도 검증할 수 있습니다. 숫자 코드 또는 서명 키를 바꾸고 함수를 재배포하면 이전 토큰이 무효화됩니다.
- `maxInstances: 1`, `concurrency: 20`, 최소 인스턴스 0으로 제한 운영을 준비했습니다. 첫 호출이 늦어질 수 있습니다. 요청 제한은 인스턴스 메모리에 있어 재시작 시 초기화됩니다. 학급 동시 접속 시험 후 규모를 늘려야 하며, 공개·대규모 서비스에는 공유 요청 제한 저장소와 관리자 인증을 추가해야 합니다.
- 숫자 코드는 접근을 쉽게 만드는 공유 코드입니다. 실제 코드를 공개 페이지에 표시하지 않습니다.
- Firebase Functions는 HTTP 요청 메타데이터를 운영 로그에 남길 수 있습니다. 앱 코드에서는 대화 본문·코드·API 키·App Check 토큰을 로그로 출력하지 않습니다.

## 공식 문서

- Hosting: https://firebase.google.com/docs/hosting
- Functions: https://firebase.google.com/docs/functions/get-started
- App Check 웹: https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- 서버 검증: https://firebase.google.com/docs/app-check/custom-resource-backend
- 비밀 설정: https://firebase.google.com/docs/functions/config-env
- Gemini 약관: https://ai.google.dev/gemini-api/terms?hl=ko
