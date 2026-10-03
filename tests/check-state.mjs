// 서버에 저장된 명단의 '흐름이 깨진 상태'를 찾습니다 (진료 흐름 규칙 flow.jsx 를 그대로 사용)
// flow.jsx 를 esbuild 로 묶은 파일 (chaos.mjs 가 만들어 둠)
import * as F from './.tmp-chaos/flow.mjs';

const get = async (B, k) => { const r = await fetch(`${B}/api/storage/${k}`); if (r.status !== 200) return null; return JSON.parse((await r.json()).value); };

export async function checkState(B, today) {
  const settings0 = await get(B, 'settings');
  const prefs = (await get(B, 'doctor-prefs')) || {};
  const list = (await get(B, 'daily-patients')) || [];
  const settings = { ...F.DEFAULT_SETTINGS, ...settings0, rooms: settings0.rooms, tests: settings0.tests };
  if (!settings.rooms.some(r => r.builtin === 'treat')) settings.rooms = [...settings.rooms, F.TREAT_ROOM];
  F.setVisionTestIds(settings.tests.filter(t => t.roomId === 'vision').map(t => t.id));
  F.setNoDilateTests(settings.tests.filter(t => (typeof t.noDilate === 'boolean' ? t.noDilate : F.isVfTest(t))).map(t => ({ id: t.id, short: t.short })));
  const waitMin = settings.dilationWaitMin ?? 15;
  const problems = [];
  const todayList = list.filter(p => p.date === today && !p.linkWaiting);
  const work = F.treatWork(todayList, settings);
  const inWork = new Set(Object.values(work).flat().map(F.patientKey));
  for (const p of todayList) {
    const pk = F.patientKey(p);
    const where = [];
    if (!p.checkin) where.push('접수 전');
    if (p.consultDone) where.push('완료');
    if (p.checkin && !F.visionComplete(p)) where.push('시력방');
    if (settings.rooms.some(r => F.roomPending(p, settings, r.id))) where.push('검사실');
    if (inWork.has(pk)) where.push('처치실');
    if (F.consultWaiting(p, settings, prefs)) where.push('진료 대기');
    if (F.inConsult(p)) where.push('진료 중');
    if (F.awaitingExplain(p)) where.push('설명 대기');
    if (p.checkin && !F.inConsult(p) && F.dropsPending(p, prefs, waitMin)) where.push('CR·산동 점안');
    if (p.consultHold && !p.consultDone && !p.seen && (!F.allDone(p, settings) || p.treatRequest)) where.push('진료 보류');
    if (!where.length) problems.push(`멈춘 환자(어느 화면에도 없음): ${p.name} · ${F.getStage(p, settings).label}`);
    if (p.seen && p.calledRoom) problems.push(`설명 대기인데 진료 중: ${p.name}`);
    if (p.consultDone && p.calledRoom) problems.push(`완료인데 진료 중 표시: ${p.name}`);
    if (F.activeVf(p) && !p.checkin) problems.push(`접수 전인데 검사 중: ${p.name}`);
  }
  const byDoc = {};
  todayList.filter(F.inConsult).forEach(p => { (byDoc[p.doctor] ||= []).push(p.name); });
  Object.entries(byDoc).forEach(([d, names]) => { if (names.length > 1) problems.push(`${d} 진료 중 ${names.length}명: ${names.join(', ')}`); });
  const keys = list.map(F.patientKey);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dup.length) problems.push(`같은 기록이 두 번: ${[...new Set(dup)].join(', ')}`);
  return { problems, count: todayList.length, stages: todayList.map(p => F.getStage(p, settings).label) };
}
