import { chromium, getKey, editKey, tester, BASE } from '../lib.mjs';
// 동시 사용 (10-03, 진료실 남은 버튼): 화면의 새로 받기를 멈춰 '다른 PC가 방금 바꾼 것을 아직 못 본' 상황에서
// 1) [처치 보내기]: 다른 PC가 이미 설명 완료(귀가) → 처치를 넣지 않고 안내 (넣으면 처치실·설명 대기 어디에도 안 보여 빠짐)
// 2) [귀가]: 다른 PC가 처치를 새로 보냄 → 귀가 처리하지 않고 안내 (처치가 빠지지 않게)
// 3) [진료 완료] 두 PC가 거의 동시에 → 먼저 한 진료 완료 그대로, 늦게 누른 쪽 되돌리기는 먼저 한 것을 되돌리지 않음
// 4) 설명 완료(처치 중) 되돌리기: 그사이 다른 PC가 귀가까지 처리 → 되돌리지 않고 FU 나중에 표시도 그대로
// 5) 평소(최신 화면) [처치 보내기]·[귀가]·되돌리기는 그대로 동작
// 6) [다시 진료 취소]: 다른 PC가 먼저 취소 → 다시 적용하지 않고 안내
const pt = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const now = Date.now();
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '송하린') return { ...p, seen: true, seenAt: now, procedures: [], consultDone: false };
  if (p.name === '임수빈') return { ...p, done: { ...p.done, oct: true, wfp: true, idra: true }, measureOk: 1, seen: true, seenAt: now, calledRoom: null, procedures: [] };
  if (p.name === '서준호') return { ...p, seen: true, seenAt: now, calledRoom: null, explainedEarly: now - 60000,
    procedures: [{ uid: 'd1', procId: 'p2', name: '전공의 처치', performer: 'resident', note: '', done: true, doneAt: now - 30000, orderedAt: 1 }] };
  if (p.name === '원성옥') return { ...p, checkin: '08:10', done: { visionIop: true }, measureOk: 1, seen: true, seenAt: now, calledRoom: null,
    procedures: [{ uid: 'e1', procId: 'p2', name: '전공의 처치', performer: 'resident', note: '', done: false, doneAt: null, orderedAt: 1 }] };
  if (p.name === '조현우') return { ...p, done: { visionIop: true, oct: true, wfp: true }, measureOk: 1, calledRoom: '김선웅', seen: false, consultDone: false };
  if (p.name === '최민지') return { ...p, done: { visionIop: true }, measureOk: 1, seen: false, calledRoom: null, dilateOverride: true, drops: [],
    redo: { kind: 'dilate', at: now - 1000, from: '김선웅', pending: [], prev: { seen: false, seenAt: null, explainedEarly: false, cr: false, dilateOverride: null, drops: [], dropsExtra: [], dropsBefore: [] } } };
  return p.doctor === '김선웅' ? { ...p, calledRoom: null } : p;
}));
const browser = await chromium.launch();
const open = async ({ stale = true } = {}) => {
  const p = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const t = tester(p);
  if (stale) { await p.route('**/api/events', r => r.abort()); await p.clock.install(); }
  await p.goto(`${BASE}/`); await t.W(1200);
  await t.pick('진료실');
  await p.getByRole('button', { name: '김선웅', exact: true }).first().click(); await t.W(600);
  if (stale) await p.clock.pauseAt(Date.now() + 1000);
  return { p, t, modal: () => p.locator('.fixed.inset-0').last() };
};
const sendProc = async (x, name) => {
  await x.t.cardOf(name).getByRole('button', { name: '처치 보내기', exact: true }).click(); await x.t.W(300);
  await x.modal().getByPlaceholder(/봉합사 제거/).fill('봉합사 제거');
  await x.modal().getByRole('button', { name: '처치 지정', exact: true }).click(); await x.t.W(1500);
};
const s = await open(); const a = await open(); const b = await open();

// 1) 처치 보내기 ← 다른 PC가 먼저 설명 완료
await editKey('daily-patients', l => l.map(p => (p.name === '송하린' ? { ...p, consultDone: true, consultDoneAt: Date.now() } : p)));
await sendProc(s, '송하린');
let r = await pt('송하린');
s.t.ok(!(r.procedures || []).some(i => i.name === '봉합사 제거') && r.consultDone === true, '귀가 처리된 환자에게는 처치를 넣지 않음');
s.t.ok(await s.p.getByText(/처치 지정 안 됨 · 송하린 환자는 이미 설명 완료/).count() === 1, '처치 지정 안 됨 안내');

// 2) 귀가 ← 다른 PC가 처치를 새로 보냄
await editKey('daily-patients', l => l.map(p => (p.name === '서준호' ? { ...p, procedures: [...p.procedures, { uid: 'd2', procId: 'p2', name: '전공의 처치', performer: 'resident', note: '', done: false, doneAt: null, orderedAt: Date.now() }] } : p)));
await s.t.cardOf('서준호').getByRole('button', { name: '귀가', exact: true }).click(); await s.t.W(1500);
r = await pt('서준호');
s.t.ok(!r.consultDone && r.procedures.some(i => i.uid === 'd2' && !i.done), '새 처치가 남아 있으면 귀가 처리하지 않음');
s.t.ok(await s.p.getByText(/귀가 처리 안 됨 · 서준호 환자는 처치가 새로 들어와 있습니다/).count() === 1, '귀가 처리 안 됨 안내');

