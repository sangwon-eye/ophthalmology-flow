// 여러 화면이 함께 쓰는 카드·버튼·창
import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import {
  Check, Plus, ChevronUp, ChevronDown, AlertTriangle, Trash2, GripVertical, RotateCcw, StickyNote,
} from 'lucide-react';
import { procNeedsConsent, procConsentPatch, procConsentCancelPatch, testConsentMissing, testConsentPatch, testConsentCancelPatch, previousMeasure, fuMissingNow, REDO_LABEL, sexAgeLabel, checkItems, procCheckDue, confirmProcCheckPatch, cancelProcCheckPatch, procLabel, RESULT_FIELDS, hasResultValue, resultEyeText, resultFieldsOf, hxPending, nctMeasured, hasAnyValue as hasAnyMeasure, COLOR_MAP, DILATE_EYE_LABEL, EYE_OPTIONS, INPUT, MEASURE_FIELDS, PERFORMER_LABEL, VISION_KEY, activeVf, cleanDetail, crActive, detailEye, dilateEyeOf, dilationBlockers, dilationState, confirmDilationPatch, fieldText, fmtClock, forcedToday, hxNeeded, inConsult, isVfTest, makePreProcs, needsDilation, normalizeMeasure, octEyeGroups, orderForPicking, orderedOptions, patchPatient, patientKey, pickDetail, prepPositiveNames, setDragActive, setLate, testLabelWithOptions, timeToMin, toggleDrop, addExtraDrop, undoExtraDrop, withoutPrep } from '../core/flow.jsx';
import { DEFAULT_HX_FIELDS } from '../core/storage.jsx';

/* ------------------------------------------------------------------ */
/* 공용 UI                                                             */
/* ------------------------------------------------------------------ */
/* 글씨 크기: 컴퓨터마다 따로 저장합니다 (화면 크기가 다르므로). '자동'은 창 너비에 맞춰 줄입니다. */
export const TEXT_SIZE_KEY = 'ui-text-size';
export const TEXT_SIZE_OPTIONS = [['auto', '자동'], ['0.7', '70%'], ['0.8', '80%'], ['0.9', '90%'], ['1', '100%'], ['1.1', '110%'], ['1.25', '125%'], ['1.5', '150%']];
export function textScale(v) {
  if (v !== 'auto') return Number(v) || 1;
  return Math.max(0.75, Math.min(1, window.innerWidth / 1100));
}
export function applyTextSize(v) {
  const scale = textScale(v);
  document.documentElement.style.fontSize = `${Math.round(scale * 1000) / 10}%`;
  // 80% 이하에서는 설명 문구(t-hint)를 숨깁니다
  if (scale <= 0.8) document.documentElement.dataset.compact = '1';
  else delete document.documentElement.dataset.compact;
}
export function useTextSize() {
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(TEXT_SIZE_KEY) || 'auto'; } catch { return 'auto'; }
  });
  useEffect(() => {
    const onChange = (e) => setValue(e.detail);
    window.addEventListener('ui-text-size', onChange);
    return () => window.removeEventListener('ui-text-size', onChange);
  }, []);
  const change = useCallback((v) => {
    try { localStorage.setItem(TEXT_SIZE_KEY, v); } catch { /* 저장 못 해도 지금 화면에는 적용 */ }
    window.dispatchEvent(new CustomEvent('ui-text-size', { detail: v }));
  }, []);
  return [value, change];
}
// App 에서 한 번만 사용: 선택한 크기를 적용하고, '자동'이면 창 크기가 바뀔 때마다 다시 계산
export function useApplyTextSize() {
  const [value] = useTextSize();
  useEffect(() => {
    applyTextSize(value);
    if (value !== 'auto') return undefined;
    const onResize = () => applyTextSize('auto');
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [value]);
}
// selectClassName: 고르기 칸 색 (어두운 환자용 화면에서 바꿈)
export function TextSizeControl({ className = '', selectClassName = 'border-slate-300 bg-white text-slate-600' }) {
  const [value, change] = useTextSize();
  return (
    <label className={`flex items-center gap-1 text-xs text-slate-500 ${className}`} title="이 컴퓨터의 글씨 크기 (컴퓨터마다 따로 저장됩니다)">
      글씨
      <select value={value} onChange={e => change(e.target.value)} className={`text-xs border rounded-lg px-1.5 py-1.5 ${selectClassName}`}>
        {TEXT_SIZE_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
    </label>
  );
}

// 직원 화면 폭: 넓은 모니터에서 카드가 한 줄에 들어가도록 넓게 (좁은 화면·태블릿은 화면 폭에 맞춤)
export const SHELL_WIDTH = 'max-w-6xl';
// 시력방 2열 (10-09 사용자): 1920 모니터를 100~110%로 볼 때(화면 폭 1700px 이상)만 두 줄, 화면 폭도 넓게.
// 1280 모니터·125% 이상은 한 줄 (사용자: 1280 두 줄은 칸이 좁아 지저분함). 같은 줄 두 카드는 높이를 같게(items-stretch).
// 검사실·명단 관리는 검사 칸이 길어 한 줄 그대로
export const SHELL_WIDE = 'max-w-6xl min-[1700px]:max-w-[1840px]';
export const WIDE_LIST = 'grid grid-cols-1 min-[1700px]:grid-cols-2 gap-x-4 items-stretch';
// 화면 버전 (화면 파일을 만든 시각). 업데이트 뒤 각 PC가 새 화면인지 확인할 때 봅니다.
export const APP_VERSION = `버전 ${typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '-'}`;
// 화면 색 (구역 제목 왼쪽 막대 등): ScreenShell이 정함
export const ShellColorContext = createContext('slate');
export function ScreenShell({ title, color, onBack, lastSync, count, extra, sub, wide = false, children }) {
  const c = COLOR_MAP[color] || COLOR_MAP.slate;
  const W = wide ? SHELL_WIDE : SHELL_WIDTH;
  return (
    <ShellColorContext.Provider value={color || 'slate'}>
    <div className="min-h-screen bg-slate-50">
      <div className={`sticky top-0 z-10 ${c.bg} border-b ${c.border} print:hidden`}>
        <div className={`${W} mx-auto px-5 py-2 flex items-center justify-between gap-3 flex-wrap`}>
          <div>
            <div className={`text-[11px] leading-none font-medium ${c.text} mb-1`}>Ophthalmology Flow{forcedToday && <span className="ml-2 px-1.5 rounded bg-amber-100 text-amber-800">날짜 {forcedToday} (직접 정함)</span>}</div>
            <h1 className="text-lg leading-tight font-semibold text-slate-900">
              {title}
              {/* 10-09 사용자: 멀리서도 보이게 방 색깔 큰 알약 (0명은 메인 화면처럼 흐린 회색) */}
              {typeof count === 'number' && <span data-wait-count className={`ml-2.5 inline-block align-middle ${count ? c.solid : 'bg-slate-300'} text-white text-lg font-bold leading-none px-3 py-1 -my-1 rounded-full whitespace-nowrap`}>대기 {count}명</span>}
            </h1>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {extra}
            <TextSizeControl />
            <button type="button" onClick={onBack} className="text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50">
              메인 화면
            </button>
          </div>
        </div>
        {sub && <div className={`${W} mx-auto px-5 pb-2`}>{sub}</div>}
      </div>
      <div className={`${W} mx-auto px-5 py-5`}>{children}</div>
      <div className="t-hint text-center text-xs text-slate-400 pb-6 print:hidden">
        {lastSync && <>마지막 업데이트 {lastSync.toLocaleTimeString('ko-KR')} · </>}{APP_VERSION}
      </div>
    </div>
    </ShellColorContext.Provider>
  );
}

// 구역 제목 (예: '검사 대기 · 8명'): 굵게 + 왼쪽 방 색깔 막대, 0명인 구역은 흐리고 작게 (10-09 사용자)
export function sectionHeadClass(color, muted) {
  const c = COLOR_MAP[color] || COLOR_MAP.slate;
  return muted
    ? 'border-l-4 border-slate-200 pl-2.5 text-sm font-medium text-slate-400'
    : `border-l-4 ${c.bar} pl-2.5 text-base font-bold text-slate-800`;
}
export function SectionHead({ muted = false, className = '', title, children }) {
  const color = useContext(ShellColorContext);
  return <div data-section-head className={`${sectionHeadClass(color, muted)} leading-snug ${className}`} title={title}>{children}</div>;
}

export function EmptyState({ text, compact = false }) {
  // compact: 아래에 다른 구역이 이어지는 곳 (큰 빈 칸 대신 한 줄)
  if (compact) return <div className="py-2 text-slate-400 text-sm">{text}</div>;
  return <div className="text-center py-16 text-slate-400 text-sm">{text}</div>;
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 block mb-1">{label}</span>
      {children}
    </label>
  );
}

// 두 번 눌러야 실행되는 버튼 (기록이 바로 지워지고 되돌리기가 없는 곳: 접수 취소·처치 취소 등).
// 한 번 누르면 3초 동안 '누르면 취소'(빨간 글씨)로 바뀌고, 그 안에 한 번 더 누르면 실행
export function TwoStepButton({ onConfirm, className = '', armedClassName = '', armedLabel = '누르면 취소', children }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
      className={armed ? armedClassName || `${className} !text-rose-700 font-medium` : className}>
      {armed ? armedLabel : children}
    </button>
  );
}

