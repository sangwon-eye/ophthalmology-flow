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

// 귀가(설명 완료)시키기: 이전 시력·안압은 귀가한 날의 값만 남음 (10-07 사용자 결정).
// 그 환자를 설명 대기로 옮긴 뒤 진료실에서 [설명 완료 · FU 나중에] — 화면에서 눌러야 App이 이전 기록을 고침
export async function dischargeVia(page, name) {
  let doctor = '';
  await editKey('daily-patients', list => list.map(p => {
    if (p.name !== name) return p;
    doctor = p.doctor;
    return { ...p, seen: true, seenAt: Date.now(), calledRoom: null, procedures: [], consultDone: false };
  }));
  await page.goto(`${BASE}/`); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /^진료실/ }).first().click(); await page.waitForTimeout(600);
  await page.getByRole('button', { name: doctor, exact: true }).first().click(); await page.waitForTimeout(1200);
  await page.locator('#consult-explain').locator('div.bg-white').filter({ has: page.getByText(name, { exact: true }) }).last()
    .getByRole('button', { name: '설명 완료 · FU 나중에' }).click();
  await page.waitForTimeout(1500);
  await page.goto(`${BASE}/`); await page.waitForTimeout(800);
}

// 시력방 측정 (10-08: 시력·안압 한 창): [시력] → 나안 OD에 값(기본 0.8), NCT 칸이 있으면 NCT OD에 값 → Enter (저장·확인)
export async function measureVision(page, card, va = '', nct = '15') {
  await card.getByRole('button', { name: /^(시력|시력 재야함|✓ 시력)$/ }).first().click(); await page.waitForTimeout(300);
  const m = page.locator('[data-measure-modal]');
  await m.getByLabel('나안 OD').fill(va || '0.8');
  const nctIn = m.getByLabel('NCT OD');
  if (await nctIn.count()) await nctIn.fill(nct);
  await m.getByLabel('나안 OD').press('Enter');
  await page.waitForTimeout(400);
}
