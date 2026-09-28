# ophthalmology-flow

안과 환자 흐름 관리 앱. 내부망의 서버 PC 한 대에서 `서버켜기_창없이.bat`을 실행하고,
다른 컴퓨터는 브라우저로 `http://서버PC주소:3000`에 접속합니다.

자세한 방법은 [사용방법.txt](사용방법.txt)를 보세요.

- `src/App.jsx` : 최상위 앱 (저장소 동기화와 화면 전환)
- `src/views/` : 화면별 파일 (시력방·검사실, 진료실, 처치실, 관리자, 설정, 환자용 화면, 메인 화면)
- `src/ui/common.jsx` : 여러 화면이 함께 쓰는 카드·버튼·창
- `src/core/` : 진료 흐름 규칙·계산(`flow.jsx`)과 서버 저장소(`storage.jsx`)
- `tests/` : 자동 테스트 (`tests/README.md`), 코드 검사는 `npm run lint`
- `CLAUDE.md` : 작업 방식·정해진 결정 기록 (Claude가 작업 전에 읽음)
- `src/main.jsx` : 서버 저장소 연결, 연결 끊김/새 버전 알림
- `server.js` : 공유 서버 (Node.js 기본 기능만 사용, 데이터는 `data/keys/`)
- `scripts/` : 서버 켜기(창 없이)·끄기·상태 확인 도구
- `서버설정.txt` : 공유폴더 백업 위치, 포트
