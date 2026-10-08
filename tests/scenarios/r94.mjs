import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 처치 후 재진료 (10-07 사용자 결정, 이름은 모두 가상)
// - 진료 후 처치 [교수님 처치 완료]·[처치 완료] 옆 '검사 · 재진료' 창의 [재진료]: 처치를 시행하고(확인 시간이 있어도 바로) 같은 교수님 진료 대기로
// - 표시·순서는 다른 재진료와 같음: 진료실 카드 'YAG · OS 후 재진', 환자용 진료실 명단 '재진료', 진료 대기 순서 규칙. [되돌리기]
// - 같은 창에서 검사도 고르면 검사가 끝난 뒤 진료 대기로 (그동안 진료실 '진료 보류'). 아무것도 안 고르면 확인 버튼을 못 누름
await editKey('settings', s => ({ ...s, procedures: [...s.procedures,
  { id: 'yag', name: 'YAG', performer: 'prof', eyeSelect: true, checkMin: 60 },
  { id: 'probe', name: 'Probing', performer: 'resident' }] }));
const item = (uid, procId, name, performer, extra = {}) => ({ uid, procId, name, performer, note: '', done: false, doneAt: null, orderedAt: 1, ...extra });
const allDone = { visionIop: true, oct: true, wfp: true, vf: true, idra: true, gat: true };
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '황도윤') return { ...p, procedures: [item('y1', 'yag', 'YAG', 'prof', { eye: 'OS' })] };
  if (p.name === '송하린') return { ...p, procedures: [item('pb1', 'probe', 'Probing', 'resident')] };
  if (p.name === '박영수') return { ...p, checkin: '08:30', done: { ...p.done, ...allDone }, measureOk: 1, calledRoom: null, seen: false, consultDone: false, procedures: [] };
  return p;
}));
const rec = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const modal = () => page.locator('.fixed.inset-0').last();
const inSec = (id, name) => page.locator(`#${id}`).locator('div.bg-white').filter({ has: page.getByText(name, { exact: true }) }).last();
const waitingHas = async (names) => {
  const body = await page.locator('body').innerText();
  const ws = body.indexOf('진료 대기 ·');
  const he = body.indexOf('진료 보류 (', ws);
  const t = he > 0 ? body.slice(0, he) : body; // 아래 '진료 보류' 칸은 빼고 진료 대기 칸만
  const at = names.map(n => t.indexOf(n, ws));
  return at.every((v, i) => v > ws && (i === 0 || v > at[i - 1]));
};
const doctor = async (d) => { await pick('진료실'); await page.getByRole('button', { name: d, exact: true }).first().click(); await W(1200); };
await page.goto(`${BASE}/`); await W();

// 1) 설명 대기 [교수님 처치 완료] 옆 '검사 · 재진료' → [재진료]만 (YAG: 확인 60분이어도 바로 진료 대기로)
await doctor('이종혁');
await inSec('consult-explain', '황도윤').scrollIntoViewIfNeeded();
await inSec('consult-explain', '황도윤').screenshot({ path: `${SP}/r94-explain-card.png` });
await inSec('consult-explain', '황도윤').getByRole('button', { name: '검사 · 재진료' }).click(); await W(400);
ok(await modal().getByRole('button', { name: '재진료나 검사를 고르세요' }).isDisabled(), '아무것도 안 고르면 확인 버튼을 못 누름');
await modal().getByLabel('재진료', { exact: true }).check(); await W(200);
await modal().screenshot({ path: `${SP}/r94-recon-modal.png` });
await modal().getByRole('button', { name: '처치 완료 · 재진료' }).click(); await W(1500);
let h = await rec('황도윤');
const y = h.procedures.find(i => i.uid === 'y1');
ok(!h.seen && h.procReconsult?.names === 'YAG · OS' && !!y.performedAt && !y.done, `재진료 → YAG 시행(확인 대기) + 진료 대기로 (${h.seen}/${h.procReconsult?.names})`);
ok(await waitingHas(['박영수', '황도윤']), '진료 대기에 예약 순서 자리로');
ok(await cardOf('황도윤').getByText('YAG · OS 후 재진', { exact: true }).count() === 1, '진료실 카드: "YAG · OS 후 재진"');
await cardOf('황도윤').screenshot({ path: `${SP}/r94-waiting-card.png` });
// 되돌리기 → 설명 대기로, YAG 시행 전으로
await page.getByRole('button', { name: '되돌리기' }).first().click(); await W(1500);
h = await rec('황도윤');
ok(h.seen && !h.procReconsult && !h.procedures.find(i => i.uid === 'y1').performedAt, '되돌리기 → 설명 대기, YAG 시행 전');
await inSec('consult-explain', '황도윤').getByRole('button', { name: '검사 · 재진료' }).click(); await W(400);
await modal().getByLabel('재진료', { exact: true }).check(); await W(200);
await modal().getByRole('button', { name: '처치 완료 · 재진료' }).click(); await W(1500);
ok(!(await rec('황도윤')).seen, '다시 재진료');
await back();
// 환자용 진료실 명단: '재진료'
await page.getByRole('button', { name: /^환자용 화면/ }).click(); await W(300);
await page.getByRole('button', { name: /^진료실 대기 명단 \(전체\)\s*교수님별/ }).click(); await W(1500);
const row = page.getByText(/^황도윤 \(\d{4}\)$/).first().locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
ok(/재진료/.test(await row.innerText()), '환자용 진료실 명단: 황도윤 "재진료"');
await page.goto(`${BASE}/`); await W();

// 2) 처치실 '검사 · 재진료' → WFP + [재진료] → 검사 끝난 뒤 진료 대기로
await pick('처치실');
await inSec('treat-procs', '송하린').getByRole('button', { name: '검사 · 재진료' }).click(); await W(400);
const more = modal().getByRole('button', { name: /^나머지 검사 보기/ });
if (await more.count()) { await more.click(); await W(200); }
await modal().locator('label').filter({ hasText: 'WFP' }).first().locator('input[type=checkbox]').check();
await modal().getByLabel('재진료', { exact: true }).check();
await modal().screenshot({ path: `${SP}/r94-post-modal.png` });
await modal().getByRole('button', { name: '처치 완료 · 검사 후 재진료' }).click(); await W(1500);
let s = await rec('송하린');
ok(!s.seen && !!s.procReconsult && s.assigned.wfp && !s.done.wfp && s.procedures[0].done, '처치 완료 + WFP + 재진료 예정');
await back();
await doctor('김선웅');
ok(await page.locator('#consult-hold').getByText('송하린', { exact: true }).count() === 1 && !(await waitingHas(['송하린'])), '검사 중에는 진료실 "진료 보류"에 (진료 대기 아님)');
await back();
await pick('31번방');
await cardOf('송하린').getByRole('button', { name: /^WFP/ }).first().click(); await W(1200);
await back();
await doctor('김선웅');
ok(await waitingHas(['송하린']) && await cardOf('송하린').getByText('Probing 후 재진', { exact: true }).count() === 1, '검사가 끝나면 진료 대기로 + "Probing 후 재진"');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
