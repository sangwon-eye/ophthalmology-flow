# ophthalmology-flow

안과 환자 흐름 관리 앱. 내부망의 서버 PC 한 대에서 `서버시작.bat`을 실행하고,
다른 컴퓨터는 브라우저로 `http://서버PC주소:3000`에 접속합니다.

자세한 방법은 [사용방법.txt](사용방법.txt)를 보세요.

- `src/App.jsx` : 앱 화면과 기능
- `src/main.jsx` : 서버 저장소 연결, 연결 끊김/새 버전 알림
- `server.js` : 공유 서버 (Node.js 기본 기능만 사용, 데이터는 `data/keys/`)
