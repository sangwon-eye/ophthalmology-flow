import { chromium, SP, getKey, editKey, tester, BASE, DATA, FIXTURES, measureVision } from '../lib.mjs';
await editKey('settings', s => ({ ...s, procedures: [...s.procedures, { id: 'prp', name: 'PRP', performer: 'prof', dilate: true }] }));
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '원성옥') return { ...p, checkin: '08:30', done: { visionIop: true }, preProcs: [{ uid: 'u1', procId: 'prp', name: 'PRP', performer: 'prof', dilate: true, done: false }], skipVision: true };
  if (p.name === '윤지아') return { ...p, dilateOverride: true };
  return p;
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
await page.goto(`${BASE}/`); await W();
ok(await page.getByRole('button', { name: /^설정/ }).count() === 1, '메인');
// 설정: 시력방에 검사 추가
await pick('설정');
const vbox = page.locator('div.bg-blue-50').first();
ok(await vbox.locator('[data-test-row="ARK"]').count() >= 1, '설정: 시력방에 ARK 보임');
await vbox.getByRole('button', { name: '검사 추가' }).click(); await W(200);
await vbox.locator('input[placeholder="예: 시야검사"]').last().fill('Topography');
await vbox.locator('input[placeholder="예: VF"]').last().fill('Topo');
await page.screenshot({ path: `${SP}/r19-settings-vision.png`, fullPage: false });
await page.getByRole('button', { name: '저장', exact: true }).click(); await W(800);
const st = (await getKey('settings')).value;
const topo = st.tests.find(t => t.short === 'Topo');
ok(topo?.roomId === 'vision', '시력방 검사 저장');
await page.getByRole('button', { name: '메인 화면' }).click(); await W(300);
ok(await page.getByText('이 컴퓨터의 화면을 선택하세요').count() === 1, "'메인 화면' 버튼으로 돌아감");
// 정대현(재진, 시력 대기)에 Topo 지정 + History(검사 지정)
await editKey('daily-patients', list => list.map(p => (p.name === '정대현' ? { ...p, firstVisit: true, assigned: { ...p.assigned, [topo.id]: true } } : p)));
await W(4500);
await pick('시력');
let c = cardOf('정대현');
ok(await c.getByRole('button', { name: /^Topo/ }).count() >= 1, '시력방 카드에 Topo 칸');
await c.getByRole('button', { name: 'History 설문지 드리기' }).click(); await W();
// 시력 완료 ([시력]·[NCT] 따로), Topo 완료
await measureVision(page, cardOf('정대현'));
await W(600);
ok(await page.getByText('정대현', { exact: true }).count() === 1, 'Topo 남아 있어 시력방에 그대로');
await cardOf('정대현').getByRole('button', { name: /^Topo/ }).first().click(); await W(600);
ok(await page.getByText('정대현', { exact: true }).count() === 0, 'Topo 완료 → 시력방에서 빠짐');
await page.getByRole('button', { name: '메인 화면' }).click(); await W(300);
await pick('처치실');
ok(await cardOf('정대현').getByRole('button', { name: '검사 지정', exact: true }).count() === 1, 'History 환자 → 처치실 검사 지정');
// PRP 산동 자동
ok(await cardOf('원성옥').getByRole('button', { name: '산동', exact: true }).count() === 1, 'PRP 진료 전 처치 → 처치실에서 바로 점안');
await page.screenshot({ path: `${SP}/r19-treat.png`, fullPage: true });
await page.getByRole('button', { name: '메인 화면' }).click(); await W(300);
await pick('31번방');
ok(await cardOf('윤지아').getByText(/VF 끝난 뒤/).count() === 1, 'VF 남은 산동 환자: 점안 막힘');
await cardOf('윤지아').screenshot({ path: `${SP}/r19-vf-note.png` });
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
