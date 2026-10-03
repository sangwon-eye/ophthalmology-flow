import { chromium, getKey, editKey, tester, BASE } from '../lib.mjs';
// 동시 사용 (10-03, 처치실): 화면의 새로 받기를 멈춰 '다른 PC가 방금 바꾼 것을 아직 못 본' 상황에서
// 1) [처치 완료]: 그사이 다른 PC가 새 처치를 보냄 → 화면에 보이던 처치만 완료, 새 처치는 남김 + 안내
// 2) 진료실 [교수님 처치 완료]도 같음
// 3) 방금 완료한 환자 [처치 완료 취소]: 가장 최근에 함께 완료한 처치만 되돌림, 이미 귀가한 환자는 그대로 + 안내
// 4) 검사 준비(FAG skin test): 다른 PC가 확인한 뒤 늦게 누른 [시작 취소]는 확인을 지우지 않음
// 5) 검사 준비: 다른 PC가 먼저 시작 → 늦게 누른 [시작]은 처음 시작 시각 그대로
// 6) 진료실 요청: 다른 PC가 먼저 처리 → 늦게 누른 [확인 완료]는 다시 적용하지 않고 안내
const pt = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const now = Date.now();
const proc = (uid, performer, name, extra = {}) => ({ uid, procId: performer === 'prof' ? 'p1' : 'p2', name, performer, note: '', done: false, doneAt: null, orderedAt: 1, ...extra });
await editKey('settings', s => ({ ...s, tests: s.tests.map(t => (t.id === 'fag' ? { ...t, prepOn: true, prepName: '동의서 · skin test', prepWaitMin: 20 } : t)) }));
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '황도윤') return { ...p, procedures: [proc('x14', 'resident', '전공의 처치')] };
  if (p.name === '송하린') return { ...p, procedures: [proc('q1', 'prof', '교수 처치')] };
  if (p.name === '장민호') return { ...p, seen: true, seenAt: now, calledRoom: null, done: { ...p.done, oct: true, wfp: true, gat: true },
    procedures: [proc('r1', 'resident', '전공의 처치', { done: true, doneAt: now - 600000 }), proc('r2', 'resident', '봉합사 제거', { done: true, doneAt: now - 60000 })] };
  if (p.name === '권나은') return { ...p, seen: true, seenAt: now - 120000, consultDone: true, consultDoneAt: now - 10000, procedures: [proc('c1', 'resident', '전공의 처치', { done: true, doneAt: now - 30000 })] };
  if (p.name === '조현우') return { ...p, assigned: { ...p.assigned, fag: true }, prep: { fag: { startedAt: now - 5 * 60000, name: 'FAG' } } };
  if (p.name === '한지훈') return { ...p, assigned: { ...p.assigned, fag: true }, prep: {} };
  if (p.name === '정대현') return { ...p, checkin: '08:54', done: { visionIop: true }, measureOk: 1, treatRequest: { at: now - 1000, from: '나상훈' }, consultHold: true, calledRoom: null };
  return p;
}));
const browser = await chromium.launch();
const open = async (role, { stale = true, doctor } = {}) => {
  const p = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const t = tester(p);
  if (stale) { await p.route('**/api/events', r => r.abort()); await p.clock.install(); }
  await p.goto(`${BASE}/`); await t.W(1200);
  await t.pick(role);
  if (doctor) { await p.getByRole('button', { name: doctor, exact: true }).first().click(); await t.W(600); }
  if (stale) await p.clock.pauseAt(Date.now() + 1000);
  return { p, t };
};
const tr = await open('처치실');
const cs = await open('진료실', { doctor: '김선웅' });

// 1) 처치실 [처치 완료] ← 새 처치
await editKey('daily-patients', l => l.map(p => (p.name === '황도윤' ? { ...p, procedures: [...p.procedures, proc('n1', 'resident', '봉합사 제거', { orderedAt: Date.now() })] } : p)));
await tr.t.cardOf('황도윤').getByRole('button', { name: '처치 완료', exact: true }).click(); await tr.t.W(1500);
let r = await pt('황도윤');
tr.t.ok(r.procedures.find(i => i.uid === 'x14').done === true && r.procedures.find(i => i.uid === 'n1').done === false, '화면에 보이던 처치만 완료, 새로 들어온 처치는 남음');
tr.t.ok(await tr.p.getByText(/새로 들어온 처치가 남아 있습니다: 봉합사 제거/).count() === 1, '새 처치가 남아 있다는 안내');

// 2) 진료실 [교수님 처치 완료] ← 새 교수님 처치
await editKey('daily-patients', l => l.map(p => (p.name === '송하린' ? { ...p, procedures: [...p.procedures, proc('q2', 'prof', '봉합사 제거', { orderedAt: Date.now() })] } : p)));
await cs.t.cardOf('송하린').getByRole('button', { name: '교수님 처치 완료', exact: true }).click(); await cs.t.W(1500);
r = await pt('송하린');
cs.t.ok(r.procedures.find(i => i.uid === 'q1').done === true && r.procedures.find(i => i.uid === 'q2').done === false, '교수님 처치도 화면에 보이던 것만 완료');
cs.t.ok(await cs.p.getByText(/새로 들어온 교수님 처치가 남아 있습니다/).count() === 1, '교수님 처치 안내');

