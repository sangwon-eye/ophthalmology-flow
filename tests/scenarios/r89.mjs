import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 처치 후 확인 + 처치 후 검사 (10-07 사용자 결정, 이름은 모두 가상)
// - 설정 > 처치 '처치 후 확인 N분'(예: YAG 60, Probing 10): [처치 완료] → '확인 대기' → 시간이 지나면 노란 'N분 지남 · 확인'(처치실 결과 확인에도) → 눌러야 끝
//   시간 전에는 한 번 누르면 [지금 완료] [시행 취소]. 확인 전에는 처치가 남은 것과 같음 (귀가 막음, 설명 먼저는 됨)
// - [처치 완료] 옆 '검사 추가 후 완료': 처치를 끝내고 고른 검사를 넣음(이미 했으면 다시), 처치에서 고른 눈이면 그 눈.
//   진료 전 처치는 검사 후 진료 대기, 진료 후 처치는 검사 후 설명 대기(그때까지 [귀가] 막음)
const min = 60000;
await editKey('settings', s => ({ ...s, procedures: [...s.procedures,
  { id: 'yag', name: 'YAG', performer: 'prof', eyeSelect: true, checkMin: 60 },
  { id: 'probe', name: 'Probing', performer: 'resident', checkMin: 10 },
  { id: 'prp', name: 'PRP', performer: 'prof', eyeSelect: true }] }));
const item = (uid, procId, name, performer, extra = {}) => ({ uid, procId, name, performer, note: '', done: false, doneAt: null, orderedAt: 1, ...extra });
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '송하린') return { ...p, procedures: [item('pb1', 'probe', 'Probing', 'resident'), item('pr1', 'prp', 'PRP', 'prof', { eye: 'OD' })], done: { ...p.done, wfp: true }, assigned: { ...p.assigned, wfp: true } };
  if (p.name === '황도윤') return { ...p, procedures: [item('y1', 'yag', 'YAG', 'prof', { eye: 'OS' })] };
  if (p.name === '장민호') return { ...p, assigned: { visionIop: true, wfp: true }, done: { visionIop: true, wfp: true }, preProcs: [{ uid: 'pp1', procId: 'prp', name: 'PRP', performer: 'prof', done: false, doneAt: null }] };
  return p;
}));
const rec = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back } = tester(page);
const modal = () => page.locator('.fixed.inset-0').last();
const inSec = (id, name) => page.locator(`#${id}`).locator('div.bg-white').filter({ has: page.getByText(name, { exact: true }) }).last();
await page.goto(`${BASE}/`); await W();

// 0) 설정 > 처치: '처치 후 확인' 칸
await pick('설정');
await page.getByRole('button', { name: '처치', exact: true }).click(); await W(300);
ok(await page.getByLabel('Probing 처치 후 확인 분').inputValue() === '10', '설정 > 처치: 처치 후 확인 10분');
await back();

// 1) 처치실: Probing [처치 완료] → 확인 대기 → 한 번 누르면 [지금 완료]
await pick('처치실');
await inSec('treat-procs', '송하린').getByRole('button', { name: '처치 완료', exact: true }).click(); await W(1200);
let s = await rec('송하린');
let pb = s.procedures.find(i => i.uid === 'pb1');
ok(!pb.done && !!pb.performedAt && pb.checkMin === 10, 'Probing [처치 완료] → 시행 시각만 (확인 대기)');
const waitBtn = inSec('treat-check', '송하린').getByRole('button', { name: '지금 확인', exact: true });
ok(await waitBtn.count() === 1 && await page.locator('#treat-procs').getByText('송하린', { exact: true }).count() === 0, '시행하면 처치 대기에서 빠지고 결과 확인에 [지금 확인] (10-10)');
ok(await inSec('treat-check', '송하린').getByRole('button', { name: '시행 취소' }).count() === 1, '시간 전: 작은 글씨 시행 취소 + [지금 확인] (검사 준비 줄과 같은 모양)');
await waitBtn.click(); await W(1200);
pb = (await rec('송하린')).procedures.find(i => i.uid === 'pb1');
ok(pb.done && !!pb.checkedAt, '[지금 확인] → Probing 끝');
await back();

