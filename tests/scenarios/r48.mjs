import { chromium, SP, BASE, editKey, tester } from '../lib.mjs';
// 서버 → 화면 변경 알림: 저장하면 0.3초 안의 변경을 모아 한 번 알림, 다른 화면이 4초 확인 없이도 바로 갱신
// 1) 알림 연결을 직접 열어 확인
const ctrl = new AbortController();
const res = await fetch(`${BASE}/api/events`, { signal: ctrl.signal });
let buf = '';
const reader = res.body.getReader();
(async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; buf += new TextDecoder().decode(value); } } catch { /* 닫힘 */ } })();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await sleep(300);
const events = () => [...buf.matchAll(/event: change\ndata: (.*)\n/g)].map(m => JSON.parse(m[1]));
const results = [];
const ok0 = (c, m) => results.push([c, m]);
ok0(res.headers.get('content-type')?.startsWith('text/event-stream'), '알림 연결 열림');
const before = events().length;
await editKey('doctors', d => [...d, '임시A']);
await editKey('doctors', d => [...d, '임시B']);
await editKey('board-notices', v => ({ ...(v || {}), notices: { ...(v?.notices || {}), vision: '' } }));
await sleep(700);
const got = events().slice(before);
ok0(got.length === 1 && got[0].keys.includes('doctors') && got[0].keys.includes('board-notices'), `0.3초 안의 저장 3번 → 알림 1번에 모아서 (${JSON.stringify(got)})`);
const b2 = events().length;
await fetch(`${BASE}/api/storage-entries/measure-history`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: [{ id: '1000007', prev: null, next: [{ date: '2026-01-01' }] }] }) });
await sleep(600);
ok0(events().slice(b2).some(e => e.keys.includes('measure-history') && !e.keys.some(k => k.includes('/'))), '나눠 둔 기록도 원래 이름(measure-history)으로 알림');
ctrl.abort();
await editKey('doctors', d => d.filter(x => !x.startsWith('임시')));

// 2) 화면: B 화면의 시계를 멈춰 4초 확인이 돌지 못하게 한 뒤, A 화면에서 [접수] → B 화면이 알림만으로 갱신되는지
const browser = await chromium.launch();
const pageA = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const pageB = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick } = tester(pageA);
pageB.on('pageerror', e => errors.push(e.message));
for (const [c, m] of results) ok(c, m);
await pageB.clock.install();
await pageB.goto(`${BASE}/`); await pageB.waitForTimeout(800);
await pageB.getByRole('button', { name: /^시력/ }).first().click(); await pageB.waitForTimeout(800);
await pageB.clock.pauseAt(new Date(Date.now() + 1000));
const t1 = await pageB.evaluate(() => Date.now()); await pageB.waitForTimeout(600);
ok(t1 === await pageB.evaluate(() => Date.now()), 'B 화면 시계 멈춤 (4초 확인이 돌지 않음)');
const waitingCount = async () => Number(((await pageB.getByText(/^접수 대기 · \d+명/).first().innerText()).match(/(\d+)명/) || [])[1]);
const n0 = await waitingCount();
await pageA.goto(`${BASE}/`); await W();
await pick('시력');
const start = Date.now();
await pageA.locator('div').filter({ has: pageA.getByText('원성옥', { exact: true }) }).getByRole('button', { name: '접수', exact: true }).first().click();
let n1 = n0;
while (Date.now() - start < 3000 && n1 === n0) { await pageB.waitForTimeout(100); n1 = await waitingCount(); }
ok(n1 === n0 - 1, `A에서 [접수] → B 화면이 알림만으로 ${Date.now() - start}ms 안에 갱신 (접수 대기 ${n0}→${n1}명)`);
await pageB.screenshot({ path: `${SP}/r48-b.png` });
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
