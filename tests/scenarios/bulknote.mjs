import { execSync } from 'child_process';
import { chromium, SP, DATA, BASE, FIXTURES } from '../lib.mjs';
const api = `${BASE}/api/storage/`;
// 접수 전 환자 추가: 오후 예약 여러 명 (나상훈 2명, 김선웅 1명)
{ const c = await (await fetch(api + 'daily-patients')).json(); const list = JSON.parse(c.value); const d = list[0].date;
  const mk = (id, name, doctor, reservation) => ({ id, name, date: d, doctor, reservation, checkin: '', assigned: { visionIop: true }, done: {}, doneAt: {}, drops: [], procedures: [], queueKey: 0 });
  list.push(mk('70000001', '가오후', '나상훈', '13:00'), mk('70000002', '나오후', '나상훈', '14:00'), mk('70000003', '다오후', '김선웅', '15:00'));
  await fetch(api + 'daily-patients', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: JSON.stringify(list), version: c.version }) }); }
const getList = async () => JSON.parse((await (await fetch(api + 'daily-patients')).json()).value);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) process.exitCode = 1; };
const W = (ms = 600) => page.waitForTimeout(ms);
const cardOf = (name) => page.locator('div.bg-white').filter({ has: page.getByText(name, { exact: true }) }).last();
await page.goto(`${BASE}/`); await W();
await page.getByRole('button', { name: /^관리자/ }).first().click(); await W();
await page.getByRole('button', { name: '명단 관리', exact: true }).click(); await W();
// 오후만 → 일괄 적용
await page.getByRole('button', { name: '오후', exact: true }).click(); await W(300);
await page.getByRole('button', { name: '접수 안내 일괄 적용' }).click(); await W(300);
ok(await page.getByText(/접수 전 환자 3명에게 적용/).count() === 1, '오후 접수 전 3명 대상');
await page.getByLabel('일괄 접수 안내 문구').fill('바로 29번방으로 오세요');
await page.getByRole('button', { name: '3명에 적용' }).click(); await W();
let list = await getList();
ok(['가오후', '나오후', '다오후'].every(n => list.find(p => p.name === n).kioskNote === '바로 29번방으로 오세요'), '오후 3명 적용');
ok(!list.some(p => p.name === '원성옥' && p.kioskNote), '오전 환자는 그대로');
await page.screenshot({ path: `${SP}/r14-bulk.png`, fullPage: true });
// 한 명만 지우기
await cardOf('나오후').getByRole('button', { name: '나오후 접수 안내 지우기' }).click(); await W();
list = await getList();
ok(!list.find(p => p.name === '나오후').kioskNote && list.find(p => p.name === '가오후').kioskNote, '한 명만 × 로 지움');
// 교수 필터 + 시력 건너뛰기
await page.getByRole('button', { name: '전체', exact: true }).click(); await W(300);
await page.locator('select').filter({ hasText: '전체 교수' }).selectOption('나상훈'); await W(300);
await page.getByRole('button', { name: '접수 안내 일괄 적용' }).click(); await W(300);
await page.getByLabel('일괄 접수 안내 문구').fill('바로 5번 진료실 앞으로 오세요');
await page.getByLabel('시력검사 없이 바로 진료').check();
await page.getByRole('button', { name: /명에 적용$/ }).click(); await W();
list = await getList();
const nas = list.filter(p => p.doctor === '나상훈' && !p.checkin && !p.consultDone);
ok(nas.length > 0 && nas.every(p => p.kioskNote === '바로 5번 진료실 앞으로 오세요' && p.skipVision), '교수별 일괄 + 시력 건너뛰기');
ok(list.filter(p => p.doctor === '나상훈' && p.checkin).every(p => !p.kioskNote), '이미 접수한 환자는 제외');
// 되돌리기
await page.getByRole('button', { name: '되돌리기' }).first().click(); await W();
list = await getList();
ok(list.find(p => p.name === '가오후').kioskNote === '바로 29번방으로 오세요' && !list.find(p => p.name === '가오후').skipVision, '일괄 적용 되돌리기');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
