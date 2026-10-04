import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, getKey, editKey, tester, BASE, DATA } from '../lib.mjs';
// 지난 날짜 안전장치 (10-03 전체 점검)
// 1) 명단 업로드·환자 추가는 어제보다 앞 날짜에 올리지 않음 (보관된 진행 기록과 섞이지 않게)
// 2) 서버는 이미 보관된 기록을 덮어쓰지 않음
// 3) 지난 날짜 화면은 보관 파일 + 아직 옮기기 전 실시간 기록을 함께 (자정 직후)
// 4) 보관 명단을 못 불러오면 '환자 없음' 대신 불러오기 실패 안내
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const day = (n) => { const d = new Date(Date.now() + n * 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const old = day(-3);
const archKey = `patients-archive-${old.slice(0, 7)}`;
const rec = (id, name, extra = {}) => ({ id, name, date: old, doctor: '김선웅', reservation: '09:00', checkin: '', assigned: { visionIop: true }, done: {}, procedures: [], drops: [], ...extra });
await editKey(archKey, () => [rec('7100001', '보관된환자', { checkin: '08:40', consultDone: true })]);
// 서버가 다음 정리(10분마다) 전이라 아직 실시간 명단에 남아 있는 지난 날짜 기록
await editKey('daily-patients', list => [...list, rec('7100002', '옮기기전환자', { checkin: '08:45' })]);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('관리자');
// 1) 환자 추가: 지난 날짜면 막음
await page.getByRole('button', { name: '환자 추가', exact: true }).click(); await W(300);
await page.locator('input[type=date]').first().fill(old); await W(200);
await page.getByPlaceholder('환자번호', { exact: true }).fill('7100009');
await page.getByPlaceholder('이름', { exact: true }).fill('지난날추가');
const before = (await getKey('daily-patients')).value.length;
await page.getByRole('button', { name: '명단에 추가', exact: true }).click(); await W(800);
ok((await getKey('daily-patients')).value.length === before && await page.getByText(/어제보다 앞 날짜에는 명단을 올리거나/).count() === 1, '지난 날짜에는 환자 추가 안 됨 (안내)');
ok(await page.locator('input[type=date]').first().getAttribute('min') === day(-1), '날짜 칸은 어제부터');
// 3) 명단 관리: 보관 파일 + 아직 옮기기 전 기록 함께
await page.getByRole('button', { name: '명단 관리', exact: true }).click(); await W(300);
await page.locator('input[type=date]').first().fill(old); await W(1500);
ok(await page.getByText('보관된환자').count() >= 1 && await page.getByText('옮기기전환자').count() >= 1, '지난 날짜: 보관 기록 + 옮기기 전 기록 함께 보임');
await back();
await pick('전체 환자 명단');
await page.locator('input[type=date]').first().fill(old); await W(1500);
ok(await page.getByText('옮기기전환자').count() >= 1, '전체 환자 명단에서도 함께 보임');
await back();
// 4) 보관 명단을 못 불러오면 실패 안내
await page.route(`**/api/storage/${archKey}**`, r => r.fulfill({ status: 500, body: '{}' }));
await page.reload(); await W(1200);
await pick('관리자');
await page.getByRole('button', { name: '명단 관리', exact: true }).click(); await W(300);
// 막은 보관 파일과 같은 달 날짜로 (day(-4)는 월초에 지난달이 되어 다른 파일을 읽음)
await page.locator('input[type=date]').first().fill(old); await W(1500);
ok(await page.getByText(/지난 명단을 불러오지 못했습니다/).count() === 1 && await page.getByText('이 날짜에 올라간 환자가 없습니다').count() === 0, '불러오기 실패 → 환자 없음 대신 실패 안내');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();

// 2) 서버: 실시간 명단에 이미 보관된 기록과 같은 기록(빈 기록)이 있어도 보관 기록을 덮어쓰지 않음
const d = fs.mkdtempSync(path.join(DATA, '..', 'arch-'));
fs.mkdirSync(path.join(d, 'keys'), { recursive: true });
const item = (v) => JSON.stringify({ version: 3, value: JSON.stringify(v) });
fs.writeFileSync(path.join(d, 'keys', `${archKey}.json`), item([rec('7100001', '보관된환자', { checkin: '08:40', consultDone: true })]));
fs.writeFileSync(path.join(d, 'keys', 'daily-patients.json'), item([rec('7100001', '보관된환자'), rec('7100003', '새로옮길환자')]));
const port = 3192;
const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, OPH_DATA_DIR: d, OPH_PORT: String(port) }, stdio: 'ignore' });
let up = false;
for (let i = 0; i < 40 && !up; i++) { await new Promise(r => setTimeout(r, 250)); try { up = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch { /* 켜지는 중 */ } }
try {
  const a = JSON.parse((await (await fetch(`http://127.0.0.1:${port}/api/storage/${archKey}`)).json()).value);
  const kept = a.find(p => p.id === '7100001');
  ok(up && kept?.consultDone === true && kept.checkin === '08:40', '서버: 보관된 진행 기록을 빈 기록으로 덮어쓰지 않음');
  ok(a.some(p => p.id === '7100003'), '서버: 새 지난 기록은 보관 파일로 옮김');
  const live = JSON.parse((await (await fetch(`http://127.0.0.1:${port}/api/storage/daily-patients`)).json()).value);
  ok(!live.some(p => p.date === old), '서버: 실시간 명단에서는 빠짐');
} finally { srv.kill(); await new Promise(r => setTimeout(r, 300)); fs.rmSync(d, { recursive: true, force: true }); }
