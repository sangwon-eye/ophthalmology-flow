import { execSync } from 'child_process';
import { chromium, SP, DATA, BASE, FIXTURES } from '../lib.mjs';

const URL = `${BASE}/`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) process.exitCode = 1; };
const shot = (name, full = true) => page.screenshot({ path: `${SP}/${name}.png`, fullPage: full });
const back = async () => { await page.getByRole('button', { name: '메인 화면' }).click(); };
const tile = async (label) => { await page.getByRole('button', { name: new RegExp(`^${label}`) }).first().click(); await page.waitForTimeout(400); };

await page.goto(URL);
await page.waitForSelector('text=이 컴퓨터의 화면을 선택하세요');

/* ---------- 31번방 ---------- */
await tile('31번방');
const headerH = await page.evaluate(() => document.querySelector('.sticky.top-0').getBoundingClientRect().height);
ok(headerH <= 60, `제목줄 높이 ${headerH.toFixed(0)}px (이전 79px)`);
const chipTexts = await page.locator('button.rounded-full').allInnerTexts();
console.log('     장비 칩:', chipTexts.filter(t => /명|전체/.test(t)).join(' | '));
ok(chipTexts.some(t => /^FAG 0명/.test(t)), '대기 0명 장비(FAG)도 목록에 보임');
ok(chipTexts.some(t => /^연구 0명/.test(t)), '대기 0명 장비(연구)도 목록에 보임');
const chipRows = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button.rounded-full')].filter(b => /명$|^전체/.test(b.innerText.trim()));
  return new Set(btns.map(b => Math.round(b.getBoundingClientRect().top))).size;
});
const sortBox = await page.getByRole('button', { name: '예약시간순' }).boundingBox();
const firstChip = await page.getByRole('button', { name: /^전체/ }).boundingBox();
ok(chipRows <= 2, `장비 칩 ${chipRows}줄`);
ok(Math.abs(sortBox.y - firstChip.y) < 12, '정렬 버튼이 칩 첫 줄 오른쪽');
await shot('r2-room31');

// 0명 장비를 골라도 목록이 남는지
await page.getByRole('button', { name: /^FAG 0명/ }).click();
await page.waitForTimeout(200);
ok(await page.getByRole('button', { name: /^FAG 0명/ }).count() === 1, 'FAG 선택 후에도 칩 유지');
ok(await page.getByText('대기 중인 환자가 없습니다').count() === 1, 'FAG 선택 시 빈 목록 안내');
ok(await page.getByRole('button', { name: /^VF 1명/ }).count() === 1, '다른 장비 칩(VF)도 그대로');
await shot('r2-room31-fag', false);
await page.getByRole('button', { name: /^전체/ }).click();
await page.waitForTimeout(200);

// [검사 변경] 펼침: 산동이 칩 줄 끝, 접기가 맨 아래
await page.getByText('윤지아').first().scrollIntoViewIfNeeded();
const yoonCard = page.locator('div.bg-white').filter({ has: page.getByText('윤지아', { exact: true }) }).last();
await yoonCard.getByRole('button', { name: '검사 변경' }).click();
await page.waitForTimeout(200);
const fold = yoonCard.getByRole('button', { name: '접기' });
const dil = yoonCard.getByRole('button', { name: /^산동/ }).first();
const fb = await fold.boundingBox(); const db = await dil.boundingBox();
ok(fb && db && fb.y > db.y + db.height - 1, `접기(y ${fb?.y.toFixed(0)})가 산동(y ${db?.y.toFixed(0)})보다 아래`);
await yoonCard.screenshot({ path: `${SP}/r2-picker-open.png` });
await fold.click();
await page.waitForTimeout(200);
ok(await yoonCard.getByRole('button', { name: '접기' }).count() === 0, '접기 누르면 닫힘');

// VF 시작 → 한 칸 → 종료
const vfStart = yoonCard.getByRole('button', { name: '▶ 시작' });
ok(await vfStart.count() === 1, 'VF 칸 안에 ▶ 시작');
await vfStart.click();
await page.waitForTimeout(300);
ok(await yoonCard.getByText(/VF 검사 중/).count() === 1, 'VF 검사 중 표시');
ok(await page.getByText('다른 장비 호출 금지').count() === 0, '노란 VF 안내 줄 없음');
await yoonCard.screenshot({ path: `${SP}/r2-vf-running.png` });
await yoonCard.getByRole('button', { name: '시작 취소' }).click();
await page.waitForTimeout(300);
ok(await yoonCard.getByRole('button', { name: '▶ 시작' }).count() === 1, 'VF 시작 취소 → 원래대로');
await back();

/* ---------- 시력실 ---------- */
await tile('시력');
await shot('r2-vision');
const cancelBtn = page.getByRole('button', { name: '접수 취소' }).first();
const cls = await cancelBtn.getAttribute('class');
ok(/text-xs/.test(cls) && /ml-auto/.test(cls), '접수 취소는 작은 글씨로 줄 끝');
await back();

