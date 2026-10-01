import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 설명 완료 창 [설명 완료 · FU 없음 (회송)] · 관리자 FU 지정 창을 진료실 창과 같은 모양으로 + [FU 없음 · FU 명단에서 삭제]
const pts0 = (await getKey('daily-patients')).value;
const sid = pts0.find(p => p.name === '서준호').id;
const jid = pts0.find(p => p.name === '신종희').id;
await editKey('daily-patients', list => list.map(p => (p.name === '서준호' ? { ...p, seen: true, seenAt: Date.now(), calledRoom: null } : p)));
await editKey('fu-designations', fu => ({
  ...(fu || {}),
  [sid]: { oct: true, doctor: '김선웅', name: '서준호', byDoctor: { 김선웅: { oct: true, doctor: '김선웅' } } },
  [jid]: { wfp: true, doctor: '나상훈', name: '신종희', byDoctor: { 나상훈: { wfp: true, doctor: '나상훈' } } },
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const modal = () => page.locator('.fixed.inset-0').last();
await page.goto(`${BASE}/`); await W();
// 진료실 설명 완료 → FU 없음 (회송)
await pick('진료실');
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W();
await cardOf('서준호').getByRole('button', { name: '설명 완료', exact: true }).click(); await W(400);
const later = await modal().getByRole('button', { name: '설명 완료 · FU 나중에' }).boundingBox();
const none = await modal().getByRole('button', { name: '설명 완료 · FU 없음 (회송)' }).boundingBox();
ok(later && none && Math.abs(later.y - none.y) < 3 && none.x > later.x, '[FU 나중에] 옆에 [FU 없음 (회송)]');
await modal().screenshot({ path: `${SP}/r58-explain.png` });
await modal().getByRole('button', { name: '설명 완료 · FU 없음 (회송)' }).click(); await W(1200);
const s = (await getKey('daily-patients')).value.find(p => p.name === '서준호');
const fu = (await getKey('fu-designations')).value;
ok(s.consultDone && s.referred, '설명 완료 + 회송 표시');
ok(!fu[sid], '예전 FU 지정도 지움, FU 나중에 명단에도 없음');
await back();
await pick('전체 환자 명단');
ok(await page.getByText('진료 완료 · 회송', { exact: true }).count() === 1, '전체 환자 명단: 진료 완료 · 회송');
await back();
// 관리자 FU 지정 관리: 같은 모양 (담당 교수 · 나머지 검사 접기) + 삭제
await pick('관리자');
await page.getByRole('button', { name: 'FU 지정 관리', exact: true }).click(); await W();
await page.getByPlaceholder('환자번호 또는 이름으로 찾기').fill(jid); await W(500);
await page.getByRole('button', { name: '수정', exact: true }).first().click(); await W(400);
ok(/다음 내원 담당: 나상훈/.test(await modal().innerText()), '관리자 FU 창에 다음 내원 담당');
ok(await modal().getByRole('button', { name: /^나머지 검사 보기/ }).count() === 1, '관리자 FU 창도 나머지 검사 접기');
await modal().getByRole('button', { name: 'FU 없음 · FU 명단에서 삭제' }).click(); await W(200);
ok(!!(await getKey('fu-designations')).value[jid], '한 번 누르면 아직 안 지움');
await modal().getByRole('button', { name: '한 번 더 누르면 FU 명단에서 삭제' }).click(); await W(1000);
ok(!(await getKey('fu-designations')).value[jid], '한 번 더 누르면 FU 명단에서 삭제');
ok(await page.locator('.fixed.inset-0').count() === 0, '창 닫힘');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
