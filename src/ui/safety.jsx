// 화면 안전장치: 화면 오류(흰 화면 대신 안내), 저장 실패 알림, 서버 데이터 파일 문제 안내
import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

// 지금 이 PC가 보고 있는 화면 (환자용 화면·QR 접수에는 직원용 안내 띠를 띄우지 않으려고)
let currentRole = null;
const roleListeners = new Set();
export function setCurrentRole(role) {
  if (currentRole === role) return;
  currentRole = role;
  roleListeners.forEach(fn => fn(role));
}
export function useCurrentRole() {
  const [role, setRole] = useState(currentRole);
  useEffect(() => {
    roleListeners.add(setRole);
    setRole(currentRole);
    return () => { roleListeners.delete(setRole); };
  }, []);
  return role;
}
export function isPatientFacing(role = currentRole) {
  return !!role && (role === 'kiosk' || role.startsWith('board:'));
}

// 마지막으로 연 화면을 PC마다 기억 (새로고침·컴퓨터를 다시 켜도 그 화면으로). 설정은 비밀번호 때문에 기억하지 않음
const ROLE_KEY = 'oph-role';
export function rememberedRole() {
  try { return localStorage.getItem(ROLE_KEY) || null; } catch { return null; }
}
export function rememberRole(role) {
  try {
    if (role && role !== 'settings') localStorage.setItem(ROLE_KEY, role);
    else localStorage.removeItem(ROLE_KEY);
  } catch { /* 기억 못 해도 이번 화면은 그대로 */ }
}

// 화면 오류를 서버 기록(서버 창, 창 없이 켰으면 data\\server-log.txt)에 남깁니다. 같은 오류는 한 번만
const reported = new Set();
export function reportClientError(where, error) {
  const message = String(error?.message || error || '');
  const key = `${where}|${currentRole}|${message}`;
  if (reported.has(key)) return;
  reported.add(key);
  try {
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: `${where} · ${currentRole || '메인'}`, message, stack: String(error?.stack || '').slice(0, 1500) }),
    }).catch(() => {});
  } catch { /* 기록을 못 남겨도 화면은 계속 */ }
}

// 화면을 그리다 오류가 나면 흰 화면 대신 안내를 띄웁니다. 30초 뒤 저절로 다시 시도 (환자용 화면처럼 사람이 없는 곳 대비)
// silent: 안내 없이 그 부분만 숨김 (위쪽 알림 띠처럼 없어도 되는 부분)
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retryTimer = null;
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) {
    reportClientError(this.props.where || '화면', error);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.setState({ error: null }), 30000);
  }
  componentWillUnmount() { clearTimeout(this.retryTimer); }
  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.silent) return null;
    const retry = () => { clearTimeout(this.retryTimer); this.setState({ error: null }); };
    return (
      <div role="alert" className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-7 w-full max-w-md break-keep">
          <div className="flex items-center gap-2 text-rose-700 mb-2">
            <AlertTriangle size={22} aria-hidden="true" />
            <h1 className="text-lg font-semibold">화면을 그리는 중 오류가 났습니다</h1>
          </div>
          <p className="text-sm text-slate-600 mb-1">서버에 저장된 내용은 그대로입니다. 아래 버튼을 눌러 주세요.</p>
          <p className="text-xs text-slate-400 mb-5">계속 반복되면 관리자에게 알려 주세요. 오류 내용은 서버에 기록했습니다.</p>
          <div className="flex gap-2">
            <button type="button" onClick={retry} className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium">다시 시도</button>
            {this.props.onHome && (
              <button type="button" onClick={() => { retry(); this.props.onHome(); }} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 text-white font-medium">메인 화면으로</button>
            )}
          </div>
        </div>
      </div>
    );
  }
}

// 저장 실패 알림: 저장소(storage.jsx)가 'oph-save-failed' 를 알리면 빨간 띠. [확인]을 누를 때까지 남음 (환자용 화면에는 띄우지 않음 — main.jsx)
export function useSaveFailures() {
  const [fails, setFails] = useState(0);
  useEffect(() => {
    const on = () => setFails(n => n + 1);
    window.addEventListener('oph-save-failed', on);
    return () => window.removeEventListener('oph-save-failed', on);
  }, []);
  return [fails, () => setFails(0)];
}
export function SaveFailBar({ count, onClose }) {
  if (!count) return null;
  return (
    <div role="alert" className="flex items-center justify-center gap-3 flex-wrap bg-red-600 px-4 py-2 text-sm text-white break-keep">
      <span><b>저장 실패{count > 1 ? ` ${count}건` : ''}</b> · 방금 입력한 내용이 서버에 저장되지 않았습니다. 화면이 저장된 내용으로 돌아가니 확인하고 다시 입력해 주세요.</span>
      <button type="button" onClick={onClose} className="rounded bg-white px-3 py-1 font-semibold text-red-700">확인</button>
    </div>
  );
}

// 서버 데이터 파일 문제 (서버가 /api/health 로 알려 줌): 복구 못 한 항목은 빨간 띠, 자동 복구한 것은 노란 띠 ([확인]은 PC마다)
const KEY_NAMES = {
  'daily-patients': '환자 명단', 'fu-designations': 'FU 지정', 'measure-history': '이전 시력',
  settings: '설정', doctors: '교수 목록', 'doctor-prefs': '교수 설정', 'board-notices': '대기 화면 안내', 'today-override': '날짜 설정',
};
const keyName = (k) => KEY_NAMES[k] || (String(k).startsWith('patients-archive-') ? `지난 명단(${String(k).slice(17)})` : k);
const SEEN_KEY = 'oph-problem-seen';
export function DataProblemBar({ problems }) {
  const [seen, setSeen] = useState(() => { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } });
  if (!Array.isArray(problems) || !problems.length) return null;
  const broken = [...new Set(problems.filter(p => p.kind === 'broken').map(p => keyName(p.key)))];
  if (broken.length) {
    return (
      <div role="alert" className="bg-red-700 px-4 py-2 text-center text-sm font-semibold text-white break-keep">
        서버의 {broken.join(', ')} 파일이 손상되어 그 부분을 저장·불러오기 할 수 없습니다. 관리자에게 알려 주세요 (서버 PC의 백업복구.bat).
      </div>
    );
  }
  const fresh = problems.filter(p => p.kind === 'recovered' && p.at > seen);
  if (!fresh.length) return null;
  const last = fresh[fresh.length - 1];
  const close = () => { try { localStorage.setItem(SEEN_KEY, String(last.at)); } catch { /* 이번만 닫힘 */ } setSeen(last.at); };
  const time = new Date(last.at);
  return (
    <div role="status" className="flex items-center justify-center gap-3 flex-wrap bg-amber-100 border-b border-amber-300 px-4 py-2 text-sm text-amber-900 break-keep">
      <span>서버가 손상된 {[...new Set(fresh.map(p => keyName(p.key)))].join(', ')} 파일을 {String(time.getHours()).padStart(2, '0')}:{String(time.getMinutes()).padStart(2, '0')}에 {last.from}으로 되돌렸습니다. 최근 입력이 빠졌는지 확인해 주세요.</span>
      <button type="button" onClick={close} className="rounded border border-amber-400 bg-white px-3 py-1 font-semibold text-amber-800">확인</button>
    </div>
  );
}
