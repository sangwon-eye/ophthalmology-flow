import { chromium, SP, editKey, tester, BASE } from '../lib.mjs';
// 환자용 진료실 명단 다듬기 (10-08 사용자, 이름은 모두 가상)
// ① '재진료'는 칸 위 오른쪽 모서리 표 (줄 안 자리를 차지하지 않아 줄바꿈 없음, 위 칸에 닿지 않음)
// ② 줄마다 '예약' 글자 없음 → 명단 아래 한 줄 '이름 앞 시각은 예약 시간입니다'
// ③ 이름은 늘 예약시간 옆 같은 줄 ④ 예약시간·이름·번호 뒷 4자리는 같은 글자 바닥선(baseline)
// ⑤ 번호 뒷 4자리는 이름보다 작게 ⑥ 복도 끝·통합: 'OOO 교수님' ⑦ 복도 끝·통합: 진료 중 줄은 회색
const today = new Date().toLocaleDateString('sv-SE');
const names = ['서준호', '남궁하늘', '최민지', '오세영', '송하린', '강서윤', '제갈민준', '이솔', '한지훈'];
const list = names.map((name, i) => {
  const resMin = 540 + i * 10;
  const reservation = `${String(Math.floor(resMin / 60)).padStart(2, '0')}:${String(resMin % 60).padStart(2, '0')}`;
  const base = { id: String(6400000 + i * 41), name, date: today, doctor: '김선웅', reservation, checkin: '08:30', late: false, assigned: { visionIop: true, oct: true }, done: { visionIop: true, oct: true }, doneAt: {}, drops: [], procedures: [], queueKey: resMin + 0.051, measureOk: 1 };
  if (i === 0) return { ...base, calledRoom: '김선웅' };
  if (i === 1 || i === 3 || i === 6) return { ...base, consultHold: true }; // 재진료 (다음 순서·3번·긴 이름)
  if (i === 7) return { ...base, late: true, checkin: '10:20', queueKey: resMin + 60.062 }; // 지각 (시간 없음)
  return base;
});
await editKey('daily-patients', () => list);
await editKey('doctor-prefs', () => ({ 김선웅: { roomNo: '3' } }));
const browser = await chromium.launch();
const { ok } = tester(await browser.newPage());
const check = async (page, label) => page.evaluate(() => {
  const out = { probs: [], rows: 0, tags: 0 };
  const probe = (el) => { const s = document.createElement('span'); s.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'; el.appendChild(s); const y = s.getBoundingClientRect().bottom; s.remove(); return y; };
  document.querySelectorAll('[data-resv]').forEach(t => {
    const nameBox = t.nextElementSibling; // 이름 + 번호 뒷 4자리
    const nm = nameBox?.querySelector('span.whitespace-nowrap'); const tail = nameBox?.querySelector('span.tabular-nums');
    if (!nm) return;
    out.rows++;
    const row = t.closest('[data-consult-row]') || t.closest('.rounded-2xl');
    if (/예약/.test(row.innerText)) out.probs.push(`줄에 '예약' 글자: ${nm.textContent}`);
    const tb = t.getBoundingClientRect(); const nb = nm.getBoundingClientRect();
    if (t.textContent && (nb.top >= tb.bottom || nb.bottom <= tb.top)) out.probs.push(`이름이 예약시간과 다른 줄: ${nm.textContent}`);
    if (t.textContent) {
      const bt = probe(t), bn = probe(nm), bl = tail ? probe(tail) : bt;
      if (Math.abs(bt - bn) > 1 || (tail && tail.getBoundingClientRect().top < nb.bottom && Math.abs(bt - bl) > 1)) out.probs.push(`바닥선 어긋남 ${nm.textContent}: 시간 ${bt.toFixed(1)} 이름 ${bn.toFixed(1)} 번호 ${bl.toFixed(1)}`);
    }
    if (tail && parseFloat(getComputedStyle(tail).fontSize) >= parseFloat(getComputedStyle(nm).fontSize)) out.probs.push(`번호 뒷 4자리가 이름보다 작지 않음: ${nm.textContent}`);
  });
  const rows = [...document.querySelectorAll('[data-consult-row], .rounded-2xl.border-2')];
  document.querySelectorAll('[data-reconsult]').forEach(tag => {
    out.tags++;
    if (getComputedStyle(tag.parentElement).position !== 'absolute') out.probs.push('재진료 표가 줄 안에 있음');
    const r = tag.getBoundingClientRect(); const own = tag.closest('[data-consult-row], .rounded-2xl');
    rows.filter(x => x !== own).forEach(x => { const b = x.getBoundingClientRect(); if (r.left < b.right && r.right > b.left && r.top < b.bottom - 0.5 && r.bottom > b.top + 0.5) out.probs.push(`재진료 표가 다른 칸에 겹침 (${own?.innerText.split('\n')[0]})`); });
  });
  // 같은 목록(같은 grid) 안의 칸 높이는 모두 같음
  new Set(rows.map(x => x.parentElement)).forEach(g => {
    const hs = [...g.children].filter(x => rows.includes(x)).map(x => Math.round(x.getBoundingClientRect().height));
    if (hs.length > 1 && Math.max(...hs) - Math.min(...hs) > 1 && g.classList.contains('grid')) out.probs.push(`칸 높이가 다름 (${hs.join(', ')})`);
  });
  out.legend = /이름 앞 시각은 예약 시간입니다/.test(document.body.innerText);
  out.over = [...document.querySelectorAll('[data-consult-row], .rounded-2xl.border-2')].filter(e => e.scrollWidth > e.clientWidth + 1).length;
  return out;
});
const screens = [
  [/^김선웅 진료실/, '진료실 앞', [[1366, 768, 1], [1093, 614, 1.25], [911, 512, 1.5]]],
  [/^진료실 대기 명단 \(전체\)\s*교수님별/, '복도 끝', [[1920, 1080, 1], [1366, 768, 1], [1093, 614, 1.25]]],
  [/^통합 화면/, '통합', [[1920, 1080, 1]]],
];
for (const [btn, label, sizes] of screens) {
  for (const [w, h, s] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: s });
    await page.addInitScript(() => { try { localStorage.removeItem('oph-role'); } catch { /* 없음 */ } });
    await page.goto(`${BASE}/`); await page.waitForTimeout(600);
    await page.getByRole('button', { name: /^환자용 화면/ }).click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: btn }).first().click(); await page.waitForTimeout(1500);
    const r = await check(page, label);
    const tag = `${label} ${w}×${h} ${Math.round(s * 100)}%`;
    // 진료실 앞 모니터는 작은 화면에서 넘치는 환자를 '외 N명 대기' 칸으로 묶음 (10-09 B안, r104)
    ok(r.rows >= (label === '진료실 앞' ? 3 : 5) && r.tags >= 1 && r.probs.length === 0, `${tag}: 줄바꿈·높이·모서리 표 (${r.rows}줄, 재진료 ${r.tags}) ${r.probs.slice(0, 3).join(' / ')}`);
    ok(r.legend && r.over === 0, `${tag}: '이름 앞 시각은 예약 시간입니다' 한 줄, 넘침 없음`);
    if (label !== '진료실 앞') {
      ok(await page.getByText('김선웅 교수님', { exact: true }).count() >= 1, `${tag}: 교수님 이름 'OOO 교수님'`);
      ok(/bg-slate-800/.test(await page.locator('[data-in-room]').first().getAttribute('class')), `${tag}: 진료 중 줄은 회색 (진료실 앞 모니터와 같게)`);
    }
    if (w === 1093 || (w === 1920 && label === '복도 끝')) await page.screenshot({ path: `${SP}/r102-${label === '진료실 앞' ? 'front' : label === '복도 끝' ? 'hall' : 'combined'}-${w}.png` });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    ok(errs.length === 0, `${tag}: 페이지 오류 없음`);
    await page.close();
  }
}
await browser.close();
