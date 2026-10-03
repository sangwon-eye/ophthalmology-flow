import { chromium, getKey, editKey, tester, BASE, FIXTURES } from '../lib.mjs';
// FU 활성화 확인 (10-03): 오늘 [설명 완료]에서 다음 내원 검사 지정 → 그 뒤에 다음 진료일 명단(엑셀) 업로드
// → 새 명단 기록에 검사가 이미 지정되어 '확인 필요'가 아님. [FU 나중에]로 넘긴 환자는 '확인 필요'(FU 미지정)로 표시
const today = new Date().toLocaleDateString('sv-SE');
const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE');
const base = { date: today, reservation: '08:30', checkin: '08:20', assigned: { visionIop: true }, done: { visionIop: true }, doneAt: {}, measureOk: 1, drops: [], procedures: [], queueKey: 500, seen: true, seenAt: Date.now(), calledRoom: null };
await editKey('daily-patients', list => [...list,
  { ...base, id: '0012345', name: '가나다', doctor: '김선웅' },
  { ...base, id: '0012347', name: '사아자', doctor: '나상훈' }]);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const modal = () => page.locator('.fixed.inset-0').last();
await page.goto(`${BASE}/`); await W();
await pick('진료실');
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(600);
await cardOf('가나다').getByRole('button', { name: '설명 완료', exact: true }).click(); await W(400);
const more = modal().getByRole('button', { name: /^나머지 검사 보기/ });
if (await more.count()) { await more.click(); await W(200); }
await modal().locator('label').filter({ hasText: 'WFP' }).first().locator('input[type=checkbox]').check();
await modal().getByRole('button', { name: '설명 완료', exact: true }).click(); await W(1500);
await page.getByRole('button', { name: '나상훈', exact: true }).first().click(); await W(600);
await cardOf('사아자').getByRole('button', { name: '설명 완료 · FU 나중에' }).click(); await W(1500);
await back();
// 다음 진료일 명단 업로드
await pick('관리자');
await page.locator('input[type=date]').first().fill(tomorrow);
await page.locator('input[type=file]').setInputFiles(`${FIXTURES}/ocs-ok.xlsx`); await W(1500);
const list = (await getKey('daily-patients')).value.filter(p => p.date === tomorrow);
const a = list.find(p => p.id === '0012345'); const c = list.find(p => p.id === '0012347');
ok(a?.assigned?.wfp === true && !a.fuMissing, `설명 완료 때 지정한 검사(WFP)가 새로 올린 명단에 붙음 (${JSON.stringify(a?.assigned)})`);
ok(c?.fuMissing === true, 'FU 나중에 환자는 새 명단에 FU 미지정 표시');
// 명단 관리 화면
await page.getByRole('button', { name: '명단 관리', exact: true }).click(); await W(500);
await page.locator('input[type=date]').first().fill(tomorrow); await W(800);
ok(await page.getByText(/확인 필요 1명/).count() === 1, '명단 관리: 확인 필요는 FU 나중에 환자 1명뿐');
const cardA = page.locator('div').filter({ has: page.getByText('가나다', { exact: true }) }).filter({ hasText: 'WFP' }).last();
ok(await cardA.count() === 1 && await cardA.getByText(/확인 필요/).count() === 0, '가나다 카드: WFP 지정됨, 확인 필요 아님');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
