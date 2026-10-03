import { chromium, getKey, editKey, tester, BASE } from '../lib.mjs';
// 'FU 나중에' 교수님별 (10-03): 두 교수님이 같은 환자에게 모두 FU 나중에 → 둘 다 남음, 관리자 목록 두 줄,
// 한 교수님만 지정하면 그 교수님 것만 지워짐, 되돌리기는 그 교수님 것만, 예전 형식(fuLater 한 칸)도 그대로 읽음
const day = (n) => { const d = new Date(Date.now() + n * 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const pts0 = (await getKey('daily-patients')).value;
const s = pts0.find(p => p.name === '서준호'); // 김선웅
const id = s.id;
// 같은 날 나상훈 2차 진료(설명 대기)도 있는 상황 대신, 두 교수님 각각 다른 날 진료로 FU 나중에를 만든다
await editKey('daily-patients', list => [
  ...list.map(p => (p.name === '서준호' ? { ...p, seen: true, seenAt: Date.now(), calledRoom: null } : p)),
  // 다음 주 명단: 김선웅·나상훈 각각
  { id, name: '서준호', date: day(7), doctor: '김선웅', reservation: '09:00', checkin: '', assigned: { visionIop: true }, done: {}, doneAt: {}, drops: [], procedures: [], queueKey: 540 },
  { id, name: '서준호', date: day(8), doctor: '나상훈', reservation: '09:00', checkin: '', assigned: { visionIop: true }, done: {}, doneAt: {}, drops: [], procedures: [], queueKey: 540 },
]);
// 나상훈 교수님이 이미 FU 나중에를 눌러 둔 상태 (예전 형식 한 칸으로)
await editKey('fu-designations', fu => ({ ...(fu || {}), [id]: { name: '서준호', fuLater: { doctor: '나상훈', date: day(-3), at: 1 } } }));
const fu = async () => (await getKey('fu-designations')).value[id];
const rec = async (d) => (await getKey('daily-patients')).value.find(p => p.id === id && p.date === d);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const modal = () => page.locator('.fixed.inset-0').last();
await page.goto(`${BASE}/`); await W();
await pick('진료실');
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(600);
// 1) 김선웅도 FU 나중에 → 둘 다 남음
await cardOf('서준호').getByRole('button', { name: '설명 완료', exact: true }).click(); await W(400);
await modal().getByRole('button', { name: '설명 완료 · FU 나중에' }).click(); await W(1500);
let f = await fu();
const docs = (x) => Object.values(x?.fuLaterBy || {}).map(e => e.doctor).sort().join(',');
ok(docs(f) === '김선웅,나상훈', '두 교수님 FU 나중에 표시가 모두 남음');
ok((await rec(day(7))).fuMissing === true && !(await rec(day(8))).fuMissing, '다음 명단 FU 미지정은 그 교수님(김선웅) 기록에만');
// 2) 되돌리기 → 김선웅 것만 지워지고 나상훈 것은 그대로
await page.getByRole('button', { name: /되돌리기/ }).first().click(); await W(1500);
f = await fu();
ok(docs(f) === '나상훈', '되돌리기: 김선웅 표시만 지움, 나상훈은 그대로');
// 다시 FU 나중에
await W(4000);
await cardOf('서준호').getByRole('button', { name: '설명 완료', exact: true }).click(); await W(400);
await modal().getByRole('button', { name: '설명 완료 · FU 나중에' }).click(); await W(1500);
await back();
// 3) 관리자 FU 지정 관리: 두 줄, 나상훈 것만 지정 → 김선웅 것은 남음
await pick('관리자');
await page.getByRole('button', { name: 'FU 지정 관리', exact: true }).click(); await W(1500);
const box = page.locator('div.border-orange-300');
ok(await box.getByText(/FU 나중에 지정할 환자 · 1명/).count() === 1 && await box.getByRole('button', { name: '지정', exact: true }).count() === 2, '관리자 목록: 한 환자에 교수님별 두 줄');
await box.locator('div').filter({ hasText: '나상훈' }).getByRole('button', { name: '지정', exact: true }).last().click(); await W(400);
const more = modal().getByRole('button', { name: /^나머지 검사 보기/ });
if (await more.count()) { await more.click(); await W(200); }
await modal().locator('label').filter({ hasText: 'WFP' }).first().locator('input[type=checkbox]').check();
await modal().getByRole('button', { name: '저장', exact: true }).click(); await W(1500);
f = await fu();
ok(docs(f) === '김선웅' && f.byDoctor?.나상훈?.wfp, '나상훈만 지정 → 나상훈 FU 저장, 김선웅 FU 나중에는 그대로');
ok((await rec(day(8))).assigned.wfp === true && (await rec(day(7))).fuMissing === true, '다음 명단: 나상훈 기록에 FU 적용, 김선웅 기록은 계속 FU 미지정');
ok(await box.getByRole('button', { name: '지정', exact: true }).count() === 1, '관리자 목록: 김선웅 한 줄만 남음');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
