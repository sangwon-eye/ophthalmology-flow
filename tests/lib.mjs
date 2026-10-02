// 자동 테스트 공용 도우미. tests/run.mjs 가 테스트용 서버(따로 된 데이터 폴더)를 켜고 이 값들을 넘겨줍니다.
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BASE = process.env.OPH_TEST_BASE || 'http://127.0.0.1:3199';
export const DATA = process.env.OPH_DATA_DIR || path.join(here, '.tmp', 'data');
export const SP = process.env.OPH_TEST_OUT || path.join(here, 'output');
export const FIXTURES = path.join(here, 'fixtures');
fs.mkdirSync(SP, { recursive: true });

// Playwright: 이 폴더에 설치돼 있으면 그것을, 아니면 전역 설치(npm i -g playwright)를 씁니다.
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* 전역 설치 사용 */ }
  const root = execSync('npm root -g').toString().trim();
  return import(path.join(root, 'playwright', 'index.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]:)/, 'file:///$1'));
}
export const { chromium } = await loadPlaywright();

const api = `${BASE}/api/storage/`;
export async function getKey(k) { const r = await fetch(api + k); if (r.status !== 200) return { value: null, version: undefined }; const c = await r.json(); return { value: JSON.parse(c.value), version: c.version }; }
export async function editKey(k, fn) { const { value, version } = await getKey(k); const next = fn(value); const r = await fetch(api + k, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: JSON.stringify(next), version }) }); if (!r.ok) throw new Error('put ' + r.status); }
// keepRole: 마지막 화면 기억을 확인하는 시나리오만 true. 평소에는 주소를 열 때마다 메인 화면에서 시작 (예전 시나리오들의 전제)
export function tester(page, { keepRole = false } = {}) {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  if (!keepRole) page.addInitScript(() => { try { localStorage.removeItem('oph-role'); } catch { /* 없음 */ } });
  let fails = 0;
  const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) { fails++; process.exitCode = 1; } };
  const W = (ms = 600) => page.waitForTimeout(ms);
  const pick = async (n) => { await page.getByRole('button', { name: new RegExp(`^${n}`) }).first().click(); await W(); };
  const back = async () => { await page.getByRole('button', { name: '메인 화면' }).click(); await W(300); };
  const cardOf = (name) => page.locator('div.bg-white').filter({ has: page.getByText(name, { exact: true }) }).last();
  return { errors, ok, W, pick, back, cardOf };
}

// 시력방 측정: [시력] → (첫 칸 값) [확인], [NCT] 버튼이 있으면 → [확인] (NCT 빈칸 경고는 한 번 더 [확인])
export async function measureVision(page, card, va = '') {
  const confirm = async () => {
    await page.locator('.fixed.inset-0').last().getByRole('button', { name: '확인', exact: true }).click(); await page.waitForTimeout(300);
    if (await page.locator('.fixed.inset-0').count()) await page.locator('.fixed.inset-0').last().getByRole('button', { name: '확인', exact: true }).click();
    await page.waitForTimeout(400);
  };
  await card.getByRole('button', { name: '시력', exact: true }).click(); await page.waitForTimeout(300);
  if (va) await page.locator('.fixed.inset-0').last().locator('input').first().fill(va);
  await confirm();
  const nct = card.getByRole('button', { name: 'NCT', exact: true });
  if (await nct.count()) { await nct.click(); await page.waitForTimeout(300); await confirm(); }
}
