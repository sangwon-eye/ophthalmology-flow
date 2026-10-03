import { chromium, getKey, editKey, tester, BASE } from '../lib.mjs';
// 동시 사용 (10-03): 화면의 새로 받기를 잠시 멈춰 '다른 PC가 방금 바꾼 것을 아직 못 본' 상황을 만들어 확인
// 1) 같은 교수님 진료실 두 PC가 거의 동시에 다른 환자를 [진료 호출] → 한 명만 진료 중, 다른 쪽은 안내
// 2) [보내기 → 검사실] 되돌리기: 그사이 다른 PC가 완료한 다른 검사는 그대로
// 3) QR 접수가 먼저 됐는데 시력방 화면이 늦게 [접수] → 처음 접수 시각 그대로
const pt = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const browser = await chromium.launch();
const stale = async () => {
  const p = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const t = tester(p);
  await p.route('**/api/events', r => r.abort());
  await p.clock.install();
  await p.goto(`${BASE}/`); await t.W(1200);
  return { p, t };
};
// 진료 대기 두 명 만들기 (김선웅: 서준호·조현우 검사 끝)
await editKey('daily-patients', list => list.map(p => (['서준호', '조현우'].includes(p.name)
  ? { ...p, doctor: '김선웅', checkin: '08:30', done: { ...p.done, visionIop: true, oct: true, wfp: true, vf: true, idra: true, gat: true }, measureOk: 1, calledRoom: null, seen: false, consultHold: false }
  : (p.doctor === '김선웅' ? { ...p, calledRoom: null } : p))));
const a = await stale(); const b = await stale();
for (const x of [a, b]) {
  await x.t.pick('진료실');
  await x.p.getByRole('button', { name: '김선웅', exact: true }).first().click(); await x.t.W(600);
  await x.p.clock.pauseAt(Date.now() + 1000);
}
await a.t.cardOf('서준호').getByRole('button', { name: '진료 호출', exact: true }).click();
await b.t.cardOf('조현우').getByRole('button', { name: '진료 호출', exact: true }).click();
await a.t.W(1500);
const list = (await getKey('daily-patients')).value.filter(p => p.doctor === '김선웅' && p.calledRoom && !p.seen && !p.consultDone);
a.t.ok(list.length === 1, `진료 중은 한 명만 (${list.map(p => p.name).join(', ')})`);
a.t.ok(await b.p.getByText(/진료 호출 안 됨/).count() + await a.p.getByText(/진료 호출 안 됨/).count() === 1, '늦게 누른 쪽에 "진료 호출 안 됨" 안내');
await a.p.close(); await b.p.close();

// 2) 보내기 되돌리기 범위
const c = await stale();
await c.t.pick('진료실');
await c.p.getByRole('button', { name: '김선웅', exact: true }).first().click(); await c.t.W(800);
const inRoomName = list[0].name;
await editKey('daily-patients', l => l.map(p => (p.name === inRoomName ? { ...p, assigned: { ...p.assigned, fp: true }, done: { ...p.done, fp: false } } : p)));
await c.p.clock.pauseAt(Date.now() + 1500);
await c.p.getByRole('button', { name: /^보내기 \(시력/ }).first().click(); await c.t.W(300);
const modal = c.p.locator('.fixed.inset-0').last();
await modal.locator('label').filter({ hasText: '검사실' }).locator('input').check();
await modal.getByRole('button', { name: 'WFP', exact: true }).click();
await modal.getByRole('button', { name: '보내기', exact: true }).click(); await c.t.W(1200);
// 그사이 다른 검사실 PC가 FP 완료
await editKey('daily-patients', l => l.map(p => (p.name === inRoomName ? { ...p, done: { ...p.done, fp: true }, doneAt: { ...p.doneAt, fp: Date.now() } } : p)));
await c.p.getByRole('button', { name: /되돌리기/ }).click(); await c.t.W(1500);
const x = await pt(inRoomName);
c.t.ok(x.done.wfp === true && x.done.fp === true, '되돌리기: 보낸 검사(WFP)만 원래대로, 다른 PC가 완료한 FP는 그대로');
c.t.ok(c.t.errors.length === 0, '페이지 오류 없음');
await c.p.close();

// 3) QR 접수가 먼저, 시력방 화면은 아직 모름
const d = await stale();
await d.t.pick('시력');
await d.p.clock.pauseAt(Date.now() + 1000);
await editKey('daily-patients', l => l.map(p => (p.name === '원성옥' ? { ...p, checkin: '08:10', late: false, queueKey: 545 } : p)));
await d.t.cardOf('원성옥').getByRole('button', { name: '접수', exact: true }).click(); await d.t.W(1500);
const w = await pt('원성옥');
d.t.ok(w.checkin === '08:10' && w.queueKey === 545, '먼저 된 접수 시각·순서 그대로 (덮어쓰지 않음)');
d.t.ok(d.t.errors.length === 0, '페이지 오류 없음');
await browser.close();
