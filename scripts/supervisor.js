// 창 없이 켜진 서버를 지켜보다가, 예기치 않게 멈추면 5초 뒤 다시 켭니다.
// 서버 종료 코드: 0 = 서버끄기로 정상 종료, 2 = 데이터 파일 손상, 3 = 이미 켜져 있음 → 다시 켜지 않음
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './common.js';

const LOG = path.join(ROOT, 'data', 'server-log.txt');
const note = (msg) => {
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, `[${new Date().toLocaleString('ko-KR')}] ${msg}\n`); } catch { /* 무시 */ }
};

function run() {
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT, windowsHide: true, stdio: 'ignore', env: process.env,
  });
  child.on('exit', code => {
    if ([0, 2, 3].includes(code)) process.exit(0);
    note(`서버가 예기치 않게 멈춰 5초 뒤 다시 켭니다 (코드 ${code}).`);
    setTimeout(run, 5000);
  });
  child.on('error', e => {
    note(`서버를 켜지 못했습니다: ${e.message}. 5초 뒤 다시 시도합니다.`);
    setTimeout(run, 5000);
  });
}
run();
