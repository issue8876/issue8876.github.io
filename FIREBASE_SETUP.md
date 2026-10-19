# 마음쉼 · Firebase로 연구용 시험 환경 만들기

구성: Firebase Hosting(화면) → Cloud Functions for Firebase(코드 확인·필터) → Gemini 3.8 Flash.
프로젝트 ID는 `maeum-d3a43`입니다. 웹앱 등록과 App Check 연결을 완료했고, 기본 활동은 https://maeum-d3a43.web.app/pages/maeum.html 에 배포했습니다. 사용자의 요청으로 결제 연결을 미뤘으므로 Cloud Functions와 AI 대화는 아직 배포하지 않았습니다. Render 계정은 필요하지 않습니다.

## 현재 상태와 다음 배포

- 완료: Firebase CLI 로그인, 웹앱 등록, reCAPTCHA Enterprise App Check 설정, Hosting 기본 활동 배포.
- 로컬에 준비: `.env`의 Gemini API 키·숫자 코드·서명 키. 값은 Git에 포함하지 않고 클라우드에도 아직 올리지 않았습니다.
- App Check 사이트 키는 `functions/.env.maeum-d3a43`에 준비했습니다. 이 파일도 Git에서 제외됩니다.
- 현재 배포는 `firebase.static.json`을 사용하며 AI 서버를 호출하지 않습니다.
- 결제 연결 이후 세 가지 비밀 값을 Secret Manager에 등록하고, `firebase.json`으로 함수와 Hosting을 함께 배포해야 AI가 연결됩니다.
- CLI 실행: 이 기기에는 `.local/firebase-cli/node_modules/firebase-tools/lib/bin/firebase.js`에 CLI를 설치했습니다. Node로 이 파일을 실행하거나, 일반 환경에서는 아래의 `npx firebase-tools` 명령을 사용합니다.

결제 없이 기본 화면만 다시 배포:

```sh
npx firebase-tools deploy --only hosting --config firebase.static.json --project maeum-d3a43
```

Blaze 연결과 비밀 등록을 마친 뒤 AI 포함 배포:

```sh
npx firebase-tools deploy --only functions,hosting --project maeum-d3a43
```

## 1. 프로젝트와 웹앱 만들기

1. 기존 프로젝트 `maeum-d3a43`을 사용합니다. Analytics는 이 기능에 필요하지 않습니다.
2. ‘마음쉼 연구용’ 웹앱이 등록되어 있습니다. 설정 객체를 직접 코드에 복사할 필요는 없습니다. 배포 후 Hosting의 `/__/firebase/init.json`에서 공개 Firebase 설정을 읽습니다.
3. Cloud Functions 배포를 위해 **Blaze** 요금제로 연결합니다. 무료 사용량은 있어도 전체가 무료로 보장되는 구성이 아닙니다. Gemini API 결제·선불 크레딧 상태도 별도로 확인합니다.
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
| `COACH_JOIN_CODE` | 선생님이 전달할 4~6자리 숫자. `1234`는 예시이며 운영 때는 임의의 6자리 권장 |
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
- 기존 GitHub Pages 주소는 현재 기본 활동을 유지합니다. Firebase 배포를 검증한 뒤 필요하면 새 주소로 안내하도록 바꿉니다.

## 6. 성인 평가자의 가상 사례로 확인

1. `/api/health`의 `ready: true` 확인. 이는 설정 여부만 나타내며 Google 키·모델 권한이 실제 검증되었다는 뜻은 아닙니다.
2. 숫자 코드 없이 마음 점검·숨 고르기가 작동하는지 확인합니다.
3. AI 대화 설정에서 실제 숫자 코드를 넣고 전송 안내를 확인합니다.
4. 잘못된 코드가 거부되고, 올바른 코드로 가상 대화가 이어지는지 확인합니다.
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
