import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 처치마다 따로 완료 (10-10 사용자: 처치 두 개가 한 줄에 묶여 [처치 완료] 하나로 한꺼번에 완료되던 문제, 이름은 모두 가상)
// - 처치실 처치 대기(전공의) · 진료 전 처치 · 진료실 설명 대기 교수님 처치 모두: 처치마다 한 줄, 각자 [처치 완료]
// - 하나를 누르면 그 처치만 시행·완료, 다른 처치는 그대로 남음 ('남은 처치 …' 안내), '검사 · 재진료' 창도 그 처치만
const today = new Date().toLocaleDateString('sv-SE');
const now = Date.now();
const min = (m) => now - m * 60000;
await editKey('settings', s => ({
  ...s,
  procedures: [
    { id: 'yag', name: 'YAG', performer: 'resident', eyeSelect: true },
    { id: 'prp', name: 'PRP', performer: 'resident', eyeSelect: true },
    { id: 'man', name: '만니톨', performer: 'prof', checkMin: 30 },
    { id: 'inj', name: '주사', performer: 'prof', eyeSelect: true },
  ],
}));
const base = (i, name, doctor, extra = {}) => ({
  id: String(6300000 + i * 71), name, date: today, doctor, reservation: `${String(9 + i).padStart(2, '0')}:00`, checkin: '08:40', late: false,
  assigned: { visionIop: true, oct: true }, done: { visionIop: true, oct: true }, doneAt: {}, drops: [], procedures: [], queueKey: 540 + i * 60 + 0.05, measureOk: 1, vaOk: 1, nctOk: 1, ...extra,
});
const pr = (uid, id, name, performer, extra = {}) => ({ uid, procId: id, name, performer, done: false, orderedAt: min(10), ...extra });
const seenX = { seen: true, seenAt: min(10), consultDoneAt: min(10) };
await editKey('daily-patients', () => [
  base(0, '서준호', '김선웅', { ...seenX, procedures: [pr('a1', 'yag', 'YAG', 'resident', { eye: 'OS' }), pr('a2', 'prp', 'PRP', 'resident', { eye: 'OD' })] }),
  base(1, '신종희', '김선웅', { preProcs: [{ uid: 'b1', procId: 'man', name: '만니톨', performer: 'prof', done: false }, { uid: 'b2', procId: 'prp', name: 'PRP', performer: 'resident', eye: 'OD', done: false }] }),
  base(2, '조현우', '김선웅', { ...seenX, procedures: [pr('c1', 'inj', '주사', 'prof', { eye: 'OD' }), pr('c2', 'man', '만니톨', 'prof')] }),
]);
const rec = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const { errors, ok, W, pick, back } = tester(page);
const inSec = (id, n) => page.locator(`#${id} div.bg-white`).filter({ has: page.getByText(n, { exact: true }) }).first();
await page.goto(`${BASE}/`); await W(900);
await pick('처치실'); await W(1500);

// 1) 처치 대기(전공의): YAG · PRP 두 줄, YAG만 완료
let c = inSec('treat-procs', '서준호');
ok(await c.locator('[data-task-line="처치"]').count() === 2 && await c.getByRole('button', { name: '처치 완료', exact: true }).count() === 2, '전공의 처치 두 개 = 두 줄, [처치 완료] 두 개');
await page.screenshot({ path: `${SP}/r109-treat.png`, fullPage: true });
await c.locator('[data-task-line="처치"]').filter({ hasText: 'YAG' }).getByRole('button', { name: '처치 완료', exact: true }).click(); await W(1200);
let r = await rec('서준호');
ok(r.procedures.find(i => i.uid === 'a1').done && !r.procedures.find(i => i.uid === 'a2').done, 'YAG만 완료, PRP는 그대로');
ok(await page.getByText(/남은 처치 PRP · OD/).count() >= 1, "안내: '남은 처치 PRP · OD'");
ok(await inSec('treat-procs', '서준호').locator('[data-task-line="처치"]').count() === 1, '처치 대기에 PRP 한 줄만 남음');

// 2) 진료 전 처치: 만니톨 · PRP 두 줄, 만니톨만 시행 (확인 30분)
c = inSec('treat-preproc', '신종희');
ok(await c.locator('[data-task-line="진료 전 처치"]').count() === 2, '진료 전 처치 두 개 = 두 줄');
await c.locator('[data-task-line="진료 전 처치"]').filter({ hasText: '만니톨' }).getByRole('button', { name: '처치 완료', exact: true }).click(); await W(1200);
r = await rec('신종희');
const b1 = r.preProcs.find(i => i.uid === 'b1');
ok(!!b1.performedAt && b1.checkMin === 30 && !r.preProcs.find(i => i.uid === 'b2').performedAt, '만니톨만 시행(확인 대기), PRP는 그대로');
ok(await inSec('treat-preproc', '신종희').locator('[data-task-line="진료 전 처치"]').count() === 1 && await inSec('treat-check', '신종희').count() === 1, 'PRP는 진료 전 처치에 남고, 만니톨은 결과 확인으로');
await back();

// 3) 진료실 설명 대기 교수님 처치: 주사 · 만니톨 두 줄, '검사 · 재진료' 창은 그 처치만
await pick('진료실'); await W(600);
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(1200);
c = inSec('consult-explain', '조현우');
ok(await c.locator('[data-task-line="교수님"]').count() === 2 && await c.getByRole('button', { name: '처치 완료', exact: true }).count() === 2, '교수님 처치 두 개 = 두 줄, [처치 완료] 두 개');
await c.locator('[data-task-line="교수님"]').filter({ hasText: '주사' }).getByRole('button', { name: '검사 · 재진료' }).click(); await W(400);
const modal = page.locator('.fixed.inset-0').last();
ok(/주사/.test(await modal.innerText()) && !/만니톨/.test(await modal.innerText()), "'검사 · 재진료' 창에는 그 처치(주사)만");
await modal.getByRole('button', { name: '취소', exact: true }).click(); await W(300);
await page.screenshot({ path: `${SP}/r109-explain.png`, fullPage: true });
await c.locator('[data-task-line="교수님"]').filter({ hasText: '주사' }).getByRole('button', { name: '처치 완료', exact: true }).click(); await W(1200);
r = await rec('조현우');
ok(r.procedures.find(i => i.uid === 'c1').done && !r.procedures.find(i => i.uid === 'c2').performedAt, '주사만 완료, 만니톨은 그대로');
ok(await page.getByText(/남은 처치 만니톨/).count() >= 1, "안내: '남은 처치 만니톨'");
// 되돌리기: 방금 완료한 주사만 원래대로
await page.getByRole('button', { name: '되돌리기' }).last().click(); await W(1200);
r = await rec('조현우');
ok(!r.procedures.find(i => i.uid === 'c1').done && !r.procedures.find(i => i.uid === 'c2').performedAt, '되돌리기 → 주사만 원래대로');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
