import { chromium, SP, getKey, editKey, tester, BASE, DATA, FIXTURES } from '../lib.mjs';
await editKey('daily-patients', list => list.map(p => {
  if (p.name === '최민지') return { ...p, firstVisit: true, dilateOverride: true, assigned: { ...p.assigned, wfp: true, oct: true }, detail: { oct: { options: ['Macular'], eye: 'OU', eyes: {} } } };
  if (p.name === '정대현') return { ...p, dilateOverride: true, assigned: { ...p.assigned, wfp: true, oct: true }, hx: { htn: true, cc: '흐림' } };
  return p;
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1155, height: 800 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
await page.goto(`${BASE}/`); await W(1000);
await pick('시력');
const mid = async (l) => { const b = await l.boundingBox(); return b.y + b.height / 2; };
for (const n of ['최민지', '정대현']) {
  const c = cardOf(n);
  const y0 = await mid(c.getByRole('button', { name: '시력', exact: true }));
  ok(Math.abs(await mid(c.getByRole('button', { name: '산동', exact: true })) - y0) < 12 && await c.getByRole('button', { name: /점안$/ }).count() === 0, `${n}: 시력·산동 첫 줄 (점안 버튼 따로 없음)`);
  if (n === '최민지') ok(Math.abs(await mid(c.getByRole('button', { name: 'History 설문지 드리기' })) - y0) < 12, `${n}: 설문지 버튼도 첫 줄`);
  ok(await c.getByRole('button', { name: /WFP/ }).count() === 0, `${n}: 다른 검사실 검사는 접혀 있음`);
  ok(/오늘 검사\s*\S/.test(await c.innerText()) && !/오늘 검사 \d+ 보기/.test(await c.innerText()), `${n}: 오늘 검사 이름이 작게 보임 (10-07)`);
  await c.getByRole('button', { name: '오늘 검사 변경' }).click(); await W(300);
  ok(await c.getByRole('button', { name: /WFP/ }).count() >= 1, `${n}: [변경]을 누르면 검사실 검사까지 모두`);
  await c.getByRole('button', { name: '오늘 검사 접기' }).click(); await W(200);
  await c.screenshot({ path: `${SP}/r27-${n}.png` });
}
const c = cardOf('정대현');
await c.getByRole('button', { name: '산동', exact: true }).click(); await W();
ok(await c.getByRole('button', { name: /^산동 \d/ }).count() === 1 && await c.getByText(/분 남음/).count() === 0, '누르면 산동 시각, 남은 시간 없음');
await c.getByRole('button', { name: '오늘 검사 변경' }).click(); await W(200);
ok(await c.getByRole('button', { name: /^\+ ?WFP|WFP/ }).count() >= 1, '오늘 검사 [변경]을 누르면 검사 바꾸기 가능');
await page.screenshot({ path: `${SP}/r27-vision.png` });
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
