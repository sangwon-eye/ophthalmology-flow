// OCS 처방 도우미(ocs-helper 폴더의 PC 프로그램)가 쓰는 서버 주소입니다. server.js 가 /api/ocs/… 요청을 여기로 넘깁니다.
// 도우미(AutoHotkey)가 읽기 쉽도록 JSON 대신 탭으로 나눈 글로 답합니다. 첫 줄 'OPHFLOW1 <종류>', 마지막 줄 'END'.
//   GET  /api/ocs/ping                  연결 확인 (오늘 날짜, 명단 인원, 처방 대기 인원)
//   GET  /api/ocs/list                  오늘 처방을 넣어야 하는 환자 (예약 순)
//   GET  /api/ocs/patient?id=환자번호    그 환자에게 넣을 처방
//   POST /api/ocs/done  본문 'id=환자번호\ntests=vf,oct'   넣은 검사를 처방 완료로 (검사실 [처방 전] 버튼과 같은 기록)
// 계산 규칙은 src/core/ocs.js (화면과 같이 씀).
import { ocsMarkOrdered, ocsPatientPlan, ocsQueue, ocsToday } from '../src/core/ocs.js';

const TAG = 'OPHFLOW1';
const PATIENTS_KEY = 'daily-patients';

function reply(res, kind, rows, status = 200) {
  const safe = v => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  const text = [`${TAG} ${kind}`, ...rows.map(r => r.map(safe).join('\t')), 'END', ''].join('\n');
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}
const fail = (res, message) => reply(res, 'ERROR', [['message', message]]);

function localDate() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// store: server.js 의 readItem · writeItem · readBody (같은 저장 규칙·변경 알림을 그대로 씀)
export async function handleOcs(req, res, pathname, store) {
  const { readItem, writeItem, readBody } = store;
  const read = (key, fallback) => {
    const item = readItem(key);
    if (!item) return fallback;
    try { return JSON.parse(item.value) ?? fallback; } catch { return fallback; }
  };
  const today = ocsToday(read('today-override', null), localDate());
  const settings = read('settings', null);
  if (!settings) return fail(res, '흐름 프로그램 설정이 아직 없어요. 설정 화면에서 한 번 저장해주세요.');

  if (pathname === '/api/ocs/ping' && req.method === 'GET') {
    const patients = read(PATIENTS_KEY, []);
    const count = new Set(patients.filter(p => p?.date === today).map(p => String(p.id))).size;
    return reply(res, 'PONG', [['today', today], ['patients', count], ['pending', ocsQueue(patients, settings, today).length]]);
  }

  if (pathname === '/api/ocs/list' && req.method === 'GET') {
    const rows = ocsQueue(read(PATIENTS_KEY, []), settings, today).map(x => [
      'patient', x.id, x.name, x.doctor, x.auto.length, x.manual.length, x.auto.map(a => a.label).join(', '), x.reservation, x.checkedIn ? 1 : 0,
    ]);
    return reply(res, 'LIST', [['today', today], ...rows]);
  }

  if (pathname === '/api/ocs/patient' && req.method === 'GET') {
    const id = String(new URL(req.url, 'http://localhost').searchParams.get('id') || '').trim();
    if (!id) return fail(res, '환자번호가 없어요.');
    const plan = ocsPatientPlan(read(PATIENTS_KEY, []), settings, today, id);
    if (!plan) return fail(res, `오늘(${today}) 흐름 프로그램 명단에 없는 환자예요 (${id})`);
    return reply(res, 'PATIENT', [
      ['id', plan.id], ['name', plan.name], ['doctor', plan.doctor], ['today', today],
      ...plan.auto.map(a => ['order', a.key, a.label, a.text, a.down, a.testId]),
      ...plan.manual.map(m => ['manual', m.label, m.reason]),
      ...plan.done.map(d => ['done', d.label]),
    ]);
  }

  if (pathname === '/api/ocs/done' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch { return fail(res, '요청을 읽지 못했어요.'); }
    const fields = Object.fromEntries(String(body).split(/\r?\n|&/).map(l => l.split('=')).filter(x => x.length >= 2).map(([k, ...v]) => [k.trim(), v.join('=').trim()]));
    const id = fields.id || '';
    const tests = String(fields.tests || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!id || !tests.length) return fail(res, '환자번호나 검사가 없어요.');
    // 읽기부터 저장까지 한 번에(중간에 기다림 없이) 처리하므로 다른 컴퓨터의 저장과 섞이지 않습니다.
    // 저장하면 버전이 올라가서, 그 사이 저장하려던 화면은 최신 명단에 다시 적용합니다 (server.js 의 409 규칙).
    const item = readItem(PATIENTS_KEY);
    let list;
    try { list = JSON.parse(item?.value || '[]'); } catch { return fail(res, '명단을 읽지 못했어요.'); }
    if (!Array.isArray(list)) return fail(res, '명단을 읽지 못했어요.');
    const at = Date.now();
    const marked = new Set();
    let found = false;
    const next = list.map(p => {
      if (p?.date !== today || !(String(p.id).trim() === id || String(p.id).trim().replace(/^0+/, '') === id.replace(/^0+/, ''))) return p;
      found = true;
      const change = ocsMarkOrdered(p, tests, at);
      if (!change) return p;
      change.added.forEach(t => marked.add(t));
      return { ...p, orders: change.orders };
    });
    if (!found) return fail(res, `오늘(${today}) 흐름 프로그램 명단에 없는 환자예요 (${id})`);
    if (marked.size) {
      try {
        writeItem(PATIENTS_KEY, JSON.stringify(next));
      } catch (e) {
        console.error(`[오류] OCS 도우미 처방 완료 저장 실패: ${e.message}`);
        return fail(res, '서버에 저장하지 못했어요. 검사실 화면에서 [처방 전]을 직접 눌러주세요.');
      }
      console.log(`OCS 도우미가 처방 완료로 표시했습니다 (검사 ${marked.size}개)`);
    }
    return reply(res, 'DONE', [['count', marked.size], ['tests', [...marked].join(',')]]);
  }

  return fail(res, '알 수 없는 요청이에요. 도우미와 흐름 프로그램 버전을 확인해주세요.');
}
