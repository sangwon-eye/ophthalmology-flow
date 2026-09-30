// OCS 처방 도우미(ocs-helper 폴더의 PC 프로그램)가 쓰는 규칙. 화면(설정)과 서버(scripts/ocs-api.js)가 함께 씁니다.
// 서버가 그대로 불러 쓰므로 import 없이, 브라우저·Node 기본 기능만 씁니다.
//
// 검사마다 설정에 'OCS 처방 입력법'을 적어 둡니다: OCS 오더 입력창에 칠 검색어 + 후보 목록에서 ↓를 누를 횟수.
//   test.ocs = { main: { both: { text, down }, single: { text, down } } }
//   양측(양안)·편측(한쪽 눈) 처방이 따로입니다. OCT처럼 세부 종류가 M,D OCT와 OCTA로 나뉜 검사는
//   M,D OCT와 OCTA가 서로 다른 처방이라 md · angio에 따로 적습니다: test.ocs = { md: {…}, angio: {…} }
// 처방 완료 기록은 검사실의 [처방 전] → 처방 완료와 같은 p.orders(검사 id 목록)를 씁니다.
// '처방 없음'(noOrder) 검사는 도우미도 건너뜁니다.

/* 아래 여섯 함수는 flow.jsx의 cleanDetail · octEyeGroups · detailEye · octOptionCode · orderedOptions · sortedTests와
   같은 규칙입니다. 서버는 .jsx 파일을 읽을 수 없어 여기 따로 둡니다. flow.jsx 쪽을 바꾸면 여기도 같이 바꿔 주세요. */
function cleanDetail(d) {
  return {
    options: Array.isArray(d?.options) ? d.options.filter(Boolean) : [],
    eye: ['OU', 'OD', 'OS'].includes(d?.eye) ? d.eye : 'OU',
    eyes: Object.fromEntries(['md', 'angio'].filter(k => ['OU', 'OD', 'OS'].includes(d?.eyes?.[k])).map(k => [k, d.eyes[k]])),
  };
}
function octEyeGroups(t) {
  if (!t.optionEyeGroups && !/oct/i.test(`${t.id} ${t.short} ${t.name}`)) return [];
  const options = t.options || [];
  const md = options.filter(o => (t.optionEyeGroups?.[o] ?? (/macular|disc|^(m|d)$/i.test(o.trim()) ? 'md' : '')) === 'md');
  const angio = options.filter(o => (t.optionEyeGroups?.[o] ?? (/angio|octa|^a$/i.test(o.trim()) ? 'angio' : '')) === 'angio');
  return md.length && angio.length ? [{ key: 'md', options: md }, { key: 'angio', options: angio }] : [];
}
function detailEye(d, key) { return d.eyes?.[key] || d.eye; }
function octOptionCode(option) {
  const value = String(option).trim().toLowerCase();
  if (['m', 'macular'].includes(value)) return 'M';
  if (['d', 'disc'].includes(value)) return 'D';
  if (['a', 'angio', 'octa'].includes(value)) return 'A';
  return null;
}
function orderedOptions(t, d) {
  const isOct = octEyeGroups(t).length > 0;
  const chosen = [...new Set(cleanDetail(d).options.map(o => {
    const renamed = t?.optionAliases?.[o] || o;
    if (!isOct || (t.options || []).includes(renamed)) return renamed;
    const code = octOptionCode(renamed);
    return (code && (t.options || []).find(current => octOptionCode(current) === code)) || renamed;
  }))];
  const known = (t?.options || []).filter(o => chosen.includes(o));
  return [...known, ...chosen.filter(o => !known.includes(o))];
}
function sortedTests(settings) {
  const rooms = Array.isArray(settings?.rooms) ? settings.rooms : [];
  const tests = Array.isArray(settings?.tests) ? settings.tests : [];
  const idx = (id) => rooms.findIndex(r => r.id === id);
  return [...tests]
    .filter(t => t.roomId === 'vision' || idx(t.roomId) >= 0)
    .sort((a, b) => (idx(a.roomId) - idx(b.roomId)) || (a.order - b.order));
}

/* ---------------- OCS 처방 입력법 ---------------- */
export const OCS_SIDES = [
  { key: 'both', label: '양측' },
  { key: 'single', label: '편측' },
];
// 이 검사가 OCS에서 몇 가지 처방으로 나뉘는지: 보통 하나(main), OCT는 M,D OCT(md)와 OCTA(angio)
export function ocsUnitKeys(t) {
  return octEyeGroups(t).length ? ['md', 'angio'] : ['main'];
}
export function ocsUnitName(t, unit) {
  return unit === 'angio' ? 'OCTA' : (t.short || t.name || '검사');
}
export function cleanOcsRecipe(r) {
  return {
    text: String(r?.text ?? '').replace(/[\t\r\n]+/g, ' ').trim(),
    down: Math.min(30, Math.max(0, Math.round(Number(r?.down) || 0))),
  };
}
// 설정 화면 요약용: 지금 세부 종류 기준으로 적어 둔 칸 수
export function ocsRecipeCount(t) {
  return ocsUnitKeys(t).reduce((n, u) => n + OCS_SIDES.filter(s => cleanOcsRecipe(t.ocs?.[u]?.[s.key]).text).length, 0);
}

