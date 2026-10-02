import { chromium, getKey, editKey, tester, BASE } from '../lib.mjs';
// 다시 진료: 점안 칸은 점안 버튼만, '다시 진료 취소'(원래 자리로·산동 원래대로), 산동을 끄면 재진 표시도 사라짐, 설명 완료 표시 풀림
// 처치: 설명 대기에서 넣은 처치를 취소하면 설명 대기에 그대로, 산동 필요 처치 취소 → 산동도 원래대로(점안 전),
// 다시 진료 뒤 [진료 완료 취소] → 같이 고른 처치는 다시 대기로
await editKey('settings', s => ({ ...s, procedures: [{ id: 'yag', name: 'YAG', performer: 'resident', dilate: true, eyeSelect: true }, { id: 'p2', name: '전공의 처치', performer: 'resident' }] }));
await editKey('daily-patients', list => list.map(p => (p.name === '황도윤' ? { ...p, procedures: [], explainedEarly: true } : p)));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, cardOf } = tester(page);
const pt = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const modal = () => page.locator('.fixed.inset-0').last();
const order = async (name, btn, labels) => {
  await cardOf(name).getByRole('button', { name: btn, exact: true }).click(); await W(300);
  for (const l of labels) await modal().locator('label').filter({ hasText: l }).first().locator('input[type=checkbox]').check();
  await modal().getByRole('button', { name: '처치 지정', exact: true }).click(); await W(1000);
};
await page.goto(`${BASE}/`); await W();
await pick('진료실');
await page.getByRole('button', { name: '이종혁', exact: true }).first().click(); await W();
// 설명 대기(설명 완료 · 처치 후 귀가) 황도윤 → 산동 후 다시 진료
await order('황도윤', '처치 보내기', ['산동 후 다시 진료']);
let h = await pt('황도윤');
ok(h.redo?.kind === 'dilate' && !h.seen && !h.explainedEarly, '다시 진료로 보내면 설명 완료 표시 풀림');
const dc = page.locator('#consult-drops');
ok(await dc.getByRole('button', { name: '점안', exact: true }).count() === 1 && await dc.getByRole('button', { name: /^산동/ }).count() === 0, '점안 칸: 점안 버튼만 (산동 켜기·끄기 칩 없음)');
await dc.getByRole('button', { name: '다시 진료 취소' }).click(); await W(200);
ok(!(await pt('황도윤')).redo?.cancelledAt, '한 번 누르면 아직 취소 안 됨');
await dc.getByRole('button', { name: '한 번 더 누르면 다시 진료 취소' }).click(); await W(1000);
h = await pt('황도윤');
ok(h.seen && h.explainedEarly && h.redo.cancelledAt && h.dilateOverride === undefined, '취소 → 설명 대기(설명 완료 그대로)로, 산동 원래대로');
// 진료 중 오세영 → 산동 후 다시 진료 + 전공의 처치 → 다른 화면에서 산동 끄면 재진 표시 사라짐
await page.getByRole('button', { name: '처치', exact: true }).click(); await W(300);
await modal().locator('label').filter({ hasText: '산동 후 다시 진료' }).locator('input').check();
await modal().locator('label').filter({ hasText: '전공의 처치' }).locator('input[type=checkbox]').check();
await modal().getByRole('button', { name: '처치 지정', exact: true }).click(); await W(1000);
await editKey('daily-patients', list => list.map(p => (p.name === '오세영' ? { ...p, dilateOverride: false } : p)));
await W(4500);
ok(await cardOf('오세영').getByRole('button', { name: '진료 호출' }).count() === 1 && !/산동 후 재진/.test(await cardOf('오세영').innerText()), '산동을 끄면 진료 대기로, 재진 표시 없음');
// 다시 진료 → 진료 완료 → 진료 완료 취소: 처치는 다시 '다시 진료 뒤'로
await editKey('daily-patients', list => list.map(p => (p.name === '오세영' ? { ...p, dilateOverride: true, drops: [Date.now() - 20 * 60000] } : p)));
await W(4500);
await cardOf('오세영').getByRole('button', { name: '진료 호출' }).click(); await W(600);
await page.getByRole('button', { name: '진료 완료', exact: true }).click(); await W(800);
ok((await pt('오세영')).procedures.some(x => x.name === '전공의 처치' && !x.done), '다시 진료 완료 → 처치 시작');
await cardOf('오세영').getByRole('button', { name: '진료 완료 취소' }).click(); await W(1000);
let o = await pt('오세영');
ok(!o.procedures.some(x => x.name === '전공의 처치' && !x.done) && o.redo.pending.length === 1, '진료 완료 취소 → 처치는 다시 대기(처치실에 안 보임)');
// 설명 대기 황도윤 [처치 보내기] YAG → 산동 켜짐 → 처치 취소: 설명 대기에 그대로 + 산동 원래대로
await editKey('daily-patients', list => list.map(p => (p.name === '황도윤' ? { ...p, explainedEarly: false } : p)));
await W(4500);
await order('황도윤', '처치 보내기', ['YAG']);
h = await pt('황도윤');
ok(h.dilateOverride === true && h.procedures.some(x => x.name === 'YAG' && x.fromExplain), '산동 필요 처치 → 산동 켜짐');
await cardOf('황도윤').getByRole('button', { name: '처치 취소' }).click(); await W(1000);
h = await pt('황도윤');
ok(h.seen && !h.calledRoom && h.procedures.length === 0, '설명 대기에서 넣은 처치 취소 → 설명 대기에 그대로 (진료실로 안 들어감)');
ok(h.dilateOverride === undefined, '처치 때문에 켠 산동도 원래대로 (점안 전)');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
