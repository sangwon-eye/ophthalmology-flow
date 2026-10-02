import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// CR은 진료실 간호사 담당: 진료실 'CR·산동 점안' 칸 (점안 끝나고 기다리면 진료 대기로 + 띵동), 시력방 첫 점안은 안 해도 넘어감,
// 처치실은 상태만, [처치]의 'CR·산동 후 다시 진료' (같이 고른 처치는 다시 진료 뒤), 환자용 화면 직원용 버튼 숨김
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const pt = async (n) => (await getKey('daily-patients')).value.find(p => p.name === n);
const setP = (name, fn) => editKey('daily-patients', list => list.map(p => (p.name === name ? { ...p, ...fn(p) } : p)));
const modal = () => page.locator('.fixed.inset-0').last();
const section = (title) => page.locator('div.scroll-mt-36').filter({ has: page.getByText(new RegExp(`^${title}`)) }).first();
const waitingCards = () => page.locator('div.bg-white').filter({ has: page.getByRole('button', { name: '진료 호출' }) });
const inWaiting = async (n) => (await cardOf(n).getByRole('button', { name: '진료 호출' }).count()) === 1;
const chimes = () => page.evaluate(() => window.__ophChimes || 0);
// 시력방: CR 환자는 첫 점안 버튼은 보이지만 누르지 않아도 넘어감
await setP('신종희', () => ({ checkin: '08:50', cr: true, measureOk: 1, vaOk: 1, nctOk: 1 }));
await page.goto(`${BASE}/`); await W();
await pick('시력');
await W(1500);
ok((await pt('신종희')).done.visionIop === true, '시력방: CR 첫 점안 없이도 시력방 완료');
await back();
// 진료실(나상훈): FU CR 권나은은 진료 대기 대신 'CR·산동 점안' 칸
await setP('권나은', () => ({ cr: true }));
await pick('진료실');
await page.getByRole('button', { name: '나상훈', exact: true }).first().click(); await W();
const drops = section('CR·산동 점안');
ok(await drops.getByText('권나은', { exact: true }).count() === 1, 'FU CR 환자는 CR·산동 점안 칸에');
ok(!(await inWaiting('권나은')), 'CR 끝나기 전에는 진료 대기에 없음');
for (let i = 1; i <= 4; i++) { await cardOf('권나은').getByRole('button', { name: `${i}회 점안` }).click(); await W(400); }
ok((await pt('권나은')).drops.filter(Boolean).length === 4, '진료실에서 CR 4회 점안 기록');
ok(/완료까지 \d+분/.test(await cardOf('권나은').innerText()), '완료까지 남은 시간');
await W(2600);
const c0 = await chimes();
await setP('권나은', p => ({ drops: p.drops.map(t => t - 20 * 60000) }));
await W(4500);
ok(await inWaiting('권나은'), '기다리는 시간이 지나면 진료 대기로');
ok(await chimes() === c0 + 1, 'CR 시간 됨 → 띵동');
await back();
// 처치실: CR 환자는 상태만 (점안 버튼 없음)
await setP('조현우', () => ({ doctor: '나상훈', cr: true, drops: [Date.now()] }));
await pick('처치실');
ok(await page.getByRole('button', { name: /회 점안/ }).count() === 0, '처치실에는 CR 점안 버튼 없음');
await back();
// [처치] → 산동 후 다시 진료 + 전공의 처치 (이종혁 진료 중 오세영)
await pick('진료실');
await page.getByRole('button', { name: '이종혁', exact: true }).first().click(); await W();
await page.getByRole('button', { name: '처치', exact: true }).click(); await W(300);
ok(await modal().getByText('CR 후 다시 진료').count() === 0, 'CR을 켜지 않은 교수님은 CR 항목 없음');
await modal().locator('label').filter({ hasText: '산동 후 다시 진료' }).locator('input').check();
await modal().locator('label').filter({ hasText: '전공의 처치' }).first().locator('input').check();
await modal().screenshot({ path: `${SP}/r62-modal.png` });
await modal().getByRole('button', { name: '처치 지정', exact: true }).click(); await W(1200);
let o = await pt('오세영');
ok(o.redo?.kind === 'dilate' && !o.seen && !o.calledRoom && o.dilateOverride === true, '산동 후 재진: 진료실 점안 칸으로 (설명 대기 아님)');
ok(!(o.procedures || []).some(x => !x.done) && o.redo.pending.length === 1, '같이 고른 처치는 다시 진료 뒤로 미룸');
ok(await section('CR·산동 점안').getByText('산동 후 재진').count() === 1, '점안 칸에 산동 후 재진 표시');
await page.screenshot({ path: `${SP}/r62-consult.png`, fullPage: true });
await cardOf('오세영').getByRole('button', { name: '점안', exact: true }).click(); await W(600);
await setP('오세영', p => ({ drops: p.drops.map(t => t && t - 20 * 60000) }));
await W(4500);
ok(await inWaiting('오세영') && /산동 후 재진/.test(await cardOf('오세영').innerText()), '산동이 끝나면 진료 대기에 산동 후 재진 표시');
const first = await waitingCards().first().innerText();
ok(/오세영/.test(first), `진료 대기 맨 앞 (${first.split('\n')[0]})`);
await cardOf('오세영').getByRole('button', { name: '진료 호출' }).click(); await W(600);
await page.getByRole('button', { name: '진료 완료', exact: true }).click(); await W(1000);
o = await pt('오세영');
ok(o.seen && (o.procedures || []).some(x => !x.done && x.name === '전공의 처치'), '다시 진료 완료 → 미뤄 둔 처치 시작');
// 설명 대기 [처치 보내기]에도 같은 항목
await cardOf('황도윤').getByRole('button', { name: '처치 보내기' }).click(); await W(300);
ok(await modal().getByText('산동 후 다시 진료').count() === 1, '설명 대기 [처치 보내기]에도 산동 후 다시 진료');
await modal().getByRole('button', { name: '취소' }).click(); await W(200);
await back();
// 환자용 진료실 화면: 직원용 버튼은 평소 숨김, 마우스를 움직이면 나타나고 글씨 크기와 상관없이 같은 크기
await page.evaluate(() => localStorage.setItem('ui-text-size', '1.5'));
await page.reload(); await W();
await page.getByRole('button', { name: /^환자용 화면/ }).first().click(); await W(300);
await page.getByRole('button', { name: /^나상훈 진료실/ }).first().click(); await W(700);
const bar = page.locator('[data-staff-controls]');
await W(5600);
ok(await bar.evaluate(e => getComputedStyle(e).opacity) === '0', '평소에는 직원용 버튼 숨김');
await page.mouse.move(400, 400); await page.mouse.move(420, 420); await W(500);
ok(await bar.evaluate(e => getComputedStyle(e).opacity) === '1', '마우스를 움직이면 나타남');
const h150 = (await page.getByRole('button', { name: '메인 화면' }).boundingBox()).height;
await page.evaluate(() => { localStorage.setItem('ui-text-size', '1'); window.dispatchEvent(new CustomEvent('ui-text-size', { detail: '1' })); }); await W(300);
await page.mouse.move(430, 430); await W(300);
const h100 = (await page.getByRole('button', { name: '메인 화면' }).boundingBox()).height;
ok(Math.abs(h150 - h100) <= 1, `글씨 150%여도 직원용 버튼 크기 그대로 (${h150} / ${h100})`);
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
