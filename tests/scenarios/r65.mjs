import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BASE, DATA, editKey } from '../lib.mjs';
// 서버 안전장치 (화면오류-허용: 화면 오류 기록 주소를 직접 확인): 저장 시 직전 저장본(.prev)·시간별 사본, 손상된 파일은 자동 복구(손상본은 따로 보관),
// 복구할 것이 없으면 그 항목만 멈추고(덮어쓰지 않음) 서버는 계속, 화면 오류 기록 주소
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) { fails++; process.exitCode = 1; } };
const today = (() => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
// 1) 평소 저장: 직전 저장본, 시간별 사본
await editKey('doctors', d => [...(d || [])]);
ok(fs.existsSync(path.join(DATA, 'keys', 'doctors.json.prev')), '저장하면 직전 저장본(.prev)이 남음');
const hourly = path.join(DATA, 'backups-hourly', today);
ok(fs.existsSync(hourly) && fs.readdirSync(hourly).some(f => /^daily-patients-\d\d시\.json$/.test(f)), '오늘 명단 시간별 사본');
const health = await (await fetch(`${BASE}/api/health`)).json();
ok(Array.isArray(health.problems) && health.problems.length === 0, '평소에는 데이터 파일 문제 없음');
const ce = await fetch(`${BASE}/api/client-error`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ where: 'test', message: '테스트 오류' }) });
ok(ce.status === 200, '화면 오류 기록 주소');
// 따로 켠 서버로 손상 파일 확인
const run = async (dir, port, fn) => {
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, OPH_DATA_DIR: dir, OPH_PORT: String(port) }, stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { await new Promise(r => setTimeout(r, 250)); try { up = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch { /* 켜지는 중 */ } }
  try { await fn(`http://127.0.0.1:${port}`, up); } finally { srv.kill(); await new Promise(r => setTimeout(r, 300)); }
};
const mk = () => { const d = fs.mkdtempSync(path.join(DATA, '..', 'safe-')); fs.mkdirSync(path.join(d, 'keys'), { recursive: true }); return d; };
// 2) 명단 파일이 비어 버림(정전) + 직전 저장본 있음 → 자동 복구
{
  const d = mk();
  const good = JSON.stringify({ version: 7, value: JSON.stringify([{ id: '9990001', name: '가상환자', date: today, doctor: '김선웅' }]) });
  fs.writeFileSync(path.join(d, 'keys', 'daily-patients.json'), '');
  fs.writeFileSync(path.join(d, 'keys', 'daily-patients.json.prev'), good);
  await run(d, 3196, async (B, up) => {
    ok(up, '손상 파일이 있어도 서버가 켜짐');
    const r = await (await fetch(`${B}/api/storage/daily-patients`)).json();
    ok(JSON.parse(r.value)[0]?.name === '가상환자' && r.version > 7, '직전 저장본으로 자동 복구 (버전은 크게 올림)');
    const h = await (await fetch(`${B}/api/health`)).json();
    ok(h.problems.some(p => p.key === 'daily-patients' && p.kind === 'recovered'), '복구했다는 안내 (health)');
  });
  ok(fs.readdirSync(path.join(d, 'keys')).some(f => f.startsWith('daily-patients.json.손상-')), '손상된 파일은 따로 보관');
  fs.rmSync(d, { recursive: true, force: true });
}
// 3) 되돌릴 것이 없는 손상 → 그 항목만 멈춤, 덮어쓰지 않음, 다른 항목·서버는 그대로
{
  const d = mk();
  fs.writeFileSync(path.join(d, 'keys', 'doctors.json'), '{bad');
  fs.writeFileSync(path.join(d, 'keys', 'settings.json'), JSON.stringify({ version: 1, value: '{}' }));
  await run(d, 3195, async (B, up) => {
    ok(up, '되돌릴 것이 없어도 서버는 켜짐');
    ok((await fetch(`${B}/api/storage/doctors`)).status === 500 && (await fetch(`${B}/api/storage/settings`)).status === 200, '손상된 항목만 읽기 멈춤 (다른 항목은 그대로)');
    const put = await fetch(`${B}/api/storage/doctors`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: '[]' }) });
    ok(put.status === 500, '손상된 항목에는 저장도 안 됨');
    const h = await (await fetch(`${B}/api/health`)).json();
    ok(h.problems.filter(p => p.key === 'doctors' && p.kind === 'broken').length === 1, '복구 못 했다는 안내 (한 번만)');
  });
  ok(fs.readFileSync(path.join(d, 'keys', 'doctors.json'), 'utf8') === '{bad', '손상된 파일을 덮어쓰지 않음');
  fs.rmSync(d, { recursive: true, force: true });
}
