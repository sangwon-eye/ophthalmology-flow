// 메인 화면(이 컴퓨터의 화면 선택)
import React, { useState, useEffect, useRef } from 'react';
import { Eye, Camera, Stethoscope, Monitor, Settings, ClipboardList, Search, Syringe, ScanBarcode, X, Heart } from 'lucide-react';
import { COLOR_MAP, INPUT, applyCheckin, consultWaiting, forcedToday, patientKey, preProcPending, realTodayISO, roomColor, roomTests, roomWaiting, todayISO, treatRoomOf, treatWork, treatWorkCount, visionWaiting } from '../core/flow.jsx';
import { visionNames } from '../core/storage.jsx';
import { APP_VERSION, TextSizeControl } from '../ui/common.jsx';
import { patientBoardName } from './BoardView.jsx';

/* ------------------------------------------------------------------ */
/* 역할 선택                                                           */
/* ------------------------------------------------------------------ */
// 설정 비밀번호: 서버가 해시로 저장하고 확인합니다 (공유 저장소에는 두지 않음).
export async function lockApi(path, body) {
  const res = await fetch(`/api/settings-lock${path}`, body === undefined
    ? { cache: 'no-store' }
    : { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}

export function PasswordModal({ onOk, onCancel }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await lockApi('/check', { password: pw });
      if (r.ok) onOk(); else { setError('비밀번호가 틀렸습니다'); setPw(''); }
    } catch { setError('서버에 연결되지 않아 확인할 수 없습니다'); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-medium mb-3 text-slate-900">설정 비밀번호</h3>
        <input type="password" autoFocus value={pw} onChange={e => setPw(e.target.value)} aria-label="설정 비밀번호" className={INPUT} />
        {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600">취소</button>
          <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-white font-medium disabled:opacity-50">확인</button>
        </div>
      </form>
    </div>
  );
}

export function SettingsPasswordCard() {
  const [enabled, setEnabled] = useState(null);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { lockApi('').then(r => setEnabled(!!r.enabled)).catch(() => setEnabled(null)); }, []);
  const save = async (value) => {
    if (value && value !== again) { setMsg('새 비밀번호 두 칸이 다릅니다'); return; }
    try {
      const r = await lockApi('/set', { current: cur, next: value });
      if (r.status === 403) { setMsg('현재 비밀번호가 틀렸습니다'); return; }
      if (r.status !== 200) { setMsg('저장하지 못했습니다'); return; }
      setEnabled(!!r.enabled);
      setCur(''); setNext(''); setAgain('');
      setMsg(r.enabled ? '비밀번호를 저장했습니다. 이제 설정에 들어갈 때마다 묻습니다.' : '비밀번호를 없앴습니다. 설정에 바로 들어갑니다.');
    } catch { setMsg('서버에 연결되지 않아 저장하지 못했습니다'); }
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="font-medium text-slate-900 mb-1">설정 비밀번호 <span className="text-sm font-normal text-slate-500">· {enabled === null ? '확인 중' : enabled ? '사용 중' : '사용 안 함'}</span></div>
      <p className="text-sm text-slate-500 mb-3">정해 두면 모든 컴퓨터에서 설정에 들어갈 때마다 비밀번호를 묻습니다. 잊어버리면 서버 PC에서 설정비밀번호초기화.bat 을 실행하세요.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        {enabled && <input type="password" placeholder="현재 비밀번호" aria-label="현재 비밀번호" value={cur} onChange={e => setCur(e.target.value)} className={INPUT} />}
        <input type="password" placeholder="새 비밀번호" aria-label="새 비밀번호" value={next} onChange={e => setNext(e.target.value)} className={INPUT} />
        <input type="password" placeholder="새 비밀번호 확인" aria-label="새 비밀번호 확인" value={again} onChange={e => setAgain(e.target.value)} className={INPUT} />
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <button type="button" disabled={!next} onClick={() => save(next)} className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium disabled:opacity-40">비밀번호 저장</button>
        {enabled && <button type="button" onClick={() => save('')} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600">비밀번호 없애기</button>}
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}

// 바코드 접수 (대기 공간에서 환자가 직접 찍음). 바코드 인식기는 키보드처럼 환자번호를 치고 Enter를 누릅니다.
export function findKioskPatient(patients, code) {
  const exact = patients.filter(p => String(p.id).trim() === code);
  if (exact.length) return exact;
  const strip = (v) => String(v).trim().replace(/^0+/, '');
  if (!strip(code)) return [];
  return patients.filter(p => strip(p.id) === strip(code));
}
export function beep(ok) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.15;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + (ok ? 0.15 : 0.4));
    o.onended = () => ctx.close();
  } catch { /* 소리를 못 내도 접수에는 영향 없음 */ }
}
// 접수 안내 문구가 없어도 진료 전 처치 환자에게는 처치실로 가라고 안내
export function kioskNoteFor(p, settings) {
  if (p.kioskNote) return p.kioskNote;
  if (!preProcPending(p)) return '';
  const t = treatRoomOf(settings);
  return `시력검사 없이 바로 ${t.patientName || t.name}로 오세요`;
}
export function KioskView({ patients, settings, mutatePatients, onExit }) {
  const [result, setResult] = useState(null);
  const [askPassword, setAskPassword] = useState(false);
  const buffer = useRef('');
  const lastKey = useRef(0);
  const clearTimer = useRef(null);
  const latest = useRef({ patients, settings });
  latest.current = { patients, settings };

  const show = (r) => {
    setResult(r);
    beep(r.ok);
    clearTimeout(clearTimer.current);
    // 노란 안내 문구(접수 안내·처치실 안내)가 있으면 읽을 시간을 더 줌
    clearTimer.current = setTimeout(() => setResult(null), r.note ? 8000 : 5000);
  };
  const handle = async (code) => {
    const { patients: list, settings: s } = latest.current;
    const found = findKioskPatient(list, code);
    const waiting = found.filter(p => !p.consultDone);
    const p = waiting.find(x => !x.checkin) || waiting[0];
    if (!p) {
      show({ ok: false, title: found.length ? '오늘 진료가 끝났습니다' : '오늘 예약 명단에서 찾지 못했습니다', sub: '접수처에 문의해 주세요' });
      return;
    }
    if (p.checkin) {
      show({ ok: true, title: `${patientBoardName(p)}님은 이미 접수되었습니다`, note: kioskNoteFor(p, s), sub: kioskNoteFor(p, s) ? '' : '잠시 기다려 주세요' });
      return;
    }
    const pk = patientKey(p);
    try {
      await mutatePatients(prev => prev.map(x => (patientKey(x) === pk && !x.checkin
        ? applyCheckin(x, { autoLate: true, graceMin: s.lateGraceMin }) : x)));
      show({ ok: true, title: `${patientBoardName(p)}님 접수되었습니다`, note: kioskNoteFor(p, s), sub: kioskNoteFor(p, s) ? '' : '잠시 기다려 주세요' });
    } catch {
      show({ ok: false, title: '지금 접수할 수 없습니다', sub: '접수처에 문의해 주세요' });
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (askPassword) return;
      const now = Date.now();
      if (now - lastKey.current > 1000) buffer.current = '';
      lastKey.current = now;
      if (e.key === 'Enter') {
        const code = buffer.current.trim();
        buffer.current = '';
        if (code) handle(code);
        e.preventDefault();
      } else if (e.key.length === 1) {
        buffer.current += e.key;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(clearTimer.current); };
    // handle 은 명단·설정을 latest(ref)에서 매번 새로 읽으므로 다시 등록할 필요가 없습니다 (일부러 뺌)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askPassword]);

  const exit = async () => {
    try {
      const r = await lockApi('');
      if (r.enabled) { setAskPassword(true); return; }
    } catch { /* 서버가 꺼져 있으면 그냥 나감 */ }
    onExit();
  };

  return (
    // 저시력 환자도 읽을 수 있게: 화면 너비에 맞춰 아주 큰 글씨, 진한 글자·밝은 바탕의 높은 대비
    <div className={`min-h-screen flex flex-col items-center justify-center px-6 py-8 text-center break-keep ${result ? (result.ok ? 'bg-white' : 'bg-red-50') : 'bg-white'}`}>
      {!result ? (
        <>
          <h1 className="font-bold text-slate-900 leading-tight mb-6" style={{ fontSize: 'clamp(2.5rem, 6vw, 5.5rem)' }}>진료카드 QR 코드를<br />찍어 주세요</h1>
          <p className="font-semibold text-slate-700" style={{ fontSize: 'clamp(1.75rem, 3.5vw, 3rem)' }}>찍으면 바로 접수됩니다</p>
        </>
      ) : (
        <div role="status" className="w-full max-w-6xl">
          <h1 className={`font-bold leading-tight mb-8 ${result.ok ? 'text-slate-900' : 'text-red-800'}`} style={{ fontSize: 'clamp(2.5rem, 6.5vw, 6rem)' }}>
            {result.ok && <span className="text-emerald-700">✓ </span>}{result.title}
          </h1>
          {result.note && (
            <p className="font-extrabold leading-snug text-black bg-yellow-300 border-8 border-black rounded-3xl px-8 py-8 mb-6" style={{ fontSize: 'clamp(2.75rem, 7vw, 6.5rem)' }}>
              {result.note}
            </p>
          )}
          {result.sub && <p className="font-semibold text-slate-800" style={{ fontSize: 'clamp(2rem, 4.5vw, 4rem)' }}>{result.sub}</p>}
        </div>
      )}
      <button type="button" onClick={exit} className="fixed bottom-3 right-4 text-xs text-slate-300 hover:text-slate-500">관리</button>
      {askPassword && <PasswordModal onOk={() => { setAskPassword(false); onExit(); }} onCancel={() => setAskPassword(false)} />}
    </div>
  );
}

// 메인 화면 칸의 검사 목록: 많으면 앞의 5개 + '외 N개' (글자가 중간에 잘리지 않게)
export function testListText(shorts) {
  if (!shorts.length) return '검사 없음';
  return shorts.length > 6 ? `${shorts.slice(0, 5).join(', ')} 외\u00a0${shorts.length - 5}개` : shorts.join(', ');
}

// 메인 화면 칸 아래 대기 인원: 방 색깔 큰 숫자 + '명 대기', 진료실은 교수님별 한 줄
function WaitBelow({ k, count, detail, c }) {
  return (
    <div data-count={k} className="text-center mt-2">
      <div className="flex items-baseline justify-center gap-1">
        <span className={`text-3xl font-bold tabular-nums ${count ? c.text : 'text-slate-300'}`}>{count}</span>
        <span className="text-sm text-slate-500">명 대기</span>
      </div>
      {detail && <div data-count-detail={k} className="text-xs text-slate-500">{detail.map(([d, n], i) => <span key={d}>{i ? ' · ' : ''}{d} <b className={n ? 'text-slate-800' : 'text-slate-400'}>{n}</b></span>)}</div>}
    </div>
  );
}

// 메인 화면 맨 아래 작은 글씨 [감사의 글] → 만든 사람의 글
const THANKS = [
  '시간이 지나고 보니 이 말은 수학에만 해당하는 이야기가 아니었습니다. 같은 수고를 매일 손으로 되풀이하기보다, 한 번 더 고민해서 그 수고를 덜어 내는 것. 이 프로그램은 그 작은 마음에서 시작되었습니다.',
  '외래의 하루는 수많은 기다림으로 채워집니다. 환자분들은 시력검사를, 검사실을, 진료실을 차례로 기다리시고, 직원분들은 명단을 넘기고 이름을 부르며 환자분이 어디쯤 계신지 확인하느라 쉴 틈이 없습니다. 바쁜 수련 생활 속에서도 그 기다림을 조금이라도 줄이고, 함께 일하는 동료들의 수고를 덜고 싶었습니다.',
  '그래서 시력검사실에서 검사실과 처치실, 진료실로 이어지는 흐름 하나하나를 들여다보며, 현장에서 들은 이야기를 한 줄씩 담았습니다. 띵동 소리 하나, 버튼 하나에도 “이렇게 하면 조금 더 편하지 않을까” 하는 고민이 들어 있습니다.',
  '검사실·진료실·처치실의 모든 선생님들과 진료를 기다리시는 환자분들께, 화면 곳곳에 담긴 작은 배려가 전해지기를 바랍니다. 불편한 점이나 더 좋은 생각이 있으시면 언제든 편하게 말씀해 주세요.',
];
export function AboutModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div role="dialog" aria-label="감사의 글" className="relative bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[92vh] overflow-y-auto break-keep" onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="닫기" className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-white/70"><X size={20} /></button>
        <div className="px-8 pt-8 pb-6 bg-gradient-to-br from-indigo-50 via-white to-sky-50 border-b border-slate-100 rounded-t-2xl">
          <div className="flex items-center gap-2 text-indigo-500 mb-2">
            <Eye size={18} aria-hidden="true" />
            <span className="text-xs font-semibold tracking-wide">Ophthalmology Flow</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">감사의 글</h2>
        </div>
        <div className="px-8 pt-6 pb-2 text-[15px] leading-7 text-slate-700 space-y-4">
          <blockquote className="border-l-4 border-indigo-300 bg-indigo-50/60 rounded-r-lg px-4 py-3">
            <div className="text-xs text-indigo-500 mb-1">학창 시절 수학 선생님께서 해 주신 말씀</div>
            <div className="text-base font-medium text-slate-900">“수학을 잘하려면 몸은 게으르고, 머리는 부지런해야 한다.”</div>
          </blockquote>
          {THANKS.map((t, i) => <p key={i}>{t}</p>)}
          <p className="font-medium text-slate-900">감사합니다.</p>
        </div>
        <div className="px-8 pt-4 pb-8 flex items-end justify-between gap-4">
          <span className="text-xs text-slate-400">{APP_VERSION}</span>
          <div className="text-right">
            <div className="text-xs text-slate-400">2026년 10월</div>
            <div className="text-lg font-bold text-slate-900">한상원 <span className="text-sm font-normal text-slate-500">드림</span></div>
            <div className="text-xs text-slate-400">2023년 입국</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RoleSelect({ settings, onSelect, onSetToday, patients = [], doctors = [], doctorPrefs }) {
  const [about, setAbout] = useState(false);
  // 날짜 바꾸기는 모든 컴퓨터 명단이 바뀌므로 고른 뒤 [바꾸기]를 한 번 더 눌러야 적용 (실제 날짜로 되돌리는 것은 바로)
  const [pendingDate, setPendingDate] = useState(null);
  const pickDate = (v) => {
    if (!v || v === todayISO()) { setPendingDate(null); return; }
    if (v === realTodayISO()) { setPendingDate(null); onSetToday(null); return; }
    setPendingDate(v);
  };
  // 메인 화면: 매일 쓰는 직원 화면(진료 흐름)은 크게, 환자용 화면·관리는 작게 묶어서 한 화면에 모두
  // 방마다 대기 인원(각 화면 위쪽 '대기 N명'과 같은 숫자). 진료실은 교수님별로 한 줄
  // 오늘 명단에 환자가 없는 교수님은 빼기
  const byDoctor = doctors.filter(d => patients.some(p => p.doctor === d))
    .map(d => [d, patients.filter(p => p.doctor === d && consultWaiting(p, settings, doctorPrefs)).length]);
  const flow = [
    { key: 'vision', label: visionNames(settings).name, sub: '가장 먼저 거치는 검사실', icon: Eye, color: 'blue', count: visionWaiting(patients).length },
    ...settings.rooms.filter(r => r.builtin !== 'treat').map(r => ({
      key: `room:${r.id}`,
      label: r.name,
      sub: testListText(roomTests(settings, r.id).map(t => t.short)),
      icon: Camera,
      color: roomColor(settings, r.id),
      count: roomWaiting(patients, settings, r.id).length,
    })),
    { key: 'procedure', label: treatRoomOf(settings).name, sub: roomTests(settings, treatRoomOf(settings).id).length ? '진료 전 검사 · 예진 · 전공의 처치' : '초진 예진 · 전공의 처치', icon: Syringe, color: 'indigo', count: treatWorkCount(treatWork(patients, settings)) },
    { key: 'consult', label: '진료실', sub: '교수님별 진료 대기', icon: Stethoscope, color: 'amber', count: byDoctor.reduce((a, [, n]) => a + n, 0),
      detail: byDoctor.length ? byDoctor : null },
  ];
  const patientSide = [
    { key: 'board', label: '환자용 화면', sub: '대기 명단 모니터', icon: Monitor },
    { key: 'kiosk', label: 'QR 접수', sub: '환자가 직접 찍는 접수', icon: ScanBarcode },
  ];
  const manage = [
    { key: 'admin', label: '관리자', sub: '명단 · FU · 통계', icon: ClipboardList },
    { key: 'settings', label: '설정', sub: '검사 · 검사실 · 교수', icon: Settings },
    { key: 'directory', label: '전체 환자 명단', sub: '환자 찾기 · 진행 상황', icon: Search },
  ];
  const small = ({ key, label, sub, icon: Icon }) => (
    <button key={key} type="button" onClick={() => onSelect(key)} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:shadow-md transition-shadow text-left">
      <Icon size={22} className="text-slate-600 shrink-0" />
      <span className="min-w-0">
        <span className="block font-medium text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500 truncate">{sub}</span>
      </span>
    </button>
  );
  const groupTitle = (text) => <div className="text-xs font-semibold text-slate-400 mb-2">{text}</div>;
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-6">
          <div className="text-sm text-slate-400 mb-1">Ophthalmology Flow</div>
          <h1 className="text-2xl font-semibold text-slate-900">이 컴퓨터의 화면을 선택하세요</h1>
          <div className="flex justify-center items-center gap-x-4 gap-y-2 mt-3 flex-wrap text-sm">
            <TextSizeControl />
            <span className="flex items-center gap-2 flex-wrap justify-center">
              <span className="text-slate-500">오늘 날짜</span>
              <input type="date" aria-label="오늘 날짜" value={pendingDate || todayISO()} onChange={e => pickDate(e.target.value)}
                className={`border rounded-lg px-3 py-1.5 bg-white ${forcedToday || pendingDate ? 'border-amber-400' : 'border-slate-300'}`} />
              {pendingDate ? <>
                <button type="button" onClick={() => { onSetToday(pendingDate); setPendingDate(null); }} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white font-semibold">모든 컴퓨터 {Number(pendingDate.slice(5, 7))}월 {Number(pendingDate.slice(8, 10))}일로 바꾸기</button>
                <button type="button" onClick={() => setPendingDate(null)} className="text-xs underline text-slate-600">취소</button>
              </> : forcedToday ? <>
                <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">직접 정함 · 모든 컴퓨터 적용 · 다음 날 자동 해제</span>
                <button type="button" onClick={() => onSetToday(null)} className="text-xs underline text-slate-600">실제 날짜({realTodayISO()})로 되돌리기</button>
              </> : <span className="text-xs text-slate-400">컴퓨터 날짜 자동</span>}
            </span>
          </div>
        </div>
        {groupTitle('진료 흐름 · 직원 화면')}
        {/* 칸 높이는 모두 같게: 설명은 늘 두 줄 자리, 칸 아래 교수님 줄이 길어도 칸은 그대로 (items-start) */}
        <div className="grid items-start gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] mb-6">
          {flow.map(({ key, label, sub, icon: Icon, color, count, detail }) => {
            const c = COLOR_MAP[color] || COLOR_MAP.slate;
            return (
              <div key={key} className="flex flex-col">
                <button type="button" data-tile={key} onClick={() => onSelect(key)} className={`flex flex-col items-center gap-2 px-3 py-5 rounded-2xl border-2 ${c.border} ${c.bg} hover:shadow-md transition-shadow`}>
                  <Icon size={30} className={c.text} />
                  <div className="text-center min-w-0">
                    <div className="t-tile font-medium text-slate-900">{label}</div>
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-2 min-h-[2.7em]">{sub}</div>
                  </div>
                </button>
                {/* 대기 인원은 칸 밖 아래에 따로 */}
                <WaitBelow k={key} count={count} detail={detail} c={c} />
              </div>
            );
          })}
        </div>
        <div className="grid gap-6 md:grid-cols-[2fr_3fr]">
          <section>
            {groupTitle('환자용')}
            <div className="grid gap-3 sm:grid-cols-2">{patientSide.map(small)}</div>
          </section>
          <section>
            {groupTitle('관리')}
            <div className="grid gap-3 sm:grid-cols-3">{manage.map(small)}</div>
          </section>
        </div>
        <div className="flex items-center justify-center gap-3 text-xs text-slate-400 mt-6">
          {APP_VERSION}
          <button type="button" onClick={() => setAbout(true)} className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100">
            <Heart size={13} aria-hidden="true" />감사의 글
          </button>
        </div>
      </div>
      {about && <AboutModal onClose={() => setAbout(false)} />}
    </div>
  );
}
