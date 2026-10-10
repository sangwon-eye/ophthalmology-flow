import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// '나중에 확인' 결과(시간 재기 ②, 예: MMP)가 남으면 (10-07 사용자 결정, 이름은 모두 가상)
// - 다른 검사는 그대로 진행, 진료 대기는 결과 확인 뒤 (진료실 '검사 진행 중'에 포함), 확인하면 진료 대기로
// - QR 다시 찍기: 남은 검사 안내가 먼저, 검사가 없으면 '검사 결과를 기다리고 있습니다 · 큰 복도'
// - 진료 뒤면 [설명 완료]는 설명만 먼저, [귀가]는 결과 확인 뒤 (설명 대기 카드 'MMP 결과 확인 전')
const min = 60000;
await editKey('settings', s => ({ ...s, tests: [...s.tests, { id: 'mmp', name: 'MMP', short: 'MMP', roomId: 'treat', order: 3, options: [], popupOnClick: false, machine: '', timed: true, prepWaitMin: 10, prepMode: 'go', withExams: true }] }));
const mmpGo = (p, extra = {}) => ({ ...p, assigned: { ...p.assigned, mmp: true }, done: { ...p.done, mmp: true }, doneAt: { ...(p.doneAt || {}), mmp: Date.now() - 11 * min }, prep: { ...(p.prep || {}), mmp: { startedAt: Date.now() - 11 * min, go: true } }, ...extra });
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '서준호') return mmpGo(p, { done: { ...p.done, oct: true, mmp: true } }); // 김선웅 · 진료 전, MMP 결과만 남음
  if (p.name === '조현우') return mmpGo(p, { assigned: { ...p.assigned, wfp: true, mmp: true }, done: { ...p.done, wfp: false, mmp: true } }); // 다른 검사(WFP)도 남음
  if (p.name === '황도윤') return mmpGo(p, { procedures: [] }); // 이종혁 · 진료 뒤 (설명 대기)
  return p;
}));
const rec = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const inSec = (id, name) => page.locator(`#${id}`).locator('div.bg-white').filter({ has: page.getByText(name, { exact: true }) }).last();
const waitingHas = async (name) => {
  const body = await page.locator('body').innerText();
  const ws = body.indexOf('진료 대기 ·');
  const he = body.indexOf('진료 보류 (', ws);
  return (he > 0 ? body.slice(ws, he) : body.slice(ws)).includes(name);
};
const doctor = async (d) => { await pick('진료실'); await page.getByRole('button', { name: d, exact: true }).first().click(); await W(1200); };
await page.goto(`${BASE}/`); await W();

// 1) 진료 전: MMP 결과 확인 전에는 진료 대기에 없음 ('검사 진행 중'에 포함)
await doctor('김선웅');
ok(!(await waitingHas('서준호')), 'MMP 결과 확인 전: 진료 대기에 없음');
ok(/진료 대기 · \d+명 \(검사 진행 중 \d+명\)/.test(await page.locator('body').innerText()), "진료실 제목: '검사 진행 중'에 포함");
await back();
// 2) QR 다시 찍기: 남은 검사가 먼저, 결과만 남으면 결과 기다림 안내
await pick('QR 접수');
const scan = async (code) => { await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press('Enter'); await W(900); };
const shows = async (...texts) => { const s = await page.locator('[role=status]').innerText().catch(() => ''); return texts.every(x => s.includes(x)); };
await scan('6100444');
ok(await shows('검사 결과를 기다리고 있습니다', '큰 복도에서 기다려 주세요'), 'QR: 결과만 남음 → 검사 결과를 기다리고 있습니다');
await scan('6100222');
ok(await shows('검사가 한 곳 남았습니다', '정밀검사실로 이동해 주세요'), 'QR: 다른 검사(WFP)가 남으면 그 안내가 먼저');
await page.goto(`${BASE}/`); await W();
// 3) 처치실 결과 확인 → 진료 대기로
await pick('처치실'); await W(800);
await inSec('treat-check', '서준호').getByRole('button', { name: '확인', exact: true }).click(); await W(1500);
ok(!!(await rec('서준호')).prep.mmp.checked, 'MMP 결과 확인');
await back();
await doctor('김선웅');
ok(await waitingHas('서준호'), '결과 확인 뒤 진료 대기로');
await back();

// 4) 진료 뒤: 설명 대기 'MMP 결과 확인 전' → 설명 완료는 설명만 먼저, 귀가는 확인 뒤
await doctor('이종혁');
const card = () => inSec('consult-explain', '황도윤');
ok(await card().locator('[data-task-line="처치실"]').filter({ hasText: 'MMP 결과 확인 전' }).count() === 1, "설명 대기 카드: 점선 '처치실' 'MMP 결과 확인 전' (10-10)");
await card().getByRole('button', { name: '설명 완료 · FU 나중에' }).click(); await W(1500);
let h = await rec('황도윤');
ok(!!h.explainedEarly && !h.consultDone, '결과 확인 전 설명 완료 → 설명만 먼저 (귀가 아님)');
ok(await card().getByRole('button', { name: '귀가', exact: true }).isDisabled(), '결과 확인 전에는 [귀가] 회색 (누를 수 없음)');
await card().screenshot({ path: `${SP}/r95-explain-card.png` });
await back();
await pick('처치실'); await W(800);
await inSec('treat-check', '황도윤').getByRole('button', { name: '확인', exact: true }).click(); await W(1500);
await back();
await doctor('이종혁');
await card().getByRole('button', { name: '귀가', exact: true }).click(); await W(1500);
ok(!!(await rec('황도윤')).consultDone, '결과 확인 뒤 [귀가]');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