export function ConfirmButton({ label, confirmLabel = '한 번 더 누르면 삭제', onConfirm, disabled, className = '' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  if (disabled) {
    return (
      <button type="button" disabled className={`text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-300 flex items-center gap-1 ${className}`}>
        <Trash2 size={12} /> {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
      className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1 ${armed ? 'bg-red-600 border-red-600 text-white' : 'border-red-200 text-red-600'} ${className}`}
    >
      <Trash2 size={12} /> {armed ? confirmLabel : label}
    </button>
  );
}

export function useUndoToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);
  const show = useCallback((message, undo) => setToast({ id: Date.now(), message, undo }), []);
  const node = toast ? (
    <div className="fixed bottom-5 inset-x-0 flex justify-center px-4 z-40 pointer-events-none">
      <div className="pointer-events-auto bg-slate-900 text-white rounded-xl pl-4 pr-2 py-2 flex items-center gap-3 shadow-lg max-w-full">
        <span className="text-sm">{toast.message}</span>
        {toast.undo && (
          <button
            type="button"
            onClick={() => { toast.undo(); setToast(null); }}
            className="text-sm font-semibold text-amber-300 px-3 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
          >
            <RotateCcw size={14} /> 되돌리기
          </button>
        )}
      </div>
    </div>
  ) : null;
  return [node, show];
}

export function RecentDone({ count, children }) {
  const [open, setOpen] = useState(false);
  if (!count) return null;
  return (
    <div className="mt-8 border-t border-slate-200 pt-4">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 text-sm text-slate-600">
        <span className="font-medium">방금 완료한 환자 {count}명</span>
        <span className="flex items-center gap-1 text-xs text-slate-400">
          잘못 눌렀다면 여기서 되돌리세요 {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  );
}

// 성별/나이 (명단 엑셀에서, 예: M/80) — 이름 바로 옆. 칸이 없는 예전 기록은 표시 없음
export function SexAge({ p, className = 'text-sm text-slate-600' }) {
  const t = sexAgeLabel(p);
  return t ? <span className={className}>{t}</span> : null;
}

export function RecentRow({ p, time, children }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 flex-wrap">
      <div className="text-sm text-slate-700">
        <span className="t-name text-slate-900">{p.name}</span> <SexAge p={p} /> <span className="text-xs text-slate-400">{p.id}</span>
        {time && <span className="text-xs text-slate-400 ml-2">{time} 완료</span>}
      </div>
      <div className="flex flex-wrap gap-2 justify-end">{children}</div>
    </div>
  );
}

export function UndoButton({ label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 flex items-center gap-1 bg-white">
      <RotateCcw size={12} /> {label}
    </button>
  );
}

// 평소엔 일반 클릭, 오른쪽 클릭(터치스크린은 길게 누르기)이면 onSpecial 실행
export function SpecialPressButton({ onClick, onSpecial, className, title, children, disabled = false }) {
  const timer = useRef(null);
  const firedAt = useRef(0);
  const suppressClick = useRef(false);
  const clear = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };
  useEffect(() => clear, []);
  const trigger = () => {
    // 터치 길게 누르기에서 타이머와 contextmenu가 둘 다 올 수 있어 한 번만 실행
    if (Date.now() - firedAt.current < 800) return;
    firedAt.current = Date.now();
    if (!disabled) onSpecial();
  };
  const specialHandlers = onSpecial && !disabled ? {
    onContextMenu: (e) => { e.preventDefault(); clear(); trigger(); },
    onPointerDown: (e) => {
      suppressClick.current = false;
      if (e.pointerType === 'mouse') return;
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        suppressClick.current = true; // 손을 뗄 때 따라오는 클릭 한 번은 무시
        trigger();
      }, 550);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
  } : {};
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className={`${className} disabled:opacity-40 disabled:cursor-not-allowed`}
      style={{ WebkitTouchCallout: 'none' }}
      {...specialHandlers}
      onClick={(e) => {
        if (suppressClick.current) { suppressClick.current = false; return; }
        onClick(e);
      }}
    >
      {children}
    </button>
  );
}

// 설정 > 검사 옵션 칩의 설명 (마우스를 올리면 보이고, 설정 위쪽 '옵션 설명'에 한 번 적혀 있음)
export const TEST_OPTION_HELP = {
  consent: '검사 준비 전에 동의서를 받았다고 체크해야 처치실 [시작]을 누를 수 있음 (예: FAG)',
  popupOnClick: '누를 때마다 세부 창(단안·종류)을 띄움. 끄면 바로 체크되고 오른쪽 클릭으로 창을 엶',
  noOrder: "처방이 필요 없는 검사 (예: OSDI). '처방 전' 표시를 하지 않음",
  noDilate: '이 검사가 끝나기 전에는 점안(산동)을 막음 (예: VF)',
  prepOn: '검사 전에 처치실 "검사 준비"에서 먼저 할 일 (예: FAG 동의서·skin test). [시작]하면 "결과 확인"으로, 시간이 되면 [끝 · 확인]해야 검사실로',
  timed: '검사 자체가 시간을 재는 검사 (예: Schirmer, MMP). 검사 칸을 누르면 시작 시각 → 시간이 되면 [끝 · 확인]',
  holdCall: '이 검사를 하는 동안 다른 검사실에서 부르지 않음 (VF는 처음부터 켜짐). 일반 검사는 [▶ 시작]·[종료]가 생기고, 검사 준비·시간 재기 검사는 시작~확인 동안',
  withExams: '처치실 검사: 다른 검사실을 기다리는 동안에도 처치실 목록에 뜸 (예: OSDI). 끄면 다른 검사 뒤에 (예: Syringing)',
  showWhenEmpty: '검사실 화면 위쪽 장비 버튼을 대기 0명이어도 보임',
  resultFields: '검사 칸을 누르면 결과 입력 창(S·C·A·Add·VA 중 고른 칸)이 열림 (예: MR, WG). 결과는 진료실에 그날만 보임',
};
// 검사 결과 입력 창 (MR·WG 등): OD·OS 두 줄, 설정에서 고른 칸만. 이전 값은 같은 세로줄에
export function ResultModal({ test, patient, onSave, onCancel }) {
  const fields = resultFieldsOf(test);
  const init = patient.results?.[test.id] || {};
  const [r, setR] = useState(() => ({ od: { ...(init.od || {}) }, os: { ...(init.os || {}) } }));
  const cols = `3rem repeat(${fields.length}, minmax(0, 1fr))`;
  const name = test.short || test.name;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-xl max-h-full overflow-y-auto">
        <h3 className="text-lg font-medium text-slate-900">{patient.name}님 {name} 결과</h3>
        <div className="text-xs text-slate-400 mb-4">{patient.id}</div>
        <div className="grid gap-2 items-center" style={{ gridTemplateColumns: cols }}>
          <div />
          {fields.map(f => <div key={f.key} className="text-xs text-slate-500 text-center">{f.label}</div>)}
          {['od', 'os'].map((e, ei) => (
            <React.Fragment key={e}>
              <div className="text-sm text-slate-700">{e === 'od' ? 'R (OD)' : 'L (OS)'}</div>
              {fields.map((f, fi) => (
                <input key={f.key} autoFocus={ei === 0 && fi === 0} aria-label={`${e === 'od' ? 'R' : 'L'} ${f.label}`} value={r[e][f.key] ?? ''}
                  onChange={ev => setR(s => ({ ...s, [e]: { ...s[e], [f.key]: ev.target.value } }))}
                  className="border border-slate-300 rounded-lg px-1 py-2 text-center text-base w-full min-w-0" />
              ))}
            </React.Fragment>
          ))}
        </div>
        <div className="flex gap-2 mt-6">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
          <button type="button" onClick={() => onSave(r)} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium">{name} 완료</button>
        </div>
      </div>
    </div>
  );
}
// 검사 결과 한 줄 (검사실 카드): "MR  R S -1.25 C -0.50 A 180 · L ..."
export function ResultLine({ test, r, onEdit }) {
  const fields = resultFieldsOf(test);
  if (!hasResultValue(r)) return null;
  return (
    <div className="w-full flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-700">
      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{test.short || test.name}</span>
      <span><span className="text-slate-400">R</span> {resultEyeText(r, 'od', fields) || '-'}</span>
      <span><span className="text-slate-400">L</span> {resultEyeText(r, 'os', fields) || '-'}</span>
      {onEdit && <button type="button" onClick={onEdit} className="text-xs px-2 py-0.5 rounded border border-blue-200 text-blue-700 hover:bg-blue-50">수정</button>}
    </div>
  );
}
// 진료실: 결과 검사(MR·WG 등) 오늘 표. 칸을 넓게, 세로로 맞춤
export function ResultTable({ tests, today }) {
  const rows = tests.filter(t => resultFieldsOf(t).length && hasResultValue(today?.[t.id]));
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto mt-2 border-t border-slate-200 pt-2">
      <table className="w-full text-base">
        <thead>
          <tr className="text-xs text-slate-400">
            <th className="text-left font-normal py-1 w-24" /><th className="text-left font-normal py-1 w-10" />
            {RESULT_FIELDS.map(f => <th key={f.key} className="text-left font-normal py-1">{f.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.flatMap(t => ['od', 'os'].map(e => (
            <tr key={`${t.id}-${e}`} className={e === 'od' ? 'border-t border-slate-100' : ''}>
              <td className="py-1.5 text-sm font-medium text-slate-600 whitespace-nowrap">{e === 'od' ? (t.short || t.name) : ''}</td>
              <td className="py-1.5 text-xs text-slate-400">{e === 'od' ? 'R' : 'L'}</td>
              {RESULT_FIELDS.map(f => <td key={f.key} className="py-1.5 pr-4 whitespace-nowrap text-slate-900 font-semibold tabular-nums">{resultFieldsOf(t).some(x => x.key === f.key) ? (String(today[t.id]?.[e]?.[f.key] ?? '').trim() || '-') : ''}</td>)}
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
}
// 산동 금지 검사: 설정에서 정하고, 정하지 않았으면 VF는 기본으로 산동 금지
export function noDilateTest(t) {
  return typeof t?.noDilate === 'boolean' ? t.noDilate : isVfTest(t || {});
}
// 검사실에서 할 검사 한 칸. '오늘 검사' 칩(얇은 테두리·둥근 모양)과 구분되도록 굵은 테두리의 네모 칸으로 그립니다.
export const TEST_TILE = 'min-h-[2.25rem] rounded-lg border-2 flex items-center select-none';
export function TestToggle({ label, done, onToggle, emphasize, onSpecial, disabled = false }) {
  const style = done
    ? 'bg-green-50 border-green-400 text-green-800'
    : emphasize
      ? 'bg-amber-50 border-amber-400 text-amber-900'
      : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400';
  return (
    <SpecialPressButton
      disabled={disabled}
      onClick={() => onToggle(!done)}
      onSpecial={onSpecial}
      title={onSpecial ? '오른쪽 클릭: 단안·프로토콜 지정' : undefined}
      className={`${TEST_TILE} text-sm font-semibold px-3 gap-1.5 ${style}`}
    >
      {done && <Check size={14} />}
      {label}
      {emphasize && !done && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">우선</span>}
    </SpecialPressButton>
  );
}

// 오늘 검사: 평소에는 선택된 검사만 보여 주고, [검사 변경]을 누르면 모든 검사와 산동 설정(children)이 펼쳐집니다.
// inline: 접힌 상태를 카드의 버튼 줄 안에 끼워 넣음 (chipsWhenClosed=false면 [검사 변경]만. 검사실은 위의 검사 칸과 겹치므로)
// mainIds: 교수님별 주요 검사. 펼쳤을 때 주요 검사(+이미 지정된 검사)만 먼저, 나머지는 [기타 검사]를 눌러야 보임
export function TestPicker({ p, tests, onPick, onSpecial, defaultOpen = false, inline = false, chipsWhenClosed = true, closedLabel = '', mainIds = null, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const [showOthers, setShowOthers] = useState(false);
  if (!tests.length) return null;
  const isMain = (t) => !mainIds || mainIds.includes(t.id) || !!p.assigned?.[t.id];
  const others = tests.filter(t => !isMain(t));
  const shown = open ? tests.filter(t => showOthers || isMain(t)) : tests.filter(t => p.assigned?.[t.id]);
  const openButton = (
    <button type="button" aria-expanded="false" onClick={() => setOpen(true)}
      className="text-xs px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-slate-500 hover:text-slate-700 flex items-center gap-1">
      <Plus size={12} />검사 변경
    </button>
  );
  const chip = (t) => {
        const on = !!p.assigned?.[t.id];
        const label = octEyeGroups(t).length ? 'OCT' : on ? testLabelWithOptions(t, p.detail?.[t.id]) : t.short;
        return (
          <SpecialPressButton
            key={t.id}
            disabled={!!activeVf(p)}
            onClick={() => onPick(t, on)}
            onSpecial={() => onSpecial(t)}
            title="오른쪽 클릭: 단안·프로토콜 지정"
            className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1 max-w-xs select-none ${on ? 'bg-violet-50 border-violet-300 text-violet-700' : 'bg-white border-slate-300 text-slate-500'}`}
          >
            {on ? <Check size={12} className="shrink-0" /> : <Plus size={12} className="shrink-0" />}
            <span className="truncate">{label}</span>
            {t.popupOnClick && <ChevronDown size={12} className="shrink-0 opacity-60" />}
          </SpecialPressButton>
        );
  };
  if (inline && !open) return <>{closedLabel && <span className="text-xs text-slate-400 mr-0.5">{closedLabel}</span>}{chipsWhenClosed && shown.map(chip)}{openButton}</>;
  return (
    <div className="w-full flex flex-wrap items-center gap-1.5 mt-1">
      <span className="text-xs text-slate-400 mr-1">오늘 검사</span>
      {!open && shown.length === 0 && <span className="text-xs text-slate-400">없음</span>}
      {shown.map(chip)}
      {open && others.length > 0 && (
        <button type="button" aria-expanded={showOthers} onClick={() => setShowOthers(v => !v)}
          className="text-xs px-2.5 py-1 rounded-full border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1">
          {showOthers ? <>기타 검사 접기 <ChevronUp size={12} /></> : <>기타 검사 {others.length}개 <ChevronDown size={12} /></>}
        </button>
      )}
      {open && children && <>
        <span className="h-5 w-px bg-slate-300 mx-0.5" aria-hidden="true" />
        {children}
      </>}
      {open ? (
        <button type="button" aria-expanded="true" onClick={() => setOpen(false)}
          className="w-full mt-1 py-1.5 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 flex items-center justify-center gap-1">
          <ChevronUp size={13} />접기
        </button>
      ) : openButton}
    </div>
  );
}

export function TestDetailEditor({ test, value, onChange, showExtra = true }) {
  const v = { ...cleanDetail(value), options: orderedOptions(test, value) };
  const opts = test.options || [];
  const eyeGroups = octEyeGroups(test);
  const toggle = (o) => onChange({ ...v, options: v.options.includes(o) ? v.options.filter(x => x !== o) : [...v.options, o] });
  return (
    <div className="space-y-3">
      {opts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {opts.map(o => {
            const on = v.options.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => toggle(o)}
                className={`text-sm px-3 py-1.5 rounded-lg border flex items-center gap-1 ${on ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-600'}`}
              >
                {on && <Check size={12} />} {o}
              </button>
            );
          })}
        </div>
      )}
      {eyeGroups.map(g => (
        <div key={g.key} className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-sm font-medium text-slate-700">{g.label}</span>
          <div className="inline-flex gap-1 bg-slate-100 rounded-lg p-1">
            {EYE_OPTIONS.map(o => <button key={o.key} type="button" aria-pressed={detailEye(v, g.key) === o.key}
              onClick={() => onChange({ ...v, eyes: { ...v.eyes, [g.key]: o.key } })}
              className={`px-3 py-1.5 rounded-md text-sm ${detailEye(v, g.key) === o.key ? 'bg-white text-slate-900 font-medium shadow' : 'text-slate-500'}`}>
              {o.label}
            </button>)}
          </div>
        </div>
      ))}
      {showExtra && (
        <>
          {(!eyeGroups.length || opts.some(o => !eyeGroups.some(g => g.options.includes(o)))) && <div className="inline-flex gap-1 bg-slate-100 rounded-lg p-1">
            {EYE_OPTIONS.map(o => (
              <button
                key={o.key}
                type="button"
                onClick={() => onChange({ ...v, eye: o.key })}
                className={`px-3 py-1.5 rounded-md text-sm ${v.eye === o.key ? 'bg-white text-slate-900 font-medium shadow' : 'text-slate-500'}`}
              >
                {o.label}
              </button>
            ))}
          </div>}
          <input
            value={v.note}
            onChange={e => onChange({ ...v, note: e.target.value })}
            placeholder="검사 프로토콜·참고사항 (예: 24-2C, 연구 프로토콜)"
            className={INPUT}
          />
        </>
      )}
    </div>
  );
}

// 검사실 카드의 '오늘 검사'에서 세부 종류가 있는 검사를 눌렀을 때 뜨는 창
export function TestDetailModal({ test, patientName, on, value, onApply, onRemove, onCancel }) {
  const [v, setV] = useState(() => cleanDetail(value));
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-full overflow-y-auto">
        <h3 className="text-lg font-medium text-slate-900">{patientName}님 {test.short || test.name}</h3>
        <p className="text-sm text-slate-500 mb-4">
          {(test.options || []).length
            ? '종류를 고르세요. 여러 개 골라도 되고, 아직 모르면 비워둬도 돼요. 단안이나 프로토콜이 있으면 아래에서 지정하세요.'
            : '단안이면 눈을 고르고, 필요하면 프로토콜을 적어주세요.'}
        </p>
        <TestDetailEditor test={test} value={v} onChange={setV} />
        <div className="flex gap-2 mt-6">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
          {on && (
            <button type="button" onClick={onRemove} className="flex-1 py-3 rounded-xl border border-red-200 text-red-600">검사 빼기</button>
          )}
          <button type="button" onClick={() => onApply(v)} className="flex-1 py-3 rounded-xl bg-violet-600 text-white font-medium">{on ? '적용' : '검사 추가'}</button>
        </div>
      </div>
    </div>
  );
}

// dot: 대기 순서가 가장 빠른 환자가 기다리는 검사 (빨간 점)
function RedDot() {
  return <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0" />;
}
// muted: 기다리는 환자가 없는 검사 (흐리게, 처치실 요약 줄의 0명과 같은 규칙)
export function FilterChip({ active, onClick, label, dot = false, title, muted = false }) {
  return (
    <button type="button" onClick={onClick} data-dot={dot ? '1' : undefined} data-muted={muted && !active ? '1' : undefined} title={dot ? title : undefined}
      className={`text-sm px-3 py-1.5 rounded-full border inline-flex items-center gap-1.5 ${active ? 'bg-slate-800 border-slate-800 text-white' : muted ? 'bg-white border-slate-200 text-slate-400 opacity-50' : 'bg-white border-slate-300 text-slate-600'}`}>
      {dot && <RedDot />}{label}
    </button>
  );
}
// 보기만 하는 칩 (같은 묶음의 다른 검사실 대기 등). 눌러도 아무 일 없음
export function InfoChip({ label, dot = false, title, muted = false }) {
  return (
    <span data-dot={dot ? '1' : undefined} data-muted={muted ? '1' : undefined} title={dot ? title : undefined}
      className={`text-sm px-3 py-1.5 rounded-full border border-dashed inline-flex items-center gap-1.5 ${muted ? 'border-slate-200 bg-slate-50 text-slate-400 opacity-50' : 'border-slate-300 bg-slate-50 text-slate-500'}`}>
      {dot && <RedDot />}{label}
    </span>
  );
}

