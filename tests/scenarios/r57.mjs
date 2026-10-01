import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 시력방 [시력]·[NCT] 분리 · 안압 안 잼(관리자 명단 관리) · 오늘 검사에 NCT · 설명 대기 [처치 보내기] · MR 결과 입력(설정 [결과 입력])
await editKey('settings', s => ({ ...s, tests: [...s.tests, { id: 'mr', name: '현성굴절검사 (MR)', short: 'MR', roomId: 'B', order: 20, options: [], popupOnClick: false, machine: '', resultFields: ['s', 'c', 'a', 'add', 'va'] }] }));
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '정대현') return { ...p, assigned: { ...p.assigned, gat: true } };
  if (p.name === '조현우') return { ...p, assigned: { ...p.assigned, mr: true } };
  return p;
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const pt = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const modal = () => page.locator('.fixed.inset-0').last();
await page.goto(`${BASE}/`); await W();
// 관리자 명단 관리: 강서윤 안압 안 잼
await pick('관리자');
await page.getByRole('button', { name: '명단 관리', exact: true }).click(); await W();
await page.locator('div.bg-white').filter({ has: page.getByText('강서윤', { exact: true }) }).last().getByRole('button', { name: '안압 잼', exact: true }).click(); await W();
ok((await pt('강서윤')).noIop === true, '명단 관리 [안압 잼] → 안압 안 잼');
await back();
await pick('시력');
ok(await cardOf('최민지').getByRole('button', { name: '시력', exact: true }).count() === 1 && await cardOf('최민지').getByRole('button', { name: 'NCT', exact: true }).count() === 1, '보통 환자: [시력]·[NCT] 따로');
ok(await cardOf('정대현').getByRole('button', { name: 'NCT 안 함 · 검사실 GAT' }).count() === 1, 'GAT 환자: NCT 대신 노란 표시');
ok(await cardOf('강서윤').getByRole('button', { name: '안압 안 잼' }).count() === 1, '안압 안 잼 환자: 노란 표시');
// 최민지: 시력만 → ✓ 시력, 아직 측정 미완료 → NCT → 완료
await cardOf('최민지').getByRole('button', { name: '시력', exact: true }).click(); await W(300);
ok(await modal().getByText('NCT', { exact: true }).count() === 0, '[시력] 창에는 NCT 칸 없음');
await modal().locator('input').first().fill('0.8');
await modal().getByRole('button', { name: '확인', exact: true }).click(); await W(800);
let p = await pt('최민지');
ok(p.vaOk && !p.measureOk && p.measure.ucva.od === '0.8', '시력만 저장: 아직 측정 완료 아님');
ok(await cardOf('최민지').getByRole('button', { name: '✓ 시력' }).count() === 1, '✓ 시력 표시');
await cardOf('최민지').getByRole('button', { name: 'NCT', exact: true }).click(); await W(300);
await modal().locator('input').first().fill('15');
await modal().locator('input[inputmode=decimal]').nth(1).fill('16');
await modal().getByRole('button', { name: '확인', exact: true }).click(); await W(1500);
p = await pt('최민지');
ok(p.nctOk && p.measureOk && p.measure.nct.od === '15' && p.measure.ucva.od === '0.8', 'NCT 저장 → 측정 완료 (시력 값 그대로)');
// 안압 안 잼 환자: 시력만으로 측정 완료, 입력 창에 NCT 칸 없음
await cardOf('강서윤').getByRole('button', { name: '시력', exact: true }).click(); await W(300);
await modal().locator('input').first().fill('0.4');
await modal().getByRole('button', { name: '확인', exact: true }).click(); await W(800);
ok((await pt('강서윤')).measureOk, '안압 안 잼: 시력만으로 측정 완료');
await back();
// 오늘 검사에 NCT (최민지 진료 대기로 보내서 진료실에서 확인)
await editKey('daily-patients', list => list.map(x => (x.name === '최민지' ? { ...x, done: { ...x.done, visionIop: true }, calledRoom: null } : x)));
// 설명 대기 [처치 보내기]: 맨 오른쪽, 설명 대기 순서(seenAt) 그대로
await pick('진료실');
await page.getByRole('button', { name: '이종혁', exact: true }).first().click(); await W();
const seen0 = (await pt('황도윤')).seenAt;
const ec = cardOf('황도윤');
const sb = await ec.getByRole('button', { name: '처치 보내기' }).boundingBox();
const others = await ec.getByRole('button').evaluateAll(bs => bs.map(b => b.getBoundingClientRect().right));
ok(sb && Math.max(...others) <= sb.x + sb.width + 1, '[처치 보내기]는 맨 오른쪽');
await ec.getByRole('button', { name: '처치 보내기' }).click(); await W(300);
await modal().locator('label').filter({ hasText: '전공의 처치' }).first().locator('input').check();
await modal().getByRole('button', { name: '처치 지정', exact: true }).click(); await W(1000);
const h = await pt('황도윤');
ok(h.procedures.length === 2 && h.seenAt === seen0 && h.seen, '설명 대기에서 처치 추가 (설명 대기 순서 그대로)');
// 진료 중(오세영) 화면: MR 오늘 표
await editKey('daily-patients', list => list.map(x => (x.name === '오세영' ? { ...x, assigned: { ...x.assigned, mr: true }, done: { ...x.done, mr: true }, results: { mr: { od: { s: '-1.50', c: '-0.50', a: '180', add: '+1.50', va: '0.9' }, os: { s: '-1.25' } } }, measure: { ...x.measure, nct: { od: '14', os: '15' } } } : x)));
await W(4500);
const inRoom = page.locator('div.rounded-2xl').filter({ has: page.getByText('현재 진료 중', { exact: true }) }).first();
ok(/MR\s+R/.test(await inRoom.innerText()) && /\+1\.50/.test(await inRoom.innerText()), '진료실: MR 결과 표');
ok(/오늘 검사\s*NCT/.test(await inRoom.innerText()), '진료실 오늘 검사에 NCT');
await page.screenshot({ path: `${SP}/r57-consult.png`, fullPage: true });
await back();
// 31번방: MR 칸 → 결과 입력 창 → 완료 + 결과 줄 + 다음 내원용 이전 기록
await pick('31번방');
await cardOf('조현우').getByRole('button', { name: 'MR', exact: true }).click(); await W(300);
ok(await modal().getByText('Add', { exact: true }).count() === 1 && await modal().locator('input').count() === 10, 'MR 결과 창: R·L × S·C·A·Add·VA');
await modal().getByLabel('R S').fill('-2.00');
await modal().getByLabel('L VA').fill('1.0');
await modal().getByRole('button', { name: 'MR 완료' }).click(); await W(1200);
const j = await pt('조현우');
ok(j.done.mr === true && j.results.mr.od.s === '-2.00' && j.results.mr.os.va === '1.0', 'MR 결과 저장 + 완료');
ok(/R S -2\.00/.test(await cardOf('조현우').innerText()), '검사실 카드에 MR 결과 줄');
const hist = (await getKey('measure-history')).value?.[j.id];
ok(!JSON.stringify(hist || []).includes('results'), 'MR은 그날 기록에만 (다음 내원 이전 기록에는 저장 안 함)');
await back();
// 설정: [결과 입력] 칩과 칸 고르기 (WG처럼 S·C·A만)
await pick('설정');
const row = page.locator('[data-test-row="MR"]');
ok(await row.getByRole('button', { name: '✓ 결과 입력' }).count() === 1, '설정: MR [결과 입력] 켜짐');
await row.getByRole('button', { name: 'Add', exact: true }).click(); await row.getByRole('button', { name: 'VA', exact: true }).click();
await page.getByRole('button', { name: '저장', exact: true }).click(); await W(800);
ok(JSON.stringify((await getKey('settings')).value.tests.find(t => t.id === 'mr').resultFields) === '["s","c","a"]', '칸 고르기 저장 (S·C·A)');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
