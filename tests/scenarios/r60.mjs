import fs from 'fs';
import { chromium, SP, DATA, BASE } from '../lib.mjs';
// 접속 비밀번호: 서버가 막음 (주소를 알아도 통행증 없이는 읽기·저장 불가), 컴퓨터마다 한 번 입력 후 기억,
// 5번 틀리면 1분 잠금, 바꾸면 다른 컴퓨터는 다시 입력, 없애면 다시 열림
const browser = await chromium.launch();
const errors = [];
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) process.exitCode = 1; };
const newPc = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  return page;
};
const W = (page, ms = 600) => page.waitForTimeout(ms);
const gate = (page) => page.getByLabel('접속 비밀번호', { exact: true }).count();
// PC A: 설정에서 접속 비밀번호 정하기
const a = await newPc();
await a.goto(`${BASE}/`); await W(a);
ok(await gate(a) === 0, '비밀번호가 없으면 바로 들어감 (업데이트 직후 잠기지 않음)');
await a.getByRole('button', { name: /^설정/ }).first().click(); await W(a, 700);
await a.getByRole('button', { name: '기타', exact: true }).click(); await W(a, 300);
await a.getByLabel('새 접속 비밀번호', { exact: true }).fill('eye2026');
await a.getByLabel('새 접속 비밀번호 확인').fill('eye2026');
await a.getByRole('button', { name: '접속 비밀번호 저장' }).click(); await W(a, 1200);
ok(/사용 중/.test(await a.locator('div.font-medium', { hasText: /^접속 비밀번호/ }).innerText()), '저장 → 사용 중');
const file = fs.readFileSync(`${DATA}/access-lock.json`, 'utf8');
ok(!file.includes('eye2026') && /"hash"/.test(file), '서버 PC에 해시로만 저장');
await a.screenshot({ path: `${SP}/r60-card.png`, fullPage: true });
await a.reload(); await W(a, 1200);
ok(await gate(a) === 0 && await a.getByRole('button', { name: /^시력/ }).count() >= 1, '정한 컴퓨터는 다시 묻지 않음');
// 주소만 아는 다른 사람: 서버가 거절
const raw = await fetch(`${BASE}/api/storage/daily-patients`);
ok(raw.status === 401, '통행증 없이 명단 주소로 읽기 → 거절 (401)');
const put = await fetch(`${BASE}/api/storage/daily-patients`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: '[]', version: 1 }) });
ok(put.status === 401, '통행증 없이 저장 → 거절 (명단 그대로)');
const fake = await fetch(`${BASE}/api/storage/daily-patients`, { headers: { cookie: 'oph_access=1234' } });
ok(fake.status === 401, '가짜 통행증 → 거절');
// PC B: 처음 들어가면 비밀번호 화면
const b = await newPc();
await b.goto(`${BASE}/`); await W(b, 1200);
ok(await gate(b) === 1, '다른 컴퓨터: 비밀번호 화면');
await b.screenshot({ path: `${SP}/r60-gate.png` });
await b.getByLabel('접속 비밀번호', { exact: true }).fill('wrong'); await b.getByRole('button', { name: '들어가기' }).click(); await W(b, 1300);
ok(await b.getByText('비밀번호가 틀렸습니다').count() === 1, '틀리면 안내');
await b.getByLabel('접속 비밀번호', { exact: true }).fill('eye2026'); await b.getByRole('button', { name: '들어가기' }).click(); await W(b, 1500);
ok(await gate(b) === 0 && await b.getByRole('button', { name: /^시력/ }).count() >= 1, '맞으면 들어감');
await b.reload(); await W(b, 1200);
ok(await gate(b) === 0, '다시 열어도 묻지 않음 (기억)');
// PC A에서 비밀번호 바꾸기 → B는 다음 확인 때 다시 비밀번호 화면
await a.getByRole('button', { name: /^설정/ }).first().click(); await W(a, 700);
await a.getByRole('button', { name: '기타', exact: true }).click(); await W(a, 300);
await a.getByLabel('현재 접속 비밀번호').fill('eye2026');
await a.getByLabel('새 접속 비밀번호', { exact: true }).fill('new2026');
await a.getByLabel('새 접속 비밀번호 확인').fill('new2026');
await a.getByRole('button', { name: '접속 비밀번호 저장' }).click(); await W(a, 1200);
await W(b, 5500);
ok(await gate(b) === 1, '비밀번호를 바꾸면 다른 컴퓨터는 몇 초 안에 다시 비밀번호 화면');
await a.reload(); await W(a, 1200);
ok(await gate(a) === 0, '바꾼 컴퓨터는 그대로 들어와 있음');
// 없애기 → 누구나 다시 열림
await a.getByRole('button', { name: /^설정/ }).first().click(); await W(a, 700);
await a.getByRole('button', { name: '기타', exact: true }).click(); await W(a, 300);
await a.getByLabel('현재 접속 비밀번호').fill('new2026');
await a.getByRole('button', { name: '접속 비밀번호 없애기' }).click(); await W(a, 1000);
ok(!fs.existsSync(`${DATA}/access-lock.json`), '없애기 → 파일 삭제');
ok((await fetch(`${BASE}/api/storage/settings`)).status === 200, '없앤 뒤에는 다시 열림');
await a.getByLabel('새 접속 비밀번호', { exact: true }).fill('eye2026');
await a.getByLabel('새 접속 비밀번호 확인').fill('eye2026');
await a.getByRole('button', { name: '접속 비밀번호 저장' }).click(); await W(a, 1000);
// 다시 정한 뒤 PC C: 5번 틀리면 1분 잠금 (맞는 비밀번호도 잠시 안 됨). 테스트는 모든 창이 같은 주소라 맨 끝에
const c = await newPc();
await c.goto(`${BASE}/`); await W(c, 1000);
for (let i = 0; i < 5; i++) { await c.getByLabel('접속 비밀번호', { exact: true }).fill(`x${i}`); await c.getByRole('button', { name: '들어가기' }).click(); await W(c, 1100); }
ok(await c.getByText(/잠시 잠겼습니다/).count() === 1, '5번 틀리면 잠금 안내');
await c.getByLabel('접속 비밀번호', { exact: true }).fill('eye2026'); await c.getByRole('button', { name: '들어가기' }).click(); await W(c, 600);
ok(await gate(c) === 1, '잠긴 동안은 맞는 비밀번호도 안 됨');
// 잊어버렸을 때: 접속비밀번호초기화.bat 처럼 파일을 지우면 다시 열림
fs.unlinkSync(`${DATA}/access-lock.json`);
ok((await fetch(`${BASE}/api/storage/settings`)).status === 200, '초기화(파일 삭제) 뒤 다시 열림');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
