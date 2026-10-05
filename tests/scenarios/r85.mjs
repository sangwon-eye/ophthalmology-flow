import { chromium, getKey, editKey, tester, BASE } from '../lib.mjs';
// 10-05 사용자 결정
// 1) 진료실 [보내기 → 검사실]로 추가 검사를 보낸 환자: 검사실에서는 앞쪽(2번째쯤)으로 부르지만, 진료 순서는 원래 예약시간 자리 그대로
//    (예: 9시30분 환자가 먼저 진료 → 추가 검사 → 돌아왔을 때 9시 환자가 아직 진료 대기면 9시 환자 뒤로) — 공평하게
//    검사실에서 위·아래로 옮겨도 진료 순서는 그대로
// 2) FU(다음 내원) 지정 창도 오른쪽 클릭으로 단안·프로토콜 칸 (검사실 검사와 같은 방식)
const pt = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const allDone = { visionIop: true, oct: true, wfp: true, vf: true, idra: true, gat: true };
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '서준호') return { ...p, doctor: '김선웅', reservation: '09:00', queueKey: 540, checkin: '08:30', done: { ...p.done, ...allDone }, measureOk: 1, calledRoom: null, seen: false }; // 9시, 진료 대기
  if (p.name === '조현우') return { ...p, doctor: '김선웅', reservation: '09:30', queueKey: 570, checkin: '08:40', done: { ...p.done, ...allDone }, measureOk: 1, calledRoom: '김선웅', seen: false }; // 9시30분, 먼저 진료 중
  if (p.name === '임수빈') return { ...p, queueKey: 500 }; // 검사 대기 (앞쪽 예약)
  if (p.name === '장민호') return { ...p, queueKey: 510 }; // 검사 대기 (앞쪽 예약)
  return p;
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const modal = () => page.locator('.fixed.inset-0').last();
await page.goto(`${BASE}/`); await W();
await pick('진료실');
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(800);
// 진료 중 조현우 → [보내기 → 검사실] WFP
await page.getByRole('button', { name: /^보내기 \(시력/ }).first().click(); await W(300);
await modal().locator('label').filter({ hasText: '검사실' }).locator('input').check();
await modal().getByRole('button', { name: /^WFP/ }).first().click(); // 오늘 이미 했으면 '(오늘 함 · 다시)'가 붙음
await modal().getByRole('button', { name: '보내기', exact: true }).click(); await W(1200);
let j = await pt('조현우');
ok(j.queueKey === 570, `진료 순서 번호는 그대로 (${j.queueKey})`);
ok(j.examBoost && j.examBoost.key < 540 && j.examBoost.tests.includes('wfp'), `검사실 순서만 앞쪽 (${j.examBoost?.key})`);
await back();

// 검사실(31번방): 2번째로 부름 — 임수빈(500) · 조현우 · 장민호(510)
await pick('31번방');
const order = async () => {
  const t = await page.locator('body').innerText();
  return ['임수빈', '조현우', '장민호'].map(n => t.indexOf(n));
};
let [a, b, c] = await order();
ok(a >= 0 && b > a && c > b, `검사실: 임수빈 → 조현우 → 장민호 (${a}, ${b}, ${c})`);
// 검사실에서 아래로 옮기면 검사실 순서만 바뀌고 진료 순서는 그대로
await cardOf('조현우').getByRole('button', { name: '아래로' }).click(); await W(1200);
j = await pt('조현우');
[a, b, c] = await order();
ok(c < b && j.queueKey === 570, `검사실에서 아래로: 장민호 다음, 진료 순서 번호 그대로 (${j.examBoost?.key}, ${j.queueKey})`);
await back();

// 검사를 마치고 돌아옴 → 9시 환자(서준호) 뒤
await editKey('daily-patients', list => list.map(p => (p.name === '조현우' ? { ...p, done: { ...p.done, wfp: true } } : p)));
await pick('진료실');
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(1500);
const t = await page.locator('body').innerText();
const ws = t.indexOf('진료 대기');
ok(ws >= 0 && t.indexOf('서준호', ws) >= 0 && t.indexOf('조현우', ws) > t.indexOf('서준호', ws), '검사 후 돌아오면 원래 예약 자리: 9시 서준호 → 9시30분 조현우');
const s = await pt('서준호'); j = await pt('조현우');
ok(s.queueKey < j.queueKey, '저장된 진료 순서도 9시 → 9시30분');

// 2) FU 창 오른쪽 클릭: 설명 대기 송하린 [설명 완료] → WFP 오른쪽 클릭 → 단안 칸 → 우안
const songId = (await pt('송하린')).id;
await cardOf('송하린').getByRole('button', { name: '설명 완료', exact: true }).click(); await W(400);
const wfpBox = modal().locator('div.rounded-xl').filter({ hasText: /^WFP/ }).first();
ok(await wfpBox.getByRole('button', { name: '우안 (OD)' }).count() === 0, 'FU 창: WFP는 처음엔 단안 칸 없음 (창을 짧게)');
await wfpBox.click({ button: 'right' }); await W(300);
ok(await wfpBox.locator('input[type=checkbox]').isChecked(), 'FU 창: 오른쪽 클릭하면 체크');
const od = wfpBox.getByRole('button', { name: '우안 (OD)' });
ok(await od.count() >= 1, 'FU 창: 오른쪽 클릭하면 단안·프로토콜 칸이 열림');
await od.first().click(); await W(200);
await modal().getByRole('button', { name: '설명 완료', exact: true }).click(); await W(1500);
const fu = (await getKey('fu-designations')).value?.[songId];
const entry = fu?.byDoctor?.김선웅 || fu;
ok(entry?.wfp === true && entry?.detail?.wfp?.eye === 'OD', `FU 저장: WFP 우안 (${JSON.stringify(entry?.detail || {})})`);
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
