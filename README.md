# 오늘급식

정적 HTML/CSS/JS로 만든 한세사이버보안고등학교 전용 NEIS 급식 화면입니다. 화면에서 학교 검색, API Key 입력, 데모 급식 데이터는 사용하지 않습니다.

## 실행

`index.html`을 브라우저에서 열면 됩니다.

로컬 서버로 확인하려면 아래 명령을 실행한 뒤 `http://localhost:4173`으로 접속합니다.

```bash
python3 -m http.server 4173
```

## 학교 값

단일 학교용 값은 [app.js](./app.js) 상단의 `SCHOOL_CONFIG`에서 관리합니다.

- `name`: 화면에 표시할 학교명
- `officeCode`: 시도교육청 코드
- `schoolCode`: 표준학교코드
- `apiKey`: 나이스 API Key가 필요할 때만 사용

현재 기본값은 아래와 같습니다.

- `name`: 한세사이버보안고등학교
- `officeCode`: B10
- `schoolCode`: 7010911

공개 저장소에는 실제 비밀 키를 커밋하지 마세요. 필요한 경우 서버 프록시나 배포 환경에서 `window.MEAL_CONFIG`를 먼저 주입해 사용합니다. `.env`, `.env.*`, `.env_*`, `server.txt`는 커밋 대상에서 제외합니다.

## 배포

소스 배포는 로컬에서 GitHub로 push한 뒤 서버에서 `git pull`로 반영합니다.

```bash
git add .
git commit -m "Update meal app"
git push
```

서버에서는 배포 디렉터리로 이동한 뒤 최신 커밋을 가져옵니다.

```bash
git pull
```

`.env` 파일이 필요한 경우 GitHub에 올리지 않고 별도로 서버에만 복사합니다.

```bash
scp .env <server-user>@<server-host>:<deploy-path>/.env
```

## 주요 기능

- 날짜 이동, 오늘 이동, 주간 급식 카드
- 날짜 직접 선택 및 `?date=YYYY-MM-DD` 링크 유지
- 오늘 메뉴 클립보드 복사
- 열량, 영양정보, 원산지, 알레르기 코드 표시
- 주간 급식일, 평균 열량, 등록 식사 수 요약
- API 성공 데이터 주 단위 캐시
- 모바일 대응, favicon, PWA manifest

## 연동 엔드포인트

- 급식: `https://open.neis.go.kr/hub/mealServiceDietInfo`
