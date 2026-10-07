import { chromium, getKey, editKey, tester, BASE } from '../lib.mjs';
// 진료 대기 순서 (10-05 사용자 결정): 시력·검사·진료 모두 같은 기준(예약시간 → 접수시각, 지각은 뒤)
// - 검사가 늦게 끝나 예약 순서로는 진료 대기 1번이 되는 환자 → 2번째 (지금 1번은 그대로)
// - 예약 순서로 2번째 이후면 그 자리 그대로
// - CR·산동 후 다시 진료도 같은 규칙 (예전 '맨 앞' → 예약 순서 자리, 1번이 되면 2번째) — 규칙 하나로
// - [호출 취소]는 되돌리기라 원래 1번 그대로, 시력·검사 순서(queueKey)는 바뀌지 않음
const pt = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const allDone = { visionIop: true, oct: true, wfp: true, vf: true, idra: true, gat: true };
const waitingRec = (p, extra) => ({ ...p, checkin: '08:30', done: { ...p.done, ...allDone }, measureOk: 1, calledRoom: null, seen: false, consultDone: false, procedures: [], ...extra });
const testingRec = (p, extra) => ({ ...p, doctor: '김선웅', checkin: '08:20', assigned: { visionIop: true, wfp: true }, done: { visionIop: true }, measureOk: 1, calledRoom: null, seen: false, ...extra });
// 10-07: '1번 보호'가 '앞 N명 보호'(N = 진료실 앞으로 안내할 인원)로 넓어짐 → 이 시나리오는 N=1(예전 규칙과 같음)로 확인
await editKey('settings', st => ({ ...st, consultFrontCount: 1 }));
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '서준호') return waitingRec(p, { doctor: '김선웅', queueKey: 540 });
  if (p.name === '조현우') return waitingRec(p, { doctor: '김선웅', queueKey: 600 });
  if (p.name === '임수빈') return testingRec(p, { queueKey: 500 }); // 예약이 가장 빠른데 검사가 늦게 끝남
  if (p.name === '장민호') return testingRec(p, { queueKey: 560 }); // 예약 순서로 2번째 이후
  if (p.name === '최민지' || p.name === '원성옥') return { ...p, doctor: '나상훈' }; // 김선웅 명단 정리
  // 이종혁: 오세영 진료 중, 박영수·황도윤 진료 대기
  if (p.name === '박영수') return waitingRec(p, { doctor: '이종혁', queueKey: 570 });
  if (p.name === '황도윤') return waitingRec(p, { doctor: '이종혁', queueKey: 650 });
  return p;
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const modal = () => page.locator('.fixed.inset-0').last();
const waitingOrder = async (names) => {
  const t = await page.locator('body').innerText();
  const ws = t.indexOf('진료 대기 ·');
  return names.map(n => t.indexOf(n, ws)).every((v, i, a) => v > ws && (i === 0 || v > a[i - 1]));
};
const openConsult = async (doc) => { await pick('진료실'); await page.getByRole('button', { name: doc, exact: true }).first().click(); await W(1200); };
await page.goto(`${BASE}/`); await W();

// 1) 31번방에서 임수빈 WFP 완료 → 예약 순서로는 1번이지만 2번째로
await pick('31번방');
await cardOf('임수빈').getByRole('button', { name: /^WFP/ }).first().click(); await W(1200);
await back();
await openConsult('김선웅');
ok(await waitingOrder(['서준호', '임수빈', '조현우']), '늦게 끝난 임수빈(예약 가장 빠름) → 2번째, 서준호는 1번 그대로');
// 2) 장민호(예약 순서로 2번째 이후) → 그 자리 그대로
await back();
await pick('31번방');
await cardOf('장민호').getByRole('button', { name: /^WFP/ }).first().click(); await W(1200);
await back();
await openConsult('김선웅');
ok(await waitingOrder(['서준호', '임수빈', '장민호', '조현우']), '장민호는 예약 순서 자리 그대로');
const s = await pt('서준호'); const i = await pt('임수빈');
ok(s.queueKey === 540 && i.queueKey === 500, '시력·검사 순서 번호(queueKey)는 그대로');
// 3) [호출 취소]는 되돌리기: 서준호 진료 호출 → 호출 취소 → 다시 1번
await cardOf('서준호').getByRole('button', { name: '진료 호출', exact: true }).click(); await W(1200);
await page.getByRole('button', { name: '호출 취소', exact: true }).click(); await W(1200);
ok(await waitingOrder(['서준호', '임수빈', '장민호', '조현우']), '호출 취소 → 서준호 다시 1번');
// 4) 진료 대기에서 위·아래로 옮기기는 진료 순서만 (검사 순서 번호 그대로)
await cardOf('조현우').getByRole('button', { name: '위로' }).click(); await W(1200);
ok(await waitingOrder(['서준호', '임수빈', '조현우', '장민호']), '진료 대기에서 위로 옮김');
ok((await pt('조현우')).queueKey === 600, '옮겨도 queueKey 그대로 (진료 순서 칸만)');
// 4-1) 진료 대기에서 [보내기 → 처치실] 뒤 [되돌리기] → 원래 1번 그대로 (되돌리기는 새로 들어온 환자가 아님)
await cardOf('서준호').getByRole('button', { name: '보내기', exact: true }).click(); await W(300);
await modal().getByRole('button', { name: '보내기', exact: true }).click(); await W(1200);
await page.getByRole('button', { name: '되돌리기' }).first().click(); await W(1500);
ok(await waitingOrder(['서준호', '임수빈', '조현우', '장민호']), '보내기 되돌리기 → 서준호 다시 1번');
await back();

// 5) CR·산동 후 다시 진료도 같은 규칙: 오세영(예약 순서로 뒤쪽) → 점안 끝나면 예약 순서 자리 (이종혁: 박영수, 황도윤 대기 / 오세영 진료 중)
await openConsult('이종혁');
await page.getByRole('button', { name: '처치', exact: true }).click(); await W(300);
await modal().locator('label').filter({ hasText: '산동 후 다시 진료' }).locator('input').check();
await modal().getByRole('button', { name: '처치 지정', exact: true }).click(); await W(1200);
await cardOf('오세영').getByRole('button', { name: '점안', exact: true }).click(); await W(800);
await cardOf('오세영').getByRole('button', { name: /^점안 \d\d:\d\d$/ }).click(); await W(200);
await cardOf('오세영').getByRole('button', { name: '지금 완료' }).click(); await W(1500);
const o = await pt('오세영');
ok(o.queueKey > 650 && await waitingOrder(['박영수', '황도윤', '오세영']), `산동 후 다시 진료 → 예약 순서 자리 그대로 (앞으로 당기지 않음, ${o.queueKey})`);
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
