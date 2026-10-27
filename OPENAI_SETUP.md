# 마음쉼 · OpenAI GPT-6.1 Terra 연결

2026-10-27: 사용자 요청에 따라 **일반 OpenAI API 방식**으로 전환한다. ZDR 승인을 연결 조건으로 요구하지 않으며 ZDR 적용을 주장하지 않는다. `store: false`는 유지한다. 실제 전환은 검증·배포 결과를 별도로 확인한다.

## 키 입력만으로 등록과 배포

1. 상위 폴더의 `마음쉼 OpenAI 키 등록.cmd` 또는 저장소의 `OpenAI-Key-Setup.cmd`를 실행한다.
2. 열린 화면에 프로젝트 API 키를 붙여 넣고 **키 등록하기**를 누른다. 이미 등록했다면 **저장한 키로 다시 확인**을 누른다.
3. 프로그램이 모델 접근 권한을 조회하고 키를 비공개 `.env`와 Firebase Secret Manager에 등록한다. 키를 명령 인자·상태 화면·Firebase 디버그 로그에 출력하지 않는다.
4. 자동 테스트 → OpenAI 함수 배포 → 공개 준비 상태 확인 → 화면 배포를 순서대로 실행한다. 사용자는 파일 수정이나 배포 명령 입력을 하지 않는다.

입력 화면은 `127.0.0.1`에만 열리고 4시간 뒤 닫힌다. 닫히면 실행 파일을 다시 열면 된다. 다른 사이트에서의 등록 요청과 중복 실행을 거부한다. Firebase 로그인이 만료되거나 권한이 바뀐 경우에는 Codex에서 복구해야 한다. 실제 대화 시험은 배포 후 가상 사례로 별도 확인한다.

## API와 저장 설정

- 모델: `gpt-6.1-terra`로 고정하며 다른 제공사나 모델로 자동 대체하지 않는다.
- 엔드포인트: `https://api.openai.com/v1/responses`.
- `store: false`, `background: false`, `reasoning: { effort: 'low' }`, 최대 출력 1,200토큰.
- 개인정보 가림을 거친 최근 대화 JSON과 학년·주제·기분을 보낸다. 점검의 숫자 응답, 숫자 코드, 연결 토큰은 AI 입력에 넣지 않는다.
- 저장 대화 ID, `previous_response_id`, 파일·벡터 저장소·외부 도구·추론 요약을 사용하지 않는다. 대화 문맥은 열린 브라우저 메모리에서 관리한다.
- App Check, 교사 숫자 코드, 입력·출력 필터, 요청 제한은 유지한다. 대화 본문·응답·제공사 오류 본문을 서버 로그에 출력하지 않는다.

이 구성은 ZDR이 아니다. `store: false`는 응답 객체 저장을 요청하지 않는 설정이며 OpenAI의 안전 점검용 보관까지 해제하지 않는다. 일반 API의 보관 범위·예외는 공식 데이터 제어 문서를 따른다. Firebase 접속·관리 로그와 브라우저 음성 서비스는 별개다.

## 내부 환경 변수

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-6.1-terra
OPENAI_ORG_ID=
OPENAI_PROJECT_ID=
```

키 입력 프로그램이 설정과 등록을 처리한다. 조직·프로젝트 ID는 특정 프로젝트로 요청을 한정할 때만 사용한다. 기존 `COACH_JOIN_CODE`, `SESSION_SIGNING_KEY`, `APP_CHECK_SITE_KEY`는 유지한다. 이전 `OPENAI_ZDR_CONFIRMED` 값은 연결 조건에 사용하지 않으며 등록 시 `false`로 정리한다.

운영 함수는 Secret Manager의 `OPENAI_API_KEY`를 읽고, `functions/.env.maeum-835b3`에는 공개 App Check 설정과 필요한 조직·프로젝트 ID만 둔다. 이 비공개 설정 파일은 Git에서 제외한다. 기존 Gemini 키를 삭제·폐기하지 않는다.

## 검증 상태

모의 응답을 사용하는 테스트에서 일반 API 연결, 키 누락·모델 불일치 차단, 숫자 코드 인증, 키 비공개 등록과 순차 배포를 확인한다. `/api/health`의 `ready: true`는 앱 설정 여부를 나타내며 OpenAI 결제·계정 권한을 계속 검증한다는 뜻은 아니다.

2026-10-27 완료: 자동 테스트 36개 통과, 실제 GPT-6.1 Terra 가상 요청 HTTP 200, Secret Manager 키 등록과 함수·Hosting 배포 완료. 공개 사이트에서 교사 코드 인증 후 가상 숙제 문장에 실제 답변이 나타나는 것을 확인했다. ZDR은 적용하지 않았다.

## 공식 근거

- [GPT-6.1 Terra 모델](https://developers.openai.com/api/docs/models/gpt-6.1-terra)
- [GPT-6 API 전환](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI 데이터 제어와 저장 범위](https://developers.openai.com/api/docs/guides/your-data)