// 4) 설명 완료(처치 중) → 다른 PC가 처치 완료·귀가 → 늦은 되돌리기
await s.t.cardOf('원성옥').getByRole('button', { name: '설명 완료 · FU 나중에', exact: true }).click(); await s.t.W(1500);
r = await pt('원성옥');
s.t.ok(!!r.explainedEarly && !r.consultDone, '처치 중 설명 완료 → 처치 후 귀가');
const won = r.id;
const laterDocs = async () => Object.values((await getKey('fu-designations')).value?.[won]?.fuLaterBy || {}).map(e => e.doctor).join(',');
s.t.ok(await laterDocs() === '김선웅', 'FU 나중에 표시 저장');
await editKey('daily-patients', l => l.map(p => (p.name === '원성옥' ? { ...p, procedures: p.procedures.map(i => ({ ...i, done: true, doneAt: Date.now() })), consultDone: true, consultDoneAt: Date.now() } : p)));
await s.p.getByRole('button', { name: /되돌리기/ }).click(); await s.t.W(1500);
r = await pt('원성옥');
s.t.ok(r.consultDone === true && !!r.explainedEarly, '이미 귀가한 환자는 되돌리지 않음');
s.t.ok(await laterDocs() === '김선웅', '되돌리지 않았으니 FU 나중에 표시도 그대로');

// 6) 다시 진료 취소 ← 다른 PC가 먼저 취소
const otherAt = Date.now() - 500;
await editKey('daily-patients', l => l.map(p => (p.name === '최민지' ? { ...p, redo: { ...p.redo, cancelledAt: otherAt }, dilateOverride: undefined, seen: false, calledRoom: null } : p)));
await s.t.cardOf('최민지').getByRole('button', { name: '다시 진료 취소', exact: true }).click(); await s.t.W(200);
await s.t.cardOf('최민지').getByRole('button', { name: '한 번 더 누르면 다시 진료 취소' }).click(); await s.t.W(1500);
r = await pt('최민지');
s.t.ok(r.redo.cancelledAt === otherAt, '먼저 한 다시 진료 취소 그대로 (다시 적용하지 않음)');
s.t.ok(await s.p.getByText(/다시 진료 취소 안 됨 · 최민지/).count() === 1, '다시 진료 취소 안 됨 안내');

// 3) 진료 완료 두 PC
await a.p.getByRole('button', { name: '진료 완료', exact: true }).click(); await a.t.W(1500);
const first = await pt('조현우');
a.t.ok(first.seen === true && !!first.seenAt, '먼저 누른 진료 완료 저장');
await b.p.getByRole('button', { name: '진료 완료', exact: true }).click(); await b.t.W(1500);
r = await pt('조현우');
b.t.ok(r.seen === true && r.seenAt === first.seenAt, '늦게 누른 진료 완료는 먼저 한 것을 바꾸지 않음 (설명 대기 순서 그대로)');
await b.p.getByRole('button', { name: /되돌리기/ }).click(); await b.t.W(1500);
r = await pt('조현우');
b.t.ok(r.seen === true && r.seenAt === first.seenAt, '늦게 누른 쪽 되돌리기는 먼저 한 진료 완료를 되돌리지 않음');
await a.p.getByRole('button', { name: /되돌리기/ }).click(); await a.t.W(1500);
r = await pt('조현우');
a.t.ok(!r.seen && r.calledRoom === '김선웅', '먼저 누른 쪽 되돌리기는 그대로 동작 (다시 진료 중)');

// 5) 평소 화면
await editKey('daily-patients', l => l.map(p => (p.name === '서준호' ? { ...p, procedures: p.procedures.map(i => ({ ...i, done: true, doneAt: Date.now() })) } : p)));
const n = await open({ stale: false });
await n.t.cardOf('서준호').getByRole('button', { name: '귀가', exact: true }).click(); await n.t.W(1500);
n.t.ok((await pt('서준호')).consultDone === true, '평소 [귀가] 정상');
await n.p.getByRole('button', { name: /되돌리기/ }).click(); await n.t.W(1500);
n.t.ok((await pt('서준호')).consultDone === false, '[귀가] 되돌리기 정상');
await n.t.W(4500);
await sendProc(n, '임수빈');
r = await pt('임수빈');
n.t.ok(r.procedures.some(i => i.name === '봉합사 제거' && i.fromExplain && !i.done) && r.seen === true, '평소 [처치 보내기] 정상');
await n.p.getByRole('button', { name: /되돌리기/ }).click(); await n.t.W(1500);
r = await pt('임수빈');
n.t.ok(!r.procedures.some(i => i.name === '봉합사 제거') && r.seen === true, '[처치 보내기] 되돌리기 정상 (설명 대기에 그대로)');
for (const x of [s, a, b, n]) x.t.ok(x.t.errors.length === 0, `페이지 오류 없음 ${x.t.errors.join(' / ')}`);
await browser.close();
