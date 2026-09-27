import { chromium, SP, getKey, editKey, tester, BASE, DATA, FIXTURES } from '../lib.mjs';
// 최민지: 초진 (기록 없음) → 추천, 정대현: 초진이지만 FU 기록 있음(9개월 FU) → 추천 안 함
await editKey('daily-patients', list => list.map(p => (p.name === '최민지' || p.name === '정대현' ? { ...p, firstVisit: true } : p)));
const pts = (await getKey('daily-patients')).value;
const jid = pts.find(p => p.name === '정대현').id;
await editKey('fu-designations', fu => ({ ...(fu || {}), [jid]: { oct: true, doctor: '나상훈', byDoctor: { '나상훈': { oct: true, doctor: '나상훈' } } } }));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
await page.goto(`${BASE}/`); await W(1000);
await pick('시력');
ok(await cardOf('최민지').getByText('History 필요', { exact: true }).count() === 1, '초진 + 기록 없음 → History 필요');
ok(await cardOf('정대현').getByText('History 필요', { exact: true }).count() === 1, '초진이면 FU 기록이 있어도 History 필요');
ok(await cardOf('정대현').getByRole('button', { name: /필요 없음|History 입력/ }).count() === 0, '필요 없음·History 입력 버튼 없음');
// 최민지 입력
await cardOf('최민지').getByRole('button', { name: /^History (입력|필요)$/ }).click(); await W(300);
const m = page.locator('.fixed.inset-0').last();
await m.getByRole('button', { name: '고혈압 있음' }).click();
await m.getByRole('button', { name: '당뇨 있음' }).click();
await m.getByLabel('당뇨 기간').fill('5');
await m.getByLabel('이전 안과 수술력').fill('백내장 OD (2020)\n녹내장 레이저');
await m.getByLabel('주호소').fill('좌안 흐림 1달');
await m.screenshot({ path: `${SP}/r18-hx-modal.png` });
await m.getByRole('button', { name: '확인', exact: true }).click(); await W();
ok(await cardOf('최민지').getByText(/HTN\(\+\) · DM\(\+\) 5년 · 수술력: 백내장 OD \(2020\), 녹내장 레이저 · 주호소: 좌안 흐림 1달/).count() === 1, '입력 후 카드에 요약');
// 강서윤(초진, seed) → 입력 없이 완료 → 경고
ok(await cardOf('강서윤').getByText('History 필요', { exact: true }).count() === 1, '강서윤 History 필요');
// 시력 완료: 측정값 입력 창에서 완료
await cardOf('강서윤').getByRole('button', { name: '측정값 입력' }).click(); await W(300);
const mm = page.locator('.fixed.inset-0').last();
await mm.getByRole('button', { name: '확인', exact: true }).click(); await W(300);
if (await page.locator('.fixed.inset-0').count()) { await page.locator('.fixed.inset-0').last().getByRole('button', { name: '확인', exact: true }).click(); }
await W(800);
let list = (await getKey('daily-patients')).value;
let k = list.find(p => p.name === '강서윤');
ok(!k.done?.visionIop && k.measureOk && k.measure, '측정 확인만: 시력방에 남음 (History 남음)');
ok(await cardOf('강서윤').getByRole('button', { name: '측정값 입력' }).count() === 0 && await cardOf('강서윤').getByRole('button', { name: '측정값 수정' }).count() === 1, '측정값 입력 버튼 사라지고 [수정]');
await cardOf('강서윤').screenshot({ path: `${SP}/r29-measure-done.png` });
// 수정 → 창 열림 → 취소
await cardOf('강서윤').getByRole('button', { name: '측정값 수정' }).click(); await W(300);
ok(await page.locator('.fixed.inset-0').count() === 1, '[수정]으로 측정 창');
await page.locator('.fixed.inset-0').last().getByRole('button', { name: '취소', exact: true }).click(); await W(300);
// 빈칸으로 History [확인] → 할 일 끝 → 자동으로 넘어감
await cardOf('강서윤').getByRole('button', { name: 'History 필요' }).click(); await W(300);
await page.locator('.fixed.inset-0').last().getByRole('button', { name: '확인', exact: true }).click(); await W(1200);
list = (await getKey('daily-patients')).value;
ok(list.find(p => p.name === '강서윤').done?.visionIop === true, 'History 확인 → 자동으로 시력방 완료');
ok(await page.getByText(/강서윤 시력방 완료/).count() === 1, '완료 알림');
await back();
// 저장소: 다음 내원 때 미리 채움
const store = (await getKey('patient-history')).value;
const cid = list.find(p => p.name === '최민지').id;
ok(store?.[cid]?.dm === true && store[cid].dmYears === '5' && !('cc' in store[cid]), '환자별 저장 (주호소 제외)');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