// 4) 검사 준비 [시작 취소] ← 다른 PC가 이미 확인
const fagStart = (await pt('조현우')).prep.fag.startedAt;
await editKey('daily-patients', l => l.map(p => (p.name === '조현우' ? { ...p, prep: { fag: { ...p.prep.fag, result: 'neg', at: Date.now() } } } : p)));
await tr.t.cardOf('조현우').getByRole('button', { name: /^동의서 · skin test \d/ }).click(); await tr.t.W(1500);
r = await pt('조현우');
tr.t.ok(r.prep?.fag?.result === 'neg' && r.prep.fag.startedAt === fagStart, '늦게 누른 시작 취소는 다른 PC의 확인을 지우지 않음');
tr.t.ok(await tr.p.getByText(/조현우 환자는 이미 다른 곳에서 처리되었습니다/).count() === 1, '시작 취소 안 됨 안내 ("시작 취소"라고 잘못 알리지 않음)');

// 5) 검사 준비 [시작] ← 다른 PC가 먼저 시작
const firstStart = Date.now() - 90000;
await editKey('daily-patients', l => l.map(p => (p.name === '한지훈' ? { ...p, prep: { fag: { startedAt: firstStart, name: 'FAG' } } } : p)));
await tr.t.cardOf('한지훈').getByRole('button', { name: '동의서 · skin test', exact: true }).click(); await tr.t.W(1500);
tr.t.ok((await pt('한지훈')).prep?.fag?.startedAt === firstStart, '먼저 시작한 시각 그대로 (늦게 누른 시작은 다시 적용 안 함)');
tr.t.ok(await tr.p.getByText(/한지훈 환자는 이미 다른 곳에서 처리되었습니다/).count() === 1, '시작 안 됨 안내');

// 6) 진료실 요청 ← 다른 PC가 먼저 처리 (WFP 추가)
await editKey('daily-patients', l => l.map(p => (p.name === '정대현' ? { ...p, treatRequest: null, assigned: { ...p.assigned, wfp: true }, done: { ...p.done, wfp: false } } : p)));
await tr.t.cardOf('정대현').getByRole('button', { name: '확인 완료 · 진료 대기로', exact: true }).click(); await tr.t.W(1500);
r = await pt('정대현');
tr.t.ok(!r.treatHandledAt && r.assigned.wfp === true && r.done.wfp === false, '늦게 누른 요청 처리는 다시 적용하지 않음 (먼저 처리한 내용 그대로)');
tr.t.ok(await tr.p.getByText(/진료실 요청은 이미 다른 곳에서 처리되었습니다/).count() === 1, '요청 처리 안내');

// 3) 방금 완료한 환자 [처치 완료 취소] (최신 화면)
const fresh = await open('처치실', { stale: false });
await fresh.p.getByRole('button', { name: /방금 완료한 환자/ }).click(); await fresh.t.W(300);
const row = (name) => fresh.p.locator('div').filter({ has: fresh.p.getByText(name, { exact: true }) }).filter({ has: fresh.p.getByRole('button', { name: /처치 완료 취소/ }) }).last();
await row('장민호').getByRole('button', { name: /처치 완료 취소/ }).click(); await fresh.t.W(1500);
r = await pt('장민호');
fresh.t.ok(r.procedures.find(i => i.uid === 'r2').done === false && r.procedures.find(i => i.uid === 'r1').done === true, '가장 최근에 완료한 처치만 되돌림 (예전에 끝낸 처치는 그대로)');
await row('권나은').getByRole('button', { name: /처치 완료 취소/ }).click(); await fresh.t.W(1500);
r = await pt('권나은');
fresh.t.ok(r.procedures[0].done === true && r.consultDone === true, '이미 귀가한 환자는 되돌리지 않음');
fresh.t.ok(await fresh.p.getByText(/권나은 환자는 이미 귀가 처리되었습니다/).count() === 1, '귀가 환자 안내');

// 평소: 남은 새 처치 완료 → 그 처치만 완료되고 설명 대기로
await fresh.p.locator('#treat-procs div.bg-white').filter({ has: fresh.p.getByText('황도윤', { exact: true }) }).last().getByRole('button', { name: '처치 완료', exact: true }).click(); await fresh.t.W(1500);
r = await pt('황도윤');
fresh.t.ok(r.procedures.every(i => i.done), '평소 [처치 완료] 정상');
for (const x of [tr, cs, fresh]) x.t.ok(x.t.errors.length === 0, `페이지 오류 없음 ${x.t.errors.join(' / ')}`);
await browser.close();
