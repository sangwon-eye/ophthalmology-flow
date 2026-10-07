// 관리자 화면(명단·FU·통계·안내문)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Trash2, Search, RotateCcw, ArrowDown } from 'lucide-react';
import { ageYears, laterEntries, laterFor, applyFollowupToList, unmarkFollowupLater, patchPatient, DILATE_EYE_LABEL, INPUT, ROSTER_HEADERS, VISION_KEY, VISION_TEST_IDS, buildPatient, byQueue, deleteFollowup, dilateEyeOf, editPatientInfo, fillFollowupNames, followupRows, fuVisitDate, getStage, hasAnyValue, hasFollowupApplied, hasVisionValue, makePreProcs, matchDoctor, mergePatientList, needsTestCheck, normalizeTime, orderForPicking, patientKey, pickDetail, previousMeasure, readRoster, removeVisit, sampleRows, saveFollowup, sortedTests, swapLinkOrder, testLabelWithOptions, todayISO, realTodayISO, treatRoomOf, updateTodayTests, mainTestIds, withoutPrep } from '../core/flow.jsx';
import { isArchivedDate, loadEntries, loadFu, shiftISO, useArchivedPatients, visionNames } from '../core/storage.jsx';
import { ConfirmButton, SexAge, DilationRow, EmptyState, Field, KioskNoteEditor, KioskNoteLine, MeasureLine, MeasureModal, PatientMemo, PreProcEditor, SESSION_OPTIONS, SORT_OPTIONS, ScreenShell, SegmentedToggle, TestCheckModal, TestDetailModal, TestPicker, byName, inSession, useSortMode } from '../ui/common.jsx';
import { PatientInfoModal, UploadResult } from './TreatView.jsx';
import { NOTICE_PRESETS, consultRoomLabel } from './BoardView.jsx';
import { WAIT_TEXT, WAIT_WINDOW_MIN, estimateWait, shownWait } from '../core/flow.jsx';

