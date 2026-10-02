import { chromium, SP, editKey, tester, BASE } from '../lib.mjs';
// 환자용 진료실 화면(교수님 한 분): 교수님 이름·진료 중·다음 순서 크게, 진료 호출 띵동(종 버튼으로 끄기)
// 시력방 앞 5명 크게 · 검사실마다 따로 된 환자용 화면
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1024 } });
const { errors, ok, W } = tester(page);
const chimes = () => page.evaluate(() => window.__ophChimes || 0);
const setP = (name, fn) => editKey('daily-patients', list => list.map(p => (p.name === name ? { ...p, ...fn(p) } : p)));
const openBoard = async (label) => {
  await page.goto(`${BASE}/`); await W();
  await page.getByRole('button', { name: /^환자용 화면/ }).first().click(); await W(300);
  await page.getByRole('button', { name: label }).first().click(); await W(800);
};
// 나상훈 진료실 앞 모니터
await setP('신종희', () => ({ checkin: '08:50', done: { visionIop: true }, calledRoom: '나상훈', calledAt: Date.now() }));
await openBoard(/^나상훈 진료실/);
ok(await page.getByRole('heading', { name: /나상훈 교수님/ }).count() === 1, '제목: 나상훈 교수님');
const title = await page.getByRole('heading', { name: /나상훈 교수님/ }).evaluate(e => parseFloat(getComputedStyle(e).fontSize));
ok(title >= 44, `교수님 이름 크게 (${title}px)`);
const inRoom = page.locator('div.rounded-2xl').filter({ hasText: '진료 중' }).first();
ok(/신\*희/.test(await inRoom.innerText()), '진료 중 환자 크게');
const roomSize = await inRoom.locator('span.font-bold').last().evaluate(e => parseFloat(getComputedStyle(e).fontSize));
const nextRow = page.locator('div.rounded-2xl').filter({ hasText: '다음 순서' }).filter({ hasText: '권*은' });
ok(await nextRow.count() === 1, '다음 순서 칸');
const nextSize = await nextRow.locator('span.font-bold').last().evaluate(e => parseFloat(getComputedStyle(e).fontSize));
ok(nextSize >= 64 && roomSize >= 30 && roomSize < nextSize, `다음 순서가 가장 크게 (${nextSize}px), 진료 중은 조금 작게 (${roomSize}px)`);
const h1 = await page.locator('h1').boundingBox();
const badge = await page.locator('h1').getByText('5번 진료실', { exact: true }).boundingBox();
ok(badge && h1 && badge.y >= h1.y && badge.y + badge.height <= h1.y + h1.height + 1, '진료실 번호 배지가 제목 줄 안에');
await page.screenshot({ path: `${SP}/r59-consult.png` });
// 띵동: 다른 PC에서 나상훈 진료 호출 → 띵동, 다른 교수님 호출은 소리 없음
await W(2600);
let c = await chimes();
await setP('신종희', () => ({ calledRoom: null, seen: true, seenAt: Date.now() }));
await setP('권나은', () => ({ calledRoom: '나상훈', calledAt: Date.now() })); await W(2000);
ok(await chimes() === c + 1, '나상훈 진료 호출 → 환자용 화면에서도 띵동');
c = await chimes();
await setP('원성옥', () => ({ checkin: '08:40', done: { visionIop: true }, calledRoom: '김선웅', calledAt: Date.now() })); await W(2000);
ok(await chimes() === c, '다른 교수님 호출은 소리 없음');
// 종 버튼으로 끄기 (이 컴퓨터만)
await page.getByRole('button', { name: '띵동 소리 끄기' }).click(); await W(2600);
c = await chimes();
await setP('권나은', () => ({ calledRoom: null, seen: true, seenAt: Date.now() }));
await setP('최민지', () => ({ done: { visionIop: true }, calledRoom: '나상훈', calledAt: Date.now() })); await W(2000);
ok(await chimes() === c, '종 버튼으로 끄면 소리 없음');
ok(await page.getByRole('button', { name: '띵동 소리 켜기' }).count() === 1, '종 버튼: 켜기로 바뀜');
await page.getByRole('button', { name: '띵동 소리 켜기' }).click(); await W(300);
// 검사실별 화면: 정밀검사실(31번방) / 안구건조증 검사실(6번방)
await openBoard(/^정밀검사실 대기 명단/);
ok(await page.getByRole('heading', { name: /정밀검사실 대기 명단/ }).count() === 1 && /31번방/.test(await page.getByRole('heading').first().innerText()), '정밀검사실 화면 (31번방 배지)');
let txt = await page.locator('.board-scroll').innerText();
ok(/조\*우/.test(txt) && /임\*빈/.test(txt) && !/IDRA/.test(txt), '31번방 검사만 (6번방 IDRA는 안 보임)');
await page.screenshot({ path: `${SP}/r59-room.png` });
await openBoard(/^안구건조증 검사실 대기 명단/);
txt = await page.locator('.board-scroll').innerText();
ok(/임\*빈/.test(txt) && /IDRA/.test(txt) && !/조\*우/.test(txt) && !/OCT/.test(txt), '6번방 화면: 6번방 검사 환자만');
// 시력방 + 검사실: 시력방 앞 5명 크게
await editKey('daily-patients', list => list.map((p, i) => (i < 8 ? { ...p, checkin: `08:1${i}`, done: {}, calledRoom: null, seen: false } : p)));
await page.setViewportSize({ width: 1920, height: 1080 });
await openBoard(/\+ 검사실/);
const sizes = await page.locator('.board-scroll span.font-bold.whitespace-nowrap').evaluateAll(es => es.map(e => parseFloat(getComputedStyle(e).fontSize)));
ok(sizes.filter(s => s >= 44).length === 5, `시력방 앞 5명 큰 글씨 (${sizes.join(', ')})`);
ok(await page.getByText('그다음 순서').count() === 1, '6번째부터는 그다음 순서 (작게)');
await page.screenshot({ path: `${SP}/r59-vision.png` });
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
