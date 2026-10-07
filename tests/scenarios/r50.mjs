import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 추가 점안(CR 제외): 산동 완료 뒤에만 '추가 점안', 버튼 하나에 마지막 시각·횟수, 버튼을 누르면 마지막 추가만 취소
// + 화면 버전 표시
const now = Date.now();
const ago = (m) => now - m * 60000;
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '장민호') return { ...p, dilateOverride: true, drops: [ago(20)] };
  if (p.name === '한지훈') return { ...p, cr: true, drops: [ago(40), ago(35), ago(25)] };
  if (p.name === '윤지아') return { ...p, dilateOverride: true, drops: [ago(20)] }; // VF(산동 금지)가 남아 있음
  return p;
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, cardOf } = tester(page);
const pt = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
await page.goto(`${BASE}/`); await W();
ok(/버전 \d\d-\d\d \d\d:\d\d/.test(await page.locator('body').innerText()), '메인 화면에 버전 표시');
await pick('31번방'); await W(800);
ok(/버전 \d\d-\d\d \d\d:\d\d/.test(await page.locator('body').innerText()), '직원 화면 아래에도 버전 표시');
const c = () => cardOf('장민호');
ok(/산동 완료/.test(await c().innerText()) && await c().getByRole('button', { name: '추가 점안' }).count() === 1, '산동 완료 뒤 [추가 점안] 보임');
await c().screenshot({ path: `${SP}/r50-ready.png` });
await c().getByRole('button', { name: '추가 점안' }).click(); await W(800);
let x = await pt('장민호');
ok(x.dropsExtra?.length === 1 && x.drops.length === 1 && x.drops[0] === ago(20), '추가 점안 기록 (처음 점안 기록은 그대로)');
ok(await c().getByRole('button', { name: /^산동 \d\d:\d\d · 2회$/ }).count() === 1, '버튼 하나에 마지막 시각 · 2회');
ok(!/산동 완료/.test(await c().innerText()) && await c().getByRole('button', { name: '추가 점안' }).count() === 0, '다시 기다리는 중 (산동 완료·추가 점안 숨김)');
await c().screenshot({ path: `${SP}/r50-extra.png` });
// 잘못 눌렀으면: 버튼을 누르면 마지막 추가 점안만 취소
await c().getByRole('button', { name: /· 2회$/ }).click(); await W(300);
await c().getByRole('button', { name: '누르면 취소' }).click(); await W(800);
x = await pt('장민호');
ok((x.dropsExtra || []).length === 0 && x.drops[0] === ago(20), '버튼을 누르면 추가 점안만 취소');
ok(await c().getByRole('button', { name: /^산동 완료 \d\d:\d\d$/ }).count() === 1, '처음 점안으로 돌아옴 (버튼이 초록 산동 완료 시각)');
// 두 번째 추가 점안: 첫 추가 점안도 시간이 지나 산동 완료 → 다시 추가 가능 → 3회
await editKey('daily-patients', list => list.map(p => (p.name === '장민호' ? { ...p, dropsExtra: [ago(18)] } : p)));
await W(5000);
ok(/산동 완료/.test(await c().innerText()) && await c().getByRole('button', { name: /· 2회$/ }).count() === 1, '추가 점안 뒤에도 시간이 지나면 산동 완료');
await c().getByRole('button', { name: '추가 점안' }).click(); await W(800);
ok(await c().getByRole('button', { name: /· 3회$/ }).count() === 1 && (await pt('장민호')).dropsExtra.length === 2, '두 번째 추가 점안 → 3회');
// CR 환자, 산동 금지 검사(VF)가 남은 환자는 추가 점안 없음
// CR은 시간이 지나면 확인을 눌러야 완료 (10-03 산동 확인)
ok(await cardOf('한지훈').getByRole('button', { name: /분 지남 · 확인$/ }).count() === 1 && await cardOf('한지훈').getByRole('button', { name: '추가 점안' }).count() === 0, 'CR 환자는 시간이 지나면 [N분 지남 · 확인], 추가 점안 없음');
ok(await cardOf('윤지아').getByRole('button', { name: '추가 점안' }).count() === 0, 'VF(산동 금지)가 남아 있으면 추가 점안 숨김');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