// 2) 진료실(이종혁) 설명 대기: YAG [교수님 처치 완료] → 확인 대기, 설명 완료는 '설명 먼저'만 되고 [귀가]는 확인 뒤
await pick('진료실');
await page.getByRole('button', { name: '이종혁', exact: true }).first().click(); await W(1200);
await inSec('consult-explain', '황도윤').getByRole('button', { name: '처치 완료', exact: true }).click(); await W(1200);
let y = (await rec('황도윤')).procedures.find(i => i.uid === 'y1');
ok(!y.done && y.checkMin === 60, 'YAG → 확인 대기 (60분)');
ok(await inSec('consult-explain', '황도윤').getByRole('button', { name: '지금 확인', exact: true }).count() === 1 && /YAG · OS/.test(await inSec('consult-explain', '황도윤').innerText()), '설명 대기 카드: "YAG · OS … 시행" + [확인 대기] (10-10: 버튼은 할 일만)');
await inSec('consult-explain', '황도윤').getByRole('button', { name: '설명 완료 · FU 나중에' }).click(); await W(1200);
let h = await rec('황도윤');
ok(!!h.explainedEarly && !h.consultDone, '확인 전 설명 완료 → 설명만 먼저 (귀가 아님)');
ok(await inSec('consult-explain', '황도윤').getByRole('button', { name: '귀가', exact: true }).isDisabled(), '확인 전에는 [귀가] 회색 (누를 수 없음)');
await back();
// 시간이 지남 → 처치실 결과 확인에 노란 'N분 지남 · 확인'
await editKey('daily-patients', list => list.map(p => (p.name === '황도윤' ? { ...p, procedures: p.procedures.map(i => (i.uid === 'y1' ? { ...i, performedAt: i.performedAt - 61 * min } : i)) } : p)));
await pick('처치실'); await W(1500);
const dueBtn = inSec('treat-check', '황도윤').getByRole('button', { name: '확인', exact: true });
ok(await dueBtn.count() === 1 && /6\d분 지남/.test(await inSec('treat-check', '황도윤').innerText()), '처치실 결과 확인: 교수님 처치도 "N분 지남" + [확인]');
await page.screenshot({ path: `${SP}/r89-treat-check.png` });
await dueBtn.click(); await W(1200);
y = (await rec('황도윤')).procedures.find(i => i.uid === 'y1');
ok(y.done && !!y.checkedAt, '처치실에서 확인 → YAG 끝');
await back();
await pick('진료실');
await page.getByRole('button', { name: '이종혁', exact: true }).first().click(); await W(1200);
ok(await inSec('consult-explain', '황도윤').getByRole('button', { name: '귀가', exact: true }).isEnabled(), '확인 뒤 [귀가] 가능');

// 3) 진료 후 처치 + 처치 후 검사: 김선웅 설명 대기 송하린 PRP(OD) '검사 추가 후 완료' → WFP(OD 다시) → 검사 후 설명 대기
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(1200);
await inSec('consult-explain', '송하린').getByRole('button', { name: '검사 · 재진료' }).click(); await W(400); // 진료 후 처치는 '검사 · 재진료' 하나 (10-07)
await modal().locator('label').filter({ hasText: /^WFP/ }).locator('input').check(); await W(200);
await page.screenshot({ path: `${SP}/r89-post-modal.png` });
await modal().getByRole('button', { name: '처치 완료 · 검사로' }).click(); await W(1500);
s = await rec('송하린');
ok(s.procedures.find(i => i.uid === 'pr1').done && s.assigned.wfp && !s.done.wfp && s.detail?.wfp?.eye === 'OD' && (s.postTests || []).includes('wfp'), `PRP 완료 + WFP 다시(OD) (${JSON.stringify(s.detail?.wfp || {})})`);
ok(await inSec('consult-explain', '송하린').locator('[data-task-line="검사실"]').filter({ hasText: 'WFP' }).count() === 1, "설명 대기 카드: 점선 '검사실' WFP (10-10)");
await inSec('consult-explain', '송하린').getByRole('button', { name: '설명 완료 · FU 나중에' }).click(); await W(1200);
ok(!!(await rec('송하린')).explainedEarly && !(await rec('송하린')).consultDone, '검사 전 설명 완료 → 설명만 먼저');
await back();
await pick('31번방');
const wfp = page.locator('div.bg-white').filter({ has: page.getByText('송하린', { exact: true }) }).last().getByRole('button', { name: /^WFP/ }).first();
ok(await wfp.count() === 1, '31번방에 송하린 WFP');
await wfp.click(); await W(1200);
await back();
await pick('진료실');
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(1200);
ok(await inSec('consult-explain', '송하린').getByRole('button', { name: '귀가', exact: true }).isEnabled(), '검사가 끝나면 설명 대기에서 [귀가]');
await back();

// 4) 진료 전 처치 + 처치 후 검사: 장민호 PRP → WFP → 검사실, 끝나면 진료 대기
await pick('처치실');
await inSec('treat-preproc', '장민호').getByRole('button', { name: '검사 추가 후 완료' }).click(); await W(400);
await modal().locator('label').filter({ hasText: /^WFP/ }).locator('input').check(); await W(200);
await modal().getByRole('button', { name: '처치 완료 · 검사로' }).click(); await W(1500);
const j = await rec('장민호');
ok(j.preProcs[0].done && j.assigned.wfp && !j.done.wfp, '진료 전 PRP 완료 + WFP 다시');
await back();
await pick('31번방');
ok(await page.getByText('장민호', { exact: true }).count() >= 1, '31번방 대기에 장민호');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
