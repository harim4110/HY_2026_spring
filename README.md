# Cognitive Tasks Demo

정적 웹페이지로 `Stroop`와 `Visual Search`를 실행하고, trial-level 데이터를 수집하는 수업용 프로토타입입니다. 수업 운영 기준은 `10분 내 체험`, `모바일 지원`, `Google Sheets 자동 수집`, `결과 대시보드 확인`입니다.

## 현재 구성

- 모바일 친화적 실험 화면: [index.html](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/index.html)
- 결과 조회 화면: [results.html](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/results.html)
- 공통 설정 파일: [config.js](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/config.js)
- 영어 색단어 기반 `Stroop`
  - practice 4
  - main 20
  - `congruent` / `incongruent`
- `Visual Search`
  - practice 6
  - main 24
  - `feature-search` / `conjunction-search`
  - set size `8 / 16 / 24`
- 학생이 과제를 아무 순서로 선택 가능
- 같은 과제를 여러 번 다시 실행 가능
- Google Sheets 제출 시 학번 기준으로 자동 회차 부여
  - 예: `20260001_1`, `20260001_2`
- trial-level 데이터 중복 제출 방지
- 수업 후 간단한 리더보드와 조건별 평균 시각화 조회 가능

## 빠른 실행

브라우저에서 [index.html](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/index.html)을 바로 열어도 되지만, 배포 전에는 간단한 정적 서버로 확인하는 편이 안전합니다.

```bash
npx serve .
```

## 설정

Apps Script 웹앱 URL을 [config.js](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/config.js)에 넣습니다.

```javascript
export const APPS_SCRIPT_URL = "YOUR_APPS_SCRIPT_WEB_APP_URL";
```

이 URL 하나로
- 실험 화면 제출
- 결과 대시보드 요약 조회
를 같이 처리합니다.

## Google Sheets 연동

1. 새 Google Sheet를 만듭니다.
2. `Extensions -> Apps Script`로 이동합니다.
3. [Code.gs](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/apps-script/Code.gs)를 붙여넣습니다.
4. 웹앱으로 배포하고 `Anyone with the link` 접근을 허용합니다.
5. 발급된 URL을 [config.js](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/config.js)에 넣습니다.

Apps Script는 아래를 담당합니다.
- raw trial 저장
- 중복 rowId 제거
- 학번별 공식 회차 번호 부여
- `submissions` 시트 생성
- 결과 대시보드용 요약 JSON 제공

## 시트 구조

자동으로 생성되는 시트:
- `raw`: trial-level 데이터
- `submissions`: 제출 단위 로그

핵심 컬럼:
- `baseParticipantId`
- `participantAttemptId`
- `runId`
- `localRunLabel`
- `taskId`
- `phase`
- `trialNumber`
- `reactionTimeMs`
- `condition`
- `setSize`
- `correct`

## 결과 대시보드

[results.html](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/results.html)에서 확인할 수 있습니다.

표시 내용:
- 각 과제 1등
- 각 과제 상위 5명
- 조건별 평균 반응시간
- 조건별 평균 정확도

현재 1등 기준:
- 정확도 우선
- 정확도가 같으면 평균 RT가 빠른 순

## 배포 권장안

- 호스팅: GitHub Pages
- 학생용 QR은 [index.html](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/index.html)로 연결
- 교사용 결과 조회는 [results.html](/Users/bdil_harim/Documents/GitHub/HY_2026_spring/results.html)로 별도 사용
- 수업 전 모바일 실기 테스트 1회 권장
- 현장 백업용으로 CSV 다운로드 버튼 유지

## 운영 팁

- 수업 중 자유 체험은 허용하되, 공식 분석에는 보통 첫 제출 기준만 쓰는 편이 깔끔합니다.
- 다시 수행한 데이터도 남기고 싶다면 `participantAttemptId`를 기준으로 회차별 비교가 가능합니다.
- 분석 수업에서는
  - Stroop: `congruent vs incongruent`
  - Visual Search: `feature vs conjunction`
  - 추가로 `setSize`
  를 비교하면 됩니다.
