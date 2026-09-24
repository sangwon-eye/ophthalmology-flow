// 서버가 켜져 있는지 확인합니다. 켜져 있으면 0, 아니면 1로 끝납니다.
// --print 를 붙이면 접속 주소를 보여줍니다.
import http from 'node:http';
import { configuredPort, lanAddresses } from './common.js';

const port = configuredPort();
const print = process.argv.includes('--print');

const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 1500 }, res => {
  res.resume();
  if (res.statusCode !== 200) return done(false);
  done(true);
});
req.on('timeout', () => req.destroy());
req.on('error', () => done(false));

function done(ok) {
  if (print) {
    if (ok) {
      const { main, virtual } = lanAddresses();
      console.log('');
      console.log(' 서버가 켜져 있습니다.');
      console.log('');
      console.log(` 이 컴퓨터에서 접속:   http://localhost:${port}`);
      for (const a of main) console.log(` 다른 컴퓨터에서 접속: http://${a}:${port}`);
      if (!main.length) for (const a of virtual) console.log(` 다른 컴퓨터에서 접속: http://${a}:${port}`);
      console.log('');
    } else {
      console.log('');
      console.log(' 서버가 꺼져 있습니다. 서버켜기_창없이.bat 을 실행하세요.');
      console.log('');
    }
  }
  process.exit(ok ? 0 : 1);
}