export function MeasureLine({ label, m, fields, emptyText = '없음' }) {
  const keys = fields || MEASURE_FIELDS.map(f => f.key);
  const parts = keys.map(k => {
    const text = fieldText(m, k);
    if (!text) return null;
    const name = k === 'bcva' && m?.autoV ? '교정(AutoV)' : MEASURE_FIELDS.find(f => f.key === k).label;
    return (
      <span key={k} className="whitespace-nowrap">
        <span className="text-slate-400">{name}</span> {text}
      </span>
    );
  }).filter(Boolean);
  const isToday = label === '오늘';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-700">
      <span className={`px-1.5 py-0.5 rounded ${isToday ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
        {label}{!isToday && m?.date ? ` ${m.date}` : ''}
      </span>
      {parts.length ? parts : <span className="text-slate-400">{emptyText}</span>}
    </div>
  );
}

// 시력방: 이전 시력·안압을 크게 (시력이 좋던 환자는 작은 글씨부터 바로 재서 시간을 줄이도록)
export function PrevVisionBox({ m }) {
  if (!hasAnyMeasure(m)) return <div className="w-full text-sm text-slate-400">이전 시력 없음</div>;
  const pair = (k, big) => {
    const od = String(m?.[k]?.od ?? '').trim();
    const os = String(m?.[k]?.os ?? '').trim();
    if (!od && !os) return null;
    const label = k === 'bcva' && m?.autoV ? '교정(AutoV)' : MEASURE_FIELDS.find(f => f.key === k).label;
    const num = big ? 'text-2xl font-bold text-slate-900' : 'text-base font-semibold text-slate-700';
    return (
      <span key={k} className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className={`${big ? 'text-sm font-semibold text-blue-800' : 'text-xs text-slate-500'} mr-0.5`}>{label}</span>
        <span className="text-xs text-slate-400">R</span><span className={`${num} tabular-nums`}>{od || '-'}</span>
        <span className="text-xs text-slate-400 ml-1">L</span><span className={`${num} tabular-nums`}>{os || '-'}</span>
      </span>
    );
  };
  const iop = [pair('nct', false), pair('gat', false)].filter(Boolean);
  // 시력(파란 칸)과 안압(회색 칸)을 나눠서 한눈에 구분
  return (
    <div data-prev-vision className="w-full flex flex-wrap items-stretch gap-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
        <span className="text-xs font-semibold text-blue-700 whitespace-nowrap">이전 시력{m.date ? ` ${m.date}` : ''}</span>
        {pair('ucva', true) || <span className="text-sm text-slate-400">시력 없음</span>}{pair('bcva', true)}
      </div>
      {iop.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
          <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">이전 안압</span>{iop}
        </div>
      )}
    </div>
  );
}

export function MeasureTable({ today, prev }) {
  const rows = [
    { label: '오늘', m: today },
    { label: prev?.date ? `이전 ${prev.date}` : '이전', m: prev },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="text-sm w-full">
        <thead>
          <tr className="text-xs text-slate-400">
            <th className="text-left font-normal pr-4 py-1" />
            {MEASURE_FIELDS.map(f => <th key={f.key} className="text-left font-normal pr-4 py-1">{f.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label} className="border-t border-slate-100">
              <td className="pr-4 py-1.5 text-xs text-slate-500 whitespace-nowrap">{r.label}</td>
              {MEASURE_FIELDS.map(f => (
                <td key={f.key} className="pr-4 py-1.5 whitespace-nowrap text-slate-800">
                  {fieldText(r.m, f.key) || '-'}
                  {f.key === 'bcva' && r.m?.autoV && fieldText(r.m, 'bcva') ? <span className="ml-1 text-xs text-amber-700">AutoV</span> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// part: 시력방에서 [시력]·[NCT]를 따로 누를 때 그 칸만 ('va' 시력 / 'nct' 안압 / 'all' 전부)
// QR(바코드) 리더기: 키보드처럼 아주 빠르게(글자 사이 60ms 안) 번호를 보내고 Enter → 사람이 치는 것과 구분해 onScan(번호, 찍힌 칸)
// (시력방 화면, 10-08). 창(.fixed.inset-0)이 열려 있으면 그 창이 처리 — 시력·안압 창은 스스로 되돌리고 안내, 다른 창은 onBlocked
export function useScanner(onScan, { enabled = true, onBlocked } = {}) {
  const ref = useRef({ onScan, onBlocked });
  ref.current = { onScan, onBlocked };
  useEffect(() => {
    if (!enabled) return undefined;
    let buf = '';
    let last = 0;
    let start = null;
    const onKey = (e) => {
      const now = Date.now();
      if (e.key === 'Enter') {
        const code = buf.trim();
        const from = start;
        const fast = now - last < 150;
        buf = '';
        start = null;
        if (code.length < 5 || !fast) return;
        const modal = document.querySelector('.fixed.inset-0');
        if (modal) { if (!modal.hasAttribute('data-measure-modal')) ref.current.onBlocked?.(); return; }
        e.preventDefault();
        ref.current.onScan(code, from);
        return;
      }
      if (e.key.length !== 1) { if (e.key !== 'Shift') buf = ''; return; }
      if (now - last > 60 || start?.el !== e.target) { buf = ''; start = { el: e.target, value: e.target?.value ?? '' }; }
      buf += e.key;
      last = now;
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}

// 시력방(mode 'vision', 10-08 사용자): 시력·안압을 한 창에서 — Tab으로 나안 OD→OS→교정 OD→OS→NCT OD→OS(AutoV는 건너뜀),
// Enter면 적힌 쪽만 저장·확인(빈 쪽은 카드에 '시력 재야함'·'안압 재야함'). part 는 처음 커서 위치만 정함('va'·'nct'·'auto'=빈 칸부터).
// QR 리더기가 창 안 칸에 찍히면(아주 빠른 입력 + Enter) 저장하지 않고 그 칸을 되돌린 뒤 안내
export function MeasureModal({ mode, part = 'all', patient, previous, gatAvailable, gatAssigned, onSave, onCancel }) {
  const initial = mode === 'prev' ? previous : patient.measure;
  const [m, setM] = useState(() => normalizeMeasure(initial));
  const [date, setDate] = useState(mode === 'prev' ? (previous?.date || '') : '');
  const [gat, setGat] = useState(!!gatAssigned);
  const [noIopChk, setNoIopChk] = useState(!!patient.noIop);
  const [scanNote, setScanNote] = useState(false);
  const burst = useRef({ count: 0, last: 0, start: null });

  const setEye = (key, eye, v) => setM(s => ({ ...s, [key]: { ...s[key], [eye]: v } }));
  // '안압 안 잼' 환자(소아 등)는 시력만
  const vision = mode === 'vision';
  const skipIop = vision && noIopChk;
  const fields = mode === 'gat' ? ['gat'] : vision
    ? ['ucva', 'bcva', ...(!skipIop && !gat ? ['nct'] : [])]
    : ['ucva', 'bcva', 'nct', 'gat'];
  const prevCell = (k, e) => String(previous?.[k]?.[e] ?? '').trim();
  const prevRows = vision ? ['ucva', 'bcva', 'nct'].filter(k => prevCell(k, 'od') || prevCell(k, 'os')) : [];
  const title = mode === 'prev' ? '이전 시력·안압' : mode === 'gat' ? 'GAT 안압' : '오늘 시력·안압';
  const completeLabel = mode === 'gat' ? 'GAT 완료' : vision ? '확인 (Enter)' : '확인';
  // 처음 커서: [NCT]·'안압 재야함'은 NCT 칸, QR·'시력 재야함'은 빈 칸부터
  const [focusKey] = useState(() => {
    if (!vision) return fields[0];
    const empty = (k) => !String(m[k]?.od ?? '').trim() && !String(m[k]?.os ?? '').trim();
    if (part === 'nct' && fields.includes('nct')) return 'nct';
    if (part === 'auto' && !(empty('ucva') && empty('bcva')) && fields.includes('nct') && empty('nct')) return 'nct';
    return 'ucva';
  });

  const submit = (complete) => {
    onSave({ measure: m, complete, gat, date, part: 'all', noIop: noIopChk });
  };
  // 입력 칸 키: 리더기(글자 사이 60ms 안, 5글자 이상 + Enter)면 그 칸을 찍기 전 값으로 되돌리고 안내, 사람이 친 Enter면 저장·확인
  const onFieldKey = (e, key, eye) => {
    const now = Date.now();
    const b = burst.current;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (b.count >= 5 && now - b.last < 150 && b.start) {
        setEye(b.start.key, b.start.eye, b.start.value);
        setScanNote(true);
        b.count = 0;
        return;
      }
      b.count = 0;
      if (vision) submit(true);
      return;
    }
    // Tab 등 다른 키는 리더기가 보내지 않음 → 이어 치기를 끊음. 다른 칸으로 옮겨 가도 끊음
    if (e.key.length !== 1) { if (e.key !== 'Shift') b.count = 0; return; }
    if (now - b.last > 60 || !b.start || b.start.key !== key || b.start.eye !== eye) { b.count = 0; b.start = { key, eye, value: m[key][eye] }; }
    b.count += 1;
    b.last = now;
  };

  return (
    <div data-measure-modal className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-full overflow-y-auto">
        <h3 className="text-lg font-medium text-slate-900">{patient.name}님 {title}</h3>
        <div className="text-xs text-slate-400 mb-4">{patient.id}</div>

        {mode !== 'prev' && (
          <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-1">
            {mode === 'vision' ? (
              // 이전 값을 아래 입력 칸과 같은 세로줄(OD·OS)에 맞춰서
              <div data-prev-vision className="grid gap-x-2 gap-y-0.5 items-baseline" style={{ gridTemplateColumns: '4rem 1fr 1fr 4.5rem' }}>
                <div className="col-span-4 text-xs font-semibold text-blue-700">이전 시력·안압{previous?.date ? ` ${previous.date}` : ''}{!prevRows.length && <span className="ml-2 font-normal text-slate-400">없음</span>}</div>
                {prevRows.map(k => {
                  const big = k === 'ucva' || k === 'bcva';
                  const cls = `text-center tabular-nums ${big ? 'text-2xl font-bold text-slate-900' : 'text-base font-semibold text-slate-600'}`;
                  return (
                    <React.Fragment key={k}>
                      <div className={`text-sm ${big ? 'text-blue-800 font-semibold' : 'text-slate-500'}`}>{k === 'bcva' && previous?.autoV ? '교정(AutoV)' : MEASURE_FIELDS.find(f => f.key === k).label}</div>
                      <div className={cls}>{prevCell(k, 'od') || '-'}</div>
                      <div className={cls}>{prevCell(k, 'os') || '-'}</div>
                      <div />
                    </React.Fragment>
                  );
                })}
              </div>
            ) : <MeasureLine label="이전" m={previous} fields={mode === 'gat' ? ['nct', 'gat'] : undefined} emptyText="이전 값 없음" />}
            {mode === 'gat' && <MeasureLine label="오늘" m={patient.measure} fields={['nct']} emptyText="오늘 NCT 없음" />}
          </div>
        )}

        <div className="grid gap-2 items-center" style={{ gridTemplateColumns: '4rem 1fr 1fr 4.5rem' }}>
          <div />
          <div className="text-xs text-slate-500 text-center">OD (우안)</div>
          <div className="text-xs text-slate-500 text-center">OS (좌안)</div>
          <div />
          {fields.map(key => (
            <React.Fragment key={key}>
              <div className="text-sm text-slate-700">{MEASURE_FIELDS.find(f => f.key === key).label}</div>
              <input
                autoFocus={key === focusKey}
                aria-label={`${MEASURE_FIELDS.find(f => f.key === key).label} OD`}
                value={m[key].od}
                onChange={e => setEye(key, 'od', e.target.value)}
                onKeyDown={e => onFieldKey(e, key, 'od')}
                inputMode="decimal"
                className="border border-slate-300 rounded-lg px-2 py-2 text-center text-base w-full"
              />
              <input
                aria-label={`${MEASURE_FIELDS.find(f => f.key === key).label} OS`}
                value={m[key].os}
                onChange={e => setEye(key, 'os', e.target.value)}
                onKeyDown={e => onFieldKey(e, key, 'os')}
                inputMode="decimal"
                className="border border-slate-300 rounded-lg px-2 py-2 text-center text-base w-full"
              />
              <div>
                {key === 'bcva' && (
                  <button
                    type="button"
                    tabIndex={-1}
                    title="AR 값으로 trial lens를 넣고 잰 교정시력"
                    onClick={() => setM(s => ({ ...s, autoV: !s.autoV }))}
                    className={`text-xs px-2.5 py-2 rounded-lg border w-full ${m.autoV ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300 text-slate-500'}`}
                  >
                    AutoV
                  </button>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* 10-08 사용자(공간): 입력 방법 안내 글은 뺌 (직원은 앎). AutoV 뜻은 버튼에 마우스를 올리면 */}
        {vision && gatAvailable && !skipIop && (
          <label className="flex items-center gap-2 mt-4 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={gat} onChange={e => setGat(e.target.checked)} className="w-4 h-4" />
            안압은 GAT로 측정 (정밀검사실에서 입력)
          </label>
        )}
        {vision && (
          <label className="flex items-center gap-2 mt-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={noIopChk} onChange={e => setNoIopChk(e.target.checked)} className="w-4 h-4" />
            안압 안 잼 (소아 등)
          </label>
        )}
        {scanNote && (
          <div role="alert" className="mt-4 text-sm bg-red-50 border border-red-300 text-red-800 rounded-lg p-3 font-medium">
            다른 QR이 찍혔습니다 · 이 창을 먼저 [확인]이나 [취소]한 뒤 다시 찍어 주세요 (찍힌 번호는 지웠습니다)
          </div>
        )}

        {mode === 'prev' && (
          <div className="mt-4">
            <Field label="측정일 (모르면 비워두세요)">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} />
            </Field>
          </div>
        )}


        <div className="flex gap-2 mt-6">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
          {mode === 'prev' && <button type="button" onClick={() => submit(false)} className={`flex-1 py-3 rounded-xl font-medium ${mode === 'prev' ? 'bg-slate-800 text-white' : 'border border-slate-300 text-slate-700'}`}>저장</button>}
          {mode !== 'prev' && (
            <button type="button" onClick={() => submit(true)} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium">{completeLabel}</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* 직원 메모: 환자별 자유 메모 (예: 타과 진료 다녀오심, YAG 후 10:30 IOP 확인). 직원 화면에만 표시 */
export const PatientMemoContext = createContext(null);
// 이름 줄 안에 들어갑니다. 메모가 없으면 작은 메모 아이콘, 있으면 내용이 보이고 누르면 수정합니다.
export function PatientMemo({ p, readOnly = false }) {
  const mutatePatients = useContext(PatientMemoContext);
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState('');
  const memo = String(p.staffMemo || '').trim();
  const canEdit = !!mutatePatients && !readOnly;
  const save = () => {
    const pk = patientKey(p);
    const text = v.trim();
    mutatePatients(prev => prev.map(x => (patientKey(x) === pk ? { ...x, staffMemo: text } : x)));
    setEditing(false);
  };
  const start = () => { setV(memo); setEditing(true); };
  if (editing) {
    return (
      <span className="w-full flex items-center gap-2 font-normal">
        <input autoFocus value={v} onChange={e => setV(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="직원 메모 (예: 타과 진료 다녀오심, YAG 후 10:30 IOP 확인)" className={`${INPUT} flex-1`} />
        <button type="button" onClick={save} className="text-sm px-3 py-2 rounded-lg bg-sky-600 text-white font-medium shrink-0">저장</button>
        <button type="button" onClick={() => setEditing(false)} className="text-sm px-2 py-2 text-slate-500 shrink-0">취소</button>
      </span>
    );
  }
  if (memo) {
    const pill = <><StickyNote size={13} className="shrink-0" /><span className="truncate">{memo}</span></>;
    return canEdit
      ? <button type="button" onClick={start} title="눌러서 메모 수정" className="text-sm font-normal max-w-full bg-sky-50 border border-sky-200 text-sky-900 rounded-lg px-2 py-0.5 flex items-center gap-1">{pill}</button>
      : <span className="text-sm font-normal max-w-full bg-sky-50 border border-sky-200 text-sky-900 rounded-lg px-2 py-0.5 flex items-center gap-1">{pill}</span>;
  }
  if (!canEdit) return null;
  return (
    <button type="button" onClick={start} title="직원 메모 추가" aria-label="직원 메모 추가" className="p-1 rounded text-slate-300 hover:text-sky-600 hover:bg-sky-50">
      <StickyNote size={15} />
    </button>
  );
}

/* 명단 보기 방식: 정렬(예약시간순·가나다순), 오전·오후 */
// 접수 안내 (관리자 명단 관리에서 환자별로 적음): 바코드 접수 화면에 크게 보여주는 문구와 '시력검사 없이 바로 진료'
export function KioskNoteLine({ p }) {
  if (!p.kioskNote && !p.skipVision) return null;
  return (
    <div className="text-xs text-violet-800 mt-0.5">
      접수 안내{p.skipVision ? ' · 시력검사 없이 바로 진료' : ''}{p.kioskNote ? `: ${p.kioskNote}` : ''}
    </div>
  );
}
export function KioskNoteEditor({ p, inline = false }) {
  const mutatePatients = useContext(PatientMemoContext);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [skip, setSkip] = useState(false);
  const pk = patientKey(p);
  const start = () => { setText(p.kioskNote || ''); setSkip(!!p.skipVision); setEditing(true); };
  const save = () => {
    patchPatient(mutatePatients, pk, () => ({ kioskNote: text.trim(), skipVision: skip }));
    setEditing(false);
  };
  if (!editing) {
    return (
      <div className={inline ? 'contents' : 'w-full flex items-center gap-2 flex-wrap'}>
        {p.kioskNote || p.skipVision
          ? <span className="inline-flex items-stretch rounded-lg bg-violet-50 border border-violet-200 text-violet-900 text-xs">
              <button type="button" onClick={start} title="눌러서 수정" className="text-left px-2 py-1">
                접수 안내{p.skipVision ? ' · 시력검사 없이 바로 진료' : ''}{p.kioskNote ? `: ${p.kioskNote}` : ''}
              </button>
              <button type="button" onClick={() => patchPatient(mutatePatients, pk, () => ({ kioskNote: '', skipVision: false }))}
                title="이 환자 접수 안내 지우기" aria-label={`${p.name} 접수 안내 지우기`} className="px-2 border-l border-violet-200 text-violet-400 hover:text-red-600">×</button>
            </span>
          : <button type="button" onClick={start} className="text-xs text-slate-400 hover:text-violet-700 underline">접수 안내 추가</button>}
      </div>
    );
  }
  return (
    <div className="w-full rounded-lg border border-violet-200 bg-violet-50 p-2 flex items-center gap-2 flex-wrap">
      <input autoFocus value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        placeholder="바코드 접수 때 보여줄 문구 (예: 시력검사 없이 바로 5번 진료실 앞으로 오세요)" className={`${INPUT} flex-1 min-w-[16rem]`} />
      <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)} className="w-4 h-4" />
        시력검사 없이 바로 진료
      </label>
      <button type="button" onClick={save} className="text-sm px-3 py-2 rounded-lg bg-violet-600 text-white font-medium">저장</button>
      <button type="button" onClick={() => setEditing(false)} className="text-sm px-2 py-2 text-slate-500">취소</button>
    </div>
  );
}

// 히스토리 (시력방에서 입력): 초진·FU loss·중간 내원 환자의 병력.
// 환자 기록 p.hx = { htn, dm, dmYears, pmh, surgery, cc, at }. 초진 때만 쓰므로 그날 기록에만 저장 (다음 내원 때 불러오지 않음).
export const HxContext = createContext({ fuMap: {}, measure: {}, fields: null });
// '지난 진료 FU 미지정' 표시 — FU 기록에 'FU 나중에'가 지금도 남아 있을 때만 (fuMissingNow)
export function FuMissingBadge({ p, tone = 'orange' }) {
  const ctx = useContext(HxContext);
  if (!p || p.consultDone || !fuMissingNow(p, ctx?.fuMap?.[p.id])) return null;
  const cls = tone === 'red' ? 'bg-red-100 text-red-800 border-red-300' : 'bg-orange-100 text-orange-800 border-orange-300';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${cls}`}>지난 진료 FU 미지정</span>;
}
export const HX_TYPES = [['yn', '있음/없음'], ['ynYears', '있음/없음 + 기간(년)'], ['text', '한 줄 글'], ['long', '여러 줄 글']];
export function hxSummary(hx, fields = DEFAULT_HX_FIELDS) {
  if (!hx) return '';
  const name = (f) => f.short || f.label;
  return fields.map(f => {
    const v = hx[f.id];
    if (f.type === 'yn' || f.type === 'ynYears') {
      if (v !== true && v !== false) return '';
      return `${name(f)}${v ? '(+)' : '(−)'}${v && f.type === 'ynYears' && hx[`${f.id}Years`] ? ` ${hx[`${f.id}Years`]}년` : ''}`;
    }
    const t = String(v ?? '').trim().replace(/\s*\n\s*/g, ', ');
    return t ? `${name(f)}: ${t}` : '';
  }).filter(Boolean).join(' · ');
}
export function HistoryLine({ p }) {
  const ctx = useContext(HxContext);
  if (p.hx) {
    return <div className="w-full text-sm bg-sky-50 border border-sky-200 text-sky-950 rounded-lg px-3 py-1.5"><span className="font-semibold mr-1">Hx</span>{hxSummary(p.hx, ctx.fields) || '특이사항 없음'}</div>;
  }
  if (hxPending(p)) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-300 font-semibold">History 미입력</span>;
  return null;
}
// 처치실(검사 지정·예진): 오늘 지정된 검사를 보기만. 한 검사는 초록 ✓, 남은 검사는 회색
export function TodayTestsLine({ p, tests }) {
  const list = tests.filter(t => t.id !== VISION_KEY && p.assigned?.[t.id]);
  return (
    <div className="w-full flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-slate-400 mr-0.5">오늘 검사</span>
      {list.length === 0 && !nctMeasured(p) && <span className="text-slate-400">없음</span>}
      {nctMeasured(p) && <span className="px-2 py-0.5 rounded-full border flex items-center gap-0.5 bg-green-50 border-green-300 text-green-800"><Check size={11} />NCT</span>}
      {list.map(t => {
        const done = !!p.done?.[t.id];
        return (
          <span key={t.id} className={`px-2 py-0.5 rounded-full border flex items-center gap-0.5 ${done ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-slate-300 text-slate-500'}`}>
            {done && <Check size={11} />}{testLabelWithOptions(t, p.detail?.[t.id])}{done ? '' : ' (남음)'}
          </span>
        );
      })}
    </div>
  );
}
// 설명 대기용 간단 요약: 오늘 한 검사 + 산동
// inline: 설명 대기 카드 참고 줄 안에 (작은 회색 이름 + 굵은 값)
export function TodayDoneLine({ p, tests, prefs, inline = false }) {
  const done = [...(nctMeasured(p) ? ['NCT'] : []), ...tests.filter(t => t.id !== VISION_KEY && p.assigned?.[t.id] && p.done?.[t.id]).map(t => testLabelWithOptions(t, p.detail?.[t.id]))];
  const drops = (p.drops || []).filter(Boolean);
  const eye = dilateEyeOf(p.dilateEye);
  if (drops.length) done.push(crActive(p, prefs) ? 'CR' : `산동${eye ? ` ${eye}` : ''}`);
  if (inline) return <RefItem k="오늘 검사">{done.length ? done.join(', ') : '없음'}</RefItem>;
  return (
    <div className="w-full text-sm text-slate-700">
      <span className="text-xs text-slate-400 mr-2">오늘 검사</span>{done.length ? done.join(', ') : '없음'}
    </div>
  );
}
// 처치실 검사 지정용: 항목마다 한 줄씩 전부 (여러 줄 글은 줄바꿈 그대로)
// editable: 처치실(검사 지정 대기·예진 대기)에서 [수정]/[입력] — 시력방을 지난 뒤에도 고칠 수 있게
export function HistoryDetail({ p, editable = false, button = false }) {
  const ctx = useContext(HxContext);
  const [open, setOpen] = useState(false);
  const modal = open && <HistoryModal p={p} onClose={() => setOpen(false)} />;
  // button: 처치실 카드의 한 줄 안에 들어가는 작은 [History 입력] 버튼
  if (button) return hxPending(p) ? <>
    <button type="button" onClick={() => setOpen(true)} aria-label={`${p.name} History 입력`} className="text-sm px-4 py-2 rounded-lg bg-orange-500 text-white font-medium">History 입력</button>
    {modal}
  </> : null;
  if (!p.hx) {
    if (hxPending(p)) return (
      <div className="w-full text-sm bg-orange-50 border border-orange-300 text-orange-800 rounded-lg px-3 py-1.5 font-semibold flex items-center justify-between gap-2">
        History 필요 (설문지 보고 입력)
        {editable && <button type="button" onClick={() => setOpen(true)} aria-label={`${p.name} History 입력`} className="text-sm px-3 py-1 rounded-md bg-orange-500 text-white font-medium">입력</button>}
        {modal}
      </div>
    );
    return null;
  }
  const rows = (ctx.fields || DEFAULT_HX_FIELDS).map(f => {
    const v = p.hx[f.id];
    let text = '';
    if (f.type === 'yn' || f.type === 'ynYears') {
      if (v === true) text = `있음${f.type === 'ynYears' && p.hx[`${f.id}Years`] ? ` (${p.hx[`${f.id}Years`]}년)` : ''}`;
      else if (v === false) text = '없음';
    } else text = String(v ?? '').trim();
    return { f, text };
  });
  return (
    <div className="w-full text-sm bg-sky-50 border border-sky-200 text-sky-950 rounded-lg px-3 py-2">
      <div className="font-semibold mb-1 flex items-center justify-between gap-2">History
        {editable && <button type="button" onClick={() => setOpen(true)} aria-label={`${p.name} History 수정`} className="text-xs px-2.5 py-1 rounded-md bg-white border border-sky-300 text-sky-700 font-medium hover:bg-sky-100">수정</button>}
      </div>
      {modal}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map(({ f, text }) => (
          <React.Fragment key={f.id}>
            <dt className="text-sky-700 whitespace-nowrap">{f.label}</dt>
            <dd className={`whitespace-pre-wrap break-words ${text ? '' : 'text-slate-400'}`}>{text || '-'}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}
export function HistoryModal({ p, onClose }) {
  const ctx = useContext(HxContext);
  const mutatePatients = useContext(PatientMemoContext);
  const fields = ctx.fields || DEFAULT_HX_FIELDS;
  // 이번 기록이 있으면 그대로, 없으면 빈칸
  const [f, setF] = useState(() => {
    const out = {};
    fields.forEach(x => {
      const src = p.hx || {};
      out[x.id] = x.type === 'yn' || x.type === 'ynYears' ? (src[x.id] ?? null) : String(src[x.id] ?? '');
      if (x.type === 'ynYears') out[`${x.id}Years`] = String(src[`${x.id}Years`] ?? '');
    });
    return out;
  });
  const set = (k, v) => setF(cur => ({ ...cur, [k]: v }));
  const save = () => {
    const at = Date.now();
    const hx = { at };
    fields.forEach(x => {
      const v = typeof f[x.id] === 'string' ? f[x.id].trim() : f[x.id];
      hx[x.id] = v;
      if (x.type === 'ynYears') hx[`${x.id}Years`] = v ? String(f[`${x.id}Years`] || '').trim() : '';
    });
    patchPatient(mutatePatients, patientKey(p), () => ({ hx, hxMissing: false }));
    onClose();
  };
  const yesNo = (x) => (
    <div className="inline-flex gap-1 bg-slate-100 rounded-lg p-1">
      {[[true, '있음'], [false, '없음']].map(([v, t]) => (
        <button key={t} type="button" aria-label={`${x.label} ${t}`} aria-pressed={f[x.id] === v} onClick={() => set(x.id, f[x.id] === v ? null : v)}
          className={`px-4 py-1.5 rounded-md text-sm ${f[x.id] === v ? 'bg-white text-slate-900 font-semibold shadow' : 'text-slate-500'}`}>{t}</button>
      ))}
    </div>
  );
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-full overflow-y-auto">
        <h3 className="text-lg font-medium text-slate-900 mb-1">{p.name}님 History</h3>
        <div className="space-y-3 mt-3">
          {fields.map(x => (
            x.type === 'yn' || x.type === 'ynYears' ? (
              <div key={x.id} className="flex items-center gap-3 flex-wrap">
                <span className="w-28 text-sm font-medium text-slate-700">{x.label}</span>
                {yesNo(x)}
                {x.type === 'ynYears' && f[x.id] === true && (
                  <label className="flex items-center gap-1.5 text-sm text-slate-700">기간 <input aria-label={`${x.label} 기간`} value={f[`${x.id}Years`]} onChange={e => set(`${x.id}Years`, e.target.value)} className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /> 년</label>
                )}
              </div>
            ) : (
              <label key={x.id} className="block text-sm text-slate-700">{x.label}
                {x.type === 'long'
                  ? <textarea aria-label={x.label} rows={3} value={f[x.id]} onChange={e => set(x.id, e.target.value)} className={`${INPUT} resize-y`} />
                  : <input aria-label={x.label} value={f[x.id]} onChange={e => set(x.id, e.target.value)} className={INPUT} />}
              </label>
            )
          ))}
        </div>
        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
          <button type="button" onClick={save} className="flex-1 py-3 rounded-xl bg-sky-600 text-white font-medium">확인</button>
        </div>
      </div>
    </div>
  );
}
// 시력방 카드: 히스토리 입력 버튼, 필요 표시(자동 추천 + 직원 판단)
export function HistoryControl({ p }) {
  const ctx = useContext(HxContext);
  const [open, setOpen] = useState(false);
  const need = hxNeeded(p);
  return (
    <>
      {/* 초진만 버튼 (재진은 없음) */}
      {!p.hx && need && (
        <button type="button" onClick={() => setOpen(true)} className="text-sm px-3 py-1.5 rounded-lg font-medium bg-orange-500 text-white">
          History 필요
        </button>
      )}
      {p.hx && (
        <div className="order-last w-full flex items-stretch text-sm bg-sky-50 border border-sky-200 text-sky-950 rounded-lg overflow-hidden">
          <div className="flex-1 min-w-0 px-3 py-1.5"><span className="font-semibold mr-1">Hx</span>{hxSummary(p.hx, ctx.fields) || '특이사항 없음'}</div>
          <button type="button" onClick={() => setOpen(true)} aria-label="History 수정" className="px-3 text-xs font-medium text-sky-700 border-l border-sky-200 hover:bg-sky-100 shrink-0">수정</button>
        </div>
      )}
      {open && <HistoryModal p={p} onClose={() => setOpen(false)} />}
    </>
  );
}

// 진료 전 처치 (관리자 명단 관리): PRP·YAG처럼 처치만 받으러 온 환자. 넣으면 시력검사 없이 처치실부터
export function PreProcEditor({ p, procedures, inline = false }) {
  const mutatePatients = useContext(PatientMemoContext);
  const pk = patientKey(p);
  const list = p.preProcs || [];
  const locked = !!p.checkin || !!p.consultDone;
  const add = (id) => {
    const x = (procedures || []).find(v => v.id === id);
    if (!x) return;
    patchPatient(mutatePatients, pk, cur => ({
      preProcs: [...(cur.preProcs || []), ...makePreProcs([id], { procedures })],
      skipVision: true,
    }));
  };
  const remove = (uid) => patchPatient(mutatePatients, pk, cur => {
    const rest = (cur.preProcs || []).filter(i => i.uid !== uid);
    return { preProcs: rest, ...(rest.length ? {} : { skipVision: false }) };
  });
  if (locked && !list.length) return null;
  return (
    <div className={inline ? 'contents text-xs' : 'w-full flex items-center gap-2 flex-wrap text-xs'}>
      {list.length > 0 && <span className="text-xs text-slate-500">진료 전 처치</span>}
      {list.map(i => (
        <span key={i.uid} className={`inline-flex items-stretch rounded-lg border ${i.done ? 'border-slate-200 bg-slate-50 text-slate-400 line-through' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          <span className="px-2 py-1">{i.name}</span>
          {!locked && <button type="button" onClick={() => remove(i.uid)} aria-label={`${p.name} ${i.name} 빼기`} className="px-2 border-l border-rose-200 text-rose-400 hover:text-red-600">×</button>}
        </span>
      ))}
      {!locked && (procedures || []).length > 0 && (
        <select value="" aria-label={`${p.name} 진료 전 처치 추가`} onChange={e => add(e.target.value)} className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white text-slate-500">
          <option value="">+ 진료 전 처치</option>
          {procedures.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      )}
    </div>
  );
}

// 지각 표시: 모든 직원 화면의 카드에서 눌러서 켜고 끔 (지각이면 먼저 접수한 환자들 뒤로 — lateKeys)
export function LateChip({ p }) {
  const mutatePatients = useContext(PatientMemoContext);
  if (!mutatePatients) return p.late ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600">지각</span> : null;
  const pk = patientKey(p);
  return (
    <button
      type="button"
      aria-pressed={!!p.late}
      onClick={() => mutatePatients(prev => prev.map(x => (patientKey(x) === pk ? setLate(x, !p.late, prev) : x)))}
      title={p.late ? '누르면 지각 취소' : '누르면 지각 표시 (먼저 접수한 환자들 뒤로)'}
      className={`text-xs px-2 py-0.5 rounded-full border ${p.late ? 'bg-red-50 border-red-300 text-red-600 font-semibold' : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'}`}
    >
      지각
    </button>
  );
}

export function byName(a, b) {
  return String(a.name).localeCompare(String(b.name), 'ko') || String(a.id).localeCompare(String(b.id));
}
// 예약 12:00 전은 오전, 12:00부터 오후. 예약시간이 없으면 양쪽 모두에 보입니다.
export const NOON = 12 * 60;
export function inSession(p, session) {
  if (session === 'all' || !p.reservation) return true;
  const m = timeToMin(p.reservation);
  return session === 'am' ? m < NOON : m >= NOON;
}
// 화면마다 고른 정렬을 이 컴퓨터에 기억합니다
export function useSortMode(storageKey) {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(storageKey) === 'name' ? 'name' : 'time'; } catch { return 'time'; }
  });
  const change = (m) => {
    setMode(m);
    try { localStorage.setItem(storageKey, m); } catch { /* 저장 못 해도 동작에는 문제 없음 */ }
  };
  return [mode, change];
}
export function SegmentedToggle({ value, onChange, options, className = '' }) {
  return (
    <div className={`inline-flex gap-1 bg-slate-100 rounded-lg p-1 ${className}`}>
      {options.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${value === k ? 'bg-white text-slate-900 font-medium shadow' : 'text-slate-500'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
export const SORT_OPTIONS = [['time', '예약시간순'], ['name', '가나다순']];
export const SESSION_OPTIONS = [['all', '전체'], ['am', '오전'], ['pm', '오후']];

// 색 규칙: 회색=정보(교수 이름·번호), 파랑=기본 동작, 빨강=산동, 주황=확인 필요(처방 전·History 필요·FU 미지정),
// 노랑=우선·진행 중, 초록=완료
// 교수님 색 점 (10-09 사용자): 어느 교수님 환자인지 글을 읽지 않아도 보이게.
// 설정 > 교수 관리에서 8색 중 고름(교수님별 설정의 새 칸 dotColor), 안 고르면 남은 색을 교수 순서대로 자동.
// 산동(빨강)·확인 필요(주황)·완료(초록)·기본 동작(파랑)과 헷갈리지 않는 색만 씀
export const DoctorOrderContext = createContext({ order: [], prefs: {} });
export const DOCTOR_DOTS = ['#8b5cf6', '#ec4899', '#0891b2', '#a16207', '#4f46e5', '#0d9488', '#be123c', '#64748b'];
export function doctorDotColor({ order = [], prefs = {} } = {}, name) {
  const own = (d) => (DOCTOR_DOTS.includes(prefs?.[d]?.dotColor) ? prefs[d].dotColor : null);
  if (own(name)) return own(name);
  const taken = new Set(order.map(own).filter(Boolean));
  const free = DOCTOR_DOTS.filter(c => !taken.has(c));
  const pool = free.length ? free : DOCTOR_DOTS;
  const i = order.filter(d => !own(d)).indexOf(name);
  if (i >= 0) return pool[i % pool.length];
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return pool[h % pool.length];
}
export function DoctorDot({ name, color }) {
  const ctx = useContext(DoctorOrderContext);
  if (!name && !color) return null;
  return <span aria-hidden="true" data-doctor-dot className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color || doctorDotColor(ctx, name) }} />;
}
// 교수님 칸 전체를 그 색으로 연하게 + 같은 색 계열 굵은 글자 (10-10 사용자: 점은 작아서 눈에 안 띔 — A안).
// 진한 색 칸은 이 프로그램에서 '누르는 버튼' 모양이라 쓰지 않음
export function doctorTintStyle(color) {
  const hex = String(color || '#64748b').replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  return { background: `rgba(${r},${g},${b},0.14)`, borderColor: `rgba(${r},${g},${b},0.6)`, color: `rgb(${Math.round(r * 0.62)},${Math.round(g * 0.62)},${Math.round(b * 0.62)})` };
}
// 교수님 이름 칸 (명단 관리 고르기·메인 화면 인원·설정 등): color를 주면 그 색(설정 화면의 고치는 중 색)
export function DoctorTag({ name, color, className = '' }) {
  const ctx = useContext(DoctorOrderContext);
  if (!name) return null;
  return <span data-doctor-chip className={`rounded-full font-bold border whitespace-nowrap ${className || 'text-xs px-2.5 py-0.5'}`} style={doctorTintStyle(color || doctorDotColor(ctx, name))}>{name}</span>;
}
export function DoctorChip({ p }) {
  const ctx = useContext(DoctorOrderContext);
  if (!p.doctor) return null;
  return (
    <span data-doctor-chip className="text-xs px-2.5 py-0.5 rounded-full font-bold border whitespace-nowrap" style={doctorTintStyle(doctorDotColor(ctx, p.doctor))}>
      {p.doctor}
    </span>
  );
}
// 넓은 화면에서는 이름 줄 오른쪽 끝에 (좁으면 다음 줄로)
// 화면 위쪽 요약 줄 (처치실·진료실): 묶음마다 인원 칩, 누르면 그 묶음으로 이동, 0명은 흐리게
export function SummaryBar({ label, items, staleMin }) {
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={label}>
      {items.map(x => (
        <button key={x.id} type="button" disabled={!x.n} onClick={() => jump(x.id)} data-summary={x.id}
          className={`text-sm px-3 py-1 rounded-full border bg-white flex items-center gap-1.5 ${x.n ? `${x.due ? 'border-green-500' : x.stale ? 'border-orange-400' : 'border-slate-300'} text-slate-800 hover:bg-slate-50` : 'border-slate-200 text-slate-400 opacity-50 cursor-default'}`}>
          <span>{x.label} <b className="font-semibold">{x.n}</b></span>
          {x.due > 0 && <span className="text-xs px-1.5 rounded-full bg-green-600 text-white font-semibold">● {x.due} 시간 됨</span>}
          {x.stale > 0 && <span className="text-xs px-1.5 rounded-full bg-orange-500 text-white font-semibold">{staleMin}분↑ {x.stale}</span>}
        </button>
      ))}
    </div>
  );
}
// 처치실: 마지막 진행 뒤 오래 그대로인 환자 (설정 > 기타의 강조 시간)
export function StaleChip({ min }) {
  if (!min) return null;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500 text-white font-semibold" title="마지막 진행 뒤 이만큼 지났어요">{min}분째 그대로</span>;
}
export function VisitTimes({ p, className = '' }) {
  return <span className={`ml-auto pl-2 text-xs text-slate-400 whitespace-nowrap ${className}`}>예약 {p.reservation || '-'} · 접수 {p.checkin || '-'}</span>;
}
// wide: 시력방 2열 — 칸 높이를 채움 (같은 줄 두 카드 높이 같게)
export function PatientRow({ p, index, color, handle, onUp, onDown, onToggleFirst, stale = 0, wide = false, children }) {
  const c = COLOR_MAP[color] || COLOR_MAP.slate;
  return (
    <div className={`flex items-start gap-3 bg-white border ${stale ? 'border-orange-400 ring-2 ring-orange-200' : c.border} rounded-xl px-4 py-3 ${wide ? 'h-full' : ''}`}>
      {handle && <div className="pt-2 shrink-0">{handle}</div>}
      <div className={`t-num w-10 h-10 rounded-full ${c.solid} text-white flex items-center justify-center font-semibold shrink-0`}>{index + 1}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="t-name text-slate-900">{p.name}</span>
          <SexAge p={p} />
          <span className="text-xs text-slate-400">{p.id}</span>
          <DoctorChip p={p} />
          {onToggleFirst
            ? <button type="button" onClick={onToggleFirst} title="누르면 초진 ↔ 재진" className={`text-xs px-2 py-0.5 rounded-full border ${p.firstVisit ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'}`}>{p.firstVisit ? '초진' : '재진'}</button>
            : p.firstVisit && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">초진</span>}
          {p.primaryKey && <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">2차 진료 · {p.primaryDoctor} 후</span>}
          <LateChip p={p} />
          <StaleChip min={stale} />
          {prepPositiveNames(p).length > 0 && !p.consultDone && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold border border-red-300">{prepPositiveNames(p).join(', ')} 검사 취소</span>}
          <FuMissingBadge p={p} />
          {p.consultHold && !p.consultDone && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 flex items-center gap-1">
              <AlertTriangle size={11} /> 진료 후 추가검사
            </span>
          )}
          <PatientMemo p={p} />
          <VisitTimes p={p} />
        </div>
        {p.sendNote?.text && !p.consultDone && <div className="w-full text-sm bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-lg px-3 py-1.5 mt-1"><span className="font-medium">{p.sendNote.from || '진료실'} 메모</span> {p.sendNote.text}</div>}
        <div className="flex flex-wrap items-center gap-2 mt-2">{children}</div>
      </div>
      {(onUp || onDown) && (
        <div className="flex flex-col gap-1 shrink-0">
          <button type="button" aria-label="위로" onClick={onUp} className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">
            <ChevronUp size={16} />
          </button>
          <button type="button" aria-label="아래로" onClick={onDown} className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">
            <ChevronDown size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// 손잡이(⋮⋮)를 잡고 끌어서 순서를 바꾸는 목록. 마우스·터치 모두 지원
// columns: 넓은 화면에서 2열 (WIDE_LIST). 2열일 때 끌기는 가로·세로 모두 보고 가장 가까운 자리로 (읽는 순서: 왼쪽 → 오른쪽, 다음 줄)
export function DraggableList({ items, getKey, onMove, renderItem, locked = false, columns = false }) {
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null);

  useEffect(() => () => { setDragActive(false); }, []);

  const start = (e, index) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const nodes = wrapRef.current ? Array.from(wrapRef.current.children) : [];
    if (!nodes[index]) return;
    const rects = nodes.map(n => {
      const r = n.getBoundingClientRect();
      return { top: r.top, height: r.height, left: r.left, width: r.width };
    });
    // 실제로 두 줄 이상 놓였을 때만 2열 방식 (한 줄이면 예전 계산 그대로)
    const grid = new Set(rects.map(r => Math.round(r.left))).size > 1;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    const d = { index, key: getKey(items[index]), startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, rects, target: index, grid };
    dragRef.current = d;
    setDragActive(true);
    setDrag(d);
    e.preventDefault();
  };

  const move = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    const dx = d.grid ? e.clientX - d.startX : 0;
    const r = d.rects[d.index];
    let target = 0;
    if (d.grid) {
      // 2열: 끌고 있는 카드 가운데와 가장 가까운 자리
      const cx = r.left + r.width / 2 + dx, cy = r.top + r.height / 2 + dy;
      let best = Infinity;
      d.rects.forEach((rr, i) => {
        const dist = (rr.left + rr.width / 2 - cx) ** 2 + (rr.top + rr.height / 2 - cy) ** 2;
        if (dist < best) { best = dist; target = i; }
      });
    } else {
      const center = r.top + r.height / 2 + dy;
      d.rects.forEach((rr, i) => {
        if (i !== d.index && rr.top + rr.height / 2 < center) target += 1;
      });
    }
    const next = { ...d, dx, dy, target };
    dragRef.current = next;
    setDrag(next);
  };

  const end = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragActive(false);
    setDrag(null);
    if (d && d.target !== d.index) onMove(d.key, d.target);
  };

  return (
    <div ref={wrapRef} className={columns ? WIDE_LIST : undefined}>
      {items.map((item, i) => {
        let style;
        if (drag && drag.grid) {
          // 2열: 사이에 있는 카드는 한 칸 앞/뒤 자리로 미끄러짐
          const slide = (j) => {
            const a = drag.rects[i], b = drag.rects[j];
            return { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px)`, transition: 'transform 150ms ease' };
          };
          if (i === drag.index) {
            style = { transform: `translate(${drag.dx}px, ${drag.dy}px)`, position: 'relative', zIndex: 30 };
          } else if (drag.index < drag.target && i > drag.index && i <= drag.target) {
            style = slide(i - 1);
          } else if (drag.index > drag.target && i >= drag.target && i < drag.index) {
            style = slide(i + 1);
          } else {
            style = { transition: 'transform 150ms ease' };
          }
        } else if (drag) {
          const h = drag.rects[drag.index]?.height || 0;
          if (i === drag.index) {
            style = { transform: `translateY(${drag.dy}px)`, position: 'relative', zIndex: 30 };
          } else if (drag.index < drag.target && i > drag.index && i <= drag.target) {
            style = { transform: `translateY(${-h}px)`, transition: 'transform 150ms ease' };
          } else if (drag.index > drag.target && i >= drag.target && i < drag.index) {
            style = { transform: `translateY(${h}px)`, transition: 'transform 150ms ease' };
          } else {
            style = { transition: 'transform 150ms ease' };
          }
        }
        const handle = (
          <div
            role="button"
            aria-label="끌어서 순서 바꾸기"
            onPointerDown={e => start(e, i)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            style={{ touchAction: 'none', cursor: drag ? 'grabbing' : 'grab' }}
            className="p-1 -ml-1 rounded text-slate-300 hover:text-slate-500 select-none"
          >
            <GripVertical size={20} />
          </div>
        );
        const lifted = drag && i === drag.index;
        return (
          <div key={getKey(item)} className="pb-3" style={style}>
            <div className={`${lifted ? 'shadow-xl rounded-xl' : ''} ${columns ? 'h-full' : ''}`}>{renderItem(item, i, locked ? null : handle)}</div>
          </div>
        );
      })}
    </div>
  );
}

export function DilationBadge({ st, large = false }) {
  const sz = large ? 'text-sm px-2.5 py-1' : 'text-xs px-2 py-0.5';
  // 점안 전에는 빨간 [점안] 버튼만으로 충분해 따로 표시하지 않음 (점안 시각은 버튼에 표시)
  if (st.status === 'todo') return null;
  if (st.status === 'progress') {
    return <span className={`${sz} rounded-full bg-blue-100 text-blue-800`}>{st.mins}분 경과</span>;
  }
  // 기다리는 중에는 점안 시각(버튼)만 보여주고 남은 시간은 표시하지 않음
  if (st.status === 'waiting') return null;
  if (st.status === 'due') return null; // 확인 버튼이 대신 보임
  return <span className={`${sz} rounded-full bg-green-100 text-green-800`}>산동 완료</span>;
}

// 산동 칩을 오른쪽 클릭(길게 누르기)했을 때 뜨는 좌·우안 선택 창
export function DilationEyeModal({ patientName, on, eye, onApply, onRemove, onCancel }) {
  const [v, setV] = useState(eye || 'OU');
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-lg font-medium text-slate-900">{patientName}님 산동</h3>
        <p className="text-sm text-slate-500 mb-4">한쪽 눈만 산동하면 눈을 골라주세요.</p>
        <div className="inline-flex gap-1 bg-slate-100 rounded-lg p-1">
          {EYE_OPTIONS.map(o => (
            <button key={o.key} type="button" aria-pressed={v === o.key} onClick={() => setV(o.key)}
              className={`px-3 py-1.5 rounded-md text-sm ${v === o.key ? 'bg-white text-slate-900 font-medium shadow' : 'text-slate-500'}`}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-6">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
          {on && <button type="button" onClick={onRemove} className="flex-1 py-3 rounded-xl border border-red-200 text-red-600">산동 빼기</button>}
          <button type="button" onClick={() => onApply(v)} className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-medium">{on ? '적용' : '산동 추가'}</button>
        </div>
      </div>
    </div>
  );
}

// 산동 여부·CR·점안 시각 기록. 모든 직원 화면의 환자 카드에서 같은 방식으로 사용
// compact: 산동·CR 예정이 없으면 아무것도 보이지 않음 (켜고 끄기는 [검사 변경] 안에서)
// togglesOnly: 산동/CR 켜고 끄는 버튼만 (점안 기록·상태 표시 없이)
// group: 카드 버튼 줄 안에 산동·점안을 한 덩어리로 (줄이 넘치면 함께 다음 줄로)
// dropsOnly: 점안 버튼만 (다시 진료 환자의 점안 칸 — 산동·CR 켜기/끄기 칩 없이)
// 처치 후 확인 (10-07 사용자 결정, 산동 확인과 같은 방식 — 버튼을 늘리지 않음):
// 시행한 처치 하나에 버튼 하나. 시간 전 'YAG · OS 11:05 · 확인 대기'(한 번 누르면 3초 동안 [지금 완료] [시행 취소]),
// 시간이 지나면 노란 'N분 지남 · 확인' → 누르면 끝. 서버 기록이 보이던 시행 그대로일 때만 저장
// short: 할 일 줄 안에서 — 왼쪽에 처치 이름·시각이 이미 있으므로 버튼은 할 일만 ([확인 대기] / [확인]) (10-10 사용자: 같은 말 반복 줄이기)
// 동의서 (10-10 사용자): 설정에서 [동의서]를 켠 처치만. 확인 전 주황 점선 '동의서 전'(한 번 누르면 확인) → 초록 '동의서 ✓ 시각'(두 번 눌러 취소)
// 여러 처치가 함께면 처치 이름을 붙임. 확인 전에는 부르는 쪽에서 [처치 완료]를 막음(consentMissing)
export const CONSENT_TITLE = '동의서 확인 후 누를 수 있습니다';
const CONSENT_OFF = 'text-sm px-3 py-2 rounded-lg border-2 border-dashed border-orange-400 bg-orange-50 text-orange-700 font-bold whitespace-nowrap';
const CONSENT_ON = 'text-sm px-3 py-2 rounded-lg border border-green-500 bg-green-50 text-green-700 font-bold whitespace-nowrap';
export function ConsentChips({ p, list, items, settings, mutatePatients }) {
  const need = (items || []).filter(i => procNeedsConsent(settings, i));
  if (!need.length) return null;
  const pk = patientKey(p);
  const named = need.length > 1;
  return need.map(i => (i.consentAt ? (
    <TwoStepButton key={i.uid} onConfirm={() => patchPatient(mutatePatients, pk, x => procConsentCancelPatch(x, list, i.uid, i.consentAt))} className={CONSENT_ON}
      armedClassName="text-sm px-3 py-2 rounded-lg border border-rose-400 bg-rose-50 text-rose-700 font-bold whitespace-nowrap">{named ? `${procLabel(i)} ` : ''}동의서 ✓ {fmtClock(i.consentAt)}</TwoStepButton>
  ) : (
    <button key={i.uid} type="button" data-consent={i.uid} onClick={() => patchPatient(mutatePatients, pk, x => procConsentPatch(x, list, i.uid, Date.now()))} title="동의서를 받았으면 누르세요" className={CONSENT_OFF}>{named ? `${procLabel(i)} ` : ''}동의서 전</button>
  )));
}
// 검사 준비가 있는 검사(예: FAG)의 동의서: 환자 기록 consent[검사id]
export function TestConsentChip({ p, t, mutatePatients }) {
  if (!t?.consent) return null;
  const pk = patientKey(p);
  const at = p.consent?.[t.id];
  if (at) return <TwoStepButton onConfirm={() => patchPatient(mutatePatients, pk, x => testConsentCancelPatch(x, t.id, at))} className={CONSENT_ON}
    armedClassName="text-sm px-3 py-2 rounded-lg border border-rose-400 bg-rose-50 text-rose-700 font-bold whitespace-nowrap">동의서 ✓ {fmtClock(at)}</TwoStepButton>;
  if (!testConsentMissing(p, t)) return null;
  return <button type="button" data-consent={t.id} onClick={() => patchPatient(mutatePatients, pk, x => testConsentPatch(x, t.id, Date.now()))} title="동의서를 받았으면 누르세요" className={CONSENT_OFF}>동의서 전</button>;
}
// onReconsult: 진료 뒤 처치(설명 대기 환자)의 확인 시간이 되면 [확인] 옆 작은 글씨 '확인 · 재진료' (10-10 사용자: 간혹 안압을 보고 다시 진료)
export function ProcCheckRow({ p, mutatePatients, filter = () => true, onReconsult = null, onToast = null }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 15000); return () => clearInterval(t); }, []);
  const items = checkItems(p).filter(filter);
  if (!items.length) return null;
  const pk = patientKey(p);
  const now = Date.now();
  // 확인: 저장 결과로 들어갔을 때만 알림(되돌리기는 아직 그 확인 그대로일 때만 다시 '확인 대기')
  const confirm = (c) => {
    const at = Date.now();
    patchPatient(mutatePatients, pk, x => confirmProcCheckPatch(x, c.list, c.i.uid, c.i.performedAt, at)).then(next => {
      const rec = Array.isArray(next) ? next.find(x => patientKey(x) === pk) : null;
      if (!rec || !onToast) return;
      if (!(rec[c.list] || []).some(i => i.uid === c.i.uid && i.checkedAt === at)) { onToast(`${p.name} 환자는 이미 다른 곳에서 처리되었습니다 · 바꾸지 않았습니다`); return; }
      onToast(`${p.name} ${procLabel(c.i)} 확인`, () => patchPatient(mutatePatients, pk, x => ({
        [c.list]: (x[c.list] || []).map(i => (i.uid === c.i.uid && i.checkedAt === at ? { ...i, done: false, doneAt: null, checkedAt: undefined } : i)),
      })));
    }, () => {});
  };
  const cancel = (c) => patchPatient(mutatePatients, pk, x => cancelProcCheckPatch(x, c.list, c.i.uid, c.i.performedAt));
  // 시간 전: 작은 글씨 '시행 취소'(두 번) + [지금 확인] — 검사 준비·시간 재기 줄과 같은 모양 (10-10)
  // 시간 됨: 노란 [확인] (진료 뒤 처치는 옆에 작은 글씨 '확인 · 재진료')
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map(c => (procCheckDue(c.i, now) ? (
        <span key={c.i.uid} className="flex items-center gap-2">
          {onReconsult && c.list === 'procedures' && p.seen && !p.consultDone && (
            <button type="button" onClick={() => onReconsult(c)} title="확인하고 같은 교수님 진료 대기로" className="text-xs text-slate-500 hover:text-slate-800 underline whitespace-nowrap">확인 · 재진료</button>
          )}
          <button type="button" data-proc-check={c.i.uid} onClick={() => confirm(c)} className="text-sm px-4 py-2 rounded-lg bg-yellow-300 border border-yellow-500 text-yellow-950 font-semibold">확인</button>
        </span>
      ) : (
        <span key={c.i.uid} className="flex items-center gap-2">
          <TwoStepButton onConfirm={() => cancel(c)} className="text-xs text-slate-400 hover:text-rose-600 underline whitespace-nowrap" armedClassName="text-xs px-2 py-0.5 rounded border border-rose-400 bg-rose-50 text-rose-700 font-medium whitespace-nowrap">시행 취소</TwoStepButton>
          <button type="button" data-proc-check={c.i.uid} onClick={() => confirm(c)} title={`${c.i.checkMin}분 전이지만 지금 확인`} className="text-sm px-4 py-2 rounded-lg border border-green-400 bg-white text-green-700 font-medium">지금 확인</button>
        </span>
      )))}
    </div>
  );
}

// ── 처치실·설명 대기 카드 (10-10 사용자): '할 일 줄' + '참고 줄' ──
// 할 일 줄: 왼쪽 구역 색깔 표 + 할 일(굵게), 버튼은 늘 오른쪽 끝. wait: 다른 곳(처치실·검사실)에서 진행 중 — 점선 표, 버튼 없음(산동 등 예외)
const TAG_TONE = { violet: 'bg-violet-600', rose: 'bg-rose-600', amber: 'bg-amber-600', sky: 'bg-sky-600', indigo: 'bg-indigo-600', emerald: 'bg-emerald-600', slate: 'bg-slate-400' };
export function TaskLine({ tag, tone = 'indigo', wait = false, what, small, children }) {
  const showTag = !!tag;
  return (
    <div data-task-line={tag || '할 일'} className="w-full flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      {showTag && <span className={`shrink-0 text-[0.8125rem] font-extrabold leading-snug rounded-lg px-2.5 py-1 ${wait ? 'bg-white border-[1.5px] border-dashed border-slate-400 text-slate-600' : `${TAG_TONE[tone] || TAG_TONE.indigo} text-white`}`}>{tag}</span>}
      <span className={`min-w-0 ${wait ? 'text-[0.9375rem] font-semibold text-slate-600' : 'text-[1.0625rem] font-bold text-slate-900'}`}>
        {what}{small && <span className={`ml-1.5 ${wait ? 'text-[0.8125rem] text-slate-400' : 'text-sm text-slate-500'} font-semibold`}>{small}</span>}
      </span>
      {children && <span className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</span>}
    </div>
  );
}
// 참고 줄 항목: 작은 회색 이름 + 굵은 값
export function RefItem({ k, children }) {
  return <span className="whitespace-nowrap"><span className="text-slate-400 mr-1">{k}</span><b className="font-semibold text-slate-700">{children}</b></span>;
}
// 참고 줄: 작은 회색 한 줄(오늘 시력·오늘 검사·History 요약·드문 버튼). detail이 있으면 오른쪽 끝 [자세히 ▾] → 아래로 펼침
// right: 줄 오른쪽 끝에 붙는 버튼(설명 대기의 설명 완료 등). line=false면 위 점선 없이
export function RefLine({ children, detail = null, right = null, line = true }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full">
      <div data-ref-line className={`flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[0.8125rem] text-slate-500 ${line ? 'border-t border-dashed border-slate-200 pt-2 mt-0.5' : ''}`}>
        {children}
        {(detail || right) && (
          <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {detail && <button type="button" data-detail-toggle aria-expanded={open} onClick={() => setOpen(v => !v)} className="text-xs px-2 py-0.5 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 whitespace-nowrap">{open ? '자세히 접기 ▴' : '자세히 ▾'}</button>}
            {right}
          </span>
        )}
      </div>
      {open && detail && <div data-card-detail className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-2">{detail}</div>}
    </div>
  );
}
// 자세히: 진료 호출 때 진료실 화면처럼 — 오늘·이전 시력·안압 표, 결과, History 전체(수정), 오늘 검사
export function CardDetail({ p, history, tests }) {
  return (
    <>
      <MeasureTable today={p.measure} prev={previousMeasure(p, history || {})} />
      <ResultTable tests={tests} today={p.results} />
      {p.hx && <HistoryDetail p={p} editable />}
      <TodayTestsLine p={p} tests={tests} />
    </>
  );
}
// 참고 줄의 History 요약 (적었을 때만)
export function HxRef({ p }) {
  const ctx = useContext(HxContext);
  if (!p.hx) return null;
  return <RefItem k="History">{hxSummary(p.hx, ctx.fields) || '특이사항 없음'}</RefItem>;
}

export function DilationRow({ p, prefs, waitMin, mutatePatients, showDrops = true, compact = false, togglesOnly = false, inline = false, group = false, large = false, crStatusOnly = false, dropsOnly = false }) {
  const pk = patientKey(p);
  const crAvail = !!prefs?.[p.doctor]?.cr;
  const cr = crActive(p, prefs);
  const dil = needsDilation(p, prefs);
  const st = dilationState(p, prefs, waitMin);
  const eye = !cr && dil ? dilateEyeOf(p.dilateEye) : undefined;
  const [eyeModal, setEyeModal] = useState(false);
  // 점안 시각이 찍힌 버튼은 두 번 눌러야 취소 (한 번 누르면 3초 동안 '누르면 취소', 실수로 스쳐도 기록이 사라지지 않게)
  const [armed, setArmed] = useState(-1);
  useEffect(() => {
    if (armed < 0) return undefined;
    const t = setTimeout(() => setArmed(-1), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  // VF처럼 산동 금지 검사가 남아 있으면 점안을 아예 막음 (이미 기록한 점안이 있으면 그대로 보여줌)
  const blockers = dilationBlockers(p);
  const blocked = blockers.length > 0 && st.given === 0;
  // 산동 확인: 화면에 보이던 마지막 점안 그대로일 때만 (그사이 추가 점안·취소가 있으면 안 함)
  const confirmDrops = () => { const at = Date.now(); patchPatient(mutatePatients, pk, x => confirmDilationPatch(x, prefs, waitMin, st.last, at)); };
  if (compact && !dil && !cr) return null;
  // CR은 진료실 간호사 담당: 처치실 등에서는 몇 회째인지만 보여 줌 (점안 버튼 없음)
  if (crStatusOnly && cr && !togglesOnly) {
    return (
      <span title="CR 점안은 진료실 화면에서 기록합니다" className={`${large ? 'text-sm px-3 py-1.5' : 'text-xs px-2.5 py-1'} rounded-full border bg-rose-50 border-rose-300 text-rose-700`}>
        CR {st.given}/{st.total}{st.status === 'ready' ? ' · 완료' : st.status === 'due' ? ' · 확인 대기' : ' · 진료실'}
      </span>
    );
  }
  if (togglesOnly) showDrops = false;
  // 카드 줄(compact): 켜고 끄기 칩 없이 [산동] 하나만. 누르면 점안 시각 기록(다시 누르면 취소).
  // 산동 예정 자체를 빼는 것은 [검사 변경] 안에서 (다른 검사처럼)
  const single = compact && showDrops;
  const eyeText = eye ? ` · ${DILATE_EYE_LABEL[eye]}` : '';
  // large: 시력방처럼 산동을 해야 하는 곳에서 크게
  const sz = large ? 'text-sm px-3 py-1.5 font-medium' : 'text-xs px-2.5 py-1';
  const chip = (on) => `${sz} rounded-full border ${on ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-white border-slate-300 text-slate-400'}`;
  return (
    <div className={group ? 'inline-flex flex-wrap items-center gap-1.5' : inline ? 'contents' : 'w-full flex flex-wrap items-center gap-1.5'}>
      {!cr && !single && !dropsOnly && (
        <SpecialPressButton
          onClick={() => patchPatient(mutatePatients, pk, () => ({ dilateOverride: !dil }))}
          onSpecial={() => setEyeModal(true)}
          title="오른쪽 클릭: 좌·우안 지정"
          className={`${chip(dil)} select-none`}
        >
          {dil ? `산동${eye ? ` · ${DILATE_EYE_LABEL[eye]}` : ''}` : '산동 안 함'}
        </SpecialPressButton>
      )}
      {eyeModal && (
        <DilationEyeModal
          patientName={p.name}
          on={dil}
          eye={dilateEyeOf(p.dilateEye)}
          onApply={e => { patchPatient(mutatePatients, pk, () => ({ dilateOverride: true, dilateEye: dilateEyeOf(e) })); setEyeModal(false); }}
          onRemove={() => { patchPatient(mutatePatients, pk, () => ({ dilateOverride: false })); setEyeModal(false); }}
          onCancel={() => setEyeModal(false)}
        />
      )}
      {crAvail && !single && !dropsOnly && (cr || !compact) && (
        <button type="button" onClick={() => patchPatient(mutatePatients, pk, () => ({ cr: !cr }))} className={chip(cr)}>
          {cr ? 'CR' : 'CR 안 함'}
        </button>
      )}
      {showDrops && st.need && blocked && (
        <span className={`${sz} rounded-lg border border-slate-300 bg-slate-100 text-slate-600`} title="산동 금지 검사가 끝나야 점안할 수 있어요">
          {single ? `${cr ? 'CR' : `산동${eyeText}`} · ${blockers.map(t => t.short).join(', ')} 끝난 뒤` : `${blockers.map(t => t.short).join(', ')} 끝난 뒤 점안`}
        </span>
      )}
      {showDrops && st.need && !blocked && st.drops.map((t, i) => {
        // 추가 점안이 있으면 버튼 하나에 마지막 시각과 횟수만 (누르면 마지막 추가 점안만 취소)
        const extraLast = !cr && st.extra.length ? st.extra[st.extra.length - 1] : 0;
        const shown = extraLast || t;
        // 산동 완료: 따로 칸을 두지 않고 마지막 점안 버튼이 초록 '산동 완료 11:18' (CR은 '3회 … · 완료')
        const doneHere = st.status === 'ready' && i === st.total - 1;
        const isArmed = armed === i && !!t;
        const undoOk = doneHere && st.ok; // 확인으로 완료된 것: 두 번 누르면 확인만 취소 (점안 기록은 그대로)
        // 산동 확인(10-03): 버튼을 늘리지 않음. 시간 전 마지막 점안 버튼을 한 번 누르면 3초 동안 [지금 완료] [점안 취소],
        // CR·다시 진료는 시간이 지나면 그 버튼이 노란 'N분 지남 · 확인'(누르면 확인 → 진료 대기로)
        const isLast = i === st.total - 1;
        const dueHere = isLast && st.status === 'due';
        const cancelDrop = () => { if (extraLast) undoExtraDrop(mutatePatients, pk, extraLast); else toggleDrop(mutatePatients, pk, i, false); };
        if (isArmed && isLast && st.status === 'waiting') {
          return (
            <span key={i} className="inline-flex gap-1">
              <button type="button" onClick={() => { setArmed(-1); confirmDrops(); }} title="산동이 이미 충분하면 시간 전이라도 지금 완료"
                className={`${sz} rounded-lg border bg-green-600 border-green-600 text-white font-semibold`}>지금 완료</button>
              <button type="button" onClick={() => { setArmed(-1); cancelDrop(); }} className={`${sz} rounded-lg border bg-white border-rose-400 text-rose-700`}>누르면 취소</button>
            </span>
          );
        }
        const base = single ? (cr ? `CR ${i + 1}회` : `산동${eyeText}`) : (cr ? `${i + 1}회 점안` : '점안');
        const label = dueHere ? `${st.mins}분 지남 · 확인` : isArmed ? (undoOk ? '누르면 확인 취소' : '누르면 취소')
          : doneHere && !cr ? `산동 완료${eyeText}${shown ? ` ${fmtClock(shown)}` : ''}${extraLast ? ` · ${st.extra.length + 1}회` : ''}`
            : `${base}${shown ? ` ${fmtClock(shown)}` : ''}${extraLast ? ` · ${st.extra.length + 1}회` : ''}${doneHere ? ' · 완료' : ''}`;
        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              if (!t) { toggleDrop(mutatePatients, pk, i, true); return; }
              if (dueHere) { confirmDrops(); return; }
              if (!isArmed) { setArmed(i); return; }
              setArmed(-1);
              if (undoOk) { const okAt = p.dilateOkAt; patchPatient(mutatePatients, pk, x => (x.dilateOkAt === okAt ? { dilateOkAt: null } : {})); return; }
              cancelDrop();
            }}
            title={dueHere ? `점안 ${[...st.drops, ...st.extra].filter(Boolean).map(fmtClock).join(', ')} · 동공을 확인했으면 누르세요 (진료 대기로)` : undoOk ? `산동 확인 ${fmtClock(p.dilateOkAt)} · 두 번 누르면 확인 취소` : extraLast
              ? `점안 ${[t, ...st.extra].map(fmtClock).join(', ')} · 두 번 누르면 ${fmtClock(extraLast)} 추가 점안 취소`
              : t ? (isLast && st.status === 'waiting' ? '누르면 [지금 완료] · [누르면 취소]' : '두 번 누르면 기록 취소') : '누르면 지금 시각으로 기록'}
            className={`${sz} rounded-lg border ${dueHere ? 'bg-amber-300 border-amber-400 text-amber-950 font-semibold' : isArmed
              ? 'bg-white border-rose-400 text-rose-700'
              : doneHere ? 'bg-green-100 border-green-300 text-green-800'
                : t ? 'bg-slate-100 border-slate-200 text-slate-500'
                  : i === st.given ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-slate-300 text-slate-500'}`}
          >
            {label}
          </button>
        );
      })}
      {st.need && !togglesOnly && !blocked && !(showDrops && st.status === 'ready') && <DilationBadge st={st} large={large} />}
      {/* 산동 완료인데 덜 됐을 때: 한 번 더 점안 (CR 제외, 산동 금지 검사가 남아 있으면 숨김) */}
      {showDrops && st.need && !cr && (st.status === 'ready' || st.status === 'due') && blockers.length === 0 && (
        <button type="button" onClick={() => addExtraDrop(mutatePatients, pk)} title="산동이 덜 됐으면 한 번 더 점안 (이 시각부터 다시 시간을 잽니다)"
          className="text-xs text-rose-700 underline">추가 점안</button>
      )}
    </div>
  );
}

// addMode: 처치실 요청 카드의 [처치 추가] (10-10) — 다시 진료·기타 요청 없이 처치만, 진료 전이면 진료 전 처치로
export function ProcedureModal({ patient, procedures, crAvailable = false, onConfirm, onCancel, addMode = false }) {
  const [sel, setSel] = useState({});
  // 처치마다: 설정에서 [눈 고르기]를 켠 처치는 OU·OD·OS, [메모 칸]을 켠 처치는 짧은 메모
  const [eye, setEye] = useState({});
  const [memo, setMemo] = useState({});
  // 목록에 없는 요청은 직접 입력 (예: 안약 교육, 봉합사 제거)
  const [custom, setCustom] = useState('');
  const [customBy, setCustomBy] = useState('resident');
  // 점안 후 다시 진료 (CR·산동 중 하나). 진료실 간호사가 점안하고, 끝나면 진료 대기 맨 앞으로
  const [redo, setRedo] = useState('');
  const redoKinds = addMode ? [] : [...(crAvailable ? ['cr'] : []), 'dilate'];
  const customName = custom.trim();
  const chosen = [
    ...procedures.filter(x => sel[x.id]).map(x => ({
      ...x,
      eye: x.eyeSelect && eye[x.id] ? eye[x.id] : undefined,
      note: x.memoField ? String(memo[x.id] || '').trim() : '',
    })),
    ...(customName && !addMode ? [{ id: 'custom', name: customName, performer: customBy, note: '' }] : []),
  ];
  const box = (on) => `flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${on ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}`;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-full overflow-y-auto">
        <h3 className="text-lg font-medium mb-1 text-slate-900">{patient.name}님 처치{addMode ? ' 추가' : ''}</h3>
        {!addMode && <p className="text-sm text-slate-500 mb-4">진료 완료 후 설명 대기로 가서 '처치 중'으로 표시됩니다. 교수님 처치는 설명 대기 카드에서, 전공의 처치는 처치실에서 완료합니다.</p>}
        {redoKinds.length > 0 && <div className={`grid gap-2 mb-2 ${redoKinds.length > 1 ? 'sm:grid-cols-2' : ''}`}>
          {redoKinds.map(k => (
            <label key={k} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${redo === k ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`}>
              <input type="checkbox" checked={redo === k} onChange={() => setRedo(r => (r === k ? '' : k))} className="w-5 h-5" />
              <span className="text-slate-700 flex-1">{REDO_LABEL[k]}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">진료실 점안</span>
            </label>
          ))}
        </div>}
        {redo && <p className="text-xs text-slate-500 px-1 mb-2">진료실 화면 'CR·산동 점안' 칸으로 가고, 점안이 끝나면 진료 대기 맨 앞으로 돌아옵니다. 같이 고른 처치는 다시 진료가 끝난 뒤 시작합니다.</p>}
        <div className="grid gap-2 sm:grid-cols-2 mb-4 mt-3">
          {procedures.length === 0 && <div className="text-sm text-slate-400">설정 &gt; 처치에서 처치 목록을 먼저 만들어주세요</div>}
          {procedures.map(x => {
            const on = !!sel[x.id];
            return (
              <label key={x.id} className={box(on)}>
                <input type="checkbox" checked={on} onChange={() => setSel(s => ({ ...s, [x.id]: !s[x.id] }))} className="w-5 h-5 mt-0.5" />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-slate-700 flex-1 min-w-0">{x.name}</span>
                    {x.dilate && <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700" title="보내면 산동 예정이 켜집니다 (이미 점안했으면 그 시각 그대로)">산동</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${x.performer === 'prof' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>{PERFORMER_LABEL[x.performer]}</span>
                  </span>
                  {on && x.eyeSelect && (
                    <span className="flex gap-1 mt-2" onClick={e => e.preventDefault()}>
                      {['OU', 'OD', 'OS'].map(v => (
                        <button key={v} type="button" aria-pressed={eye[x.id] === v} aria-label={`${x.name} ${v}`}
                          onClick={() => setEye(m => ({ ...m, [x.id]: m[x.id] === v ? '' : v }))}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${eye[x.id] === v ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-600'}`}>{v}</button>
                      ))}
                    </span>
                  )}
                  {on && x.memoField && (
                    <input value={memo[x.id] || ''} onClick={e => e.preventDefault()} onChange={e => setMemo(m => ({ ...m, [x.id]: e.target.value }))}
                      aria-label={`${x.name} 메모`} placeholder="메모" className={`${INPUT} mt-2 py-1.5`} />
                  )}
                </span>
              </label>
            );
          })}
        </div>
        {!addMode && <div className="rounded-xl border border-slate-200 p-3 mb-6">
          <div className="text-sm text-slate-700 mb-2">기타 요청 (직접 입력)</div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="예: 안약 점안 교육, 봉합사 제거" className={`${INPUT} flex-1 min-w-[12rem]`} />
            <div className="inline-flex gap-1 bg-slate-100 rounded-lg p-1">
              {['prof', 'resident'].map(k => (
                <button key={k} type="button" aria-pressed={customBy === k} onClick={() => setCustomBy(k)}
                  className={`px-3 py-1 rounded-md text-sm ${customBy === k ? 'bg-white text-slate-900 font-medium shadow' : 'text-slate-500'}`}>
                  {PERFORMER_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
        </div>}
        <div className={`flex gap-3 ${addMode ? 'mt-2' : ''}`}>
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
          <button
            type="button"
            disabled={!chosen.length && !redo}
            onClick={() => onConfirm(chosen, redo)}
            className={`flex-1 py-3 rounded-xl font-medium ${chosen.length || redo ? (addMode ? 'bg-indigo-600 text-white' : 'bg-amber-600 text-white') : 'bg-slate-200 text-slate-400'}`}
          >
            {addMode ? '처치 추가' : '처치 지정'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function cancelProcedure(mutatePatients, pk, uid) {
  mutatePatients(prev => prev.map(p => {
    if (patientKey(p) !== pk || p.consultDone || !(p.procedures || []).some(x => x.uid === uid && !x.done)) return p;
    const item = p.procedures.find(x => x.uid === uid);
    const procedures = p.procedures.filter(x => x.uid !== uid);
    // 이 처치 때문에 켠 산동이고 아직 점안 전이면 산동도 원래대로 (다른 '산동 필요' 처치가 남아 있으면 그대로)
    const undoDilate = item.dilateSet && !procedures.some(x => x.dilate && !x.done) && !(p.drops || []).some(Boolean)
      ? { dilateOverride: typeof item.dilateWas === 'boolean' ? item.dilateWas : undefined } : {};
    if (procedures.length) return { ...p, procedures, ...undoDilate };
    // 설명 대기에서 [처치 보내기]로 넣은 처치였으면 설명 대기에 그대로
    if (item.fromExplain) return { ...p, procedures, procOrderedAt: null, ...undoDilate };
    const occupied = prev.some(x => patientKey(x) !== pk && x.date === p.date && x.doctor === p.doctor && inConsult(x));
    return { ...p, procedures, seen: false, seenAt: null, procOrderedAt: null, calledRoom: occupied ? null : p.doctor || null, ...undoDilate };
  }));
}

export function ProcedureList({ p, performer, onCancel }) {
  const list = (p.procedures || []).filter(x => !performer || x.performer === performer);
  if (!list.length) return null;
  return (
    <div className="w-full text-sm text-slate-700 space-y-0.5">
      {list.map(x => (
        <div key={x.uid} className={x.done ? 'text-slate-400 line-through' : ''}>
          <span className="font-medium">{procLabel(x)}</span>
          <span className="text-xs text-slate-400 ml-1">{PERFORMER_LABEL[x.performer]}</span>
          {!x.done && x.performedAt && <span className="text-xs text-amber-700 ml-1">시행 {fmtClock(x.performedAt)} · 확인 대기</span>}
          {x.note && <span className="text-xs text-yellow-800 ml-2">{x.note}</span>}
          {!x.done && !x.performedAt && onCancel && <TwoStepButton onConfirm={() => onCancel(x.uid)} className="ml-3 rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700" armedClassName="ml-3 rounded-lg border border-rose-500 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">처치 취소</TwoStepButton>}
        </div>
      ))}
    </div>
  );
}

// 처치 후 검사 고르기 (10-07): 진료 전 처치는 [처치 완료] 옆 '검사 추가 후 완료'. 처치에서 고른 눈(OD·OS)이 하나면 검사도 처음부터 그 눈으로
// reconsultOption: 진료 후 처치는 카드의 '검사 · 재진료' 하나로 이 창 하나 (10-07 사용자 — 글씨 두 개를 합침):
//   맨 위 [재진료](같은 교수님 진료 대기로) + 아래 검사 고르기, 둘 다 / 하나만. 확인 버튼 글자가 고른 대로 바뀜, 아무것도 안 고르면 못 누름
const anyPicked = (sel) => Object.values(sel || {}).some(Boolean);
export function PostTestModal({ p, items, tests, settings, mainIds, reconsultOption = false, onConfirm, onCancel }) {
  const [recon, setRecon] = useState(false);
  const eyes = [...new Set((items || []).map(i => i.eye).filter(e => e === 'OD' || e === 'OS'))];
  const initialDetail = eyes.length === 1 ? Object.fromEntries(tests.map(t => [t.id, { eye: eyes[0] }])) : {};
  const names = (items || []).map(procLabel).join(', ');
  const eyeNote = eyes.length === 1 ? ` · 검사 눈 ${eyes[0]} (처치한 눈)` : '';
  const common = { mainIds, tests, settings, initial: {}, initialDetail, openDetail: false, onCancel };
  if (!reconsultOption) {
    return (
      <TestCheckModal key={`post-${patientKey(p)}`} {...common}
        title={`${p.name}님 처치 후 검사`}
        subtitle={`${names}${eyeNote}`}
        confirmLabel="처치 완료 · 검사로"
        onConfirm={(sel, detail) => onConfirm(sel, detail, false)} />
    );
  }
  return (
    <TestCheckModal key={`post-${patientKey(p)}`} {...common}
      title={`${p.name}님 처치 완료 후`}
      subtitle={`${names}${eyeNote}`}
      info={<>
        <label className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer ${recon ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white'}`}>
          <input type="checkbox" aria-label="재진료" checked={recon} onChange={e => setRecon(e.target.checked)} className="w-5 h-5" />
          <span className="font-semibold text-slate-900">재진료</span>
          <span className="text-sm text-slate-500">같은 교수님 진료 대기로</span>
        </label>
        <div className="mt-4 text-sm font-medium text-slate-700">검사 추가 <span className="text-xs font-normal text-slate-400">(고르지 않아도 됨 · 이미 한 검사는 다시)</span></div>
      </>}
      confirmLabel={sel => (recon && anyPicked(sel) ? '처치 완료 · 검사 후 재진료' : recon ? '처치 완료 · 재진료' : anyPicked(sel) ? '처치 완료 · 검사로' : '재진료나 검사를 고르세요')}
      canConfirm={sel => recon || anyPicked(sel)}
      onConfirm={(sel, detail) => onConfirm(sel, detail, recon)} />
  );
}

// confirmLabel·canConfirm 은 고른 검사(sel)에 따라 바꿀 수 있음 (함수로 주면) — 처치 완료 후 창
export function TestCheckModal({ title, subtitle, info, tests: rawTests, settings, initial, initialDetail, openDetail = true, dilation, triageChoice, followup, linkDoctors, preProcChoice, confirmLabel, canConfirm, onConfirm, onLater, onNoFu, onDelete, onCancel, mainIds = null }) {
  const [delArmed, setDelArmed] = useState(false);
  const [preSel, setPreSel] = useState(() => preProcChoice?.initial || []);
  const tests = orderForPicking(rawTests, settings);
  const [followupDoctor, setFollowupDoctor] = useState(followup?.doctor || '');
  const [linkDoctor, setLinkDoctor] = useState('');
  const [showOthers, setShowOthers] = useState(false);
  const [triageRequired, setTriageRequired] = useState(triageChoice !== false);
  const [dil, setDil] = useState(() => ({ mode: ['yes', 'no'].includes(dilation?.initial?.mode) ? dilation.initial.mode : followup?.prefs?.[followup.doctor]?.dilate ? 'yes' : 'no', cr: !!dilation?.initial?.cr, eye: dilateEyeOf(dilation?.initial?.eye) || 'OU' }));
  const [dilEyeOpen, setDilEyeOpen] = useState(() => !!dilateEyeOf(dilation?.initial?.eye));
  const [sel, setSel] = useState(() => Object.fromEntries(tests.map(t => [t.id, !!initial?.[t.id]])));
  const [detail, setDetail] = useState(() => {
    const out = {};
    Object.keys(initialDetail || {}).forEach(k => { out[k] = cleanDetail(initialDetail[k]); });
    return out;
  });
  // 단안·프로토콜 칸은 필요할 때만 펼침 (이미 값이 있으면 펼친 상태로 시작)
  const [extraOpen, setExtraOpen] = useState(() => {
    const out = {};
    // openDetail=false: 처치 후 검사처럼 눈만 미리 맞춰 두고 칸은 접어 둠 (검사 이름 옆에 '(OD만)'으로 보임)
    if (!openDetail) return out;
    Object.keys(initialDetail || {}).forEach(k => {
      const d = cleanDetail(initialDetail[k]);
      if (d.note.trim() || d.eye !== 'OU') out[k] = true;
    });
    return out;
  });
  const preferred = followup?.prefs?.[followupDoctor]?.followupTests;
  // 다음 내원 창은 담당 교수님 목록, 그 밖의 창은 mainIds(그 환자 교수님 목록). 이미 체크된 검사는 항상 보임
  const mainList = followup ? (Array.isArray(preferred) ? preferred : null) : mainIds;
  const primary = !mainList ? tests : tests.filter(t => mainList.includes(t.id) || initial?.[t.id]);
  const others = tests.filter(t => !primary.some(x => x.id === t.id));
  const visibleTests = showOthers ? [...primary, ...others] : primary;
  const openExtra = (id) => {
    setSel(s => ({ ...s, [id]: true }));
    setExtraOpen(o => ({ ...o, [id]: true }));
  };
  // 다음 내원 진료 전 처치 (FU 지정 창에서는 [나머지 검사 보기] 안에)
  const preProcBlock = preProcChoice && (settings.procedures || []).length > 0 ? (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 mb-6">
      <div className="text-sm text-slate-700 mb-2">다음 내원 진료 전 처치 <span className="text-xs text-slate-500">(고르면 시력검사 없이 처치실부터)</span></div>
      <div className="flex flex-wrap gap-1.5">
        {(settings.procedures || []).map(x => {
          const on = preSel.includes(x.id);
          return (
            <button key={x.id} type="button" aria-pressed={on} onClick={() => setPreSel(v => (on ? v.filter(i => i !== x.id) : [...v, x.id]))}
              className={`text-sm px-3 py-1.5 rounded-full border ${on ? 'bg-rose-600 border-rose-600 text-white font-medium' : 'bg-white border-slate-300 text-slate-600'}`}>
              {on ? '✓ ' : ''}{x.name}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-full overflow-y-auto">
        <h3 className="text-lg font-medium mb-1 text-slate-900">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500 mb-4 break-keep">{subtitle}</p>}
        {info && <div className="mb-4">{info}</div>}
        {followup && <div className="text-sm text-indigo-700 mb-3">다음 내원 담당: {followupDoctor || '미지정'}</div>}
        {/* 2열 체크 칸. 세부 입력(단안·옵션)이 열린 칸만 한 줄 전체를 쓴다 */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          {tests.length === 0 && <div className="col-span-2 text-sm text-slate-400">설정에 등록된 검사가 없습니다</div>}
          {visibleTests.map(t => {
            const checked = !!sel[t.id];
            // [세부 창] 검사는 체크하면 바로, 다른 검사는 오른쪽 클릭(길게 누르기)으로 단안·프로토콜 칸 (FU 창도 같음, 10-05)
            const open = !!t.popupOnClick || !!extraOpen[t.id];
            return (
              <div
                key={t.id}
                onContextMenu={e => { e.preventDefault(); openExtra(t.id); }}
                className={`min-w-0 rounded-xl border ${checked ? 'border-slate-300 bg-slate-50' : 'border-slate-200'} ${checked && open ? 'col-span-2' : ''}`}
              >
                <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer" title={t.popupOnClick ? undefined : '오른쪽 클릭: 단안·프로토콜 지정'}>
                  <input type="checkbox" checked={checked} onChange={() => setSel(s => ({ ...s, [t.id]: !s[t.id] }))} className="w-5 h-5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-slate-700 truncate">
                      {t.short || t.name}
                      {checked && !open && detail[t.id] && cleanDetail(detail[t.id]).eye !== 'OU' && (
                        <span className="ml-1.5 text-xs text-slate-500">{cleanDetail(detail[t.id]).eye}만</span>
                      )}
                    </span>
                  </span>
                </label>
                {checked && open && (
                  <div className="px-3 pb-3">
                    <TestDetailEditor test={t} value={detail[t.id]} onChange={v => setDetail(d => ({ ...d, [t.id]: v }))} showExtra={open} />
                  </div>
                )}
                {checked && !open && !followup && (
                  <button type="button" onClick={() => openExtra(t.id)} className="block text-xs text-slate-500 underline -mt-1 pb-2 pl-10 pr-3">
                    단안·프로토콜 지정
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {!followup && others.length > 0 && (
          <button type="button" onClick={() => setShowOthers(v => !v)} className="w-full -mt-3 mb-5 rounded-lg border border-slate-300 py-2 text-sm text-slate-600">
            {showOthers ? '기타 검사 접기' : `기타 검사 보기 (${others.length}개 · 선택 ${others.filter(t => sel[t.id]).length}개)`}
          </button>
        )}
        {followup && <div className="mb-5 space-y-2">
          <button type="button" onClick={() => setShowOthers(v => !v)} className="w-full rounded-lg border border-slate-300 py-2 text-sm">{showOthers ? '나머지 검사 접기' : `나머지 검사 보기 (${others.length}개 · 선택 ${others.filter(t => sel[t.id]).length}개)${linkDoctor ? ` · 오늘 ${linkDoctor} 진료 추가` : ''}${preSel.length ? ` · 진료 전 처치 ${preSel.length}개` : ''}`}</button>
          {showOthers && <>
            {Array.isArray(linkDoctors) && (
              <label className="block text-sm text-fuchsia-800 rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-3">오늘 다른 교수 진료 추가
                <select value={linkDoctor} onChange={e => setLinkDoctor(e.target.value)} className={INPUT}>
                  <option value="">추가 안 함</option>
                  {linkDoctors.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
                <span className="text-xs">{linkDoctor
                  ? `설명 완료 후 ${settings.linkCheckAdded !== false ? '처치실에서 추가 검사를 확인하고 ' : ''}${linkDoctor} 진료 대기로 넘어갑니다.`
                  : '같은 날 다른 교수님 진료도 봐야 하면 선택하세요.'}</span>
              </label>
            )}
            <label className="block text-sm text-slate-600">다음 내원 담당 교수
              <select value={followupDoctor} onChange={e => { setFollowupDoctor(e.target.value); setDil(d => ({ ...d, cr: !!followup.prefs?.[e.target.value]?.cr && d.cr })); }} className={INPUT}>
                {[...new Set([followupDoctor, ...(followup.doctors || [])])].filter(Boolean).map(name => <option key={name} value={name}>{name}</option>)}
              </select><span className="text-xs">현재 선택한 검사는 유지되고, 오늘 진료 교수는 변경되지 않습니다.</span>
            </label>
            {preProcBlock}
          </>}
        </div>}
        {typeof triageChoice === 'boolean' && (
          <fieldset className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 mb-4">
            <legend className="px-1 text-sm font-medium text-indigo-900">검사 후 예진</legend>
            <div className="flex flex-wrap gap-4 text-sm text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="triage-required" checked={triageRequired} onChange={() => setTriageRequired(true)} />예진 함</label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="triage-required" checked={!triageRequired} onChange={() => setTriageRequired(false)} />예진 안 함</label>
            </div>
            <p className="mt-2 text-xs text-indigo-800">{triageRequired ? '검사 완료 후 처치실의 예진 대기로 이동합니다.' : '검사 완료 후 바로 진료 대기로 이동합니다.'} 검사가 없으면 바로 이동합니다.</p>
          </fieldset>
        )}
        {dilation && (
          <div className="rounded-xl border border-slate-200 p-3 mb-6">
            <div className="text-sm text-slate-700 mb-2">다음 내원 산동</div>
            <div className="inline-flex gap-1 bg-slate-100 rounded-lg p-1">
              {[['yes', '산동'], ['no', '산동 안 함']].map(([k, label]) => (
                <SpecialPressButton
                  key={k}
                  onClick={() => setDil(d => ({ ...d, mode: k }))}
                  onSpecial={k === 'yes' ? () => { setDil(d => ({ ...d, mode: 'yes' })); setDilEyeOpen(true); } : undefined}
                  title={k === 'yes' ? '오른쪽 클릭: 좌·우안 지정' : undefined}
                  className={`px-3 py-1.5 rounded-md text-sm select-none ${dil.mode === k ? 'bg-white text-slate-900 font-medium shadow' : 'text-slate-500'}`}
                >
                  {k === 'yes' && dil.mode === 'yes' && dil.eye !== 'OU' ? `${label} · ${DILATE_EYE_LABEL[dil.eye]}` : label}
                </SpecialPressButton>
              ))}
            </div>
            {dil.mode === 'yes' && dilEyeOpen && (
              <div className="mt-2 inline-flex gap-1 bg-slate-100 rounded-lg p-1 ml-0 sm:ml-2">
                {EYE_OPTIONS.map(o => (
                  <button key={o.key} type="button" aria-pressed={dil.eye === o.key} onClick={() => setDil(d => ({ ...d, eye: o.key }))}
                    className={`px-3 py-1.5 rounded-md text-sm ${dil.eye === o.key ? 'bg-white text-slate-900 font-medium shadow' : 'text-slate-500'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {(followup ? !!followup.prefs?.[followupDoctor]?.cr : dilation.crAvailable) && (
              <label className="flex items-center gap-2 mt-3 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={dil.cr} onChange={e => setDil(d => ({ ...d, cr: e.target.checked }))} className="w-4 h-4" />
                CR (조절마비 굴절검사, 3회 점안)
              </label>
            )}
          </div>
        )}
        {!followup && preProcBlock}
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 px-3 py-3 rounded-xl border border-slate-300 text-slate-600">취소</button>
          <button type="button" disabled={typeof canConfirm === 'function' && !canConfirm(sel)} onClick={() => onConfirm(sel, pickDetail(detail, sel, tests), { ...dil, doctor: followupDoctor, preProcs: preSel }, triageRequired, linkDoctor)} className="flex-1 px-3 py-3 rounded-xl bg-amber-600 text-white font-medium leading-snug break-keep disabled:bg-slate-300 disabled:text-slate-500">{typeof confirmLabel === 'function' ? confirmLabel(sel) : confirmLabel}</button>
        </div>
        {(onLater || onNoFu) && (
          <div className="flex gap-2 mt-2">
            {onLater && (
              <button type="button" onClick={() => onLater(linkDoctor)} title="위 체크는 저장하지 않고, 관리자 > FU 지정 관리에서 나중에 지정" className="flex-1 py-2.5 rounded-xl border border-emerald-300 text-emerald-700 text-sm font-medium">
                설명 완료 · FU 나중에
              </button>
            )}
            {/* 회송서를 쓰고 보내는 등 FU가 아예 없는 환자: FU를 잡지 않고 FU 명단에도 올리지 않음 */}
            {onNoFu && (
              <button type="button" onClick={() => onNoFu(linkDoctor)} title="FU를 잡지 않음 (예전 FU 지정도 지움)" className="flex-1 py-2.5 rounded-xl border border-rose-300 text-rose-700 text-sm font-medium">
                설명 완료 · FU 없음 (회송)
              </button>
            )}
          </div>
        )}
        {/* 관리자 FU 지정: FU를 잡지 않고 FU 명단에서 지움 (한 번 더 눌러야 삭제) */}
        {onDelete && (
          <div className="mt-3 text-center">
            <button type="button" onClick={() => (delArmed ? onDelete(followupDoctor) : setDelArmed(true))} className="text-sm text-rose-700 underline">
              {delArmed ? '한 번 더 누르면 FU 명단에서 삭제' : 'FU 없음 · FU 명단에서 삭제'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// 카드의 [검사 변경]에서 검사 켜고 끄기 + 세부 창 (처치실 등에서 함께 씀)
export function useTestEditing(patients, settings, mutatePatients) {
  const [detailFor, setDetailFor] = useState(null);
  const setAssigned = (pk, key, val, detail) =>
    mutatePatients(prev => prev.map(x => {
      if (patientKey(x) !== pk || activeVf(x)) return x;
      const nextDetail = { ...(x.detail || {}) };
      if (!val || detail === null) delete nextDetail[key];
      else if (detail) nextDetail[key] = detail;
      return { ...x, assigned: { ...x.assigned, [key]: val }, done: val ? x.done : { ...x.done, [key]: false }, detail: nextDetail, ...(val ? {} : withoutPrep(x, key)) };
    }));
  const pickTest = (p, t, on) => {
    if (t.popupOnClick) { setDetailFor({ key: patientKey(p), testId: t.id }); return; }
    setAssigned(patientKey(p), t.id, !on);
  };
  const openSpecial = (p, t) => setDetailFor({ key: patientKey(p), testId: t.id });
  const dp = detailFor ? patients.find(x => patientKey(x) === detailFor.key) : null;
  const dt = detailFor ? settings.tests.find(t => t.id === detailFor.testId) : null;
  const modal = detailFor && dp && dt ? (
    <TestDetailModal
      key={`${detailFor.key}-${detailFor.testId}`}
      test={dt}
      patientName={dp.name}
      on={!!dp.assigned?.[dt.id]}
      value={dp.detail?.[dt.id]}
      onApply={(d) => {
        const kept = pickDetail({ [dt.id]: d }, { [dt.id]: true }, [dt])[dt.id] || null;
        setAssigned(detailFor.key, dt.id, true, kept);
        setDetailFor(null);
      }}
      onRemove={() => { setAssigned(detailFor.key, dt.id, false); setDetailFor(null); }}
      onCancel={() => setDetailFor(null)}
    />
  ) : null;
  return { pickTest, openSpecial, modal };
}
