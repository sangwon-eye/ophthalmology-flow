import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 김선웅 교수님 주요 검사: OCT·WFP·VF 만 (나머지는 기타)
await editKey('doctor-prefs', prefs => ({ ...prefs, '김선웅': { ...(prefs?.['김선웅'] || {}), followupTests: ['oct', 'wfp', 'vf'] } }));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
await page.goto(`${BASE}/`); await W(1000);
// 31번방 조현우(김선웅, OCT·WFP 지정)
await pick('31번방');
let c = cardOf('조현우');
await c.getByRole('button', { name: '검사 변경' }).click(); await W(200);
ok(await c.getByRole('button', { name: /^VF$/ }).count() === 1, '주요 검사(VF)는 바로 보임');
ok(await c.getByRole('button', { name: /^FAG$/ }).count() === 0, '기타 검사(FAG)는 처음엔 숨김');
const more = c.getByRole('button', { name: /^기타 검사 \d+개/ });
ok(await more.count() === 1, '[기타 검사 N개] 버튼');
await c.screenshot({ path: `${SP}/r31-picker-main.png` });
await more.click(); await W(200);
ok(await c.getByRole('button', { name: /^FAG$/ }).count() === 1, '누르면 기타 검사(FAG) 보임');
await c.getByRole('button', { name: /^FAG$/ }).click(); await W(600);
await c.getByRole('button', { name: /기타 검사 접기/ }).click(); await W(200);
ok(await c.getByRole('button', { name: /FAG/ }).count() >= 1, '지정한 기타 검사(FAG)는 접어도 보임');
await c.getByRole('button', { name: '접기' }).click(); await W(200);
// 이종혁(목록 없음) 환자는 전부 보임
c = cardOf('장민호');
await c.getByRole('button', { name: '검사 변경' }).click(); await W(200);
ok(await c.getByRole('button', { name: /^기타 검사/ }).count() === 0 && await c.getByRole('button', { name: /^FAG$/ }).count() === 1, '목록을 안 정한 교수님: 모든 검사 그대로');
await back();
// 진료실 추가 검사 창 (김선웅)
await pick('진료실');
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(500);
await cardOf('서준호').getByRole('button', { name: '진료 호출' }).click(); await W(600);
await page.getByRole('button', { name: '추가 검사', exact: true }).click(); await W(300);
const m = page.locator('.fixed.inset-0').last();
ok(await m.getByText('FAG', { exact: true }).count() === 0 && await m.getByText('WFP', { exact: true }).count() === 1, '추가 검사 창: 주요 검사만 먼저');
await m.getByRole('button', { name: /기타 검사 보기/ }).click(); await W(200);
ok(await m.getByText('FAG', { exact: true }).count() === 1, '추가 검사 창: [기타 검사 보기] 누르면 나머지');
await m.screenshot({ path: `${SP}/r31-modal.png` });
await m.getByRole('button', { name: '취소', exact: true }).click(); await W(200);
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
