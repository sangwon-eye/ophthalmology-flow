import { chromium, getKey, editKey, tester, BASE } from '../lib.mjs';
// 10-03 전체 점검에서 찾은 논리 오류
// 1) 진료실·처치실에서 '시력/안압 다시'로 보낸 환자: 시력방 화면이 열려 있어도 다시 재기 전에는 시력 완료로 넘어가지 않음
// 2) 다른 교수님이 FU를 저장해도 이 교수님의 'FU 나중에' 표시는 그대로
const pt = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const browser = await chromium.launch();
const vision = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const tv = tester(vision);
await vision.goto(`${BASE}/`); await tv.W();
await tv.pick('시력');
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, cardOf } = tester(page);
const modal = () => page.locator('.fixed.inset-0').last();
// 서준호(검사 끝, 진료 대기, 측정 완료 상태)
await editKey('daily-patients', list => list.map(p => (p.name === '서준호' ? { ...p, measureOk: Date.now(), vaOk: Date.now(), nctOk: Date.now(), calledRoom: '김선웅' } : p)));
await page.goto(`${BASE}/`); await W();
await pick('진료실');
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(800);
await page.getByRole('button', { name: /^보내기 \(시력/ }).first().click(); await W(300);
await modal().locator('label').filter({ hasText: '시력/안압 다시' }).locator('input').check(); await W(200);
await modal().getByRole('button').last().click(); await W(4000);
let s = await pt('서준호');
ok(!s.done.visionIop && !s.measureOk, '진료실 → 시력/안압 다시: 시력방 화면이 열려 있어도 다시 재기 전에는 완료로 안 넘어감');
ok(await tv.cardOf('서준호').count() === 1, '시력방 대기에 보임');
// 2) FU 나중에(이종혁) 표시가 있는 환자에게 김선웅 FU 저장 → 이종혁 나중에 표시는 그대로
const id = s.id;
await editKey('fu-designations', fu => ({ ...(fu || {}), [id]: { name: '서준호', fuLater: { doctor: '이종혁', date: '2026-09-01', at: 1 } } }));
await editKey('daily-patients', list => list.map(p => (p.name === '서준호' ? { ...p, done: { ...p.done, visionIop: true }, measureOk: Date.now(), calledRoom: null, consultHold: false, seen: true, seenAt: Date.now() } : p)));
await W(4500);
await cardOf('서준호').getByRole('button', { name: '설명 완료', exact: true }).click(); await W(400);
await modal().getByRole('button', { name: '설명 완료', exact: true }).click(); await W(1500);
const f = (await getKey('fu-designations')).value[id];
ok(f?.byDoctor?.김선웅 && f.fuLater?.doctor === '이종혁', '김선웅 FU를 저장해도 이종혁 FU 나중에 표시는 그대로');
// 3) 설정에서 교수님을 지워도 오늘 명단의 그 교수님 환자는 진료실에서 고를 수 있음
await editKey('doctors', d => d.filter(x => x !== '이종혁'));
await W(4500);
await page.getByRole('button', { name: '이종혁', exact: true }).first().click(); await W(500);
ok(await page.getByRole('button', { name: '이종혁', exact: true }).count() >= 1 && /bg-amber-600/.test(await page.getByRole('button', { name: '이종혁', exact: true }).first().getAttribute('class')), '지운 교수님도 오늘 환자가 있으면 진료실에서 고를 수 있음');
ok(errors.length === 0 && tv.errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
