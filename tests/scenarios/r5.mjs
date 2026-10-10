import { execSync } from 'child_process';
import { chromium, SP, DATA, BASE, FIXTURES } from '../lib.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) process.exitCode = 1; };
const wait = (ms = 400) => page.waitForTimeout(ms);
const pick = async (n) => { await page.getByRole('button', { name: new RegExp(`^${n}`) }).first().click(); await wait(500); };
const back = async () => { await page.getByRole('button', { name: '메인 화면' }).click(); await wait(300); };
const cardOf = (name) => page.locator('div.bg-white').filter({ has: page.getByText(name, { exact: true }) }).last();
const order = () => page.evaluate(() => [...document.querySelectorAll('.t-num')].map(n => n.parentElement.querySelector('.t-name')?.innerText));
const pressed = async (name) => cardOf(name).getByRole('button', { name: '지각', exact: true }).getAttribute('aria-pressed');
await page.goto(`${BASE}/`); await wait(600);
// 31번방: 지각 켜기/끄기
await pick('31번방');
let o = await order();
await cardOf(o[0]).getByRole('button', { name: '지각', exact: true }).click(); await wait();
let o2 = await order();
ok(await pressed(o[0]) === 'true' && o2[o2.length - 1] === o[0], `검사실에서 지각 켜기 → 뒤로 (${o2.join(',')})`);
await cardOf(o[0]).getByRole('button', { name: '지각', exact: true }).click(); await wait();
ok((await order())[0] === o[0], '검사실에서 지각 끄기 → 원래 자리');
// VF 칸
const y = cardOf('윤지아');
const startBg = await y.getByRole('button', { name: '▶ 시작' }).evaluate(e => getComputedStyle(e).backgroundColor);
ok(!/rgb\(2[0-3]\d, 1[01]\d, 0\)/.test(startBg), `시작 버튼 연한 색 (${startBg})`);
const orderBg = await y.getByRole('button', { name: '처방 전', exact: true }).evaluate(e => getComputedStyle(e).backgroundColor);
console.log('     처방 전 배경', orderBg);
await y.screenshot({ path: `${SP}/r5-card.png` });
await y.getByRole('button', { name: '▶ 시작' }).click(); await wait();
const txt = await y.innerText();
ok(/VF 검사 중/.test(txt) && !/검사 중 \d\d:\d\d/.test(txt), '검사 중에 시작 시간 없음');
await y.screenshot({ path: `${SP}/r5-vf-running.png` });
await y.getByRole('button', { name: '종료', exact: true }).click(); await wait();
ok(await y.getByText(/VF 검사 중/).count() === 0, 'VF 종료 동작');
await back();
// 진료실 진료 대기 카드
await pick('진료실');
await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await wait();
await cardOf('서준호').getByRole('button', { name: '지각', exact: true }).click(); await wait();
ok(await pressed('서준호') === 'true', '진료실 진료 대기 카드에서 지각 켜기');
await cardOf('서준호').getByRole('button', { name: '지각', exact: true }).click(); await wait();
ok(await pressed('서준호') === 'false', '진료실에서 지각 끄기');
await back();
// 시력실 접수 대기 카드 + 검사 대기 카드
await pick('시력');
await cardOf('원성옥').getByRole('button', { name: '지각', exact: true }).click(); await wait();
await cardOf('원성옥').getByRole('button', { name: '접수', exact: true }).click(); await wait();
o = await order();
// 10-08 '지각 자리': 먼저 접수한 환자 뒤 — 가상 명단은 08:3x~08:5x 접수라, 시험 브라우저 시계가 그보다 이르면(새벽에 돌릴 때) 먼저 온 환자가 없어 맨 뒤가 아님
const early = await page.evaluate(() => new Date().toTimeString().slice(0, 5) < '08:56');
ok((early || o[o.length - 1] === '원성옥') && await pressed('원성옥') === 'true', `접수 전 지각 → 접수 후 먼저 접수한 환자 뒤 (${o.join(',')}${early ? ' · 시험 시각이 이른 아침이라 순서는 확인 안 함' : ''})`);
await page.screenshot({ path: `${SP}/r5-vision.png` });
ok(errors.length === 0, '페이지 오류 없음');
await browser.close();
