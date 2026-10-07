import { chromium, SP, getKey, editKey, tester, BASE, DATA, FIXTURES , measureVision, dischargeVia } from '../lib.mjs';
const list0 = (await getKey('daily-patients')).value;
const today = list0[0].date;
const nextWeek = new Date(new Date(today).getTime() + 7 * 86400000).toISOString().slice(0, 10);
const choi = list0.find(p => p.name === '최민지');
// 다음 주 환자(차트리뷰 대상) 추가 + 기록: 오늘 환자·다음 주 환자·명단에 없는 옛 환자
await editKey('daily-patients', list => [...list,
  { id: '7000001', name: '미래환자', date: nextWeek, doctor: '김선웅', reservation: '09:00', checkin: '', assigned: { visionIop: true }, done: {}, doneAt: {}, drops: [], procedures: [], queueKey: 540 },
  { id: '7000002', name: '차트리뷰', date: nextWeek, doctor: '김선웅', reservation: '09:15', checkin: '', assigned: { visionIop: true }, done: {}, doneAt: {}, drops: [], procedures: [], queueKey: 555 }]);
await editKey('measure-history', () => ({
  [choi.id]: [{ date: '2026-03-02', ucva: { od: '0.3', os: '0.4' }, nct: { od: '18', os: '19' } }],
  '7000001': [{ date: '2026-01-10', ucva: { od: '0.9', os: '1.0' } }],
  '9999999': [{ date: '2025-01-01', ucva: { od: '0.1', os: '0.1' } }],
}));
await editKey('fu-designations', fu => ({ ...(fu || {}), '7000001': { oct: true, doctor: '김선웅', byDoctor: { '김선웅': { oct: true, doctor: '김선웅' } } } }));
const r = await fetch(`${BASE}/api/storage-subset/measure-history`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [choi.id, '7000001'] }) });
const sub = JSON.parse((await r.json()).value);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
ok(Object.keys(sub).length === 2 && !sub['9999999'], '서버 부분 조회: 명단 환자 것만');
let net = 0; page.on('response', async res => { if (res.url().includes('storage-subset/measure-history') && res.status() === 200) net++; if (res.url().endsWith('/api/storage/measure-history')) console.log('     전체 받기 발생', res.status()); });
await page.goto(`${BASE}/`); await W(1200);
await pick('시력');
ok(/R\s*0\.3\s*L\s*0\.4/.test(await cardOf('최민지').locator('[data-prev-vision]').innerText()), '오늘 환자 이전 시력 보임 (크게)');
await back();
// 다음 주 차트리뷰: 관리자 명단 관리에서 날짜 변경
await pick('관리자'); await page.getByRole('button', { name: '명단 관리', exact: true }).click(); await W(400);
await page.locator('input[type=date]').first().fill(nextWeek); await W(800);
const fc = page.locator('div.bg-white.rounded-xl').filter({ has: page.getByText('미래환자', { exact: true }) }).first();
ok(await fc.getByText('0.9 / 1.0').count() === 1, '다음 주 환자: 지난번 시력 보임');
ok(await fc.getByRole('button', { name: /OCT/ }).count() >= 1, '다음 주 환자: 예정 검사(FU) 보임');
// 프로그램 사용 전 데이터 직접 입력
const cc = page.locator('div.bg-white.rounded-xl').filter({ has: page.getByText('차트리뷰', { exact: true }) }).first();
await cc.getByRole('button', { name: '이전 시력 입력' }).click(); await W(300);
const m = page.locator('.fixed.inset-0').last();
await m.locator('input[type=date]').fill('2025-12-01').catch(() => {});
await m.locator('input').nth(1).fill('0.6');
await m.getByRole('button', { name: '저장', exact: true }).click(); await W(1000);
ok(await cc.getByText(/0\.6/).count() >= 1, '차트리뷰 중 이전 시력 직접 입력 → 보임');
await back();
// 오늘 측정 저장 → 귀가하면(10-07: 귀가한 날의 값만) 전체 기록에 합쳐지고 옛 환자 기록 보존
await pick('시력');
await measureVision(page, cardOf('최민지'), '0.5');
await W(1500);
await dischargeVia(page, '최민지');
const full = (await getKey('measure-history')).value;
ok(full['9999999'] && full[choi.id].some(x => x.date === today) && full['7000001'], '저장 후에도 옛 환자 기록 그대로 + 오늘 기록 추가');
await W(5000);
ok(net >= 1, `4초 확인은 부분 조회로 (${net}회)`);
await page.screenshot({ path: `${SP}/r30-admin-next.png` });
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