/* ---------- 진료실 (김선웅) ---------- */
await tile('진료실');
await page.getByRole('button', { name: '김선웅', exact: true }).first().click();
await page.waitForTimeout(400);
await shot('r2-consult-kim');
const song = page.locator('div.bg-white').filter({ has: page.getByText('송하린', { exact: true }) }).last();
ok(await song.locator('[data-task-line="처치실"]').count() === 1, "처치실에서 진행 중인 처치는 점선 '처치실' 줄 (10-10: 처치 중 배지 대신)");
const undoCls = await song.getByRole('button', { name: '진료 완료 취소' }).getAttribute('class');
ok(/text-xs/.test(undoCls), '진료 완료 취소는 작은 글씨');
await song.screenshot({ path: `${SP}/r2-explain-card.png` });

// 설명 완료 창 2열
await song.getByRole('button', { name: '설명 완료', exact: true }).click();
await page.waitForTimeout(300);
const modal = page.locator('.fixed.inset-0').last();
const grid = modal.locator('div.grid.grid-cols-2').first();
ok(await grid.count() === 1, '설명 완료 창 검사 목록이 2열');
const cells = grid.locator(':scope > div');
const n = await cells.count();
const b0 = await cells.nth(0).boundingBox(); const b1 = await cells.nth(1).boundingBox();
ok(n >= 2 && Math.abs(b0.y - b1.y) < 2 && b1.x > b0.x, `첫 두 칸이 같은 줄 (${n}칸)`);
const mh = await modal.locator('div.bg-white').first().boundingBox();
console.log(`     설명 완료 창 높이 ${mh.height.toFixed(0)}px`);
await modal.locator('div.bg-white').first().screenshot({ path: `${SP}/r2-explain-modal.png` });
// OCT(옵션 창 있는 검사) 체크 → 그 칸만 한 줄 전체
const octCell = cells.filter({ hasText: /^OCT/ }).first();
await octCell.locator('input[type=checkbox]').check();
await page.waitForTimeout(200);
const oc = await octCell.boundingBox();
ok(oc.width > b0.width * 1.8, `OCT 세부 입력이 열린 칸은 넓게 (${oc.width.toFixed(0)}px)`);
await modal.locator('div.bg-white').first().screenshot({ path: `${SP}/r2-explain-modal-oct.png` });
await modal.getByRole('button', { name: '취소', exact: true }).click();
await page.waitForTimeout(200);

// 진료 완료 취소는 여전히 동작
await song.getByRole('button', { name: '진료 완료 취소' }).click();
await page.waitForTimeout(400);
ok(await page.getByText(/송하린 진료 완료 취소/).count() >= 1, '진료 완료 취소 동작 (알림 표시)');
await page.getByRole('button', { name: '되돌리기' }).first().click().catch(() => {});
await page.waitForTimeout(400);
await back();

/* ---------- 진료실 (이종혁) 추가 검사 창 ---------- */
await tile('진료실');
await page.getByRole('button', { name: '이종혁', exact: true }).first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: '추가 검사', exact: true }).click();
await page.waitForTimeout(300);
const xm = page.locator('.fixed.inset-0').last();
const xg = xm.locator('div.grid.grid-cols-2').first();
const fagCell = xg.locator(':scope > div').filter({ hasText: /^FAG/ }).first();
const before = await fagCell.boundingBox();
await fagCell.locator('input[type=checkbox]').check();
await page.waitForTimeout(200);
const after = await fagCell.boundingBox();
ok(Math.abs(after.width - before.width) < 2, `체크해도 칸 너비 그대로 (${before.width.toFixed(0)}→${after.width.toFixed(0)}px)`);
ok(await fagCell.getByRole('button', { name: '단안·프로토콜 지정' }).count() === 1, '체크하면 칸 안에 단안·프로토콜 지정');
await fagCell.getByRole('button', { name: '단안·프로토콜 지정' }).click();
await page.waitForTimeout(200);
const opened = await fagCell.boundingBox();
ok(opened.width > before.width * 1.8, '단안·프로토콜 지정을 누르면 그 칸만 넓게');
await xm.locator('div.bg-white').first().screenshot({ path: `${SP}/r2-extra-modal.png` });
await xm.getByRole('button', { name: '취소', exact: true }).click();
await page.waitForTimeout(200);
await back();

/* ---------- 처치실 ---------- */
await tile('처치실');
await shot('r2-procedure');
const kwon = page.locator('div.bg-white').filter({ has: page.getByText('황도윤', { exact: true }) }).last();
const doneBtn = kwon.getByRole('button', { name: '처치 완료' });
const listItem = kwon.getByText('전공의 처치').first();
const d1 = await doneBtn.boundingBox(); const l1 = await listItem.boundingBox();
ok(d1 && l1 && Math.abs((d1.y + d1.height / 2) - (l1.y + l1.height / 2)) < 16, '처치 완료 버튼이 처치 이름 줄 끝');
ok(await page.getByText(/없습니다/).count() === 0, '처치실 빈 구역 안내 줄 없음');
// 처치실 검사 지정 창(같은 2열 창)
await back();

/* ---------- 관리자 ---------- */
await tile('관리자');
await shot('r2-admin', false);
await back();

console.log(errors.length ? `오류:\n${errors.join('\n')}` : '페이지 오류 없음');
ok(errors.length === 0, '페이지 오류 없음');
await browser.close();
