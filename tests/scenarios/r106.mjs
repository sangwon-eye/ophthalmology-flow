import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 처치실·설명 대기 '할 일 줄' + '시행하면 대기 칸에서 빠짐' (10-10 사용자, 이름은 모두 가상)
// - 처치(확인 시간 있음)를 시행하면 처치 대기에서 빠지고 결과 확인에 '확인 대기' → 시간이 되면 [확인]
// - 검사 준비(FAG skin test)·처치실 시간 재기 검사(Schirmer)를 시작하면 대기 칸에서 빠지고 결과 확인으로, [시작 취소]면 원래 칸
// - 교수님 처치(설명 대기에서 시행)도 시행 즉시 처치실 결과 확인에. 숫자에는 확인 대기도 셈, 띵동은 시간이 됐을 때만
// - 버튼은 할 일만 짧게(같은 말 반복 없음), 설명 대기의 '설명 후 귀가'·'처치가 끝나면 귀가…' 글 없음
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TMP = path.join(HERE, '..', '.tmp-r106');
fs.mkdirSync(TMP, { recursive: true });
fs.writeFileSync(path.join(TMP, 'xlsx-stub.mjs'), 'export const read = () => ({}); export const utils = {}; export default {};');
const esbuild = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
const built = spawnSync(esbuild, [path.join(ROOT, 'src', 'core', 'flow.jsx'), '--bundle', '--format=esm', '--platform=node',
  '--outfile=' + path.join(TMP, 'flow.mjs'), '--alias:xlsx=' + path.join(TMP, 'xlsx-stub.mjs'), '--log-level=warning'], { stdio: 'inherit', shell: process.platform === 'win32' });
const F = await import(path.join(TMP, 'flow.mjs') + `?t=${Date.now()}`);

