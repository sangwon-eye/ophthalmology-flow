import { chromium, SP, tester, BASE } from '../lib.mjs';
// 디자인 정리: 환자용 화면 제목 줄(낱말 단위 줄바꿈 · 진료실 번호 배지 · 시계 한 줄), 직원용 버튼은 오른쪽 아래,
// 1번 '다음 순서' 배지, 검사실 명단은 이름 아래에 검사, 메인 화면 칸 높이 같게, 0명 검사 칩 흐리게, 전체 환자 명단 방 색깔
const browser = await chromium.launch();
const openBoard = async (page, W, label) => {
  await page.goto(`${BASE}/`); await W();
  await page.getByRole('button', { name: /^환자용 화면/ }).click(); await W(300);
  await page.getByRole('button', { name: new RegExp(`^${label}`) }).first().click(); await W(900);
};
const allErrors = [];
for (const [w, h] of [[1024, 768], [1920, 1080]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const { errors, ok, W } = tester(page);
  await openBoard(page, W, '나상훈 진료실');
  const h1 = page.locator('h1');
  ok((await h1.innerText()).replace(/\s+/g, ' ').includes('나상훈 교수님 진료'), `${w}px: 진료실 화면 제목`);
  ok(await h1.getByText('5번 진료실', { exact: true }).count() === 1, `${w}px: 진료실 번호는 제목 옆 배지`);
  const title = await h1.locator('span').first().boundingBox();
  ok(title.height < 50, `${w}px: 제목이 한 줄 (높이 ${Math.round(title.height)})`);
  const clock = await page.getByText(/^(오전|오후) \d{1,2}:\d{2}$/).boundingBox();
  ok(clock && clock.height < 50, `${w}px: 시계가 한 줄`);
  const back = await page.getByRole('button', { name: '메인 화면' }).boundingBox();
  ok(back.y > h - 60 && back.x > w / 2, `${w}px: 메인 화면 버튼은 오른쪽 아래`);
  const auto = await page.getByRole('button', { name: /자동 스크롤/ }).boundingBox();
  ok(auto.height < 40, `${w}px: 자동 스크롤 버튼 글자가 한 줄`);
  ok(await page.getByText('다음 순서', { exact: true }).count() === 1, `${w}px: 1번 칸에 '다음 순서' 배지`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight), `${w}px: 화면 밖으로 넘치지 않음`);
  await page.screenshot({ path: `${SP}/r55-consult-${w}.png` });
  // 시력방: 1번('다음 순서')은 가장 크게, 2~5번 큰 칸은 높이가 모두 같음
  await openBoard(page, W, '시력검사실 대기 명단');
  const rows = page.locator('div.rounded-2xl.border-2');
  const hs = [];
  for (let i = 1; i < Math.min(5, await rows.count()); i++) hs.push(Math.round((await rows.nth(i).boundingBox()).height));
  ok(hs.length >= 2 && new Set(hs).size === 1, `${w}px: 시력방 칸 높이가 모두 같음 (${hs.join(', ')})`);
  // 검사실: 이름은 윗줄, 검사실·검사는 아랫줄
  await openBoard(page, W, '검사실 대기 명단');
  const card = page.locator('div.break-keep').filter({ hasText: '정밀검사실' }).first();
  const name = await card.locator('div').first().boundingBox();
  const chip = await card.getByText(/^정밀검사실:/).first().boundingBox();
  ok(chip.y >= name.y + name.height - 1, `${w}px: 검사실 명단은 이름 아래에 검사`);
  if (w === 1920) await page.screenshot({ path: `${SP}/r55-exam-${w}.png` });
  allErrors.push(...errors);
  await page.close();
}
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W } = tester(page);
await page.goto(`${BASE}/`); await W();
// 메인 화면: 칸 높이가 모두 같고, 검사가 많으면 '외 N개'
const tiles = page.locator('[data-tile]');
const th = [];
for (let i = 0; i < await tiles.count(); i++) th.push(Math.round((await tiles.nth(i).boundingBox()).height));
ok(new Set(th).size === 1, `메인 화면 칸 높이가 모두 같음 (${th.join(', ')})`);
ok(/외\s5개/.test(await page.locator('[data-tile="room:B"]').innerText()), "31번방 칸: 검사가 많으면 '외 5개'");
// 31번방: 기다리는 환자가 없는 검사 칩은 흐리게
await page.locator('[data-tile="room:B"]').click(); await W(800);
const top = page.locator('[data-testid="exam-top"]');
ok(await top.getByRole('button', { name: /^FAG 0명/ }).getAttribute('data-muted') === '1', '0명인 FAG 칩은 흐리게');
ok(await top.getByRole('button', { name: /^OCT [1-9]/ }).getAttribute('data-muted') === null, '기다리는 환자가 있는 OCT 칩은 그대로');
await page.getByRole('button', { name: '메인 화면' }).click(); await W(300);
// 전체 환자 명단: 상태 칩은 방 색깔
await page.getByRole('button', { name: /^전체 환자 명단/ }).click(); await W(800);
const chipClass = async (re) => (await page.getByText(re).first().getAttribute('class')) || '';
ok((await chipClass(/^31번방 · /)).includes('teal'), '31번방 대기 칩은 31번방 색(청록)');
ok((await chipClass(/^시력 \/ 안압 검사실 · /)).includes('blue'), '시력방 대기 칩은 파랑');
ok((await chipClass(/^진료실 · 진료 대기$/)).includes('amber'), '진료 대기 칩은 진료실 색(주황)');
ok((await chipClass(/^처치실 · 전공의 처치 대기$/)).includes('indigo'), '처치실 칩은 처치실 색');
await page.screenshot({ path: `${SP}/r55-directory.png` });
ok(errors.length === 0 && allErrors.length === 0, `페이지 오류 없음 ${[...allErrors, ...errors].join(' / ')}`);
await browser.close();
