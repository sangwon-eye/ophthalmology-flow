import { chromium, getKey, editKey, tester, BASE } from '../lib.mjs';
// 8) 예약시간이 없는 환자: 접수하면 지각(먼저 접수한 환자 뒤 — 10-08, 예전 맨 뒤), [지각]을 풀면 접수 시각을 예약시간처럼 (맨 앞으로 가지 않음)
// 10) 두 PC가 거의 동시에 누름: 버튼은 화면에 보이던 값대로 (다른 PC가 먼저 바꿔도 뒤집어 되돌리지 않음)
// (7) 메인 화면 날짜 두 번 확인은 r9)
const today = (() => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
const toMin = (t) => { const m = String(t || '').match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
const pt = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
await editKey('daily-patients', list => [...list, { id: '6199999', name: '나예약', date: today, doctor: '김선웅', reservation: '', checkin: '', late: false, assigned: { visionIop: true }, done: {}, doneAt: {}, drops: [], procedures: [], queueKey: 1440, firstVisit: false }]);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, cardOf } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('시력');
await cardOf('나예약').getByRole('button', { name: '접수', exact: true }).click(); await W(1200);
let p = await pt('나예약');
// 10-08: 지각은 맨 뒤 묶음이 아니라 '먼저 접수한 환자' 중 가장 뒤 순서 바로 뒤 (r99)
const earlier = (await getKey('daily-patients')).value.filter(x => x.name !== '나예약' && x.checkin && !x.consultDone && !x.linkWaiting && x.date === p.date && toMin(x.checkin) <= toMin(p.checkin));
const maxEarlier = Math.max(toMin(p.checkin), ...earlier.map(x => x.queueKey));
ok(p.checkin && p.late === true && p.queueKey < 100000 && p.queueKey > maxEarlier, `예약시간 없음 → 접수하면 지각 (먼저 접수한 환자 ${earlier.length}명 뒤)`);
ok(await cardOf('나예약').getByRole('button', { name: '지각', exact: true }).getAttribute('aria-pressed') === 'true', '카드에 지각 표시');
await cardOf('나예약').getByRole('button', { name: '지각', exact: true }).click(); await W(1200);
p = await pt('나예약');
ok(p.late === false && Math.floor(p.queueKey) === toMin(p.checkin), '[지각]을 풀면 접수 시각을 예약시간처럼 (맨 앞으로 가지 않음)');
// 예약시간이 있는 환자는 그대로 (직원 접수는 자동 지각 아님)
await cardOf('신종희').getByRole('button', { name: '접수', exact: true }).click(); await W(1200);
p = await pt('신종희');
ok(p.late === false && Math.floor(p.queueKey) === toMin(p.reservation), '예약시간 있는 환자는 예약시간 순서 (지각 아님)');
ok(errors.length === 0, '페이지 오류 없음');

// 10) 이 PC의 새로 받기를 멈춘 채(알림 끊고 시계 멈춤) 다른 PC가 먼저 바꾼 상황
const pcB = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const tb = tester(pcB);
await pcB.route('**/api/events', r => r.abort());
await pcB.clock.install();
await pcB.goto(`${BASE}/`); await tb.W(1200);
await tb.pick('시력');
await pcB.clock.pauseAt(Date.now() + 1000);
await editKey('daily-patients', list => list.map(x => (x.name === '최민지' ? { ...x, firstVisit: true } : x)));
await tb.W(800);
ok(await tb.cardOf('최민지').getByRole('button', { name: '재진', exact: true }).count() === 1, 'PC B 화면은 아직 재진 (새로 받기 전)');
let v0 = (await getKey('daily-patients')).version;
await tb.cardOf('최민지').getByRole('button', { name: '재진', exact: true }).click(); await tb.W(1000);
let after = await getKey('daily-patients');
ok(after.version > v0 && after.value.find(x => x.name === '최민지').firstVisit === true, '재진을 보고 누름 → 초진으로 저장 (먼저 바꾼 초진을 다시 재진으로 뒤집지 않음)');
await editKey('daily-patients', list => list.map(x => (x.name === '정대현' ? { ...x, late: true } : x)));
await tb.W(500);
v0 = (await getKey('daily-patients')).version;
await tb.cardOf('정대현').getByRole('button', { name: '지각', exact: true }).click(); await tb.W(1000);
after = await getKey('daily-patients');
ok(after.version > v0 && after.value.find(x => x.name === '정대현').late === true, '지각 아님을 보고 누름 → 지각으로 저장 (먼저 켠 지각을 끄지 않음)');
ok(tb.errors.length === 0, 'PC B 페이지 오류 없음');
await browser.close();