/* ------------------------------------------------------------------ */
/* 관리자 화면                                                          */
/* ------------------------------------------------------------------ */
// 관리자 > 대기 화면 안내: 시력방·검사실별·교수님별 문구 (직접 지울 때까지 유지)
export function NoticeInput({ label, sub, value, presets, onSave }) {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  const save = (text) => { if (text.trim() !== String(value || '').trim()) onSave(text.trim()); };
  return (
    <div className={`rounded-xl border px-3 py-2 flex gap-2 flex-wrap items-center ${value ? 'border-yellow-400 bg-yellow-50' : 'border-slate-200 bg-white'}`}>
      <div className="w-44 shrink-0 text-sm font-medium text-slate-900">{label}{sub && <span className="block text-xs font-normal text-slate-500">{sub}</span>}</div>
      <div className="flex-1 flex gap-2 flex-wrap items-center">
        <input aria-label={`${label} 안내 문구`} value={v} onChange={e => setV(e.target.value)} onBlur={() => save(v)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          placeholder="환자용 화면에 보일 안내 (비워 두면 안 보임)" className={`${INPUT} flex-1 min-w-[16rem]`} />
        <select aria-label={`${label} 자주 쓰는 문구`} value="" onChange={e => { if (e.target.value) { setV(e.target.value); save(e.target.value); } }}
          className="text-sm border border-slate-300 rounded-lg px-2 py-2 bg-white max-w-[12rem]">
          <option value="">문구 고르기</option>
          {presets.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {value && <button type="button" onClick={() => { setV(''); onSave(''); }} className="text-sm px-3 py-2 rounded-lg border border-slate-300 text-slate-600">지우기</button>}
      </div>
    </div>
  );
}
/* 오늘 통계: 이미 기록되는 시각(접수·시력방 완료·검사 완료·진료 호출·진료 완료·설명 완료)으로 단계별 평균 시간 */
export function checkinTime(p) {
  if (!p.checkin || !p.date) return null;
  const t = new Date(`${p.date}T${String(p.checkin).padStart(5, '0')}:00`).getTime();
  return Number.isFinite(t) ? t : null;
}
export function stageTimes(p) {
  const checkin = checkinTime(p);
  const vision = p.visionSkipped || p.skipVision ? null : (p.doneAt?.[VISION_KEY] || null);
  const examIds = Object.keys(p.assigned || {}).filter(id => p.assigned[id] && id !== VISION_KEY && !VISION_TEST_IDS.includes(id));
  const examDone = examIds.length && examIds.every(id => p.done?.[id] && p.doneAt?.[id]) ? Math.max(...examIds.map(id => p.doneAt[id])) : null;
  const ready = examDone || vision;
  return { checkin, vision, examDone, ready, called: p.calledAt || null, seen: p.seenAt || null, done: p.consultDone ? (p.consultDoneAt || null) : null };
}
export const STAT_STAGES = [
  { key: 'vision', label: '시력방', sub: '접수 → 시력방 끝', from: 'checkin', to: 'vision' },
  { key: 'exam', label: '검사', sub: '시력방 끝 → 검사 끝', from: 'vision', to: 'examDone' },
  { key: 'wait', label: '진료 대기', sub: '검사 끝 → 진료 호출', from: 'ready', to: 'called' },
  { key: 'consult', label: '진료', sub: '호출 → 진료 완료', from: 'called', to: 'seen' },
  { key: 'explain', label: '설명', sub: '진료 완료 → 설명 완료', from: 'seen', to: 'done' },
  { key: 'total', label: '전체', sub: '접수 → 설명 완료', from: 'checkin', to: 'done' },
];
export function stageMinutes(list, stage) {
  // 12시간이 넘거나 거꾸로 된 값(되돌리기 등)은 빼고 계산
  return list.map(p => { const t = stageTimes(p); return t[stage.from] && t[stage.to] ? (t[stage.to] - t[stage.from]) / 60000 : null; })
    .filter(v => v !== null && v >= 0 && v < 720);
}
export function avgText(values) {
  if (!values.length) return '-';
  return `${Math.round(values.reduce((a, b) => a + b, 0) / values.length)}분`;
}
export function DayStats({ patients, doctors }) {
  const [date, setDate] = useState(todayISO());
  const archived = useArchivedPatients(date, patients);
  const list = (archived.isArchived ? archived.list : patients).filter(p => p.date === date && !p.linkWaiting);
  const checkedIn = list.filter(p => p.checkin);
  const done = list.filter(p => p.consultDone);
  const waiting = checkedIn.filter(p => !p.consultDone);
  const noCallTime = checkedIn.some(p => p.seenAt && !p.calledAt);
  const docNames = [...new Set([...doctors, ...list.map(p => p.doctor).filter(Boolean)])].filter(d => list.some(p => p.doctor === d));
  const hours = {};
  checkedIn.forEach(p => { const h = String(p.checkin).padStart(5, '0').slice(0, 2); hours[h] = (hours[h] || 0) + 1; });
  const hourRows = Object.entries(hours).sort(([a], [b]) => a.localeCompare(b));
  const maxHour = Math.max(1, ...hourRows.map(([, n]) => n));
  const kpis = [
    ['명단', list.length], ['접수', checkedIn.length], ['설명 완료 (귀가)', done.length], ['지금 병원 안', waiting.length],
    ['초진', list.filter(p => p.firstVisit).length], ['지각', list.filter(p => p.late).length],
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-slate-600 flex items-center gap-2">날짜
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 bg-white" />
        </label>
        {archived.isArchived && <span className="text-xs text-slate-500">{archived.loading ? '지난 명단을 불러오는 중…' : '보관된 지난 명단'}</span>}
      </div>
      <section className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {kpis.map(([label, value]) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="text-2xl font-semibold text-slate-900 mt-1">{value}<span className="text-sm font-normal text-slate-500 ml-0.5">명</span></div>
          </div>
        ))}
      </section>
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="font-medium text-slate-900">단계별 평균 시간</div>
        <p className="text-xs text-slate-500 mb-3">각 단계를 마친 환자만 계산합니다 (12시간이 넘는 값은 제외).{noCallTime ? ' 진료 호출 시각은 이번 버전부터 기록되어, 그 전 환자는 진료 대기·진료 시간에서 빠집니다.' : ''}</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {STAT_STAGES.map(st => {
            const values = stageMinutes(list, st);
            return (
              <div key={st.key} className={`rounded-lg px-3 py-3 ${st.key === 'total' ? 'bg-slate-800 text-white' : 'bg-slate-50'}`}>
                <div className={`text-sm font-medium ${st.key === 'total' ? 'text-white' : 'text-slate-800'}`}>{st.label}</div>
                <div className={`text-xs ${st.key === 'total' ? 'text-slate-300' : 'text-slate-500'}`}>{st.sub}</div>
                <div className="text-2xl font-semibold mt-2">{avgText(values)}</div>
                <div className={`text-xs mt-0.5 ${st.key === 'total' ? 'text-slate-300' : 'text-slate-500'}`}>{values.length ? `${values.length}명 · 가장 긴 ${Math.round(Math.max(...values))}분` : '아직 없음'}</div>
              </div>
            );
          })}
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="font-medium text-slate-900 mb-2">교수별</div>
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="text-xs text-slate-500 border-b border-slate-200">
              <th className="text-left font-normal py-1.5">교수</th><th className="text-right font-normal">명단</th><th className="text-right font-normal">귀가</th><th className="text-right font-normal">병원 안</th><th className="text-right font-normal">평균 진료 대기</th><th className="text-right font-normal">평균 전체</th>
            </tr></thead>
            <tbody>
              {docNames.map(d => {
                const ps = list.filter(p => p.doctor === d);
                return (
                  <tr key={d} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 text-slate-900">{d}</td>
                    <td className="text-right">{ps.length}</td>
                    <td className="text-right">{ps.filter(p => p.consultDone).length}</td>
                    <td className="text-right">{ps.filter(p => p.checkin && !p.consultDone).length}</td>
                    <td className="text-right">{avgText(stageMinutes(ps, STAT_STAGES[2]))}</td>
                    <td className="text-right">{avgText(stageMinutes(ps, STAT_STAGES[5]))}</td>
                  </tr>
                );
              })}
              {!docNames.length && <tr><td colSpan={6} className="py-3 text-slate-400">이 날짜의 명단이 없습니다</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="font-medium text-slate-900 mb-2">시간대별 접수</div>
          {!hourRows.length && <div className="text-sm text-slate-400">아직 접수한 환자가 없습니다</div>}
          <div className="space-y-1.5">
            {hourRows.map(([h, n]) => (
              <div key={h} className="flex items-center gap-2 text-sm">
                <span className="w-10 text-slate-500 tabular-nums">{h}시</span>
                <span className="flex-1 h-3 bg-slate-100 rounded-r"><span className="block h-3 bg-blue-500 rounded-r" style={{ width: `${(n / maxHour) * 100}%` }} /></span>
                <span className="w-10 text-right text-slate-700 tabular-nums">{n}명</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
/* 역할별 1장 안내문: 자리마다 붙여 두는 요약(하는 일 5줄 이내 + 이럴 땐). 방 이름은 지금 설정을 따라감.
   화면 동작을 바꾸면 여기와 업무흐름정리.md 도 같이 고칠 것. [인쇄]하면 흐름 그림 1장 + 역할마다 한 장씩 */
export function roleGuideSheets(settings) {
  const vision = visionNames(settings).name;
  const rooms = settings.rooms.filter(r => r.builtin !== 'treat').map(r => r.name).join(' · ') || '검사실';
  const treat = treatRoomOf(settings).name;
  return [
    { key: 'vision', title: vision, steps: [
      '[접수] (QR로 찍은 환자는 저절로 접수). 늦게 온 환자는 [지각]',
      '[시력] · [NCT]를 눌러 값 입력 → 둘 다 ✓',
      '초진이면 [History 설문지 드리기]',
      '산동 예정이면 [산동]으로 점안 시각 기록 (CR은 진료실에서 점안)',
      '할 일이 모두 끝나면 저절로 다음 방으로 넘어갑니다',
    ], tips: [
      '검사를 넣거나 뺄 때: 오늘 검사 옆 작은 글씨 [변경]을 눌러 그 자리에서',
      '접수를 잘못 눌렀으면: [접수 취소]를 두 번',
      '잘못 넘어갔으면: 아래 알림의 [되돌리기]',
    ] },
    { key: 'exam', title: `검사실 (${rooms})`, steps: [
      '위쪽 장비 버튼(VF · OCT …)을 누르면 내 장비 환자만 보입니다',
      '전산 처방을 넣은 뒤 [처방 전] → "처방 완료"',
      '검사가 끝나면 검사 칸을 누릅니다 (초록 ✓). "우선" 표시를 먼저',
      'VF 등: [▶ 시작] → 끝나면 [종료] (검사 중에는 다른 장비가 부르지 못함)',
      '산동 예정이면 [산동] (VF처럼 산동 금지 검사가 끝난 뒤)',
    ], tips: [
      '검사를 넣거나 뺄 때: [검사 변경]',
      '단안 · 세부 종류: 검사 칸을 길게 누르기 (마우스는 오른쪽 클릭)',
      '잘못 눌렀으면: 알림의 [되돌리기] 또는 아래 "방금 완료한 환자"',
    ] },
    { key: 'treat', title: treat, steps: [
      '위쪽 요약 줄의 묶음을 누르면 그곳으로 이동 (주황 = 오래 기다리는 환자)',
      '초진 · 2차 진료: [History 입력] → [검사 지정]',
      '검사 준비(skin test 등): [시작] → 시간이 되면 [확인]',
      '예진이 끝나면 [예진 완료], 전공의 처치가 끝나면 [처치 완료]',
      '진료실 요청: 할 일을 고르고 [확인 완료 · 진료 대기로]',
    ], tips: [
      '진료 전 처치(PRP · YAG): 맨 위 카드에서 [처치 완료]',
      '처치 후 확인(YAG · Probing 등): [처치 완료] → 시간이 되면 노란 "N분 지남 · 확인"을 눌러야 끝 (결과 확인 칸에도)',
      '처치 뒤 검사·다시 진료: [처치 완료] 옆 "검사 · 재진료" → [재진료] · 검사 중 필요한 것 (진료 전 처치는 "검사 추가 후 완료")',
      '잘못 눌렀으면: 알림의 [되돌리기] 또는 아래 "방금 완료한 환자"',
    ] },
    { key: 'consult', title: '진료실', steps: [
      '위에서 교수님을 고릅니다 (이 PC가 기억)',
      '진료 대기에서 [진료 호출] → 진료 중 카드가 위에 크게',
      '진료 중: [진료 완료] · [처치] · [추가 검사] · [보내기]',
      '설명 대기: [설명 완료] 창에서 다음 내원 검사 지정 (바쁘면 [설명 완료 · FU 나중에])',
      'CR · 산동 점안 칸: 점안할 때마다 버튼, 시간이 되면 노란 "N분 지남 · 확인"을 눌러야 진료 대기로',
    ], tips: [
      '잘못 불렀으면: [호출 취소]',
      '진료 후 처치를 넣을 때: 설명 대기 카드의 [처치 보내기]',
      '처치가 남은 환자: 처치가 끝나면 [귀가] (처치 후 확인 · 처치 뒤 검사가 끝난 뒤)',
      '처치 뒤 검사·다시 진료: [교수님 처치 완료] 옆 "검사 · 재진료" → [재진료]는 진료 대기로 ("YAG 후 재진"), 검사만이면 검사 후 설명 대기로',
      '진료실 앞에 안 온 환자: 카드 끝 [환자 찾기] (복도 끝 모니터에 이름이 크게)',
      '산동이 이미 충분하면: 시각이 찍힌 점안 버튼 한 번 → [지금 완료]',
    ] },
    { key: 'admin', title: '관리자', steps: [
      '전날 · 아침: [명단 업로드]에 엑셀 (제목: 환자명 · 환자번호 · 예약 · 초재진 · 진료의)',
      '[명단 관리]: 주황 "확인 필요" 환자의 오늘 검사 지정',
      '[FU 지정 관리]: "FU 나중에" 환자의 다음 내원 검사 지정',
      '[대기 화면 안내]: 환자용 화면 노란 안내 문구',
    ], tips: [
      '날짜가 틀리면: 메인 화면 "오늘 날짜"',
      '서버 · 백업 · 문제 해결: 사용방법.txt',
    ] },
  ];
}
// 어느 자리에서나 같은 것 (흐름 그림 아래·자리별 안내 아래 공통)
const COMMON_TIPS = [
  '잘못 눌렀으면 아래 알림의 [되돌리기] (몇 초 동안)',
  '"○○ 안 됨" 안내가 뜨면: 다른 자리에서 먼저 처리한 것 → 바뀐 화면을 보고 필요하면 다시',
  '위쪽 빨간 띠: 저장이 안 된 것 → 관리 담당에게 알리기',
];
function FlowBox({ title, lines, tone = 'slate' }) {
  const tones = { slate: 'border-slate-300 bg-white', sky: 'border-sky-300 bg-sky-50', violet: 'border-violet-300 bg-violet-50', indigo: 'border-indigo-300 bg-indigo-50', amber: 'border-amber-300 bg-amber-50', emerald: 'border-emerald-300 bg-emerald-50' };
  return (
    <div className={`border-2 rounded-xl px-4 py-2.5 ${tones[tone]}`}>
      <div className="font-semibold text-slate-900 text-base print:text-xl">{title}</div>
      {lines.map(l => <div key={l} className="text-sm text-slate-700 print:text-base">{l}</div>)}
    </div>
  );
}
const FlowArrow = () => <div className="flex justify-center text-slate-400 py-0.5"><ArrowDown size={22} /></div>;
// 환자 흐름 그림 1장 (벽 · 교육용)
export function FlowSheet({ settings }) {
  const vision = visionNames(settings).name;
  const treat = treatRoomOf(settings).name;
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 mb-4 print:border-0 print:rounded-none print:p-0 print:break-after-page">
      <div className="text-xs text-slate-400">Ophthalmology Flow · 환자 흐름</div>
      <h3 className="text-xl font-semibold text-slate-900 mt-1 mb-3 print:text-3xl">환자는 이렇게 움직입니다</h3>
      <div className="max-w-2xl">
        <FlowBox title="접수" lines={['QR 접수(환자가 직접) 또는 시력방 [접수]']} />
        <FlowArrow />
        <FlowBox tone="sky" title={vision} lines={['시력 · NCT, 초진 History 설문지, 산동 첫 점안']} />
        <FlowArrow />
        <div className="grid grid-cols-2 gap-3">
          <FlowBox tone="violet" title={treat} lines={['초진 · 2차 진료: 검사 지정 · 예진', '진료 전 처치(PRP · YAG)', '검사 준비(skin test 등)']} />
          <FlowBox tone="indigo" title="검사실" lines={['장비별 검사 (VF · OCT …)', '처방 완료 → 검사 → ✓']} />
        </div>
        <div className="text-center text-xs text-slate-500 py-1 print:text-sm">필요한 곳을 모두 거치면 저절로 진료 대기로 (산동 환자는 점안 + 대기시간 뒤)</div>
        <FlowArrow />
        <FlowBox tone="amber" title="진료실" lines={['CR · 산동 점안 → 진료 대기 → [진료 호출] → 진료 중', '[보내기]: 시력방 · 검사실 · 처치실에 다녀오면 다시 진료 대기로']} />
        <FlowArrow />
        <FlowBox tone="emerald" title="설명 대기" lines={['[설명 완료] + 다음 내원(FU) 지정', '처치가 남으면: 처치실(전공의) · 설명 대기 카드(교수님) → [귀가]']} />
        <FlowArrow />
        <FlowBox title="귀가" lines={['같은 날 다른 교수님 진료가 있으면 그 진료로 이어집니다']} />
      </div>
      <div className="mt-4 text-sm text-slate-700 print:text-base">
        <div className="font-semibold text-slate-900 mb-1">어느 자리에서나</div>
        {COMMON_TIPS.map(t => <div key={t}>· {t}</div>)}
      </div>
    </section>
  );
}
export function RoleGuides({ settings }) {
  const sheets = roleGuideSheets(settings);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 print:hidden">
        <p className="text-sm text-slate-500">흐름 그림 1장과 자리마다 붙여 둘 1장 요약입니다. [인쇄]하면 한 장씩 나옵니다 (방 이름은 설정을 따라갑니다).</p>
        <button type="button" onClick={() => window.print()} className="text-sm px-4 py-2 rounded-lg bg-slate-800 text-white font-medium">인쇄</button>
      </div>
      <FlowSheet settings={settings} />
      <div className="grid gap-4 md:grid-cols-2 print:block">
        {sheets.map(sh => (
          <section key={sh.key} className="bg-white border border-slate-200 rounded-xl p-5 print:border-0 print:rounded-none print:p-0 print:break-after-page">
            <div className="text-xs text-slate-400">Ophthalmology Flow · 이 자리 사용법</div>
            <h3 className="text-xl font-semibold text-slate-900 mt-1 mb-3 print:text-4xl">{sh.title}</h3>
            <div className="text-xs font-semibold text-slate-500 mb-1 print:text-base">하는 일</div>
            <ol className="space-y-1.5 text-base text-slate-800 print:text-2xl print:space-y-4">
              {sh.steps.map((t, i) => <li key={i} className="flex gap-2"><span className="text-slate-400 shrink-0">{i + 1}.</span><span>{t}</span></li>)}
            </ol>
            <div className="text-xs font-semibold text-slate-500 mt-4 mb-1 print:text-base print:mt-8">이럴 땐</div>
            <ul className="space-y-1 text-sm text-slate-600 print:text-xl print:space-y-3">
              {[...sh.tips, ...COMMON_TIPS.slice(1)].map((t, i) => <li key={i}>· {t}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
// 대기 시간 안내: 접수→시력방 완료, 시력방 완료→첫 검사 완료 (최근 60분 기준 계산)
function WaitAdmin({ patients, value, mutate, visionLabel }) {
  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(i); }, []);
  const waits = value?.waits || {};
  const autoMin = Number.isFinite(Number(waits.autoMin)) ? Number(waits.autoMin) : 20;
  const [minDraft, setMinDraft] = useState(String(autoMin));
  useEffect(() => { setMinDraft(String(autoMin)); }, [autoMin]);
  const setWait = (kind, patch) => mutate(prev => ({ ...prev, waits: { ...(prev?.waits || {}), [kind]: { ...(prev?.waits?.[kind] || {}), ...patch } } }));
  const saveMin = () => {
    const n = Math.max(0, Math.round(Number(minDraft) || 0));
    mutate(prev => ({ ...prev, waits: { ...(prev?.waits || {}), autoMin: n } }));
  };
  const rows = [
    { kind: 'vision', label: visionLabel, sub: '접수 → 시력검사 완료' },
    { kind: 'exams', label: '검사실', sub: '시력검사 완료 → 첫 검사 완료' },
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="font-medium text-slate-900 mb-1">대기 시간 안내</div>
      <p className="text-sm text-slate-500 mb-3">최근 {WAIT_WINDOW_MIN}분 동안 마친 환자와 지금 기다리는 환자로 대략 계산합니다 (5분 단위 올림). 지각·2차 진료·진료 전 처치 환자는 빠집니다.
        반자동은 [띄우기]를 눌러야 환자 화면에 나오고(그 값 그대로, 오늘만), 자동은 계산값이 기준 이상일 때 저절로 나오고 줄면 사라집니다.</p>
      <div className="space-y-2">
        {rows.map(({ kind, label, sub }) => {
          const w = waits[kind] || {};
          const auto = w.mode === 'auto';
          const est = estimateWait(patients, kind);
          const shown = shownWait(waits, patients, kind);
          return (
            <div key={kind} data-wait={kind} className={`rounded-lg border px-3 py-2 flex gap-3 flex-wrap items-center ${shown ? 'border-yellow-400 bg-yellow-50' : 'border-slate-200'}`}>
              <div className="w-44 shrink-0 text-sm font-medium text-slate-900">{label}<span className="block text-xs font-normal text-slate-500">{sub}</span></div>
              <div className="text-sm text-slate-700 min-w-[14rem]">
                {est.min ? <>지금 계산: <b>약 {est.min}분</b></> : '계산할 환자가 부족합니다'}
                <span className="block text-xs text-slate-400">마친 환자 {est.done}명 · 기다리는 환자 {est.waiting}명</span>
              </div>
              <SegmentedToggle value={auto ? 'auto' : 'semi'} onChange={v => setWait(kind, { mode: v })} options={[['semi', '반자동'], ['auto', '자동']]} />
              <div className="flex-1 flex items-center gap-2 flex-wrap justify-end">
                <span className="text-sm text-slate-600">{shown ? <>환자 화면: <b>{WAIT_TEXT[kind].replace('{n}', shown)}</b></> : '환자 화면에 표시 안 함'}</span>
                {!auto && <button type="button" disabled={!est.min} onClick={() => setWait(kind, { shown: est.min, shownDate: todayISO() })}
                  className="text-sm px-3 py-2 rounded-lg bg-amber-600 text-white font-medium disabled:opacity-40">{shown ? '지금 값으로 다시 띄우기' : '띄우기'}</button>}
                {!auto && shown && <button type="button" onClick={() => setWait(kind, { shown: null })} className="text-sm px-3 py-2 rounded-lg border border-slate-300 text-slate-600">내리기</button>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 mt-3 text-sm text-slate-600">
        자동일 때
        <input type="number" min="0" aria-label="자동 표시 기준" value={minDraft} onChange={e => setMinDraft(e.target.value)} onBlur={saveMin} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
        분 이상이면 환자 화면에 표시
      </div>
    </div>
  );
}
export function BoardNoticeAdmin({ patients = [], settings, doctors, doctorPrefs, value, mutate }) {
  const notices = value?.notices || {};
  const presets = Array.isArray(value?.presets) ? value.presets : NOTICE_PRESETS;
  const [newPreset, setNewPreset] = useState('');
  const setNotice = (key, text) => mutate(prev => ({ ...prev, notices: { ...(prev?.notices || {}), [key]: text } }));
  const setPresets = (fn) => mutate(prev => ({ ...prev, presets: fn(Array.isArray(prev?.presets) ? prev.presets : NOTICE_PRESETS) }));
  const addPreset = () => {
    const t = newPreset.trim();
    if (t) setPresets(list => (list.includes(t) ? list : [...list, t]));
    setNewPreset('');
  };
  const vn = visionNames(settings);
  return (
    <div className="space-y-3">
      <WaitAdmin patients={patients} value={value} mutate={mutate} visionLabel={vn.patientName} />
      <p className="text-sm text-slate-500">적은 문구는 환자용 대기 화면에 노란 띠로 바로 나타나고, 지울 때까지 계속 보입니다. 칸을 벗어나거나 Enter를 누르면 저장됩니다.</p>
      <NoticeInput label={vn.patientName} sub="시력방" value={notices.vision} presets={presets} onSave={t => setNotice('vision', t)} />
      <NoticeInput label="검사실 전체" sub="환자용 화면 검사실 칸 맨 위 (방 이름 없이)" value={notices.exams} presets={presets} onSave={t => setNotice('exams', t)} />
      {settings.rooms.map(r => (
        <NoticeInput key={r.id} label={r.patientName || r.name} sub={r.name !== (r.patientName || r.name) ? r.name : ''} value={notices[`room:${r.id}`]} presets={presets} onSave={t => setNotice(`room:${r.id}`, t)} />
      ))}
      {doctors.map(d => (
        <NoticeInput key={d} label={`${d} 진료실`} sub={consultRoomLabel(doctorPrefs, d)} value={notices[`doctor:${d}`]} presets={presets} onSave={t => setNotice(`doctor:${d}`, t)} />
      ))}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="font-medium text-slate-900 mb-2">자주 쓰는 문구</div>
        <div className="space-y-1 mb-3">
          {presets.map(t => (
            <div key={t} className="flex items-center justify-between gap-2 text-sm text-slate-700 border-b border-slate-100 py-1">
              <span>{t}</span>
              <button type="button" onClick={() => setPresets(list => list.filter(x => x !== t))} className="text-xs text-slate-400 hover:text-red-600">삭제</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input aria-label="새 자주 쓰는 문구" value={newPreset} onChange={e => setNewPreset(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPreset(); }} placeholder="새 문구" className={`${INPUT} flex-1`} />
          <button type="button" onClick={addPreset} className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium shrink-0">추가</button>
        </div>
      </div>
    </div>
  );
}

// 그저께 이전 날짜는 서버가 보관 파일로 옮긴 명단이라 새로 올리면 보관된 진행 기록과 섞임 → 올리지 않음
const PAST_DATE_MSG = '어제보다 앞 날짜에는 명단을 올리거나 환자를 추가할 수 없습니다. 지난 명단은 명단 관리에서 날짜를 골라 보세요 (보기 전용).';

// FU 지정 관리 탭을 연 동안만 FU 전체를 받습니다 (평소 화면은 명단에 있는 환자 것만 — App).
// 고치면 이 목록에 바로 보이고, 저장은 그 환자 칸만 (updateFu). 저장 중에 시작한 새로 받기는 버림 (방금 고친 것이 잠깐 사라지지 않게)
function useAllFollowups(active, updateFu) {
  const [all, setAll] = useState(null);
  const seq = useRef(0);
  const pending = useRef(0);
  const reload = useCallback(async () => {
    const started = seq.current;
    try {
      const v = await loadFu();
      if (pending.current === 0 && seq.current === started) setAll(v || {});
    } catch { /* 서버 연결 안 됨: 지금 목록 그대로 */ }
  }, []);
  useEffect(() => {
    if (!active) { setAll(null); return undefined; }
    reload();
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [active, reload]);
  const edit = useCallback((id, mapFn) => {
    seq.current += 1;
    pending.current += 1;
    setAll(prev => (prev ? mapFn(prev) : prev));
    const done = () => { pending.current -= 1; reload(); };
    return updateFu(id, mapFn).then(done, done);
  }, [updateFu, reload]);
  return [all, edit];
}

export function AdminView({ patients, history, doctors, doctorPrefs, settings, fuMap, mutatePatients, updateFu, mutateDoctors, mutateDoctorPrefs, boardNotices, mutateBoardNotices, onBack, lastSync }) {
  const [todayDetail, setTodayDetail] = useState(null);
  const todayEdit = patients.find(p => patientKey(p) === todayDetail?.key);
  const todayTest = settings.tests.find(t => t.id === todayDetail?.testId);
  const setTodayTest = (key, test, on, detail) => mutatePatients(prev => prev.map(p => {
    if (patientKey(p) !== key) return p;
    const details = { ...p.detail };
    if (detail !== undefined) { if (detail) details[test.id] = detail; else delete details[test.id]; }
    const next = updateTodayTests(p, [test], { ...p.assigned, [test.id]: on }, details);
    return on ? next : { ...next, ...withoutPrep(next, test.id) };
  }));
  const [tab, setTab] = useState('upload');
  const [batchDate, setBatchDate] = useState(todayISO());
  const [batchDoctor, setBatchDoctor] = useState('');
  const EMPTY_MANUAL = { id: '', name: '', reservation: '', firstVisit: false, sex: '', age: '' };
  const [manual, setManual] = useState(EMPTY_MANUAL);
  const [manageDate, setManageDate] = useState(todayISO());
  const [fuSearch, setFuSearch] = useState('');
  const [fuEdit, setFuEdit] = useState(null);
  const [message, setMessage] = useState('');
  const [allFu, editFu] = useAllFollowups(tab === 'fu', updateFu);
  const fuAll = allFu || {};

  useEffect(() => {
    if (doctors.length && !doctors.includes(batchDoctor)) setBatchDoctor(doctors[0]);
  }, [doctors, batchDoctor]);

  const allTests = sortedTests(settings);

  const [uploadResult, setUploadResult] = useState(null);
  const [sortMode, changeSort] = useSortMode('admin-sort');
  const [session, setSession] = useState('all');

  // 이미 명단에 있는 환자는 덮어쓰지 않습니다 (mergePatientList 참고). 저장된 결과의 통계를 돌려줍니다.
  const upsert = async (news) => {
    let stats = null;
    await mutatePatients(prev => {
      const r = mergePatientList(prev, news, doctorPrefs, settings);
      stats = r.stats;
      return r.next;
    });
    return stats;
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fail = (msg) => { setUploadResult(null); setMessage(msg); e.target.value = ''; };
    if (isArchivedDate(batchDate)) return fail(PAST_DATE_MSG);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const roster = readRoster(wb.Sheets[wb.SheetNames[0]]);
      if (!roster) return fail('제목 줄을 찾지 못했습니다. 첫 줄에 환자명 / 환자번호 / 예약 / 초재진 / 진료의 제목이 있는지 확인해주세요.');
      const lacking = Object.entries(ROSTER_HEADERS).filter(([k]) => roster.cols[k] === undefined).map(([, name]) => name);
      if (lacking.length) return fail(`엑셀에 ${lacking.map(n => `"${n}"`).join(', ')} 칸이 없어 등록하지 않았습니다. 제목 글자가 정확히 같은지 확인해주세요 (환자명 · 환자번호 · 예약 · 초재진 · 진료의).`);
      if (!roster.rows.length) return fail('환자를 찾지 못했습니다. 환자번호 칸이 비어 있지 않은지 확인해주세요.');
      // 이번 명단 환자들의 FU만 받아서 검사 지정에 씀
      const currentFu = await loadEntries('fu-designations', [...new Set(roster.rows.map(r => String(r.id)))]);
      const rejected = [];
      const news = [];
      roster.rows.forEach(r => {
        const doctor = matchDoctor(r.doctorText, doctors);
        if (!doctor) { rejected.push(r); return; }
        news.push({ id: r.id, name: r.name, reservation: r.reservation, firstVisit: r.firstVisit, sex: r.sex, age: r.age, date: batchDate, doctor });
      });
      // 같은 환자가 두 교수님 줄에 있으면 두 교수님 진료로 연결됩니다 (mergePatientList)
      const uniq = [...new Map(news.map(r => [`${r.id}::${r.doctor}`, r])).values()].map(r => buildPatient(r, currentFu, settings));
      let stats = { added: [], timeChanged: [], unchanged: [], linked: [] };
      if (uniq.length) {
        stats = null;
        try { stats = await upsert(uniq); } catch { /* 저장 실패는 결과 창에 표시 */ }
      }
      const fileDoctors = doctors.filter(d => uniq.some(p => p.doctor === d));
      const keys = new Set(uniq.map(p => `${p.id}::${p.doctor}`));
      // 같은 날짜·같은 교수 명단에 있었는데 이번 파일에는 없는 환자 → 사용자가 확인 후 삭제
      const missing = patients
        .filter(p => p.date === batchDate && fileDoctors.includes(p.doctor) && !keys.has(`${p.id}::${p.doctor}`))
        .map(p => patientKey(p));
      const perDoctor = fileDoctors.map(d => `${d} ${uniq.filter(p => p.doctor === d).length}명`);
      setMessage('');
      setUploadResult({ date: batchDate, doctors: fileDoctors, allDoctors: doctors, perDoctor, total: uniq.length, stats, missing, rejected, noSexAge: !roster.hasSexAge });
    } catch (err) {
      return fail('파일을 읽지 못했습니다. 엑셀(.xlsx) 파일인지 확인해주세요.');
    }
    e.target.value = '';
  };

  const loadSample = async () => {
    let docsNow = doctors;
    if (!docsNow.length) {
      docsNow = ['김안과 교수', '이안과 교수'];
      await mutateDoctors(() => docsNow);
    }
    await updateFu('10001', prev => ({ ...prev, '10001': { oct: true, vf: true, detail: { oct: { options: ['Macular', 'Disc'], note: '' }, vf: { options: [], note: '24-2C' } } } }));
    await updateFu('10004', prev => ({ ...prev, '10004': { wfp: true, idra: true, gat: true } }));
    if (docsNow[1] && !doctorPrefs?.[docsNow[1]]) {
      await mutateDoctorPrefs(prev => ({ ...prev, [docsNow[1]]: { dilate: true, cr: true } }));
    }
    const freshFu = await loadEntries('fu-designations', sampleRows().map(r => r.id));
    const news = sampleRows().map((r, i) => buildPatient({ ...r, firstVisit: r.id === '10003', date: todayISO(), doctor: docsNow[i % docsNow.length] }, freshFu, settings));
    await upsert(news);
    setUploadResult(null);
    setMessage(`샘플 환자 ${news.length}명을 오늘 명단에 올렸습니다. (이미 있던 환자는 그대로 둡니다)`);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { 예약: '09:00', 환자번호: '10001', 환자명: '홍길동', 성별: '남', 나이: '80세', 초재진: '재진', 진료의: doctors[0] || '김안과' },
      { 예약: '09:10', 환자번호: '10002', 환자명: '김영희', 성별: '여', 나이: '11세5개월', 초재진: '초진', 진료의: doctors[1] || doctors[0] || '김안과' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '명단');
    XLSX.writeFile(wb, '환자명단_템플릿.xlsx');
  };

  const handleManualAdd = async () => {
    if (!manual.id || !manual.name) { setMessage('환자번호와 이름을 입력해주세요.'); return; }
    if (!batchDoctor) { setMessage('먼저 담당 교수를 선택해주세요.'); return; }
    if (isArchivedDate(batchDate)) { setMessage(PAST_DATE_MSG); return; }
    // 나이: 엑셀과 같은 규칙 ('80', '80세', '11세5개월' → 11). 비워도 됨, 잘못 적으면 추가하지 않고 안내
    const age = ageYears(manual.age);
    if (String(manual.age).trim() && age === null) { setMessage('나이는 숫자로 적어주세요 (예: 80, 아이는 11세5개월도 됩니다).'); return; }
    const currentFu = await loadEntries('fu-designations', [manual.id.trim()]);
    const np = buildPatient({ ...manual, id: manual.id.trim(), name: manual.name.trim(), reservation: normalizeTime(manual.reservation), sex: manual.sex, age, date: batchDate, doctor: batchDoctor }, currentFu, settings);
    const stats = await upsert([np]);
    if (stats?.linked.length) {
      const l = stats.linked[0];
      setMessage(l.linkType === 'added'
        ? `${manual.name}님을 ${batchDoctor} 2차 진료로 추가했습니다. ${l.others.join(', ')} 진료 설명 완료 후 ${settings.linkCheckAdded !== false ? '처치실에서 추가 검사를 확인합니다' : '진료 대기로 넘어갑니다'}.`
        : `${manual.name}님은 ${batchDate}에 ${l.others.join(', ')} 명단에도 있어 두 교수님 진료로 연결했습니다 (${l.first ? `${batchDoctor} 먼저` : `${l.others.join(', ')} 먼저`}).`);
    }
    else if (stats?.timeChanged.length) setMessage(`${manual.name}님은 이미 명단에 있어 예약시간만 ${np.reservation}(으)로 바꿨습니다. 진행 상황은 그대로입니다.`);
    else if (stats?.unchanged.length) setMessage(`${manual.name}님은 이미 ${batchDate} ${batchDoctor} 명단에 있습니다.`);
    else setMessage(`${manual.name}님을 ${batchDate} ${batchDoctor} 명단에 추가했습니다.${hasFollowupApplied(np) ? ' (이전 정보 적용)' : ''}`);
    setManual(EMPTY_MANUAL);
  };

  const archived = useArchivedPatients(manageDate, patients);
  const readOnly = archived.isArchived;
  const [manageDoctor, setManageDoctor] = useState('');
  const dayAll = (readOnly ? archived.list : patients).filter(p => p.date === manageDate);
  const dayDoctors = [...new Set([...doctors, ...dayAll.map(p => p.doctor)].filter(Boolean))];
  const [manageQuery, setManageQuery] = useState('');
  const mq = manageQuery.trim();
  const byDate = dayAll.filter(p => (!manageDoctor || p.doctor === manageDoctor) && inSession(p, session)
    && (!mq || String(p.name || '').includes(mq) || String(p.id).includes(mq))).sort(sortMode === 'name' ? byName : byQueue);
  // 접수 안내 일괄 적용: 지금 보이는 명단(날짜·교수·오전/오후·검색) 중 접수 전 환자에게 한 번에 적용. 바로 되돌릴 수 있습니다.
  const [bulkNote, setBulkNote] = useState(null);
  const [bulkNoteDone, setBulkNoteDone] = useState(null);
  const applyBulkNote = (targets, text, skip, verb, procId = '') => {
    const keys = new Set(targets.map(patientKey));
    const snapshot = Object.fromEntries(targets.map(p => [patientKey(p), { kioskNote: p.kioskNote || '', skipVision: !!p.skipVision, preProcs: p.preProcs || [] }]));
    mutatePatients(prev => prev.map(p => (keys.has(patientKey(p)) && !p.checkin ? {
      ...p, kioskNote: text, skipVision: skip,
      ...(procId && !(p.preProcs || []).some(i => i.procId === procId && !i.done) ? { preProcs: [...(p.preProcs || []), ...makePreProcs([procId], settings)] } : {}),
    } : p)));
    setBulkNote(null);
    setBulkNoteDone({ label: `${manageDate} ${manageDoctor || '모든 교수님'}${sessionLabel} ${targets.length}명 ${verb}.`, snapshot });
  };
  const undoBulkNote = () => {
    const { snapshot } = bulkNoteDone;
    mutatePatients(prev => prev.map(p => (snapshot[patientKey(p)] ? { ...p, ...snapshot[patientKey(p)] } : p)));
    setBulkNoteDone(null);
  };
  // 전체 삭제: 지금 보이는 명단(날짜 + 선택한 교수)을 한 번에 지웁니다. 바로 되돌릴 수 있습니다.
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const sessionLabel = session === 'am' ? ' 오전' : session === 'pm' ? ' 오후' : '';
  const [bulkDeleted, setBulkDeleted] = useState(null);
  const bulkDelete = () => {
    const keys = byDate.map(patientKey);
    const snapshot = dayAll;
    const label = `${manageDate}${manageDoctor ? ` ${manageDoctor}` : ' 전체'}${sessionLabel} 명단 ${keys.length}명`;
    setBulkConfirm(false);
    mutatePatients(prev => keys.reduce((list, k) => removeVisit(list, k), prev));
    setBulkDeleted({ keys, snapshot, label });
  };
  const undoBulkDelete = () => {
    const { keys, snapshot } = bulkDeleted;
    const deleted = new Set(keys);
    setBulkDeleted(null);
    mutatePatients(prev => {
      const have = new Set(prev.map(patientKey));
      const before = new Map(snapshot.map(p => [patientKey(p), p]));
      // 남아 있던 다른 교수님 진료는 연결 상태만 원래대로
      const restored = prev.map(p => {
        const old = before.get(patientKey(p));
        if (!old || deleted.has(patientKey(p))) return p;
        return { ...p, primaryKey: old.primaryKey, primaryDoctor: old.primaryDoctor, linkWaiting: old.linkWaiting };
      });
      return [...restored, ...snapshot.filter(p => deleted.has(patientKey(p)) && !have.has(patientKey(p)))];
    });
    setMessage('삭제를 되돌렸습니다.');
  };
  const checkCount = readOnly ? 0 : byDate.filter(p => needsTestCheck(p, doctorPrefs)).length;
  const updateOne = (pk, fn) => mutatePatients(prev => prev.map(p => (patientKey(p) === pk ? fn(p) : p)));
  const removeOne = (pk) => mutatePatients(prev => removeVisit(prev, pk));
  const reassignDoctor = (p, doctor) => {
    if (patients.some(x => x.id === p.id && x.date === p.date && x.doctor === doctor && patientKey(x) !== patientKey(p))) {
      setMessage(`${p.name}님은 ${p.date}에 이미 ${doctor} 진료가 있습니다.`);
      return;
    }
    const pk = patientKey(p);
    mutatePatients(prev => prev.map(x => (patientKey(x) === pk ? { ...x, doctor } : x.primaryKey === pk ? { ...x, primaryDoctor: doctor } : x)));
  };
  // 초진 ↔ 재진: 화면에 보이던 값의 반대로 (두 PC가 동시에 눌러도 같은 결과)
  const toggleFirst = (pk, on) => updateOne(pk, p => ({ ...p, firstVisit: on }));
  const [infoEdit, setInfoEdit] = useState(null);
  // 이전 시력 입력 (관리자에서만)
  const [prevFor, setPrevFor] = useState(null);
  const prevPatient = prevFor ? patients.find(x => patientKey(x) === prevFor) : null;
  const saveInfo = (p, info) => {
    const id = info.id.trim();
    if (!id || !info.name.trim()) { setMessage('환자번호와 이름을 입력해주세요.'); return; }
    if (id !== p.id && patients.some(x => x.id === id && x.date === p.date)) {
      setMessage(`환자번호 ${id}는 ${p.date} 명단에 이미 있습니다.`);
      return;
    }
    // 나이: 엑셀·환자 추가와 같은 규칙, 비우면 지움, 잘못 적으면 저장하지 않고 안내
    const age = ageYears(info.age);
    if (String(info.age ?? '').trim() && age === null) { setMessage('나이는 숫자로 적어주세요 (예: 80, 아이는 11세5개월도 됩니다).'); return; }
    setInfoEdit(null);
    mutatePatients(prev => editPatientInfo(prev, patientKey(p), { id, name: info.name, reservation: normalizeTime(info.reservation), sex: info.sex, age }));
    setMessage(`${info.name.trim()}님 정보를 수정했습니다.`);
  };
  const swapOrder = (p) => mutatePatients(prev => swapLinkOrder(prev, patientKey(p), doctorPrefs));
  const crAnywhere = Object.values(doctorPrefs || {}).some(v => v?.cr);

  // FU 기록에 이름이 없으면 명단에서 찾아 보여줍니다
  const nameOf = (id) => fuAll[id]?.name || fuMap[id]?.name || patients.find(p => p.id === id)?.name || '';
  const fuQuery = fuSearch.trim();
  const fuIds = Object.keys(fuAll).filter(id => !fuQuery || id.includes(fuQuery) || nameOf(id).includes(fuQuery)).slice(0, 30);
  useEffect(() => {
    // 명단에 있는 환자인데 FU 기록에 이름이 비어 있으면 채워 둡니다 (그 환자 칸만 한 번 저장)
    const need = new Map(patients.filter(p => p.id && p.name && fuMap[p.id] && !fuMap[p.id].name).map(p => [p.id, p]));
    need.forEach((p, id) => updateFu(id, prev => fillFollowupNames(prev, [p])));
  }, [patients, fuMap, updateFu]);
  const saveFuEdit = (sel, detail, dil) => {
    const id = fuEdit.id;
    const doctor = dil?.doctor || fuEdit.doctor || '';
    setFuEdit(null);
    const value = {
      ...sel,
      detail,
      dilate: dil?.mode === 'yes' || dil?.mode === 'no' ? dil.mode : undefined,
      dilateEye: dil?.mode === 'yes' ? dilateEyeOf(dil.eye) : undefined,
      cr: dil?.cr || undefined,
      preProcs: dil?.preProcs?.length ? dil.preProcs : undefined,
      name: fuEdit.name || nameOf(id),
      visitDate: fuEdit.visitDate || laterFor(fuAll[id] || fuMap[id], doctor)?.date,
      updatedAt: Date.now(),
    };
    // 이미 올라가 있는 다음 명단(오늘 포함, 같은 교수님, 접수 전)에도 바로 적용, 'FU 미지정' 표시는 지움
    if (patients.some(p => p.id === id && (p.fuMissing || (p.doctor === doctor && !p.checkin && p.date >= todayISO())))) {
      mutatePatients(prev => applyFollowupToList(prev, id, doctor, value, settings, todayISO()));
    }
    editFu(id, prev => saveFollowup(prev, id, doctor, value));
  };

  // FU 지정 창의 'FU 없음 · FU 명단에서 삭제': 그 교수님 FU 지정과 'FU 나중에' 표시, 다음 명단의 'FU 미지정' 표시를 지움
  const deleteFuEdit = (e, chosenDoctor) => {
    const id = e.id;
    const doctor = chosenDoctor || e.doctor || '';
    setFuEdit(null);
    // 그 교수님 것만 지움. 교수님을 모르면 '나중에' 표시만 지우고 저장된 FU는 그대로 (다른 교수님 FU 보호)
    editFu(id, prev => (doctor ? unmarkFollowupLater(deleteFollowup(prev, id, doctor), id, doctor) : unmarkFollowupLater(prev, id)));
    // 'FU 미지정'은 그 교수님 기록에서만 지움 (교수님을 모르면 모두)
    const mine = (p) => p.id === id && p.fuMissing && (!doctor || p.doctor === doctor);
    if (patients.some(mine)) mutatePatients(prev => prev.map(p => (mine(p) ? { ...p, fuMissing: false } : p)));
    setMessage(`${e.name || nameOf(id) || id} FU 없음 · FU 명단에서 삭제했습니다.`);
  };

  const TABS = [
    { key: 'upload', label: '명단 업로드' },
    { key: 'manual', label: '환자 추가' },
    { key: 'today', label: '명단 관리' },
    { key: 'fu', label: 'FU 지정 관리' },
    { key: 'notice', label: '대기 화면 안내' },
    { key: 'stats', label: '오늘 통계' },
    { key: 'guide', label: '역할별 안내문' },
  ];

  return (
    <ScreenShell title="관리자" color="slate" onBack={onBack} lastSync={lastSync}>
      <div className="flex gap-2 mb-5 flex-wrap print:hidden">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => { setTab(t.key); setMessage(''); }} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-slate-800 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {message && <div className="bg-slate-800 text-white text-sm rounded-xl px-4 py-3 mb-4">{message}</div>}

      {(tab === 'upload' || tab === 'manual') && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4 grid grid-cols-2 gap-3">
          <Field label="진료 날짜">
            <input type="date" min={shiftISO(realTodayISO(), -1)} value={batchDate} onChange={e => setBatchDate(e.target.value)} className={INPUT} />
          </Field>
          {tab === 'upload' ? (
            <Field label="진료의">
              <div className="text-sm text-slate-500 py-2">엑셀의 진료의 칸으로 교수님을 자동으로 나눕니다</div>
            </Field>
          ) : <Field label="담당 교수">
            {doctors.length === 0 ? (
              <div className="text-sm text-red-600 py-2">설정 &gt; 교수 관리에서 먼저 등록해주세요</div>
            ) : (
              <select value={batchDoctor} onChange={e => setBatchDoctor(e.target.value)} className={INPUT}>
                {doctors.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
          </Field>}
        </div>
      )}

      {tab === 'upload' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="font-medium text-slate-900 mb-1">엑셀 명단 올리기</div>
          <p className="text-sm text-slate-500 mb-3">엑셀 첫 줄 제목: 환자명 · 환자번호 · 예약 · 초재진 · 진료의 (제목 글자가 정확히 같아야 함, 칸 순서·다른 칸은 상관없음, 재진 외에는 초진). 성별 · 나이 칸(또는 '성별/나이' 한 칸)이 있으면 함께 읽어 이름 옆에 'M/80'으로 보여 줍니다 (남 → M, 여 → F, 11세5개월 → 11, 없어도 됨). 진료의가 교수 관리에 등록된 이름과 맞지 않는 환자는 등록하지 않습니다.</p>
          <div className="flex gap-3 flex-wrap items-center">
            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium cursor-pointer">
              <Upload size={16} /> 엑셀 올리기
              <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            </label>
            <button type="button" onClick={downloadTemplate} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600">템플릿 받기</button>
            <button type="button" onClick={loadSample} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600">데모 샘플 넣기</button>
          </div>
          {uploadResult && <UploadResult result={uploadResult} patients={patients} onRemove={removeOne} onShowList={() => { setManageDate(uploadResult.date); setTab('today'); }} />}
        </div>
      )}

      {tab === 'manual' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="font-medium text-slate-900 mb-3">환자 한 명 추가</div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <input placeholder="환자번호" value={manual.id} onChange={e => setManual({ ...manual, id: e.target.value })} className={INPUT} />
            <input placeholder="이름" value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })} className={INPUT} />
            <input placeholder="예약시간 (예: 09:30)" value={manual.reservation} onChange={e => setManual({ ...manual, reservation: e.target.value })} className={INPUT} />
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={manual.firstVisit} onChange={e => setManual({ ...manual, firstVisit: e.target.checked })} className="w-4 h-4" />
              초진
            </label>
            {/* 성별·나이 (비워도 됨) — 직원 화면 이름 옆 'M/80' */}
            <select aria-label="성별" value={manual.sex} onChange={e => setManual({ ...manual, sex: e.target.value })} className={INPUT}>
              <option value="">성별 (비워도 됨)</option>
              <option value="M">남 (M)</option>
              <option value="F">여 (F)</option>
            </select>
            <input placeholder="나이 (예: 80, 비워도 됨)" value={manual.age} onChange={e => setManual({ ...manual, age: e.target.value })} className={INPUT} />
          </div>
          <button type="button" onClick={handleManualAdd} className="px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium">명단에 추가</button>
        </div>
      )}

      {tab === 'today' && (
        <div>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-sm text-slate-500">날짜</span>
            <input type="date" value={manageDate} onChange={e => setManageDate(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
            <select value={manageDoctor} onChange={e => setManageDoctor(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">전체 교수</option>
              {dayDoctors.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <span className="text-sm text-slate-400">{byDate.length}명</span>
            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-1.5">
              <Search size={14} className="text-slate-400" />
              <input placeholder="이름·환자번호 찾기" value={manageQuery} onChange={e => setManageQuery(e.target.value)} className="outline-none text-sm w-32" />
              {mq && <button type="button" aria-label="검색 지우기" onClick={() => setManageQuery('')} className="text-slate-400 text-sm">✕</button>}
            </div>
            {!readOnly && !mq && byDate.length > 0 && (
              <button type="button" onClick={() => setBulkConfirm(true)} className="text-sm px-3 py-2 rounded-lg border border-red-200 text-red-600 bg-white flex items-center gap-1">
                <Trash2 size={14} /> {`${manageDoctor ? `${manageDoctor} ` : ''}${sessionLabel.trim() ? `${sessionLabel.trim()} ` : ''}전체 삭제`}
              </button>
            )}
            {!readOnly && byDate.length > 0 && (
              <button type="button" onClick={() => { setBulkNote({ text: '', skip: false }); setMessage(''); }} className="text-sm px-3 py-2 rounded-lg border border-violet-300 text-violet-700 bg-white">
                접수 안내 일괄 적용
              </button>
            )}
            <div className="ml-auto flex gap-2 flex-wrap">
              <SegmentedToggle value={session} onChange={setSession} options={SESSION_OPTIONS} />
              <SegmentedToggle value={sortMode} onChange={changeSort} options={SORT_OPTIONS} />
            </div>
          </div>
          {bulkDeleted && (
            <div className="bg-slate-800 text-white text-sm rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
              <span>{bulkDeleted.label}을 삭제했습니다.</span>
              <button type="button" onClick={undoBulkDelete} className="text-sm font-semibold text-amber-300 px-3 py-1 rounded-lg flex items-center gap-1 shrink-0"><RotateCcw size={14} /> 되돌리기</button>
            </div>
          )}
          {bulkNoteDone && (
            <div className="bg-violet-800 text-white text-sm rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
              <span>{bulkNoteDone.label}</span>
              <button type="button" onClick={undoBulkNote} className="text-sm font-semibold text-amber-300 px-3 py-1 rounded-lg flex items-center gap-1 shrink-0"><RotateCcw size={14} /> 되돌리기</button>
            </div>
          )}
          {bulkNote && (() => {
            const targets = byDate.filter(p => !p.checkin && !p.consultDone);
            const skipped = byDate.length - targets.length;
            return (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
                  <h3 className="text-lg font-medium text-slate-900 mb-1">접수 안내 일괄 적용</h3>
                  <p className="text-sm text-slate-600 mb-3">
                    <b>{manageDate} {manageDoctor || '모든 교수님'}{sessionLabel}{mq ? ` · '${mq}' 검색` : ''}</b> 명단 중 접수 전 환자 <b>{targets.length}명</b>에게 적용합니다.
                    {skipped > 0 && <span className="text-slate-500"> (이미 접수했거나 진료가 끝난 {skipped}명은 제외)</span>}
                  </p>
                  <input autoFocus value={bulkNote.text} onChange={e => setBulkNote(b => ({ ...b, text: e.target.value }))} aria-label="일괄 접수 안내 문구"
                    placeholder="예: 바로 29번방으로 오세요" className={INPUT} />
                  <label className="flex items-center gap-2 text-sm text-slate-700 mt-3 cursor-pointer">
                    <input type="checkbox" checked={bulkNote.skip} onChange={e => setBulkNote(b => ({ ...b, skip: e.target.checked }))} className="w-4 h-4" />
                    시력검사 없이 바로 진료
                  </label>
                  {(settings.procedures || []).length > 0 && (
                    <label className="flex items-center gap-2 text-sm text-slate-700 mt-3">
                      진료 전 처치 추가
                      <select value={bulkNote.proc || ''} aria-label="일괄 진료 전 처치" onChange={e => setBulkNote(b => ({ ...b, proc: e.target.value, skip: e.target.value ? true : b.skip }))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                        <option value="">없음</option>
                        {settings.procedures.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </label>
                  )}
                  <p className="text-xs text-slate-500 mt-3">적용한 뒤에도 환자 카드에서 한 명씩 고치거나 × 로 지울 수 있습니다. 이미 적힌 안내는 새 문구로 바뀝니다.</p>
                  <div className="flex gap-2 mt-5 flex-wrap">
                    <button type="button" onClick={() => setBulkNote(null)} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
                    <button type="button" onClick={() => applyBulkNote(targets, '', false, '안내를 지웠습니다')} className="flex-1 py-3 rounded-xl border border-violet-300 text-violet-700">이 명단 안내 모두 지우기</button>
                    <button type="button" disabled={!bulkNote.text.trim() && !bulkNote.skip && !bulkNote.proc} onClick={() => applyBulkNote(targets, bulkNote.text.trim(), bulkNote.skip, '안내를 적용했습니다', bulkNote.proc)} className="flex-1 py-3 rounded-xl bg-violet-600 text-white font-medium disabled:opacity-40">{targets.length}명에 적용</button>
                  </div>
                </div>
              </div>
            );
          })()}
          {bulkConfirm && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md">
                <h3 className="text-lg font-medium text-slate-900 mb-1">명단 전체 삭제</h3>
                <p className="text-sm text-slate-600 mb-2">
                  <b>{manageDate} {manageDoctor || '모든 교수님'}{sessionLabel}</b> 명단 <b>{byDate.length}명</b>을 모두 삭제합니다.
                </p>
                {byDate.some(p => p.checkin) && <p className="text-sm text-red-600 mb-2">이미 접수한 환자 {byDate.filter(p => p.checkin).length}명도 함께 삭제됩니다.</p>}
                <p className="text-xs text-slate-500">삭제 직후 화면에 나오는 [되돌리기]로 복구할 수 있습니다. 환자별 다음 내원 정보(FU)는 지워지지 않습니다.</p>
                <div className="flex gap-2 mt-6">
                  <button type="button" onClick={() => setBulkConfirm(false)} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
                  <button type="button" onClick={bulkDelete} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-medium">{byDate.length}명 삭제</button>
                </div>
              </div>
            </div>
          )}
          {readOnly && (
            <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 mb-4 text-sm text-slate-600">
              {archived.loading ? '지난 명단을 불러오는 중입니다…' : archived.error ? '지난 명단을 불러오지 못했습니다. 서버 연결을 확인해주세요.' : '지난 날짜의 보관된 명단입니다. 보기만 할 수 있습니다.'}
            </div>
          )}
          {checkCount > 0 && (
            <div className="bg-orange-50 border border-orange-300 rounded-xl px-4 py-3 mb-4 text-sm text-orange-900">
              <span className="font-semibold">확인 필요 {checkCount}명</span> · 검사 미지정 또는 지난 진료 FU 미지정
            </div>
          )}
          {byDate.length === 0 ? <EmptyState text={readOnly && archived.error ? '명단은 서버에 그대로 있습니다. 연결을 확인한 뒤 날짜를 다시 골라 주세요.' : readOnly && archived.loading ? '불러오는 중…' : mq ? `'${mq}'에 맞는 환자가 없습니다` : '이 날짜에 올라간 환자가 없습니다'} /> : byDate.map(p => {
            const flag = !readOnly && needsTestCheck(p, doctorPrefs);
            return (
            <div key={patientKey(p)} className={`bg-white rounded-xl p-4 mb-3 flex items-center justify-between gap-3 flex-wrap ${flag ? 'border-2 border-orange-400' : 'border border-slate-200'}`}>
              <div>
                <div className="font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                  <span className="t-name">{p.name}</span> <SexAge p={p} /> <span className="text-xs text-slate-400">{p.id}</span>
                  {flag && !p.fuMissing && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold">검사 미지정 · 확인 필요</span>}
                  {p.fuMissing && !p.consultDone && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold border border-orange-300">지난 진료 FU 미지정</span>}
                  {p.primaryKey && <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">2차 진료 · {p.primaryDoctor} 후{p.linkType === 'added' ? ' (진료 중 추가)' : ''}</span>}
                  {dayAll.filter(x => x.primaryKey === patientKey(p)).map(x => <span key={patientKey(x)} className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700">1차 진료 → {x.doctor}</span>)}
                  {p.consultDone && <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700">진료 완료</span>}
                  <PatientMemo p={p} readOnly={readOnly} />
                </div>
                <div className="text-xs text-slate-400 mt-0.5">예약 {p.reservation || '-'} · {readOnly ? p.doctor : getStage(p, settings).label}</div>
                {!readOnly && p.linkWaiting && p.linkType === 'planned' && <div className="text-xs text-fuchsia-700 mt-0.5">검사는 1차 진료 전에 함께 합니다. 추가할 검사는 1차 진료 카드에 지정해주세요.</div>}
              </div>
              {!readOnly && <>
              <div className="flex gap-2 items-center flex-wrap">
                {p.linkWaiting && p.linkType === 'planned' && !patients.find(x => patientKey(x) === p.primaryKey)?.checkin && !patients.find(x => patientKey(x) === p.primaryKey)?.primaryKey && (
                  <button type="button" onClick={() => swapOrder(p)} className="text-xs px-3 py-1.5 rounded-lg border border-fuchsia-300 text-fuchsia-700">진료 순서 바꾸기</button>
                )}
                <button type="button" onClick={() => setInfoEdit(p)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600">정보 수정</button>
                <select value={p.doctor} onChange={e => reassignDoctor(p, e.target.value)} className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
                  {!doctors.includes(p.doctor) && <option value={p.doctor}>{p.doctor}</option>}
                  {doctors.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <button type="button" onClick={() => toggleFirst(patientKey(p), !p.firstVisit)} className={`text-xs px-3 py-1.5 rounded-lg border ${p.firstVisit ? 'bg-sky-50 border-sky-300 text-sky-700' : 'border-slate-300 text-slate-500'}`}>
                  {p.firstVisit ? '초진' : '재진'}
                </button>
                {/* 소아 등 안압을 아예 재지 않는 환자: 시력방에 '안압 안 잼', NCT 칸 없음 */}
                <button type="button" onClick={() => patchPatient(mutatePatients, patientKey(p), () => ({ noIop: !p.noIop }))} title="누르면 안압 잼 ↔ 안 잼"
                  className={`text-xs px-3 py-1.5 rounded-lg border ${p.noIop ? 'bg-amber-50 border-amber-300 text-amber-800 font-semibold' : 'border-slate-300 text-slate-500'}`}>
                  {p.noIop ? '안압 안 잼' : '안압 잼'}
                </button>
                <ConfirmButton label="삭제" onConfirm={() => removeOne(patientKey(p))} />
              </div>
              {(() => {
                // 이전 시력 · 접수 안내 · 진료 전 처치를 한 줄에 (이전 시력이 없으면 [이전 시력 입력] 버튼만)
                const prev = previousMeasure(p, history);
                const missing = !hasVisionValue(prev);
                return (
                  <div className="w-full flex items-center gap-x-3 gap-y-2 flex-wrap">
                    {missing ? (
                      <button type="button" onClick={() => setPrevFor(patientKey(p))} className="text-xs px-2.5 py-1 rounded-lg border border-orange-300 text-orange-700 bg-orange-50 font-medium">이전 시력 입력</button>
                    ) : (
                      <span className="flex items-center gap-2">
                        <MeasureLine label="이전" m={prev} />
                        {prev?.source === 'manual' && <button type="button" onClick={() => setPrevFor(patientKey(p))} className="text-xs text-slate-400 underline">수정</button>}
                      </span>
                    )}
                    {!p.checkin && !p.consultDone ? <KioskNoteEditor inline p={p} /> : (p.kioskNote || p.skipVision) && <KioskNoteLine p={p} />}
                    <PreProcEditor inline p={p} procedures={settings.procedures} />
                    <DilationRow compact group showDrops={false} p={p} prefs={doctorPrefs} waitMin={settings.dilationWaitMin} mutatePatients={mutatePatients} />
                  </div>
                );
              })()}
              <TestPicker p={p} tests={orderForPicking(allTests, settings)} defaultOpen={flag} mainIds={mainTestIds(doctorPrefs, p.doctor)}
                onPick={(t, on) => { if (p.consultDone) return; if (t.popupOnClick) setTodayDetail({ key: patientKey(p), testId: t.id }); else setTodayTest(patientKey(p), t, !on); }}
                onSpecial={t => { if (!p.consultDone) setTodayDetail({ key: patientKey(p), testId: t.id }); }}>
                <DilationRow togglesOnly inline p={p} prefs={doctorPrefs} waitMin={settings.dilationWaitMin} mutatePatients={mutatePatients} />
              </TestPicker>
              </>}
            </div>
            );
          })}
        </div>
      )}

      {tab === 'notice' && (
        <BoardNoticeAdmin patients={patients} settings={settings} doctors={doctors} doctorPrefs={doctorPrefs} value={boardNotices} mutate={mutateBoardNotices} />
      )}

      {tab === 'stats' && <DayStats patients={patients} settings={settings} doctors={doctors} />}

      {tab === 'guide' && <RoleGuides settings={settings} />}

      {tab === 'fu' && (
        <div>
          <div className="flex items-center gap-2 mb-4 bg-white border border-slate-300 rounded-lg px-3 py-2">
            <Search size={16} className="text-slate-400" />
            <input placeholder="환자번호 또는 이름으로 찾기" value={fuSearch} onChange={e => setFuSearch(e.target.value)} className="flex-1 outline-none text-sm" />
          </div>
          {(() => {
            // 교수님별로 한 줄 (두 교수님이 모두 'FU 나중에'를 눌렀으면 두 줄)
            const later = Object.entries(fuAll).flatMap(([id, r]) => laterEntries(r).map(e => ({ id, r, e })))
              .sort((a, b) => String(a.e.date).localeCompare(String(b.e.date)));
            if (!later.length) return null;
            return (
              <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-4 mb-4">
                <div className="font-medium text-orange-900 mb-1">FU 나중에 지정할 환자 · {new Set(later.map(x => x.id)).size}명</div>
                {later.map(({ id, r, e }) => (
                  <div key={`${id}-${e.doctor || ''}`} className="flex items-center justify-between gap-2 py-1.5 border-t border-orange-200 first:border-t-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="t-name">{r.name || nameOf(id) || '이름 정보 없음'}</span>
                      <span className="text-xs text-slate-500">{id} · 최근 진료 {e.date} · {e.doctor}</span>
                    </span>
                    <button type="button" onClick={() => setFuEdit({ ...(r.byDoctor?.[e.doctor] || {}), id, doctor: e.doctor, name: r.name || nameOf(id), visitDate: e.date })}
                      className="text-sm px-3 py-1.5 rounded-lg bg-orange-500 text-white font-medium shrink-0">지정</button>
                  </div>
                ))}
              </div>
            );
          })()}
          {!allFu && <EmptyState text="FU 지정을 불러오는 중…" />}
          {allFu && fuIds.length === 0 && !fuSearch.trim() && <EmptyState text="저장된 FU 지정이 없습니다" />}
          {fuIds.flatMap(id => followupRows(id, fuAll[id])).map(({ id, doctor: fuDoctor, fu }) => {
            const dilText = [fu.dilate === 'yes' ? `산동${dilateEyeOf(fu.dilateEye) ? ` (${DILATE_EYE_LABEL[fu.dilateEye]})` : ''}` : fu.dilate === 'no' ? '산동 안 함' : '', fu.cr ? 'CR' : ''].filter(Boolean).join(', ');
            const preText = (fu.preProcs || []).map(pid => (settings.procedures || []).find(x => x.id === pid)?.name).filter(Boolean).join(', ');
            const names = [preText && `진료 전 처치: ${preText}`, allTests.filter(t => fu[t.id]).map(t => testLabelWithOptions(t, fu.detail?.[t.id])).join(', '), dilText].filter(Boolean).join(' / ');
            const fuNotes = allTests
              .filter(t => fu[t.id] && String(fu.detail?.[t.id]?.note ?? '').trim())
              .map(t => ({ id: t.id, short: t.short, note: String(fu.detail[t.id].note).trim() }));
            return (
              <div key={`${id}-${fuDoctor}`} className="bg-white border border-slate-200 rounded-xl p-4 mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                    {nameOf(id) ? <span className="t-name">{nameOf(id)}</span> : <span className="text-slate-400 font-normal">이름 정보 없음</span>}
                    <span className="text-xs text-slate-400 font-normal">{id}</span>
                    {fuDoctor && <span className="text-xs text-slate-500 font-normal">· 다음 내원 {fuDoctor}</span>}
                    {fuVisitDate(fu) && <span className="text-xs text-slate-500 font-normal">· 최근 진료 {fuVisitDate(fu)}</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{names || '지정된 검사 없음'}</div>
                  {fuNotes.map(n => (
                    <div key={n.id} className="text-xs text-yellow-800 mt-0.5"><span className="font-medium">{n.short}</span> {n.note}</div>
                  ))}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => setFuEdit({ ...fu, id, doctor: fuDoctor, name: nameOf(id) })} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600">수정</button>
                  <ConfirmButton label="삭제" onConfirm={() => { editFu(id, prev => deleteFollowup(prev, id, fuDoctor)); setMessage(`${nameOf(id) || id}${fuDoctor ? ` ${fuDoctor}` : ''} 다음 내원 지정을 삭제했습니다.`); }} />
                </div>
              </div>
            );
          })}
          {allFu && fuQuery && !fuAll[fuQuery] && /^[0-9A-Za-z-]+$/.test(fuQuery) && (
            <button type="button" onClick={() => setFuEdit({ id: fuQuery, name: nameOf(fuQuery) })} className="mt-3 text-sm px-4 py-2 rounded-lg bg-slate-800 text-white">
              {fuSearch.trim()} 새로 지정하기
            </button>
          )}
        </div>
      )}

      {todayEdit && todayTest && <TestDetailModal key={`${todayDetail.key}-${todayTest.id}`} test={todayTest} patientName={todayEdit.name} on={!!todayEdit.assigned?.[todayTest.id]} value={todayEdit.detail?.[todayTest.id]}
        onApply={d => { const kept = pickDetail({ [todayTest.id]: d }, { [todayTest.id]: true }, [todayTest])[todayTest.id] || null; setTodayTest(todayDetail.key, todayTest, true, kept); setTodayDetail(null); }}
        onRemove={() => { setTodayTest(todayDetail.key, todayTest, false); setTodayDetail(null); }} onCancel={() => setTodayDetail(null)} />}
      {prevPatient && (
        <MeasureModal
          key={`prev-${prevFor}`}
          mode="prev"
          patient={prevPatient}
          previous={previousMeasure(prevPatient, history)}
          gatAvailable={false}
          gatAssigned={false}
          onSave={({ measure, date }) => {
            const pk = prevFor;
            setPrevFor(null);
            const prevManual = hasAnyValue(measure) ? { ...measure, date } : null;
            mutatePatients(prev => prev.map(x => (patientKey(x) === pk ? { ...x, prevManual } : x)));
          }}
          onCancel={() => setPrevFor(null)}
        />
      )}
      {infoEdit && <PatientInfoModal patient={infoEdit} onSave={info => saveInfo(infoEdit, info)} onCancel={() => setInfoEdit(null)} />}
      {fuEdit && (
        <TestCheckModal
          key={`fu-${fuEdit.id}`}
          title={`${fuEdit.name || nameOf(fuEdit.id) ? `${fuEdit.name || nameOf(fuEdit.id)}님 (${fuEdit.id})` : `환자 ${fuEdit.id}`} 다음 내원 검사`}
          subtitle="다음 내원 때 필요한 검사를 체크하고 저장을 누르세요"
          followup={{ doctor: fuEdit.doctor || (fuAll[fuEdit.id] || fuMap[fuEdit.id])?.doctor || patients.find(p => p.id === fuEdit.id)?.doctor || '', doctors, prefs: doctorPrefs }}
          onDelete={(d) => deleteFuEdit(fuEdit, d)}
          tests={allTests}
          settings={settings}
          initial={fuEdit}
          initialDetail={fuEdit.detail}
          dilation={{ crAvailable: crAnywhere, initial: { mode: fuEdit.dilate || 'default', cr: !!fuEdit.cr, eye: fuEdit.dilateEye } }}
          preProcChoice={{ initial: fuEdit.preProcs || [] }}
          confirmLabel="저장"
          onConfirm={saveFuEdit}
          onCancel={() => setFuEdit(null)}
        />
      )}
    </ScreenShell>
  );
}
