import { chromium, SP, editKey, tester, BASE } from '../lib.mjs';
// 검사실 묶음 윗줄: 다른 검사실 대기도 '보기만', 대기 순서가 가장 빠른 환자가 기다리는 검사 칩에 빨간 점
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back } = tester(page);
const top = () => page.locator('[data-testid="exam-top"]');
const dotted = async () => (await top().locator('[data-dot="1"]').allInnerTexts()).map(t => t.trim().split(' ')[0]).sort();
await page.goto(`${BASE}/`); await W();
await page.screenshot({ path: `${SP}/r54-main.png` });
await pick('31번방'); await W(800);
const other = top().locator('[data-room="C"]');
ok(/6번방/.test(await other.innerText()) && /IDRA 1명/.test(await other.innerText()), '31번방 윗줄에 6번방 IDRA 대기도 보임');
ok(await other.getByRole('button').count() === 0, '다른 검사실 칩은 보기만 (버튼 아님)');
// 대기 순서 1번(조현우: OCT·WFP 남음) → OCT·WFP 칩에 빨간 점
ok(JSON.stringify(await dotted()) === JSON.stringify(['OCT', 'WFP']), `가장 빠른 환자의 남은 검사 칩에 빨간 점 (${await dotted()})`);
ok(/조현우/.test(await top().locator('[data-dot="1"]').first().getAttribute('title')), '점에 마우스를 올리면 그 환자 이름');
await top().screenshot({ path: `${SP}/r54-31.png` });
await back();
await pick('6번방'); await W(800);
ok(/IDRA 1명/.test(await top().innerText()) && /31번방/.test(await top().locator('[data-room="B"]').innerText()), '6번방 윗줄: 자기 IDRA + 31번방 대기');
ok(JSON.stringify(await dotted()) === JSON.stringify(['OCT', 'WFP']), '6번방에서도 31번방 OCT·WFP 칩에 빨간 점');
await top().screenshot({ path: `${SP}/r54-6.png` });
// 조현우가 VF 검사 중이면 빼고 다음 사람(윤지아: OCT·VF)
await editKey('daily-patients', list => list.map(p => (p.name === '조현우' ? { ...p, assigned: { ...p.assigned, vf: true }, vfInProgress: 'vf', vfStartedAt: Date.now() } : p)));
await W(2500);
ok(JSON.stringify(await dotted()) === JSON.stringify(['OCT', 'VF']), `검사 중인 환자는 빼고 다음 사람 기준 (${await dotted()})`);
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
