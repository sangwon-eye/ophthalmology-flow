import { chromium, SP, getKey, editKey, tester, BASE, DATA, FIXTURES } from '../lib.mjs';
await editKey('daily-patients', list => list.map(p => (p.name === '최민지' ? { ...p, firstVisit: true, done: { visionIop: true }, measure: { ucva: { od: '0.3', os: '0.8' }, nct: { od: '22', os: '15' } },
  hx: { htn: true, dm: true, dmYears: '5', pmh: '', surgery: '백내장 OD (2020)\n녹내장 레이저', cc: '좌안 흐림 1달' } } : p)));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
await page.goto(`${BASE}/`); await W(1000);
await pick('처치실');
const c = cardOf('최민지');
ok(/History/.test(await c.innerText()), '참고 줄에 History 한 줄 요약 (10-10)');
await c.locator('[data-detail-toggle]').first().click(); await W(400); // [자세히 ▾] → History 전체 + [수정]
ok(/History/.test(await c.innerText()) && await c.getByRole('button', { name: '최민지 History 수정' }).count() === 1, '처치실 검사 지정 대기 카드에 History + [수정]');
ok(await c.getByText('좌안 흐림 1달').count() >= 1 && await c.getByText('있음 (5년)').count() === 1, '주호소·당뇨 기간 보임 (요약 줄 + 자세히)');
ok(await c.getByText(/백내장 OD \(2020\)\s*녹내장 레이저/).count() === 1, '수술력 여러 줄 그대로');
await c.screenshot({ path: `${SP}/r22-treat-hx-card.png` });
await c.getByRole('button', { name: '검사 지정' }).click(); await W(300);
const m = page.locator('.fixed.inset-0').last();
ok(await m.getByText('좌안 흐림 1달').count() === 1, '검사 지정 창에도 History');
await m.locator('div.bg-white').first().screenshot({ path: `${SP}/r22-treat-hx-modal.png` });
await m.getByRole('button', { name: '취소', exact: true }).click(); await W(200);
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
