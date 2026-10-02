# 자동 테스트

실제 화면을 브라우저(Playwright)로 눌러 보며 확인하는 시나리오 모음입니다.
시나리오마다 **테스트용 데이터 폴더와 포트(3199)** 로 서버를 따로 켜므로, 실제 `data` 폴더와 백업은 건드리지 않습니다.

## 준비 (개발용 PC에서 한 번)
```
npm install
npm install -g playwright
npx playwright install chromium
```

## 실행
```
npm run build
npm run lint                  # 코드 검사 (경고 0개여야 통과)
node tests/run.mjs            # 전체
node tests/run.mjs r29 hx     # 파일 이름에 r29·hx 가 들어간 것만
```
결과 사진은 `tests/output/` 에 저장됩니다.

## 구성
- `seed.cjs` : 시나리오마다 새로 넣는 예시 명단(가상 환자)
- `lib.mjs` : 공용 도우미 (서버 값 읽기·고치기, 화면 이동, OK/FAIL 출력)
- `scenarios/*.mjs` : 기능별 시나리오
- `fixtures/` : 명단 업로드 시험용 가상 엑셀 파일

## 알아 둘 점
- 화면 오류는 흰 화면 대신 안내가 떠서 `pageerror` 로 잡히지 않습니다. 대신 서버 기록에 `[화면 오류]` 가 남으면
  그 시나리오를 실패로 봅니다. 일부러 화면 오류를 만드는 시나리오는 파일 안에 `화면오류-허용` 을 적어 둡니다.
- `tester(page)` 는 주소를 열 때마다 '마지막 화면 기억'을 지워 메인 화면에서 시작합니다.
  기억 기능을 확인할 때만 `tester(page, { keepRole: true })`.
- 전체 실행을 두 개 동시에 돌리지 마세요 (같은 포트를 씀). 하나만 따로 돌릴 때는 `OPH_TEST_PORT=3207 node tests/run.mjs r66`.
