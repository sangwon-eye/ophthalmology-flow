import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 처치 창: 한 줄에 2칸, 처치마다 설정에 따라 눈(OU·OD·OS)·메모 칸, 공용 처치 메모 없음,
// '산동 필요' 처치는 보내면 산동 예정(이미 점안했으면 그 시각 그대로), 전공의 처치는 교수님 처치가 남아 있어도 처치실에
await editKey('settings', s => ({ ...s, procedures: [
  { id: 'yag', name: 'YAG', performer: 'resident', dilate: true, eyeSelect: true },
  { id: 'inj', name: '안내 주사', performer: 'prof', eyeSelect: true },
  { id: 'edu', name: '안약 점안 교육', performer: 'resident', memoField: true },
  { id: 'p1', name: '교수 처치', performer: 'prof' },
] }));
const t0 = Date.now() - 6 * 60000;
await editKey('daily-patients', list => list.map(p => (p.name === '오세영' ? { ...p, dilateOverride: true, drops: [t0] } : p)));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const pt = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const modal = () => page.locator('.fixed.inset-0').last();
await page.goto(`${BASE}/`); await W();
await pick('진료실');
await page.getByRole('button', { name: '이종혁', exact: true }).first().click(); await W();
await page.getByRole('button', { name: '처치', exact: true }).click(); await W(300);
const boxes = await modal().locator('label').filter({ hasText: /YAG|안내 주사/ }).evaluateAll(ls => ls.map(l => l.getBoundingClientRect().top));
ok(boxes.length === 2 && Math.abs(boxes[0] - boxes[1]) < 3, '처치 칸이 한 줄에 2개');
ok(await modal().getByPlaceholder(/처치 메모/).count() === 0, '공용 처치 메모 칸 없음');
const lab = (n) => modal().locator('label').filter({ hasText: n });
ok(await modal().getByRole('button', { name: 'YAG OS' }).count() === 0, '체크 전에는 눈 버튼 없음');
await lab('YAG').locator('input[type=checkbox]').check();
await lab('안내 주사').locator('input[type=checkbox]').check();
await lab('안약 점안 교육').locator('input[type=checkbox]').check();
ok(await lab('안약 점안 교육').getByRole('button', { name: /OU/ }).count() === 0 && await modal().getByLabel('YAG 메모').count() === 0, '설정에 따라 눈 버튼·메모 칸이 따로');
await modal().getByRole('button', { name: 'YAG OS' }).click();
ok((await lab('YAG').locator('input[type=checkbox]').isChecked()), '눈 버튼을 눌러도 체크는 그대로');
await modal().getByRole('button', { name: '안내 주사 OD' }).click();
await modal().getByLabel('안약 점안 교육 메모').fill('인공눈물 하루 4번');
await modal().screenshot({ path: `${SP}/r63-modal.png` });
await modal().getByRole('button', { name: '처치 지정', exact: true }).click(); await W(1200);
const o = await pt('오세영');
const by = (n) => o.procedures.find(x => x.name === n);
ok(by('YAG').eye === 'OS' && by('YAG').dilate && by('안내 주사').eye === 'OD' && by('안약 점안 교육').note === '인공눈물 하루 4번' && !by('안약 점안 교육').eye, '처치마다 눈·메모 저장');
ok(o.dilateOverride === true && o.drops[0] === t0, '산동 필요 처치: 산동 예정 + 이미 점안한 시각 그대로');
ok(/YAG · OS/.test(await cardOf('오세영').innerText()) && /안내 주사 · OD/.test(await cardOf('오세영').innerText()), '설명 대기: YAG · OS, 안내 주사 · OD');
await back();
await pick('처치실');
const tc = cardOf('오세영');
ok(/YAG · OS/.test(await tc.innerText()) && await tc.getByRole('button', { name: '처치 완료' }).count() === 1, '교수님 처치가 남아 있어도 전공의 처치는 처치실에');
ok(/교수님 처치도 남음: 안내 주사 · OD/.test(await tc.innerText()), '교수님 처치도 남음 표시');
ok(await tc.getByRole('button', { name: /^산동 \d\d:\d\d$/ }).count() === 1, '처치실 카드에 산동 점안 시각');
await page.screenshot({ path: `${SP}/r63-treat.png`, fullPage: true });
// 설정 > 처치: 산동 필요 · 눈 고르기 · 메모 칸
await back();
await pick('설정');
await page.getByRole('button', { name: '처치', exact: true }).click(); await W(300);
ok(await page.getByText('눈 고르기', { exact: true }).count() === 4 && await page.getByText('메모 칸', { exact: true }).count() === 4, '설정 > 처치에 눈 고르기 · 메모 칸');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