function sideLabel(eye) {
  return eye === 'OU' ? '양측' : eye === 'OD' ? '편측(우)' : '편측(좌)';
}
// 환자에게 지정된 한 검사가 OCS에서 어떤 처방(들)이 되는지
function ocsUnits(t, d) {
  const detail = cleanDetail(d);
  const groups = octEyeGroups(t);
  if (!groups.length) return [{ unit: 'main', eye: detail.eye }];
  const opts = orderedOptions(t, d);
  const units = groups.filter(g => g.options.some(o => opts.includes(o))).map(g => ({ unit: g.key, eye: detailEye(detail, g.key) }));
  return units.length ? units : [{ unit: 'md', eye: detail.eye }];
}

function orderedTestIds(p) {
  return [...new Set(Object.values(p.orders || {}).flatMap(r => r?.tests || []))];
}

// 한 환자(그날 명단 한 줄)의 처방 계획
//   auto   : 도우미가 넣을 처방 줄 { key, testId, label, text, down }
//   manual : 입력법이 비어 있어 직접 넣을 검사 { testId, label, reason }
//   done   : 이미 처방 완료인 처방 줄
// 한 검사의 처방 줄 중 하나라도 입력법이 없으면 그 검사는 통째로 직접 입력입니다
// (처방 완료 기록이 검사 단위라서, 일부만 넣으면 다음에 같은 처방이 두 번 들어갈 수 있음).
export function ocsPlan(p, settings) {
  const ordered = new Set(orderedTestIds(p));
  const auto = [], manual = [], done = [];
  sortedTests(settings).forEach(t => {
    if (!p.assigned?.[t.id] || t.noOrder) return;
    const lines = ocsUnits(t, p.detail?.[t.id]).map(({ unit, eye }) => {
      const side = eye === 'OU' ? 'both' : 'single';
      return { key: `${t.id}:${unit}:${side}`, testId: t.id, label: `${ocsUnitName(t, unit)} ${sideLabel(eye)}`, ...cleanOcsRecipe(t.ocs?.[unit]?.[side]) };
    });
    if (ordered.has(t.id)) done.push(...lines);
    else if (lines.every(l => l.text)) auto.push(...lines);
    else {
      const missing = lines.filter(l => !l.text).map(l => l.label);
      manual.push({ testId: t.id, label: lines.map(l => l.label).join(' + '), reason: `입력법 미등록: ${missing.join(', ')}` });
    }
  });
  return { auto, manual, done };
}

function sameId(a, b) {
  const x = String(a ?? '').trim(), y = String(b ?? '').trim();
  return !!x && (x === y || x.replace(/^0+/, '') === y.replace(/^0+/, ''));
}
function timeToMin(t) {
  const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

// 메인 화면에서 날짜를 직접 정했으면(그날 하루만) 그 날짜가 '오늘' (App.jsx 와 같은 규칙)
export function ocsToday(todayOverride, realToday) {
  return todayOverride?.date && todayOverride.setOn === realToday ? todayOverride.date : realToday;
}

// 오늘 같은 환자번호의 명단 줄(2차 진료면 여러 줄)을 모아 한 환자의 처방 계획으로
export function ocsPatientPlan(patients, settings, today, id) {
  const entries = (Array.isArray(patients) ? patients : []).filter(p => p?.date === today && sameId(p.id, id));
  if (!entries.length) return null;
  const pick = (list) => { const seen = new Set(); return list.filter(x => { const k = x.key || x.testId; if (seen.has(k)) return false; seen.add(k); return true; }); };
  const plans = entries.map(p => ocsPlan(p, settings));
  const auto = pick(plans.flatMap(x => x.auto));
  return {
    id: entries[0].id,
    name: entries[0].name || '',
    doctor: [...new Set(entries.map(p => p.doctor).filter(Boolean))].join(', '),
    auto,
    manual: pick(plans.flatMap(x => x.manual)).filter(m => !auto.some(a => a.testId === m.testId)),
    done: pick(plans.flatMap(x => x.done)).filter(d => !auto.some(a => a.key === d.key)),
  };
}

// 명단 모드: 오늘 처방을 넣어야 하는 환자 (예약 시간 순, 2차 진료도 환자당 한 줄)
export function ocsQueue(patients, settings, today) {
  const todays = (Array.isArray(patients) ? patients : []).filter(p => p?.date === today && p.id);
  const ids = [];
  todays.forEach(p => { if (!ids.some(x => sameId(x, p.id))) ids.push(p.id); });
  return ids
    .map(id => {
      const plan = ocsPatientPlan(todays, settings, today, id);
      const first = todays.filter(p => sameId(p.id, id)).sort((a, b) => timeToMin(a.reservation) - timeToMin(b.reservation))[0];
      return { ...plan, reservation: first.reservation || '', checkedIn: todays.some(p => sameId(p.id, id) && p.checkin) };
    })
    .filter(x => x.auto.length || x.manual.length)
    .sort((a, b) => (timeToMin(a.reservation) - timeToMin(b.reservation)) || String(a.id).localeCompare(String(b.id)));
}

// 도우미가 넣은 검사를 처방 완료로 (검사실의 [처방 전] 버튼과 같은 기록). 지정되지 않은 검사는 건너뜀.
// 바뀔 것이 없으면 null, 있으면 { orders: 새 기록, added: 새로 처방 완료가 된 검사 id }
export function ocsMarkOrdered(p, testIds, at) {
  const current = orderedTestIds(p);
  const added = [...new Set(testIds)].filter(id => p.assigned?.[id] && !current.includes(id));
  if (!added.length) return null;
  return { orders: { all: { at, tests: [...current, ...added] } }, added };
}
