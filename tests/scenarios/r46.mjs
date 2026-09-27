import { chromium, SP, BASE, DATA, getKey, editKey, tester } from '../lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// 이전 시력: 한 환자 칸만 저장 (오늘 + 지난 1회), 서버 칸 저장 충돌 처리
const api = (k) => `${BASE}/api/storage-entries/${k}`;
const post = (k, entries) => fetch(api(k), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) });
// 서버: 칸 저장 · 충돌
await editKey('measure-history', () => ({ A: [{ date: '2026-01-01', nct: { od: '10', os: '11' } }], B: [{ date: '2026-01-02' }] }));
let r = await post('measure-history', [{ id: 'A', prev: [{ date: '2026-01-01', nct: { od: '10', os: '11' } }], next: [{ date: '2026-02-01' }] }]);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, cardOf } = tester(page);
ok(r.status === 200, '칸 저장 성공');
let h = (await getKey('measure-history')).value;
ok(h.A[0].date === '2026-02-01' && h.B[0].date === '2026-01-02', '그 칸만 바뀌고 다른 칸은 그대로');
r = await post('measure-history', [{ id: 'A', prev: [{ date: 'old' }], next: null }]);
ok(r.status === 409 && (await r.json()).current.A[0].date === '2026-02-01', '다른 값 기준이면 거절 + 최신 값 돌려줌');
// 화면: 시력방 측정값 저장 → 그 환자 칸만, 최대 2회
const pid = (await getKey('daily-patients')).value.find(p => p.name === '최민지').id;
await editKey('measure-history', () => ({ [pid]: [{ date: '2025-05-01', nct: { od: '20', os: '20' } }, { date: '2025-01-01', nct: { od: '21', os: '21' } }], other: [{ date: '2025-01-01' }] }));
await page.goto(`${BASE}/`); await W();
await pick('시력');
await cardOf('최민지').getByRole('button', { name: '측정값 입력' }).click(); await W(300);
const m = page.locator('.fixed.inset-0').last();
await m.locator('input').first().fill('0.5');
await m.getByRole('button', { name: '확인', exact: true }).click(); await W(300);
if (await page.locator('.fixed.inset-0').count()) { await page.locator('.fixed.inset-0').last().getByRole('button', { name: '확인', exact: true }).click(); }
await W(1500);
h = (await getKey('measure-history')).value;
ok(Array.isArray(h[pid]) && h[pid].length === 2 && h[pid][1].date === '2025-05-01', `오늘 + 지난 1회만 남음 (${JSON.stringify(h[pid]?.map(x => x.date))})`);
ok(Array.isArray(h.other), '다른 환자 칸은 그대로');
// 환자번호 끝 두 자리 파일에 나눠 저장 (…33 → 33.json)
const shardFile = path.join(DATA, 'keys', 'measure-history', `${String(pid).slice(-2)}.json`);
ok(fs.existsSync(shardFile) && JSON.parse(JSON.parse(fs.readFileSync(shardFile, 'utf8')).value)[pid], `환자 기록이 ${String(pid).slice(-2)}.json 에 저장됨`);
ok(!fs.existsSync(path.join(DATA, 'keys', 'measure-history.json')), '예전 한 파일은 없음');
// 예전 한 파일(measure-history.json)은 서버를 켤 때 100개 파일로 나눠 옮김 (따로 켠 서버로 확인)
{
  const dir = fs.mkdtempSync(path.join(DATA, '..', 'split-'));
  fs.mkdirSync(path.join(dir, 'keys'), { recursive: true });
  const value = JSON.stringify({ '1000007': [{ date: '2026-01-01' }], '2000042': [{ date: '2026-02-02' }] });
  fs.writeFileSync(path.join(dir, 'keys', 'measure-history.json'), JSON.stringify({ version: 3, value }));
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, OPH_DATA_DIR: dir, OPH_PORT: '3197' }, stdio: 'ignore' });
  let got = null;
  for (let i = 0; i < 40 && !got; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const r = await fetch('http://127.0.0.1:3197/api/storage/measure-history'); if (r.ok) got = JSON.parse((await r.json()).value); } catch { /* 켜지는 중 */ }
  }
  srv.kill();
  ok(got?.['1000007'] && got?.['2000042'], '나눠 옮긴 뒤에도 전체가 그대로 보임');
  ok(fs.existsSync(path.join(dir, 'keys', 'measure-history', '07.json')) && fs.existsSync(path.join(dir, 'keys', 'measure-history', '42.json')) && !fs.existsSync(path.join(dir, 'keys', 'measure-history.json')), '07.json · 42.json 으로 나뉘고 예전 파일은 없어짐');
  const backups = fs.existsSync(path.join(dir, 'backups')) ? fs.readdirSync(path.join(dir, 'backups')) : [];
  ok(backups.some(d => fs.existsSync(path.join(dir, 'backups', d, 'measure-history.json'))), '예전 파일은 백업 폴더에 남김');
  fs.rmSync(dir, { recursive: true, force: true });
}
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
