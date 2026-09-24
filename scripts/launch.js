// 서버를 화면에 창 없이(콘솔 없이) 백그라운드로 켭니다. 서버켜기_창없이.bat 에서 사용합니다.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './common.js';

const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'supervisor.js')], {
  cwd: ROOT,
  detached: true,      // 이 창과 완전히 분리 (콘솔 없음)
  windowsHide: true,
  stdio: 'ignore',
  env: { ...process.env, OPH_HIDDEN: '1' },
});
child.unref();
