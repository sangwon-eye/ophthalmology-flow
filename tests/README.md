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
node tests/run.mjs            # 전체
node tests/run.mjs r29 hx     # 파일 이름에 r29·hx 가 들어간 것만
```
결과 사진은 `tests/output/` 에 저장됩니다.

## 구성
- `seed.cjs` : 시나리오마다 새로 넣는 예시 명단(가상 환자)
- `lib.mjs` : 공용 도우미 (서버 값 읽기·고치기, 화면 이동, OK/FAIL 출력)
- `scenarios/*.mjs` : 기능별 시나리오
- `fixtures/` : 명단 업로드 시험용 가상 엑셀 파일
