import { chromium, getKey, editKey, tester, BASE } from '../lib.mjs';
// 산동 확인 (10-03 사용자 결정)
// - 점안 뒤 시간 전이면 작은 [산동 확인 · 완료] / [CR 확인 · 완료] → 바로 완료 (모든 화면)
// - 진료실 'CR·산동 점안' 칸(CR, 산동 후 다시 진료)은 시간이 지나도 저절로 진료 대기로 가지 않음:
//   노란 [N분 지남 · CR 확인]을 눌러야 진료 대기로. 확인으로 완료된 버튼은 두 번 누르면 확인만 취소
const min = 60000;
const now = Date.now();
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '한지훈') return { ...p, cr: true, done: { ...p.done, oct: true, wfp: true }, drops: [now - 26 * min, now - 25 * min, now - 21 * min, now - 20 * min] }; // CR 시간 지남
  if (p.name === '권나은') return { ...p, cr: true, drops: [now - 6 * min, now - 5 * min, now - 4 * min, now - 3 * min] }; // CR 아직 시간 전
  if (p.name === '최민지') return { ...p, dilateOverride: true, drops: [now - 2 * min] }; // 일반 산동 (시력방)
  if (p.name === '서준호') return { ...p, dilateOverride: true, redo: { kind: 'dilate', at: now - 30 * min, from: 'consult', pending: [] }, drops: [now - 18 * min] }; // 산동 후 다시 진료, 시간 지남
  return p;
}));
const rec = async (name) => (await getKey('daily-patients')).value.find(p => p.name === name);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, cardOf } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('진료실');
await page.getByRole('button', { name: '나상훈', exact: true }).first().click(); await W(800);

// 1) CR 시간 지남: 진료 대기로 가지 않고 노란 확인 버튼
const due = cardOf('한지훈').getByRole('button', { name: /분 지남 · CR 확인$/ });
ok(await due.count() === 1, 'CR 시간 지남 → 노란 [N분 지남 · CR 확인]');
ok(await cardOf('한지훈').getByRole('button', { name: '진료 호출' }).count() === 0, '확인 전에는 진료 대기에 없음');
await due.click(); await W(1200);
ok(!!(await rec('한지훈')).dilateOkAt, 'CR 확인 기록');
ok(await cardOf('한지훈').getByRole('button', { name: '진료 호출' }).count() === 1, '확인하면 진료 대기로');

// 2) CR 시간 전: 작은 [CR 확인 · 완료]로 일찍 완료
const early = cardOf('권나은').getByRole('button', { name: 'CR 확인 · 완료' });
ok(await early.count() === 1, 'CR 시간 전 → [CR 확인 · 완료]');
await early.click(); await W(1200);
ok(await cardOf('권나은').getByRole('button', { name: '진료 호출' }).count() === 1, '일찍 완료 → 진료 대기로');

// 3) 확인 취소: 초록 완료 버튼을 두 번 → 확인만 취소 (점안 기록은 그대로), 다시 점안 칸
const green = cardOf('권나은').getByRole('button', { name: /완료$/ }).first();
await green.click(); await W(200);
ok(await cardOf('권나은').getByRole('button', { name: '누르면 확인 취소' }).count() === 1, '한 번 누르면 "누르면 확인 취소"');
await cardOf('권나은').getByRole('button', { name: '누르면 확인 취소' }).click(); await W(1200);
const k = await rec('권나은');
ok(!k.dilateOkAt && (k.drops || []).filter(Boolean).length === 4, '확인만 취소, 점안 4회 그대로');
ok(await cardOf('권나은').getByRole('button', { name: 'CR 확인 · 완료' }).count() === 1, '다시 점안 칸 (확인 버튼)');

// 4) 산동 후 다시 진료: 시간이 지나도 확인해야 진료 대기로
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(800);
const redo = cardOf('서준호').getByRole('button', { name: /분 지남 · 산동 확인$/ });
ok(await redo.count() === 1, '산동 후 다시 진료 → 노란 [N분 지남 · 산동 확인]');
await redo.click(); await W(1200);
ok(await cardOf('서준호').getByRole('button', { name: '진료 호출' }).count() === 1, '확인하면 진료 대기로');

// 5) 일반 산동(시력방): 시간 전 [산동 확인 · 완료] → 초록 '산동 완료'
await page.getByRole('button', { name: '메인 화면' }).click(); await W(300);
await pick('시력');
const gen = cardOf('최민지').getByRole('button', { name: '산동 확인 · 완료' });
ok(await gen.count() === 1, '일반 산동 시간 전 → [산동 확인 · 완료]');
await gen.click(); await W(1200);
ok(await cardOf('최민지').getByRole('button', { name: /^산동 완료/ }).count() === 1, '일반 산동 → 바로 산동 완료');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
