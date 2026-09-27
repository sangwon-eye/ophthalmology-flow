import { execSync } from 'child_process';
import fs from 'fs';
import { chromium, SP, DATA, BASE, FIXTURES } from '../lib.mjs';
const browser = await chromium.launch();
const pcA = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const pcB = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = []; for (const p of [pcA, pcB]) p.on('pageerror', e => errors.push(e.message));
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) process.exitCode = 1; };
const wait = (p, ms = 600) => p.waitForTimeout(ms);
const today = new Date().toLocaleDateString('sv-SE');
const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE');
await pcA.goto(`${BASE}/`); await pcB.goto(`${BASE}/`); await wait(pcA);
const dateInput = (p) => p.getByLabel('오늘 날짜');
ok(await dateInput(pcA).inputValue() === today, `처음엔 컴퓨터 날짜 (${today})`);
// PC B는 31번방
await pcB.getByRole('button', { name: /^31번방/ }).first().click(); await wait(pcB);
const countB = async () => (await pcB.locator('h1').innerText()).match(/대기 (\d+)명/)?.[1];
ok(await countB() === '5', '31번방 오늘 대기 5명');
// PC A에서 내일로
await dateInput(pcA).fill(tomorrow); await wait(pcA, 800);
ok(await pcA.getByText('직접 정함 · 모든 컴퓨터 적용').count() === 1, 'PC A: 직접 정함 표시');
await pcA.screenshot({ path: `${SP}/r9-main.png`, clip: { x: 283, y: 0, width: 800, height: 260 } });
await wait(pcB, 5000);
ok(await countB() === '0', 'PC B(31번방): 몇 초 뒤 내일 명단(0명)으로 바뀜');
ok(await pcB.getByText(`날짜 ${tomorrow} (직접 정함)`).count() === 1, 'PC B 제목줄에 직접 정한 날짜 표시');
await pcB.screenshot({ path: `${SP}/r9-room.png`, clip: { x: 283, y: 0, width: 800, height: 120 } });
// 되돌리기
await pcA.getByRole('button', { name: /실제 날짜/ }).click(); await wait(pcA, 800);
ok(await dateInput(pcA).inputValue() === today, 'PC A: 되돌리기');
await wait(pcB, 5000);
ok(await countB() === '5', 'PC B: 다시 오늘 명단');
// 어제 정한 값은 무시 (다음 날 자동 해제)
const f = `${DATA}/keys/today-override.json`;
const o = JSON.parse(fs.readFileSync(f));
o.value = JSON.stringify({ date: tomorrow, setOn: new Date(Date.now() - 86400000).toLocaleDateString('sv-SE') }); o.version += 1;
fs.writeFileSync(f, JSON.stringify(o));
await pcA.reload(); await wait(pcA, 1500);
ok(await dateInput(pcA).inputValue() === today && await pcA.getByText('직접 정함').count() === 0, '어제 정한 날짜는 오늘 적용 안 됨');
ok(errors.length === 0, '페이지 오류 없음');
await browser.close();
