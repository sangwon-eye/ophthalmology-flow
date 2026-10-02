// 자동 테스트 실행: node tests/run.mjs            (전체)
//                  node tests/run.mjs r29 hx     (이름에 r29·hx 가 들어간 것만)
// 시나리오마다 새 테스트 데이터(시드)로 테스트용 서버를 따로 켜서 돌립니다. 실제 data 폴더·백업은 건드리지 않습니다.
// 준비: npm run build (dist 필요), Playwright (npm i -g playwright 후 npx playwright install chromium)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PORT = Number(process.env.OPH_TEST_PORT) || 3199;
const BASE = `http://127.0.0.1:${PORT}`;
const filters = process.argv.slice(2);
const files = fs.readdirSync(path.join(here, 'scenarios')).filter(f => f.endsWith('.mjs')).sort()
  .filter(f => !filters.length || filters.some(x => f.includes(x)));

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.log('dist 가 없어 먼저 빌드합니다...');
  spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/storage/settings`); if (r.status) return true; } catch { /* 아직 */ }
    await wait(250);
  }
  return false;
}

const results = [];
for (const f of files) {
  const tmp = fs.mkdtempSync(path.join(here, '.tmp-'));
  const data = path.join(tmp, 'data');
  spawnSync(process.execPath, [path.join(here, 'seed.cjs')], { cwd: tmp });
  const env = { ...process.env, OPH_DATA_DIR: data, OPH_PORT: String(PORT), OPH_TEST_BASE: BASE };
  // 서버 기록은 파일로 받아 둡니다: 화면 오류(흰 화면 대신 안내가 뜬 경우)가 기록되면 실패로 봄
  const logFile = path.join(tmp, 'server-out.txt');
  const logFd = fs.openSync(logFile, 'w');
  const server = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, env, stdio: ['ignore', logFd, logFd] });
  let out = '';
  let code = 1;
  if (await waitUp()) {
    const r = spawnSync(process.execPath, [path.join(here, 'scenarios', f)], { cwd: tmp, env, encoding: 'utf8', timeout: 240000 });
    out = `${r.stdout || ''}${r.stderr || ''}`;
    code = r.status ?? 1;
  } else out = '테스트 서버가 켜지지 않았습니다';
  server.kill();
  await wait(300);
  fs.closeSync(logFd);
  // 일부러 화면 오류를 만드는 시나리오는 파일 안에 '화면오류-허용' 표시
  const clientErrors = (fs.readFileSync(logFile, 'utf8').match(/\[화면 오류\][^\n]*/g) || []);
  if (clientErrors.length && !fs.readFileSync(path.join(here, 'scenarios', f), 'utf8').includes('화면오류-허용')) {
    out += clientErrors.map(l => `\nFAIL 서버에 기록된 화면 오류: ${l}`).join('');
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const okN = (out.match(/^OK /gm) || []).length;
  const failN = (out.match(/^FAIL/gm) || []).length;
  const pass = code === 0 && failN === 0;
  results.push({ f, pass });
  console.log(`${pass ? '통과' : '실패'}  ${f}  (${okN} OK${failN ? `, ${failN} FAIL` : ''})`);
  if (!pass) console.log(out.split('\n').filter(l => /FAIL|Error|waiting for/.test(l)).slice(0, 6).map(l => `      ${l}`).join('\n'));
}
const bad = results.filter(r => !r.pass);
console.log(`\n${results.length}개 중 ${results.length - bad.length}개 통과${bad.length ? ` · 실패: ${bad.map(r => r.f).join(', ')}` : ''}`);
process.exitCode = bad.length ? 1 : 0;