const today = new Date().toLocaleDateString('sv-SE');
const now = Date.now();
const min = (m) => now - m * 60000;
await editKey('settings', s => ({
  ...s,
  tests: [...s.tests.filter(t => t.id !== 'sch').map(t => (t.id === 'fag' ? { ...t, prepOn: true, prepName: 'skin test', prepWaitMin: 20 } : t)),
    { id: 'sch', name: 'Schirmer', short: 'Schirmer', roomId: 'treat', order: 30, options: [], popupOnClick: false, machine: '', timed: true, prepWaitMin: 5 }],
  procedures: [
    { id: 'p2', name: '전공의 처치', performer: 'resident' },
    { id: 'yag', name: 'YAG', performer: 'resident', eyeSelect: true, checkMin: 60 },
    { id: 'inj', name: '주사', performer: 'prof', eyeSelect: true, checkMin: 30 },
  ],
}));
const m = { ucva: { od: '0.5', os: '0.6' }, nct: { od: '17', os: '18' } };
const base = (i, name, extra = {}) => ({
  id: String(6990000 + i * 79), name, date: today, doctor: '김선웅', reservation: `${String(9 + i).padStart(2, '0')}:00`, checkin: '08:40', late: false,
  assigned: { visionIop: true }, done: { visionIop: true }, doneAt: {}, drops: [], procedures: [], queueKey: 540 + i * 60 + 0.05, measureOk: 1, vaOk: 1, nctOk: 1, measure: m, ...extra,
});
const list = [
  base(0, '서준호', { seen: true, seenAt: min(20), procedures: [{ uid: 'y0', procId: 'yag', name: 'YAG', eye: 'OS', performer: 'resident', done: false, orderedAt: min(20) }] }), // 전공의 YAG 시행 전
  base(1, '신종희', { assigned: { visionIop: true, fag: true }, done: { visionIop: true } }), // FAG skin test 시작 전
  base(2, '조현우', { assigned: { visionIop: true, sch: true }, done: { visionIop: true } }), // 처치실 Schirmer
  base(3, '남궁하늘', { seen: true, seenAt: min(30), procedures: [{ uid: 'j3', procId: 'inj', name: '주사', eye: 'OD', performer: 'prof', done: false, orderedAt: min(30), performedAt: min(5), checkMin: 30 }] }), // 교수님 주사 시행 · 확인 대기
  base(4, '임수빈', { seen: true, seenAt: min(10), explainedEarly: true, procedures: [{ uid: 'r4', procId: 'p2', name: '전공의 처치', performer: 'resident', done: false, orderedAt: min(10) }] }), // 설명 먼저 + 처치 남음
  base(5, '장민호', { firstVisit: true, hxSheetAt: min(10) }), // 초진 검사 지정
];
await editKey('daily-patients', () => list);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1024 } });
const { errors, ok, W, pick, back } = tester(page);
ok(built.status === 0, '흐름 규칙 묶기');
const sec = (id) => page.locator(`#${id}`);
const has = async (id, name) => (await sec(id).count()) > 0 && (await sec(id).getByText(name, { exact: true }).count()) > 0;
await page.goto(`${BASE}/`); await W(900);
await pick('처치실'); await W(1500);
ok(await has('treat-check', '남궁하늘'), '교수님 처치(설명 대기에서 시행)도 시행 즉시 처치실 결과 확인에');
ok(await sec('treat-check').locator('[data-task-line="확인 대기"]').count() === 1 && await sec('treat-check').getByRole('button', { name: '지금 확인', exact: true }).count() === 1, "결과 확인: 시간 전이면 '확인 대기' 줄 + [지금 확인] (10-10: 상태 표와 같은 버튼 없음)");
const count0 = Number((await page.locator('[data-wait-count]').innerText()).match(/\d+/)[0]);
ok(count0 === 6, `'대기 N명'에 확인 대기도 셈 (${count0}: 결과 확인 1 · 처치 대기 2 · 검사 준비 1 · 진료 전 검사 1 · 검사 지정 1)`);
// 1) 전공의 YAG [처치 완료] → 처치 대기에서 빠지고 결과 확인 '확인까지 60분'
await sec('treat-procs').locator('[data-task-line="처치"]').filter({ hasText: 'YAG' }).getByRole('button', { name: '처치 완료', exact: true }).click(); await W(1500);
ok(!(await has('treat-procs', '서준호')) && await has('treat-check', '서준호'), 'YAG 시행 → 처치 대기에서 빠지고 결과 확인으로');
ok(/(59|60)분 남음/.test(await sec('treat-check').locator('.rounded-xl').filter({ hasText: '서준호' }).innerText()), "결과 확인 줄에 '60분 남음'");
// 2) FAG skin test [시작] → 결과 확인으로, [시작 취소] → 다시 검사 준비
await sec('treat-prep').locator('[data-task-line="검사 준비"]').getByRole('button', { name: '시작', exact: true }).click(); await W(1500);
ok(!(await has('treat-prep', '신종희')) && await has('treat-check', '신종희'), 'skin test 시작 → 검사 준비에서 빠지고 결과 확인으로');
const fagLine = sec('treat-check').locator('.rounded-xl').filter({ hasText: '신종희' });
ok(await fagLine.getByRole('button', { name: '지금 확인', exact: true }).count() === 1 && /20분 남음|19분 남음/.test(await fagLine.innerText()), "결과 확인: 'FAG skin test … 20분 남음' + [지금 확인]");
await fagLine.getByRole('button', { name: '시작 취소', exact: true }).click(); await W(1500);
ok(await has('treat-prep', '신종희') && !(await has('treat-check', '신종희')), '[시작 취소] → 다시 검사 준비 칸');
// 3) 처치실 시간 재기(Schirmer) 시작 → 진료 전 검사 칸에서 빠지고 결과 확인
await sec('treat-exams').locator('div.bg-white').filter({ hasText: '조현우' }).getByRole('button', { name: /^Schirmer$/ }).first().click(); await W(1500);
ok(!(await has('treat-exams', '조현우')) && await has('treat-check', '조현우'), 'Schirmer 시작 → 진료 전 검사에서 빠지고 결과 확인으로');
// 4) 자세히: 검사 지정 카드 → 시력·안압 표 펼침
await sec('treat-triage').locator('[data-detail-toggle]').first().click(); await W(400);
ok(await sec('treat-triage').locator('[data-card-detail] table').count() >= 1, "[자세히 ▾] → 오늘·이전 시력·안압 표 펼침 (진료실 진료 중 화면처럼)");
ok(await page.locator('[data-doctor-chip]').first().evaluate(e => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(e).backgroundColor !== 'rgb(255, 255, 255)'), '교수님 칸은 그 교수님 색으로 연하게');
await page.screenshot({ path: `${SP}/r106-treat.png`, fullPage: true });
// 저장값: 시행 기록만 (기존 형식 그대로)
const v = (await getKey('daily-patients')).value;
const yag = v.find(p => p.name === '서준호').procedures[0];
ok(!!yag.performedAt && yag.checkMin === 60 && !yag.done, 'YAG 기록은 예전 형식 그대로 (performedAt·checkMin, done 아님)');
// 5) 진료실 설명 대기: 교수님 처치 확인 대기 · 설명 먼저 환자 귀가 막힘
await back(); await pick('진료실'); await W(600);
await page.getByRole('button', { name: '김선웅', exact: true }).first().click().catch(() => {}); await W(1200);
const card = (n) => page.locator('#consult-explain .rounded-xl').filter({ has: page.getByText(n, { exact: true }) }).first();
ok(await card('남궁하늘').getByRole('button', { name: '지금 확인', exact: true }).count() === 1, "설명 대기: 교수님 처치 확인 대기 → [지금 확인]");
ok(await card('임수빈').getByRole('button', { name: '귀가', exact: true }).isDisabled() && !(await page.getByText('처치가 끝나면 귀가 처리할 수 있어요').count()), "설명 먼저 + 처치 남음 → 회색 [귀가]만 (설명 글 없음)");
ok(!(await page.getByText('설명 후 귀가').count()), "'설명 후 귀가' 글 없음 (버튼만)");
ok(await card('서준호').locator('[data-task-line="처치실"]').count() === 1, "처치실에서 확인 대기인 전공의 처치는 점선 '처치실' 줄");
await page.screenshot({ path: `${SP}/r106-explain.png`, fullPage: true });
// 6) 띵동: 결과 확인에 들어간 것만으로는 안 울리고, 시간이 됐을 때만
const S = (await getKey('settings')).value;
const yagP = { ...list[0], procedures: [{ ...list[0].procedures[0], performedAt: now, checkMin: 60 }] };
const keysNow = F.treatChimeKeys([yagP], S, now);
const keysLater = F.treatChimeKeys([yagP], S, now + 61 * 60000);
ok(!keysNow.some(k => k.startsWith('check:') || k.startsWith('pchk:')) && keysLater.some(k => k.startsWith('pchk:')), `띵동: 시행 직후 없음 → 60분 뒤 '확인' 시간에만 (${keysNow.join(',')} / ${keysLater.join(',')})`);
ok(F.treatWork([yagP], S).check.length === 1 && F.treatWork([yagP], S).procs.length === 0, '흐름 규칙: 시행한 처치는 결과 확인에만');
// 예전 기록(새 칸 없음)도 그대로: 시행 전 처치는 처치 대기
ok(F.treatWork([list[0]], S).procs.length === 1 && F.treatWork([list[0]], S).check.length === 0, '예전 기록: 시행 전 처치는 처치 대기');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
