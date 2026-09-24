// 창 없이 켜진 서버를 끕니다 (이 컴퓨터에서만 가능).
import http from 'node:http';
import { configuredPort } from './common.js';

const port = configuredPort();
const req = http.request({ host: '127.0.0.1', port, path: '/api/shutdown', method: 'POST', timeout: 3000 }, res => {
  res.resume();
  res.on('end', () => {
    console.log(res.statusCode === 200 ? '\n 서버를 껐습니다. 이제 다른 컴퓨터에서도 사용할 수 없습니다.\n' : `\n 서버를 끄지 못했습니다 (${res.statusCode}).\n`);
    process.exit(res.statusCode === 200 ? 0 : 1);
  });
});
req.on('timeout', () => req.destroy());
req.on('error', () => { console.log('\n 서버가 이미 꺼져 있습니다.\n'); process.exit(0); });
req.end();
