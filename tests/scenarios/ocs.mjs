import { chromium, SP, getKey, editKey, tester, BASE } from '../lib.mjs';
// OCS 처방 도우미: 설정의 OCS 입력법, 서버 주소 /api/ocs/…(명단·환자·처방 완료), 검사실 [처방 전] → 처방 완료 반영
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick, back, cardOf } = tester(page);
const ocs = async (p, body) => (await fetch(`${BASE}/api/ocs/${p}`, body ? { method: 'POST', body } : undefined)).text();
const rows = (text, kind) => text.split('\n').filter(l => l.startsWith(`${kind}\t`)).map(l => l.split('\t'));

// 입력법: VF 양측·편측, OCT는 M,D OCT 양측 + OCTA 양측만, WFP 양측. GAT는 처방 없음.
await editKey('settings', s => ({
  ...s,
  tests: s.tests.map(t => ({
    ...t,
    ...(t.id === 'vf' ? { ocs: { main: { both: { text: 'Visual field test', down: 1 }, single: { text: 'Visual field test', down: 0 } } } } : {}),
    ...(t.id === 'oct' ? { ocs: { md: { both: { text: 'Optical Coherence', down: 2 } }, angio: { both: { text: 'OCT angio', down: 0 } } } } : {}),
    ...(t.id === 'wfp' ? { ocs: { main: { both: { text: 'Wide fundus', down: 0 } } } } : {}),
    ...(t.id === 'gat' ? { noOrder: true } : {}),
  })),
}));

const ping = await ocs('ping');
ok(/^OPHFLOW1 PONG/.test(ping) && /\npatients\t16\n/.test(ping), '연결 확인: 오늘 명단 16명');
const list = await ocs('list');
const ids = rows(list, 'patient').map(r => r[2]);
ok(ids[0] === '윤지아' && !ids.includes('조현우'), `명단: 예약 순, 이미 처방 완료(조현우)는 빠짐 (${ids.join(',')})`);
ok(rows(list, 'patient').find(r => r[2] === '임수빈')?.[5] === '1', '입력법 없는 IDRA는 직접 입력 1건');

const jia = await ocs('patient?id=6100259');
const orders = rows(jia, 'order').map(r => `${r[2]}|${r[3]}|${r[4]}|${r[5]}`);
ok(JSON.stringify(orders) === JSON.stringify(['VF 양측|Visual field test|1|vf', 'OCT 양측|Optical Coherence|2|oct']), `윤지아 처방 줄 (${orders.join(' / ')})`);
ok(/^OPHFLOW1 ERROR/.test(await ocs('patient?id=999')), '명단에 없는 환자는 오류');
ok(!rows(await ocs('patient?id=6100296'), 'order').some(r => r[5] === 'gat'), '처방 없음(GAT)은 넣지 않음');

// 편측: OCT Macular 우안 + OCTA 좌안 → OCTA 편측 입력법이 없으므로 OCT 검사 전체가 직접 입력
await editKey('daily-patients', l => l.map(p => (p.name === '장민호' ? { ...p, detail: { oct: { options: ['Macular', 'Angio'], note: '', eye: 'OU', eyes: { md: 'OD', angio: 'OS' } } } } : p)));
let min = await ocs('patient?id=6100296');
ok(!rows(min, 'order').some(r => r[5] === 'oct') && /OCT 편측\(우\) \+ OCTA 편측\(좌\)/.test(rows(min, 'manual')[0]?.[1] || ''), 'OCTA 편측 입력법이 없으면 OCT 전체를 직접 입력으로');

// 설정 화면: OCT [자세히] → M,D OCT / OCTA 칸, 편측 칸을 채우고 저장
await page.goto(`${BASE}/`); await W();
await pick('설정');
const octRow = page.locator('[data-test-row="OCT"]');
await octRow.getByRole('button', { name: /자세히/ }).click(); await W(200);
ok(await octRow.getByLabel('OCT 양측 검색어').inputValue() === 'Optical Coherence', '설정: 저장된 OCT 양측 검색어가 보임');
await octRow.getByLabel('OCTA 편측 검색어').fill('OCT angio');
await octRow.getByLabel('OCTA 편측 아래 화살표 횟수').fill('1');
await octRow.getByLabel('OCT 편측 검색어').fill('Optical Coherence');
await octRow.getByLabel('OCT 편측 아래 화살표 횟수').fill('3');
await octRow.screenshot({ path: `${SP}/ocs-settings.png` });
await page.getByRole('button', { name: '저장', exact: true }).click(); await W(800);
const st = (await getKey('settings')).value.tests.find(t => t.id === 'oct').ocs;
ok(st?.angio?.single?.text === 'OCT angio' && st.angio.single.down === 1 && st.md.single.down === 3, '설정 저장: OCTA·OCT 편측');
ok(await page.locator('[data-test-row="GAT"]').getByText('OCS 처방 입력법').count() === 0, '처방 없음 검사에는 입력칸 없음');
min = await ocs('patient?id=6100296');
ok(JSON.stringify(rows(min, 'order').map(r => r[2])) === JSON.stringify(['OCT 편측(우)', 'OCTA 편측(좌)', 'WFP 양측']), `편측 입력법을 채우면 OCT·OCTA 따로 (${rows(min, 'order').map(r => r[2])})`);
await back();

// 도우미가 넣은 뒤 처방 완료 표시 → 31번방 카드가 바로 '처방 완료'
await pick('31번방'); await W(800);
ok(await cardOf('윤지아').getByRole('button', { name: '처방 전' }).count() === 1, '넣기 전: 윤지아 처방 전');
const done = await ocs('done', 'id=6100259\ntests=vf,oct');
ok(/\ncount\t2\n/.test(done), '처방 완료 표시 2건');
await W(2500);
ok(await cardOf('윤지아').getByText('처방 완료').count() >= 1, '검사실 화면에 처방 완료로 바뀜');
const saved = (await getKey('daily-patients')).value.find(p => p.name === '윤지아').orders;
ok(JSON.stringify(saved?.all?.tests) === JSON.stringify(['vf', 'oct']), '기록은 [처방 전] 버튼과 같은 orders');
ok(/\ncount\t0\n/.test(await ocs('done', 'id=6100259\ntests=vf')), '이미 처방 완료면 다시 표시하지 않음');
ok(rows(await ocs('patient?id=6100259'), 'order').length === 0, '처방 완료 뒤에는 넣을 처방 없음');
await page.screenshot({ path: `${SP}/ocs-room.png` });

// 진료실에서 검사를 새로 지정하면(처방 완료 표시 지움) 다시 도우미 대상
await editKey('daily-patients', l => l.map(p => (p.name === '윤지아' ? { ...p, orders: { all: { ...p.orders.all, tests: ['oct'] } } } : p)));
ok(JSON.stringify(rows(await ocs('patient?id=6100259'), 'order').map(r => r[5])) === JSON.stringify(['vf']), '처방 완료가 풀린 검사만 다시 넣음');

// 메인 화면에서 날짜를 직접 정하면 그 날짜 기준
await editKey('today-override', () => ({ date: '2020-01-01', setOn: new Date().toLocaleDateString('sv-SE') }));
ok(/\ntoday\t2020-01-01\n/.test(await ocs('ping')) && /^OPHFLOW1 ERROR/.test(await ocs('patient?id=6100259')), '직접 정한 날짜를 오늘로 씀');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
