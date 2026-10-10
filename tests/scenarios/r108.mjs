import { chromium, SP, editKey, tester, BASE } from '../lib.mjs';
// 불필요한 중복·줄 넘김 없음 (10-10 사용자: '중복이 하나도 없어야 한다는 게 아니라 불필요한 중복을 없애라').
// 처치실·진료실(설명 대기) 바쁜 상황, 할 일 줄마다:
//  ① 작은 글씨가 왼쪽 표의 말을 되풀이하지 않음 (예전: 표 '처치실' + '처치실에서 진행 중', 표 '시간 됨' + '· 시간 됨', 표 '확인 대기' + '확인까지 20분')
//  ② 상태 표(확인 대기·시간 됨)와 같은 글자의 버튼 없음 (예전: 표 '확인 대기' + [확인 대기])
//  ③ 같은 줄에 같은 글자의 버튼 두 개 없음  ④ 한 줄이 두 줄로 넘어가지 않음
// 정보를 주는 겹침은 그대로 둠 (예: 표 '검사 지정' + [검사 지정], 표 '처치' + [처치 완료] — 왼쪽 할 일 목록 + 오른쪽 버튼 구조, 사용자 선택). 화면 폭 1280·960. 이름은 모두 가상
const today = new Date().toLocaleDateString('sv-SE');
const now = Date.now();
const min = (m) => now - m * 60000;
await editKey('settings', s => ({
  ...s,
  tests: [...s.tests.filter(t => !['sch', 'mmp'].includes(t.id)).map(t => (t.id === 'fag' ? { ...t, prepOn: true, prepName: 'skin test', prepWaitMin: 20, consent: true } : t)),
    { id: 'sch', name: 'Schirmer', short: 'Schirmer', roomId: 'treat', order: 30, options: [], popupOnClick: false, machine: '', timed: true, prepWaitMin: 5, withExams: true },
    { id: 'mmp', name: 'MMP', short: 'MMP', roomId: 'treat', order: 31, options: [], popupOnClick: false, machine: '', timed: true, prepMode: 'go', prepWaitMin: 10, withExams: true },
    // 진료실에서 하는 검사 준비 (10-10: 동의서는 처치실, skin test는 진료실)
    { id: 'icg', name: 'ICG', short: 'ICG', roomId: 'B', order: 32, options: [], popupOnClick: false, machine: '', prepOn: true, prepName: 'skin test', prepWaitMin: 20, consent: true, prepAtConsult: true }],
  procedures: [
    { id: 'man', name: '만니톨', performer: 'prof', checkMin: 30 },
    { id: 'yag', name: 'YAG', performer: 'resident', eyeSelect: true, checkMin: 60, consent: true },
    { id: 'prp', name: 'PRP', performer: 'resident', eyeSelect: true, dilate: true, consent: true },
    { id: 'inj', name: '주사', performer: 'prof', eyeSelect: true, consent: true },
    { id: 'p2', name: '봉합사 제거', performer: 'resident' },
  ],
}));
const m = { ucva: { od: '0.4', os: '0.7' }, bcva: { od: '0.8', os: '0.9' }, nct: { od: '17', os: '18' } };
const base = (i, name, doctor, extra = {}) => ({
  id: String(6500000 + i * 97), name, date: today, doctor, reservation: `${String(9 + Math.floor(i / 3)).padStart(2, '0')}:${String((i % 3) * 20).padStart(2, '0')}`,
  checkin: '08:40', late: false, assigned: { visionIop: true }, done: { visionIop: true }, doneAt: { visionIop: min(30) }, drops: [], procedures: [],
  queueKey: 540 + i * 20 + 0.05, measureOk: 1, vaOk: 1, nctOk: 1, measure: m, sex: i % 2 ? 'F' : 'M', age: 50 + i * 2, ...extra,
});
const seenX = (ago) => ({ seen: true, seenAt: min(ago), consultDoneAt: min(ago), assigned: { visionIop: true, oct: true }, done: { visionIop: true, oct: true } });
const pr = (uid, id, name, performer, extra = {}) => ({ uid, procId: id, name, performer, done: false, orderedAt: min(20), ...extra });
const list = [
  base(0, '서준호', '김선웅', { firstVisit: true, hxSheetAt: min(30) }),
  base(1, '신종희', '나상훈', { primaryKey: 'x', primaryDoctor: '김선웅', addOnCheck: true, assigned: { visionIop: true, oct: true }, done: { visionIop: true, oct: true } }),
  base(2, '조현우', '이종혁', { assigned: { visionIop: true, oct: true, wfp: true }, treatRequest: { at: min(3), from: '31번방', roomId: 'B', note: '안압 OD 32, 만니톨?' } }),
  base(3, '남궁하늘', '김선웅', { assigned: { visionIop: true, oct: true }, done: { visionIop: true, oct: true }, consultHold: true, treatRequest: { at: min(5), from: '김선웅' }, sendNote: { text: 'GAT 다시, 산동 여부', from: '김선웅', at: min(5) } }),
  base(4, '임수빈', '나상훈', { assigned: { visionIop: true, fag: true, oct: true }, done: { visionIop: true, oct: true } }),
  base(5, '장민호', '이종혁', { assigned: { visionIop: true, fag: true }, prep: { fag: { startedAt: min(8), name: 'FAG' } }, consent: { fag: min(9) } }),
  base(6, '최민지', '김선웅', { preProcs: [{ uid: 'pp6', procId: 'prp', name: 'PRP', eye: 'OD', dilate: true, done: false }], dilateOverride: true }),
  base(7, '이솔', '나상훈', { preProcs: [{ uid: 'pp7', procId: 'man', name: '만니톨', done: false, performedAt: min(10), checkMin: 30, fromRequest: '31번방' }] }),
  base(8, '한지훈', '이종혁', { ...seenX(35), procedures: [pr('r8', 'yag', 'YAG', 'resident', { eye: 'OS' }), pr('f8', 'inj', '주사', 'prof', { eye: 'OD' })] }),
  base(9, '오세영', '김선웅', { ...seenX(15), explainedEarly: true, procedures: [pr('r9', 'p2', '봉합사 제거', 'resident')] }),
  base(10, '권나은', '나상훈', { ...seenX(90), procedures: [pr('r10', 'yag', 'YAG', 'resident', { eye: 'OD', performedAt: min(70), checkMin: 60, consentAt: min(80) })] }),
  base(11, '박영수', '김선웅', { ...seenX(40), procedures: [pr('m11', 'man', '만니톨', 'prof', { performedAt: min(12), checkMin: 30 })] }),
  base(12, '황도윤', '김선웅', { ...seenX(20), procedures: [pr('i12', 'inj', '주사', 'prof', { eye: 'OD' })] }),
  base(13, '송하린', '김선웅', { ...seenX(30), procedures: [pr('m13', 'man', '만니톨', 'prof', { performedAt: min(35), checkMin: 30 })] }),
  base(14, '윤지아', '김선웅', { ...seenX(10) }),
  base(15, '정대현', '이종혁', { assigned: { visionIop: true, sch: true, oct: true }, done: { visionIop: true, oct: true }, prep: { sch: { startedAt: min(3), name: 'Schirmer' } } }),
  base(16, '강서윤', '김선웅', { assigned: { visionIop: true, mmp: true, oct: true }, done: { visionIop: true, oct: true, mmp: true }, prep: { mmp: { startedAt: min(12), go: true, name: 'MMP' } } }),
  base(17, '문가람', '김선웅', { ...seenX(5), assigned: { visionIop: true, oct: true, wfp: true }, done: { visionIop: true, oct: true }, postTests: ['wfp'] }),
  // 교수님 담당 진료 전 처치(진료실 '진료 전 처치' 칸, 10-10) + 같은 환자의 전공의 진료 전 처치(처치실, 진료실에는 점선)
  base(18, '배하늘', '김선웅', { assigned: { visionIop: true, oct: true }, preProcs: [{ uid: 'pm18', procId: 'man', name: '만니톨', performer: 'prof', done: false, fromRequest: '31번방' }, { uid: 'pr18', procId: 'prp', name: 'PRP', performer: 'resident', eye: 'OD', done: false }] }),
  base(19, '임서준', '김선웅', { preProcs: [{ uid: 'pm19', procId: 'man', name: '만니톨', performer: 'prof', done: false, performedAt: min(31), checkMin: 30 }] }),
  base(20, '하윤서', '김선웅', { assigned: { visionIop: true, icg: true, oct: true } }), // 동의서 전 (처치실 '동의서' 줄, 진료실 점선)
  base(21, '구민재', '김선웅', { assigned: { visionIop: true, icg: true }, consent: { icg: min(4) } }), // 진료실 [시작]
  base(22, '채다인', '김선웅', { assigned: { visionIop: true, icg: true }, consent: { icg: min(30) }, prep: { icg: { startedAt: min(25), name: 'ICG' } } }), // 진료실 시간 됨
];
await editKey('daily-patients', () => list);
const browser = await chromium.launch();
const audit = (page, where) => page.evaluate((where) => {
  const out = [];
  document.querySelectorAll('[data-task-line]').forEach(line => {
    const card = line.closest('div.bg-white, div.rounded-xl');
    const who = card?.querySelector('.t-name')?.textContent?.trim() || '';
    const vis = (e) => e && e.offsetParent !== null;
    const kids = [...line.children];
    const tagEl = kids[0]?.tagName === 'SPAN' && !kids[0].querySelector('button') && kids.length > 1 ? kids[0] : null;
    const tag = vis(tagEl) ? tagEl.textContent.trim() : '';
    const smallEl = [...line.querySelectorAll(':scope > span > span')].find(vis);
    const small = smallEl ? smallEl.textContent.trim() : '';
    const btns = [...line.querySelectorAll('button')].filter(vis).map(e => e.textContent.trim());
    const parts = [tag, small, ...btns].filter(Boolean);
    const dup = [];
    const tagWords = tag.split(/[\s·]+/).filter(w => w.length >= 2);
    tagWords.forEach(w => { if (small.includes(w)) dup.push(`작은 글씨가 표 '${tag}'를 되풀이`); });
    if (['확인 대기', '시간 됨', '대기', '결과 확인'].includes(tag) && btns.includes(tag)) dup.push(`상태 표와 같은 버튼 [${tag}]`);
    btns.forEach((t, i) => { if (btns.indexOf(t) !== i) dup.push(`같은 버튼 두 개 [${t}]`); });
    // 줄 넘김: 표·할 일·버튼 묶음이 서로 다른 줄(세로로 겹치지 않음)에 있으면
    const boxes = kids.map(c => c.getBoundingClientRect()).filter(r => r.height > 0);
    const wrapped = boxes.some(x => boxes.some(y => x.bottom <= y.top + 2));
    if (dup.length || wrapped) out.push(`${where} ${who} [${line.getAttribute('data-task-line')}] ${[...new Set(dup)].join(', ')}${wrapped ? ' 줄 넘김' : ''}: ${parts.join(' / ')}`);
  });
  return out;
}, where);
for (const [w, h] of [[1280, 1000], [960, 900]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const { errors, ok, W, pick, back } = tester(page);
  await page.goto(`${BASE}/`); await W(900);
  await pick('처치실'); await W(1800);
  const t = await audit(page, `처치실 ${w}`);
  ok(t.length === 0, `처치실 ${w}: 할 일 줄에 같은 말 두 번·줄 넘김 없음${t.length ? `\n      ${t.join('\n      ')}` : ''}`);
  await back(); await pick('진료실'); await W(600);
  await page.getByRole('button', { name: '김선웅', exact: true }).first().click(); await W(1500);
  const c = await audit(page, `진료실 ${w}`);
  ok(c.length === 0, `진료실 설명 대기·진료 전 처치 ${w}: 같은 말 두 번·줄 넘김 없음${c.length ? `\n      ${c.join('\n      ')}` : ''}`);
  ok(errors.length === 0, `${w}: 페이지 오류 없음 ${errors.join(' / ')}`);
  await page.close();
}
await browser.close();
