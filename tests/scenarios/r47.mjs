import { chromium, BASE, editKey, tester } from '../lib.mjs';
// QR 접수: 노란 안내 문구가 있으면 8초, 없으면 5초 보여줌
await editKey('daily-patients', list => list.map(p => (p.name === '신종희' ? { ...p, kioskNote: '5번 진료실 앞으로 오세요' } : p)));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const { errors, ok, W, pick } = tester(page);
const scan = async (code) => { await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press('Enter'); };
await page.goto(`${BASE}/`); await W();
await pick('QR 접수');
// 안내 문구 없음(원성옥) → 5초 뒤 사라짐
await scan('6100000'); await W(800);
ok(await page.getByText(/님 접수되었습니다/).count() === 1, '안내 없는 환자 접수 화면');
await W(5000);
ok(await page.getByText('찍으면 바로 접수됩니다').count() === 1, '안내 없음: 5초 뒤 처음 화면');
// 안내 문구 있음(신종희) → 6초엔 그대로, 8초 뒤 사라짐
await scan('6100037'); await W(800);
ok(await page.getByText('5번 진료실 앞으로 오세요').count() === 1, '안내 문구 표시');
await W(5500);
ok(await page.getByText('5번 진료실 앞으로 오세요').count() === 1, '안내 있음: 6초가 지나도 그대로');
await W(2200);
ok(await page.getByText('찍으면 바로 접수됩니다').count() === 1, '안내 있음: 8초 뒤 처음 화면');
ok(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`);
await browser.close();
