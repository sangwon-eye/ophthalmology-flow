// 접속 비밀번호 화면: 서버가 확인하고, 맞으면 이 컴퓨터(브라우저)가 기억합니다 (통행증 쿠키).
import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { INPUT } from '../core/flow.jsx';

export async function accessApi(path, body) {
  const res = await fetch(`/api/access${path}`, body === undefined
    ? { cache: 'no-store' }
    : { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}

export function AccessGate({ onOk }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!pw) return;
    setBusy(true); setError('');
    try {
      const r = await accessApi('/login', { password: pw });
      if (r.status === 200 && r.ok) { onOk(); return; }
      setPw('');
      setError(r.status === 429 ? `여러 번 틀려서 잠시 잠겼습니다. ${r.wait || 60}초 뒤에 다시 입력하세요.` : '비밀번호가 틀렸습니다');
    } catch { setError('서버에 연결되지 않았습니다. 서버 PC가 켜져 있는지 확인해주세요.'); }
    setBusy(false);
  };
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-7 w-full max-w-sm">
        <div className="flex items-center gap-2 text-slate-900 mb-1">
          <Lock size={20} aria-hidden="true" />
          <h1 className="text-lg font-semibold">안과 환자 흐름</h1>
        </div>
        <p className="text-sm text-slate-500 mb-4 break-keep">접속 비밀번호를 입력하세요. 한 번 들어오면 이 컴퓨터는 다음부터 묻지 않습니다.</p>
        <input type="password" autoFocus aria-label="접속 비밀번호" placeholder="접속 비밀번호" value={pw} onChange={e => setPw(e.target.value)} className={`${INPUT} w-full mb-3`} />
        {error && <div role="alert" className="text-sm text-red-600 mb-3">{error}</div>}
        <button type="submit" disabled={busy || !pw} className="w-full px-4 py-2.5 rounded-lg bg-slate-800 text-white font-medium disabled:opacity-40">{busy ? '확인 중…' : '들어가기'}</button>
      </form>
    </div>
  );
}

// 설정 화면: 접속 비밀번호 정하기·바꾸기·없애기
export function AccessPasswordCard() {
  const [enabled, setEnabled] = useState(null);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState('');
  React.useEffect(() => { accessApi('').then(r => setEnabled(!!r.enabled)).catch(() => setEnabled(null)); }, []);
  const save = async (value) => {
    if (value && value !== again) { setMsg('새 비밀번호 두 칸이 다릅니다'); return; }
    try {
      const r = await accessApi('/set', { current: cur, next: value });
      if (r.status === 403) { setMsg('현재 접속 비밀번호가 틀렸습니다'); return; }
      if (r.status === 429) { setMsg(`여러 번 틀려서 잠시 잠겼습니다. ${r.wait || 60}초 뒤에 다시 하세요.`); return; }
      if (r.status !== 200) { setMsg('저장하지 못했습니다'); return; }
      setEnabled(!!r.enabled);
      setCur(''); setNext(''); setAgain('');
      setMsg(r.enabled ? '접속 비밀번호를 저장했습니다. 다른 컴퓨터는 다음 확인 때 비밀번호 화면이 나옵니다 (한 번 입력하면 기억).' : '접속 비밀번호를 없앴습니다. 주소만 알면 누구나 들어올 수 있습니다.');
    } catch { setMsg('서버에 연결되지 않아 저장하지 못했습니다'); }
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="font-medium text-slate-900 mb-1">접속 비밀번호 <span className="text-sm font-normal text-slate-500">· {enabled === null ? '확인 중' : enabled ? '사용 중' : '사용 안 함'}</span></div>
      <p className="text-sm text-slate-500 mb-3">
        정해 두면 프로그램에 처음 들어갈 때 모든 컴퓨터(환자용 화면·QR 접수·태블릿 포함)에서 한 번 묻고, 그 뒤로는 기억합니다.
        서버가 직접 막으므로 주소를 알아도 비밀번호 없이는 데이터를 볼 수 없습니다. 바꾸면 모든 컴퓨터가 다시 입력해야 합니다.
        잊어버리면 서버 PC에서 접속비밀번호초기화.bat 을 실행하세요.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        {enabled && <input type="password" placeholder="현재 접속 비밀번호" aria-label="현재 접속 비밀번호" value={cur} onChange={e => setCur(e.target.value)} className={INPUT} />}
        <input type="password" placeholder="새 접속 비밀번호" aria-label="새 접속 비밀번호" value={next} onChange={e => setNext(e.target.value)} className={INPUT} />
        <input type="password" placeholder="새 접속 비밀번호 확인" aria-label="새 접속 비밀번호 확인" value={again} onChange={e => setAgain(e.target.value)} className={INPUT} />
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <button type="button" disabled={!next} onClick={() => save(next)} className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium disabled:opacity-40">접속 비밀번호 저장</button>
        {enabled && <button type="button" disabled={!cur} onClick={() => save('')} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 disabled:opacity-40">접속 비밀번호 없애기</button>}
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}
