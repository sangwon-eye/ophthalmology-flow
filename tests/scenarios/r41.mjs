import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// 처치실 위쪽 요약 줄(묶음별 인원 · 검사별 인원 · 흐린 0명 칩 · 누르면 이동)과 오래 그대로인 환자 강조
await editKey('settings', s => {
  const rooms = s.rooms.some(r => r.builtin === 'treat') ? s.rooms : [...s.rooms, { id: 'treat', name: '처치실', patientName: '처치실', showPriority: false, builtin: 'treat' }];
  return { ...s, rooms, tests: [...s.tests,
    { id: 'sch', name: 'Schirmer', short: 'Schirmer', roomId: 'treat', order: 2, options: [], popupOnClick: false, machine: '', timed: true, prepWaitMin: 5, withExams: true, noOrder: true }] };
});
const ago = Date.now() - 30 * 60000;
await editKey('daily-patients', list => list.map(p => (p.name === '임수빈' ? { ...p, assigned: { ...p.assigned, sch: true } }
  : p.name === '황도윤' ? { ...p, checkin: '00:01', seenAt: ago } : p)));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 700 } });
const { errors, ok, W, pick, cardOf } = tester(page);
await page.goto(`${BASE}/`); await W();
await pick('처치실');
const bar = page.getByLabel('처치실 할 일 요약');
const chip = (id) => bar.locator(`[data-summary="${id}"]`);
ok(await bar.count() === 1, '요약 줄이 보임');
ok(/처치 대기 2/.test(await chip('treat-procs').innerText()), '처치 대기 2명');
ok(/20분↑ 1/.test(await chip('treat-procs').innerText()), '처치 대기 칩에 20분↑ 1');
ok(/진료 전 검사 1/.test(await chip('treat-exams').innerText()) && /Schirmer 1/.test(await chip('treat-exams').innerText()), '진료 전 검사 칩에 Schirmer 1');
ok(await chip('treat-check').isDisabled() && await chip('treat-check').count() === 1, '0명 묶음(확인할 검사)은 흐리게 표시');
ok(/\d+분째 그대로/.test(await cardOf('황도윤').innerText()), '오래 그대로인 환자 카드에 "N분째 그대로"');
ok(!/분째 그대로/.test(await cardOf('송하린').innerText()), '최근 진행한 환자는 강조 없음');
await page.screenshot({ path: `${SP}/r41-top.png` });
// 누르면 그 묶음으로 이동 (요약 줄은 계속 위에 붙어 있음)
await chip('treat-procs').click(); await W(1000);
const [top, sy] = await page.locator('#treat-procs').evaluate(el => [el.getBoundingClientRect().top, window.scrollY]);
ok(sy > 0 && top >= 100 && top < 600, `처치 대기 묶음으로 이동 (top ${Math.round(top)}, scroll ${Math.round(sy)})`);
ok(await bar.isVisible(), '스크롤해도 요약 줄이 보임');
await page.screenshot({ path: `${SP}/r41-jump.png` });
// 설정: 강조 시간 기본 20분, 0분이면 끔
await page.getByRole('button', { name: '메인 화면' }).click(); await W(300);
await pick('설정');
await page.getByRole('button', { name: /^기타/ }).first().click(); await W(300);
const inp = page.getByLabel('처치실 강조 시간');
ok(await inp.inputValue() === '20', '설정 기본 20분');
await inp.fill('0');
await page.getByRole('button', { name: '저장', exact: true }).first().click(); await W(1000);
ok((await getKey('settings')).value.treatStaleMin === 0, '0분 저장');
await page.getByRole('button', { name: '메인 화면' }).click(); await W(300);
await pick('처치실');
ok(!/분째 그대로/.test(await cardOf('황도윤').innerText()) && !/분↑/.test(await bar.innerText()), '0분이면 강조 없음');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
