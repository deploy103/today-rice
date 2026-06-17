# 오늘급식

한세사이버보안고등학교 전용 NEIS 급식 화면입니다. 

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
