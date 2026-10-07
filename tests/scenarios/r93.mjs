import { chromium, getKey, editKey, tester, BASE, measureVision } from '../lib.mjs';
// 이전 시력·안압은 귀가(설명 완료)한 날의 값만 (10-07 사용자 결정, 이름은 모두 가상)
// - 시력방에서 재기만 하고 진료를 못 마치면 이전 기록에 안 남음 (예전에는 입력하는 순간 저장)
// - 설명 완료(귀가)하면 그날 값이 남고, 되돌리면 빠지고, 다시 귀가하면 다시 남음
const list0 = (await getKey('daily-patients')).value;
const hwang = list0.find(p => p.name === '황도윤');
const choi = list0.find(p => p.name === '최민지');
const today = hwang.date;
await editKey('measure-history', () => ({ [hwang.id]: [{ date: '2026-01-01', ucva: { od: '0.3', os: '0.3' }, bcva: { od: '', os: '' }, nct: { od: '20', os: '21' }, gat: { od: '', os: '' } }] }));
await editKey('daily-patients', list => list.map(p => (p.name === '황도윤'
  ? { ...p, procedures: [], measure: { ucva: { od: '0.9', os: '0.8' }, nct: { od: '12', os: '13' } } } : p)));
const hist = async (id) => (await getKey('measure-history')).value?.[id] || null;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const inSec = (id, name) => page.locator(`#${id}`).locator('div.bg-white').filter({ has: page.getByText(name, { exact: true }) }).last();
await page.goto(`${BASE}/`); await W();

// 1) 시력방에서 재기만 함 → 이전 기록에 안 남음
await pick('시력');
await measureVision(page, cardOf('최민지'), '0.4'); await W(1200);
const c = (await getKey('daily-patients')).value.find(p => p.name === '최민지');
ok(c.measure?.ucva?.od === '0.4', '시력방 값은 그날 명단 기록에 저장');
ok(!(await hist(choi.id)), '귀가 전에는 이전 시력·안압 기록에 안 남음');
await back();

// 2) 설명 완료(귀가) → 그날 값이 남음 (지난 값 1개와 함께)
await pick('진료실');
await page.getByRole('button', { name: '이종혁', exact: true }).first().click(); await W(1200);
await inSec('consult-explain', '황도윤').getByRole('button', { name: '설명 완료 · FU 나중에' }).click(); await W(1500);
let h = await hist(hwang.id);
ok(h?.length === 2 && h[0].date === today && h[0].ucva.od === '0.9' && h[0].nct.os === '13' && h[1].date === '2026-01-01', `귀가 → 그날 값이 이전 기록에 (${JSON.stringify(h?.map(r => r.date))})`);

// 3) 되돌리기 → 그날 값이 빠짐 (지난 값은 그대로), 다시 귀가 → 다시 남음
await page.getByRole('button', { name: '되돌리기' }).first().click(); await W(1500);
h = await hist(hwang.id);
ok(!(await getKey('daily-patients')).value.find(p => p.name === '황도윤').consultDone, '설명 완료 되돌림');
ok(h?.length === 1 && h[0].date === '2026-01-01', `되돌리면 그날 값은 빠지고 지난 값은 그대로 (${JSON.stringify(h?.map(r => r.date))})`);
await inSec('consult-explain', '황도윤').getByRole('button', { name: '설명 완료 · FU 나중에' }).click(); await W(1500);
h = await hist(hwang.id);
ok(h?.length === 2 && h[0].date === today, '다시 귀가 → 다시 남음');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
