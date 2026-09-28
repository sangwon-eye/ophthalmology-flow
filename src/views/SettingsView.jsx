// 설정 화면
import React, { useState } from 'react';
import { Plus, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { COLOR_MAP, DEFAULT_SETTINGS, INPUT, ROOM_PALETTE, machineGroups, newId, orderForPicking, parseOptions, renameTestOptions, sortedTests, toDraft, holdCallOf } from '../core/flow.jsx';
import { DEFAULT_HX_FIELDS, hxFieldsOf, visionNames } from '../core/storage.jsx';
import { ConfirmButton, Field, HX_TYPES, SHELL_WIDTH, ScreenShell, TEST_OPTION_HELP, noDilateTest } from '../ui/common.jsx';
import { SettingsPasswordCard } from './RoleSelect.jsx';
import { DoctorRoomInput } from './BoardView.jsx';

/* ------------------------------------------------------------------ */
/* 설정 화면                                                            */
/* ------------------------------------------------------------------ */
export function SettingsView({ settings, doctors, doctorPrefs, mutateSettings, mutateDoctors, mutateDoctorPrefs, onBack, lastSync }) {
  const [tab, setTab] = useState('rooms');
  const [draft, setDraft] = useState(() => toDraft(settings));
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [newDoctor, setNewDoctor] = useState('');
  const updateDraft = (fn) => { setDraft(d => fn(d)); setDirty(true); setNotice(''); };

  const updateRoom = (id, patch) => updateDraft(d => ({ ...d, rooms: d.rooms.map(r => (r.id === id ? { ...r, ...patch } : r)) }));
  const moveRoom = (id, dir) => updateDraft(d => {
    const i = d.rooms.findIndex(r => r.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= d.rooms.length) return d;
    const rooms = [...d.rooms];
    [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
    return { ...d, rooms };
  });
  const addRoom = () => updateDraft(d => ({ ...d, rooms: [...d.rooms, { id: newId('r'), name: '새 검사실', patientName: '새 검사실', showPriority: false }] }));
  const deleteRoom = (id) => updateDraft(d => ({ ...d, rooms: d.rooms.filter(r => r.id !== id) }));

  const maxOrder = (d, roomId) => Math.max(-1, ...d.tests.filter(t => t.roomId === roomId).map(t => t.order));
  const updateTest = (id, patch) => updateDraft(d => ({ ...d, tests: d.tests.map(t => (t.id === id ? { ...t, ...patch } : t)) }));
  // 검사 목록은 한 줄 요약으로 보여주고, [자세히]를 누른 검사만 입력칸을 펼침 (새로 추가한 검사는 펼친 채로)
  const [openTests, setOpenTests] = useState(() => new Set());
  const toggleTestOpen = (id, force) => setOpenTests(prev => {
    const next = new Set(prev);
    if (force ?? !next.has(id)) next.add(id); else next.delete(id);
    return next;
  });
  const addTest = (roomId) => {
    const id = newId('t');
    updateDraft(d => ({
      ...d,
      tests: [...d.tests, { id, name: '새 검사', short: '새 검사', roomId, order: maxOrder(d, roomId) + 1, options: [], optionsText: '', popupOnClick: false }],
    }));
    toggleTestOpen(id, true);
  };
  const deleteTest = (id) => updateDraft(d => ({ ...d, tests: d.tests.filter(t => t.id !== id), ...(id === 'ark' ? { arkRemoved: true } : {}) }));
  const changeTestRoom = (id, roomId) => updateDraft(d => ({ ...d, tests: d.tests.map(t => (t.id === id ? { ...t, roomId, order: maxOrder(d, roomId) + 1 } : t)) }));
  const moveTest = (id, dir) => updateDraft(d => {
    const target = d.tests.find(x => x.id === id);
    if (!target) return d;
    const list = d.tests.filter(x => x.roomId === target.roomId).sort((a, b) => a.order - b.order);
    const i = list.findIndex(x => x.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return d;
    const orders = new Map(list.map((x, k) => [x.id, k]));
    orders.set(id, j);
    orders.set(list[j].id, i);
    return { ...d, tests: d.tests.map(x => (orders.has(x.id) ? { ...x, order: orders.get(x.id) } : x)) };
  });

  const save = async () => {
    const cleaned = {
      ...draft,
      rooms: draft.rooms.map(r => ({
        ...r,
        name: (r.name || '').trim() || '이름 없는 검사실',
        patientName: (r.patientName || '').trim() || (r.name || '').trim() || '검사실',
      })),
      tests: draft.tests.map(({ optionsText, noteEnabled, ...t }) => ({
        ...renameTestOptions(t, parseOptions(optionsText ?? (t.options || []).join(','))),
        name: (t.name || '').trim() || '이름 없는 검사',
        short: (t.short || '').trim() || (t.name || '').trim() || '검사',
        options: parseOptions(optionsText ?? (t.options || []).join(',')),
        popupOnClick: !!t.popupOnClick,
        machine: String(t.machine || '').trim(),
        showWhenEmpty: t.showWhenEmpty !== false,
        prepOn: !!t.prepOn,
        prepName: String(t.prepName || '').trim() === '검사 준비' ? '' : String(t.prepName || '').trim(),
        prepWaitMin: Math.max(0, Math.round(Number(t.prepWaitMin ?? 20) || 0)),
        withExams: !!t.withExams,
        holdCall: holdCallOf(t),
        timed: !!t.timed,
        noOrder: !!t.noOrder,
        noDilate: noDilateTest(t),
        prepCompletes: !!t.prepCompletes,
      })),
      procedures: (draft.procedures || [])
        .map(x => ({ ...x, name: (x.name || '').trim() }))
        .filter(x => x.name),
      vision: {
        name: (draft.vision?.name || '').trim() || DEFAULT_SETTINGS.vision.name,
        patientName: (draft.vision?.patientName || '').trim() || (draft.vision?.name || '').trim() || DEFAULT_SETTINGS.vision.patientName,
      },
      dilationWaitMin: Math.max(1, Math.round(Number(draft.dilationWaitMin) || 15)),
      lateGraceMin: Math.max(0, Math.round(Number(draft.lateGraceMin) || 0)),
      treatStaleMin: Math.max(0, Math.round(Number(draft.treatStaleMin ?? 20) || 0)),
      hxFields: hxFieldsOf(draft).map(x => ({ ...x, label: String(x.label || '').trim(), short: String(x.short || '').trim() })).filter(x => x.label),
    };
    setDraft(toDraft(cleaned));
    setDirty(false);
    const docs = [...docDraft], prefs = { ...prefDraft };
    await Promise.all([mutateSettings(() => cleaned), mutateDoctors(() => docs), mutateDoctorPrefs(() => prefs)]);
    setNotice('저장했습니다. 다른 컴퓨터에도 몇 초 안에 반영됩니다.');
  };
  const revert = () => { setDraft(toDraft(settings)); setDocDraft([...(doctors || [])]); setPrefDraft({ ...(doctorPrefs || {}) }); setDirty(false); setNotice(''); };

  // 교수 관리도 다른 탭처럼 고친 뒤 [저장] (그 전에는 초안)
  const [docDraft, setDocDraft] = useState(() => [...(doctors || [])]);
  const [prefDraft, setPrefDraft] = useState(() => ({ ...(doctorPrefs || {}) }));
  const editDocs = (fn) => { setDocDraft(fn); setDirty(true); setNotice(''); };
  const editPrefs = (fn) => { setPrefDraft(fn); setDirty(true); setNotice(''); };
  const addDoctor = () => {
    const name = newDoctor.trim();
    if (!name || docDraft.includes(name)) return;
    editDocs(prev => (prev.includes(name) ? prev : [...prev, name]));
    setNewDoctor('');
  };
  const removeDoctor = (name) => editDocs(prev => prev.filter(d => d !== name));
  const setPref = (name, key, val) => editPrefs(prev => ({ ...prev, [name]: { ...(prev[name] || {}), [key]: val } }));

  const updateProc = (id, patch) => updateDraft(d => ({ ...d, procedures: (d.procedures || []).map(x => (x.id === id ? { ...x, ...patch } : x)) }));
  const addProc = () => updateDraft(d => ({ ...d, procedures: [...(d.procedures || []), { id: newId('p'), name: '', performer: 'prof' }] }));
  const deleteProc = (id) => updateDraft(d => ({ ...d, procedures: (d.procedures || []).filter(x => x.id !== id) }));
  const moveProc = (id, dir) => updateDraft(d => {
    const list = [...(d.procedures || [])];
    const i = list.findIndex(x => x.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return d;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...d, procedures: list };
  });
  const moveDoctor = (name, dir) => editDocs(prev => {
    const i = prev.indexOf(name);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  // 검사 목록 편집 (시력방·검사실·처치실 공통)
  const renderTestList = (roomKey, tests, c, isTreat = false, footer = null) => (
    <>
      <div className="space-y-1.5">
        {tests.length === 0 && <div className="text-sm text-slate-400">아직 검사가 없습니다</div>}
        {tests.map((t, ti) => {
          const open = openTests.has(t.id);
          const options = [
            ['popupOnClick', '세부 창', !!t.popupOnClick, true],
            ['noOrder', '처방 없음', !!t.noOrder, true],
            ['noDilate', '산동 금지', noDilateTest(t), true],
            ['prepOn', '검사 준비', !!t.prepOn, roomKey !== 'vision'],
            ['timed', '시간 재기', !!t.timed, true],
            ['holdCall', '진행 중 호출 금지', holdCallOf(t), roomKey !== 'vision' && !(t.timed && t.prepMode === 'go')],
            ['withExams', '대기 중에도', !!t.withExams, isTreat],
            ['showWhenEmpty', '0명도 표시', t.showWhenEmpty !== false, machineGroups(tests).length >= 2],
          ].filter(o => o[3]);
          return (
            <div key={t.id} data-test-row={t.short || t.name} className={`rounded-lg ${open ? 'bg-white border border-slate-300' : 'bg-slate-50'}`}>
              {/* 한 줄 요약: 이름 · 옵션 칩(바로 켜고 끔) · 순서 · 자세히 */}
              <div className="flex items-center gap-2 flex-wrap px-3 py-2">
                <span className={`w-6 h-6 rounded-full ${c.solid} text-white text-xs flex items-center justify-center shrink-0`}>{ti + 1}</span>
                <button type="button" onClick={() => toggleTestOpen(t.id)} title="눌러서 자세히" className="w-40 shrink-0 min-w-0 text-left">
                  <span className="block text-sm font-medium text-slate-900 truncate">{t.short || t.name || '이름 없음'}</span>
                  {t.name && t.name !== t.short && <span className="block text-xs text-slate-400 truncate">{t.name}</span>}
                </button>
                <span className="flex flex-wrap items-center gap-1.5">
                  {options.map(([k, label, on]) => (
                    <button key={k} type="button" aria-pressed={on} title={TEST_OPTION_HELP[k]}
                      onClick={() => {
                        // 검사 준비와 시간 재기는 둘 중 하나만 (켜면 다른 하나는 꺼짐)
                        updateTest(t.id, k === 'prepOn' ? { prepOn: !on, timed: false, prepWaitMin: t.prepWaitMin ?? 20 }
                          : k === 'timed' ? { timed: !on, prepOn: false, prepWaitMin: t.prepWaitMin ?? 20 } : { [k]: !on });
                        if ((k === 'prepOn' || k === 'timed') && !on) toggleTestOpen(t.id, true); // 켜면 시간·방식을 적도록 펼침
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full border ${on ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-500'}`}>
                      {on ? '✓ ' : ''}{label}
                    </button>
                  ))}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  <button type="button" aria-label="우선순위 올리기" onClick={() => moveTest(t.id, 'up')} className="p-1.5 rounded border border-slate-200 text-slate-500 bg-white"><ChevronUp size={14} /></button>
                  <button type="button" aria-label="우선순위 내리기" onClick={() => moveTest(t.id, 'down')} className="p-1.5 rounded border border-slate-200 text-slate-500 bg-white"><ChevronDown size={14} /></button>
                  <button type="button" aria-expanded={open} onClick={() => toggleTestOpen(t.id)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 flex items-center gap-0.5">
                    {open ? <>접기 <ChevronUp size={12} /></> : <>자세히 <ChevronDown size={12} /></>}
                  </button>
                </span>
              </div>
              {open && (
                <div className="border-t border-slate-200 px-3 pt-3 pb-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem_auto] gap-2 items-end">
                    <Field label="환자용 검사 이름">
                      <input value={t.name} placeholder="예: 시야검사" onChange={e => updateTest(t.id, { name: e.target.value })} className={INPUT} />
                    </Field>
                    <Field label="직원용 이름">
                      <input value={t.short} placeholder="예: VF" onChange={e => updateTest(t.id, { short: e.target.value })} className={INPUT} />
                    </Field>
                    <Field label="어디서 하나요">
                      <select value={t.roomId} onChange={e => changeTestRoom(t.id, e.target.value)} className={INPUT}>
                        <option value="vision">{visionNames(draft).name}</option>
                        {draft.rooms.map(rr => <option key={rr.id} value={rr.id}>{rr.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                    <Field label="장비 / 상단 분류 (OCT 계열은 이 값과 관계없이 OCT로 집계)">
                      <input value={t.machine || ''} placeholder="비워두면 자동" onChange={e => updateTest(t.id, { machine: e.target.value })} className={INPUT} />
                    </Field>
                    <Field label="세부 종류 (쉼표로 구분, 이름 변경 시 기존 순서 유지)">
                      <input value={t.optionsText ?? ''} placeholder="예: Macular, Disc, Angio" onChange={e => updateTest(t.id, { optionsText: e.target.value })} className={INPUT} />
                    </Field>
                  </div>
                  {parseOptions(t.optionsText || '').length > 0 && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-600 mb-2">눈 위치 그룹 · 검사 이름과 별도로 저장됩니다. 항목을 추가하거나 순서를 바꾸면 그룹을 확인해주세요.</div>
                    <div className="flex flex-wrap gap-2">{parseOptions(t.optionsText || '').map(o => {
                      const normalized = renameTestOptions(t, parseOptions(t.optionsText || ''));
                      return <label key={o} className="text-xs text-slate-600">{o} <select aria-label={`${o} 눈 위치 그룹`} value={normalized.optionEyeGroups[o] || 'default'} onChange={e => updateTest(t.id, { optionEyeGroups: { ...t.optionEyeGroups, [o]: e.target.value } })} className="border border-slate-300 rounded px-2 py-1">
                        <option value="default">공통</option><option value="md">M,D OCT</option><option value="angio">OCTA</option>
                      </select></label>;
                    })}</div>
                  </div>}
                  {t.prepOn && (
                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                      검사 준비 (처치실에서 먼저):
                      <input aria-label={`${t.short || t.name} 준비 이름`} value={t.prepName ?? ''} placeholder="준비 이름 (예: 동의서 · skin test)" onChange={e => updateTest(t.id, { prepName: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-48 bg-white" />
                      <input type="number" min="0" aria-label={`${t.short || t.name} 준비 대기 분`} value={t.prepWaitMin ?? 20} onChange={e => updateTest(t.id, { prepWaitMin: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-16 bg-white" />분 뒤 [확인] → 검사실로
                      <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={!!t.prepCompletes} onChange={e => updateTest(t.id, { prepCompletes: e.target.checked })} className="w-4 h-4" />확인하면 검사도 완료</label>
                    </div>
                  )}
                  {t.timed && (
                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                      시간 재기 (검사 칸에서):
                      <input type="number" min="0" aria-label={`${t.short || t.name} 시간 재기 분`} value={t.prepWaitMin ?? 20} onChange={e => updateTest(t.id, { prepWaitMin: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-16 bg-white" />분
                      <select aria-label={`${t.short || t.name} 시간 재기 방식`} value={t.prepMode === 'go' ? 'go' : 'confirm'} onChange={e => updateTest(t.id, { prepMode: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white">
                        <option value="confirm">시간이 되면 [끝 · 확인]을 눌러야 완료 (예: Schirmer)</option>
                        <option value="go">누르면 바로 완료, 시간이 되면 처치실에 확인 알림 (예: MMP)</option>
                      </select>
                    </div>
                  )}
                  <div className="flex items-center justify-end">
                    {t.builtin === 'gat' ? (
                      <span className="text-xs text-slate-400">GAT 값을 이 검사실에서 입력해요. 기본 항목이라 삭제할 수 없어요.</span>
                    ) : (
                      <ConfirmButton label="검사 삭제" onConfirm={() => deleteTest(t.id)} />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <button type="button" onClick={() => addTest(roomKey)} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 flex items-center gap-1 bg-white">
          <Plus size={14} /> 검사 추가
        </button>
        {footer && <div className="ml-auto flex items-center gap-2">{footer}</div>}
      </div>
    </>
  );

  const TABS = [
    { key: 'rooms', label: '검사실 · 검사' },
    { key: 'procedures', label: '처치' },
    { key: 'doctors', label: '교수 관리' },
    { key: 'etc', label: '기타' },
  ];

  return (
    <ScreenShell title="설정" color="slate" onBack={onBack} lastSync={lastSync}>
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-slate-800 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {notice && <div className="bg-slate-800 text-white text-sm rounded-xl px-4 py-3 mb-4">{notice}</div>}

      {tab === 'rooms' && (
        <div>
          {/* 설명은 한 곳에 접어 두고, 검사는 한 줄씩 (이름을 누르거나 [자세히]로 입력칸 펼치기) */}
          <details className="bg-white border border-slate-200 rounded-xl px-4 py-3 mb-4 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-800">도움말 · 검사 옵션 설명</summary>
            <p className="mt-2">검사실마다 검사를 추가하고 순서를 정할 수 있어요. 위에 있는 검사일수록 우선순위가 높고, 직원용 이름은 버튼에 쓰입니다.
              검사 이름이나 [자세히]를 누르면 이름·검사실·세부 종류를 고칠 수 있어요.</p>
            <p className="mt-2">세부 종류를 적어두면 창에서 종류를 고를 수 있어요 (예: OCT의 Macular, Disc, Angio). 어떤 검사든 오른쪽 클릭(터치스크린은 길게 누르기)하면 양안·우안·좌안과 검사 프로토콜을 지정하는 창이 떠요.</p>
            <ul className="mt-2 space-y-1">
              {[['popupOnClick', '세부 창'], ['noOrder', '처방 없음'], ['noDilate', '산동 금지'], ['prepOn', '검사 준비'], ['timed', '시간 재기'], ['holdCall', '진행 중 호출 금지'], ['withExams', '대기 중에도'], ['showWhenEmpty', '0명도 표시']].map(([k, l]) => (
                <li key={k}><b className="text-slate-800">{l}</b> · {TEST_OPTION_HELP[k]}</li>
              ))}
            </ul>
          </details>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-1">
              <Field label="시력방 이름 (직원 화면)">
                <input value={draft.vision?.name ?? ''} onChange={e => updateDraft(d => ({ ...d, vision: { ...visionNames(d), name: e.target.value } }))} className={INPUT} />
              </Field>
              <Field label="환자에게 보이는 이름">
                <input value={draft.vision?.patientName ?? ''} onChange={e => updateDraft(d => ({ ...d, vision: { ...visionNames(d), patientName: e.target.value } }))} className={INPUT} />
              </Field>
            </div>
            <div className="text-xs text-slate-500 mb-2">모든 환자가 가장 먼저 거치는 곳 (나안·교정 시력과 NCT는 기본). 아래는 시력방에서 함께 할 검사예요.</div>
            {renderTestList('vision', draft.tests.filter(t => t.roomId === 'vision').sort((a, b) => a.order - b.order), COLOR_MAP.blue)}
          </div>

          {draft.rooms.map((r, ri) => {
            const tests = draft.tests.filter(t => t.roomId === r.id).sort((a, b) => a.order - b.order);
            const c = COLOR_MAP[ROOM_PALETTE[ri % ROOM_PALETTE.length]];
            return (
              <div key={r.id} className={`bg-white border-2 ${c.border} rounded-xl p-4 mb-4`}>
                <div className="flex items-end gap-3 mb-3 flex-wrap">
                  <div className="flex-1 min-w-[20rem] grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Field label="검사실 이름 (직원 화면)">
                      <input value={r.name} onChange={e => updateRoom(r.id, { name: e.target.value })} className={INPUT} />
                    </Field>
                    <Field label="환자에게 보이는 이름">
                      <input value={r.patientName || ''} onChange={e => updateRoom(r.id, { patientName: e.target.value })} className={INPUT} />
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer py-2" title="검사가 2개 이상일 때, 환자마다 먼저 할 검사 버튼에 '우선' 표시를 붙입니다">
                    <input type="checkbox" checked={!!r.showPriority} onChange={e => updateRoom(r.id, { showPriority: e.target.checked })} className="w-4 h-4" />
                    우선 검사 표시
                  </label>
                  <div className="flex gap-1 py-1">
                    <button type="button" aria-label="검사실 위로" onClick={() => moveRoom(r.id, 'up')} className="p-1.5 rounded border border-slate-200 text-slate-500"><ChevronUp size={16} /></button>
                    <button type="button" aria-label="검사실 아래로" onClick={() => moveRoom(r.id, 'down')} className="p-1.5 rounded border border-slate-200 text-slate-500"><ChevronDown size={16} /></button>
                  </div>
                </div>

                {r.builtin === 'treat' && (
                  <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 mb-3">
                    처치실 (고정). 여기 추가한 검사(예: Syringing)는 진료 전에 처치실 화면 맨 위 '진료 전 검사'에서 합니다.
                    다른 검사실 검사가 모두 끝난 뒤 대기에 뜹니다. 예진·처치는 지금처럼 처치실 화면에서 합니다.
                  </p>
                )}
                {renderTestList(r.id, tests, c, r.builtin === 'treat', r.builtin !== 'treat' && <>
                  {tests.length > 0 && <span className="text-xs text-slate-400">검사가 남아 있으면 삭제할 수 없어요</span>}
                  <ConfirmButton label="검사실 삭제" disabled={tests.length > 0} onConfirm={() => deleteRoom(r.id)} />
                </>)}
              </div>
            );
          })}

          <button type="button" onClick={addRoom} className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 flex items-center justify-center gap-2">
            <Plus size={16} /> 검사실 추가
          </button>
        </div>
      )}

      {tab === 'rooms' && (() => {
        const picked = orderForPicking(sortedTests(draft), draft);
        const movePick = (i, dir) => updateDraft(d => {
          const ids = orderForPicking(sortedTests(d), d).map(t => t.id);
          const j = i + dir;
          if (j < 0 || j >= ids.length) return d;
          [ids[i], ids[j]] = [ids[j], ids[i]];
          return { ...d, pickOrder: ids };
        });
        return (
          <div className="bg-white border border-slate-200 rounded-xl p-5 mt-4">
            <div className="font-medium text-slate-900 mb-1">검사 선택 창 순서</div>
            <p className="text-sm text-slate-500 mb-3">환자 카드의 '오늘 검사' 버튼과, 진료 중 추가 검사·설명 완료(다음 내원 검사)·처치실 검사 지정·FU 지정 창에서 검사가 이 순서로 나옵니다. 검사실 대기 순서에는 영향이 없어요.</p>
            <div className="flex flex-wrap gap-1.5">
              {picked.map((t, i) => (
                <div key={t.id} className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg pl-2 pr-1 py-1">
                  <span className="text-xs text-slate-400">{i + 1}</span>
                  <span className="text-sm text-slate-800 px-1">{t.short || t.name}</span>
                  <button type="button" aria-label={`${t.short || t.name} 앞으로`} disabled={i === 0} onClick={() => movePick(i, -1)} className="p-1 rounded border border-slate-200 text-slate-500 bg-white disabled:opacity-30"><ChevronLeft size={13} /></button>
                  <button type="button" aria-label={`${t.short || t.name} 뒤로`} disabled={i === picked.length - 1} onClick={() => movePick(i, 1)} className="p-1 rounded border border-slate-200 text-slate-500 bg-white disabled:opacity-30"><ChevronRight size={13} /></button>
                </div>
              ))}
            </div>
            {Array.isArray(draft.pickOrder) && (
              <button type="button" onClick={() => updateDraft(d => { const { pickOrder, ...rest } = d; return rest; })} className="mt-3 text-xs text-slate-500 underline">검사실 순서로 되돌리기</button>
            )}
          </div>
        );
      })()}

      {tab === 'procedures' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="font-medium text-slate-900 mb-1">처치 목록</div>
          <p className="text-sm text-slate-500 mb-4">
            진료실에서 처치 버튼을 누르면 이 목록이 나와요. 교수님이 하는 처치는 진료실 명단의 처치 대기로, 전공의가 하는 처치는 처치실로 갑니다.
          </p>
          <div className="space-y-2">
            {(draft.procedures || []).length === 0 && <div className="text-sm text-slate-400">등록된 처치가 없습니다</div>}
            {(draft.procedures || []).map(x => (
              <div key={x.id} className="flex items-center gap-2 bg-slate-50 rounded-lg p-3 flex-wrap">
                <input value={x.name} placeholder="처치 이름" onChange={e => updateProc(x.id, { name: e.target.value })} className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
                <select value={x.performer} onChange={e => updateProc(x.id, { performer: e.target.value })} className="text-sm border border-slate-300 rounded-lg px-2 py-2 bg-white">
                  <option value="prof">교수님이 직접</option>
                  <option value="resident">전공의</option>
                </select>
                <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer" title="진료 전 처치로 지정되면 접수하자마자 '산동'이 켜집니다">
                  <input type="checkbox" checked={!!x.dilate} onChange={e => updateProc(x.id, { dilate: e.target.checked })} className="w-4 h-4" />
                  산동 필요
                </label>
                <button type="button" aria-label="위로" onClick={() => moveProc(x.id, 'up')} className="p-1.5 rounded border border-slate-200 text-slate-500 bg-white"><ChevronUp size={14} /></button>
                <button type="button" aria-label="아래로" onClick={() => moveProc(x.id, 'down')} className="p-1.5 rounded border border-slate-200 text-slate-500 bg-white"><ChevronDown size={14} /></button>
                <ConfirmButton label="삭제" onConfirm={() => deleteProc(x.id)} />
              </div>
            ))}
          </div>
          <button type="button" onClick={addProc} className="mt-3 text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 flex items-center gap-1 bg-white">
            <Plus size={14} /> 처치 추가
          </button>
        </div>
      )}

      {tab === 'doctors' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="font-medium text-slate-900 mb-1">교수 목록</div>
          <p className="text-sm text-slate-500 mb-3">
            고친 뒤 아래 [저장]을 눌러야 적용됩니다. 초진 예진 기본값은 처치실에서 새로 검사 지정할 때 적용되고(환자별로 변경 가능), 기본 산동·CR 사용도 교수별로 정합니다.
            <span className="block mt-1"><b className="text-slate-700">주요 검사</b> · 체크한 검사만 먼저 보이고 나머지는 [기타 검사]를 눌러야 보입니다 (설명 완료 창, [검사 변경], 검사 지정·추가 검사 창).</span>
          </p>
          <div className="flex gap-2 mb-4">
            <input placeholder="교수님 성함" value={newDoctor} onChange={e => setNewDoctor(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addDoctor(); }} className={INPUT} />
            <button type="button" onClick={addDoctor} className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium shrink-0">추가</button>
          </div>
          {docDraft.length === 0 && <div className="text-sm text-slate-400">등록된 교수가 없습니다</div>}
          <div className="space-y-2">
            {docDraft.map(name => (
              <div key={name} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 flex-wrap">
                  <span className="text-slate-700 flex-1">{name}</span>
                  <DoctorRoomInput name={name} value={prefDraft?.[name]?.roomNo} onSave={v => setPref(name, 'roomNo', v)} />
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    초진 예진 기본값
                    <select aria-label={`${name} 초진 예진 기본값`} value={prefDraft?.[name]?.triageRequired === false ? 'no' : 'yes'} onChange={e => setPref(name, 'triageRequired', e.target.value === 'yes')} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
                      <option value="yes">예진 함</option>
                      <option value="no">예진 안 함</option>
                    </select>
                  </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={!!prefDraft?.[name]?.dilate} onChange={e => setPref(name, 'dilate', e.target.checked)} className="w-4 h-4" />
                  기본 산동
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer mr-2">
                  <input type="checkbox" checked={!!prefDraft?.[name]?.cr} onChange={e => setPref(name, 'cr', e.target.checked)} className="w-4 h-4" />
                  CR 사용
                </label>
                <button type="button" aria-label="위로" onClick={() => moveDoctor(name, 'up')} className="p-1 rounded border border-slate-200 text-slate-500 bg-white"><ChevronUp size={14} /></button>
                <button type="button" aria-label="아래로" onClick={() => moveDoctor(name, 'down')} className="p-1 rounded border border-slate-200 text-slate-500 bg-white"><ChevronDown size={14} /></button>
                <ConfirmButton label="삭제" onConfirm={() => removeDoctor(name)} />
                <div className="w-full border-t border-slate-200 pt-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs font-medium text-slate-500">주요 검사</span>{sortedTests(settings).map(t => {
                    const selected = prefDraft?.[name]?.followupTests;
                    const checked = !Array.isArray(selected) || selected.includes(t.id);
                    return <label key={t.id} className="flex items-center gap-1 text-sm text-slate-700"><input type="checkbox" checked={checked} onChange={e => {
                      const on = e.target.checked;
                      editPrefs(prev => { const current = prev[name]?.followupTests; const ids = Array.isArray(current) ? current : sortedTests(settings).map(x => x.id); return { ...prev, [name]: { ...prev[name], followupTests: on ? [...new Set([...ids, t.id])] : ids.filter(id => id !== t.id) } }; });
                    }} />{t.short || t.name}</label>;
                  })}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'etc' && (
        <div className="space-y-4">
          <SettingsPasswordCard />
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="font-medium text-slate-900 mb-1">History 양식</div>
            <p className="text-sm text-slate-500 mb-3">시력방 History 창에 나오는 항목입니다. '요약 이름'은 진료실 카드 한 줄 요약에 쓰입니다 (예: 고혈압 → HTN). '다음에 미리 채움'을 켠 항목은 다음 내원 때 지난 내용이 채워져 있습니다.</p>
            <div className="space-y-2">
              {hxFieldsOf(draft).map((x, i, list) => {
                const upd = (patch) => updateDraft(d => ({ ...d, hxFields: hxFieldsOf(d).map((y, j) => (j === i ? { ...y, ...patch } : y)) }));
                const move = (dir) => updateDraft(d => {
                  const arr = [...hxFieldsOf(d)];
                  const j = i + dir;
                  if (j < 0 || j >= arr.length) return d;
                  [arr[i], arr[j]] = [arr[j], arr[i]];
                  return { ...d, hxFields: arr };
                });
                return (
                  <div key={x.id} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2 flex-wrap">
                    <input aria-label="History 항목 이름" value={x.label} onChange={e => upd({ label: e.target.value })} placeholder="항목 이름" className="flex-1 min-w-[8rem] border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white" />
                    <input aria-label="History 요약 이름" value={x.short || ''} onChange={e => upd({ short: e.target.value })} placeholder="요약 이름" className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white" />
                    <select aria-label="History 항목 형식" value={x.type} onChange={e => upd({ type: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                      {HX_TYPES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                    </select>
                    <button type="button" aria-label="위로" disabled={i === 0} onClick={() => move(-1)} className="p-1.5 rounded border border-slate-200 text-slate-500 bg-white disabled:opacity-30"><ChevronUp size={14} /></button>
                    <button type="button" aria-label="아래로" disabled={i === list.length - 1} onClick={() => move(1)} className="p-1.5 rounded border border-slate-200 text-slate-500 bg-white disabled:opacity-30"><ChevronDown size={14} /></button>
                    <button type="button" onClick={() => updateDraft(d => ({ ...d, hxFields: hxFieldsOf(d).filter((_, j) => j !== i) }))} className="text-xs px-2 py-1 text-slate-400 hover:text-red-600">삭제</button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              <button type="button" onClick={() => updateDraft(d => ({ ...d, hxFields: [...hxFieldsOf(d), { id: newId('hx'), label: '새 항목', short: '', type: 'text' }] }))} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 flex items-center gap-1 bg-white"><Plus size={14} /> 항목 추가</button>
              <button type="button" onClick={() => updateDraft(d => ({ ...d, hxFields: DEFAULT_HX_FIELDS }))} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-500 bg-white">처음 양식으로</button>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="font-medium text-slate-900 mb-1">산동 대기 시간</div>
            <p className="text-sm text-slate-500 mb-3">점안 후 이 시간이 지나면 '산동 완료'로 표시돼요. CR은 4번째 점안부터 계산합니다.</p>
            <div className="flex items-center gap-2">
              <input type="number" min="1" value={draft.dilationWaitMin} onChange={e => updateDraft(d => ({ ...d, dilationWaitMin: e.target.value }))} className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <span className="text-sm text-slate-600">분</span>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="font-medium text-slate-900 mb-1">처치실 오래 기다린 환자 강조</div>
            <p className="text-sm text-slate-500 mb-3">처치실 화면에서 마지막 진행(접수·검사 완료·산동·처치 등) 뒤 이 시간이 지나도록 그대로인 환자는 카드가 주황색으로 강조되고, 위쪽 요약 줄에도 표시됩니다. 0분이면 강조하지 않습니다.</p>
            <div className="flex items-center gap-2">
              <input type="number" min="0" aria-label="처치실 강조 시간" value={draft.treatStaleMin ?? 20} onChange={e => updateDraft(d => ({ ...d, treatStaleMin: e.target.value }))} className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <span className="text-sm text-slate-600">분</span>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="font-medium text-slate-900 mb-1">지각 유예 시간 (바코드 접수)</div>
            <p className="text-sm text-slate-500 mb-3">환자가 바코드를 찍은 시각이 예약시간보다 이 시간 넘게 늦으면 자동으로 지각이 됩니다. 0분이면 1분만 늦어도 지각이에요. 직원이 [접수]를 누를 때는 자동 지각이 없고, 어느 쪽이든 카드의 [지각]으로 바꿀 수 있습니다.</p>
            <div className="flex items-center gap-2">
              <input type="number" min="0" aria-label="지각 유예 시간" value={draft.lateGraceMin ?? 0} onChange={e => updateDraft(d => ({ ...d, lateGraceMin: e.target.value }))} className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <span className="text-sm text-slate-600">분</span>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="font-medium text-slate-900 mb-1">같은 날 두 교수님 진료 (2차 진료)</div>
            <p className="text-sm text-slate-500 mb-3">1차 진료의 설명 완료 후 2차 진료로 넘어갈 때, 처치실에서 추가 검사를 먼저 확인할지 정합니다. 끄면 바로 2차 교수님 진료 대기로 갑니다.</p>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mb-2">
              <input type="checkbox" checked={draft.linkCheckAdded !== false} onChange={e => updateDraft(d => ({ ...d, linkCheckAdded: e.target.checked }))} className="w-4 h-4" />
              진료 중에 추가된 2차 진료 → 처치실에서 추가 검사 확인
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={!!draft.linkCheckPlanned} onChange={e => updateDraft(d => ({ ...d, linkCheckPlanned: e.target.checked }))} className="w-4 h-4" />
              미리 예정된 2차 진료 → 처치실에서 추가 검사 확인 (예정된 검사는 1차 진료 전에 함께 합니다)
            </label>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-sky-50 p-5">
            <div className="text-xs font-medium text-indigo-500 mb-1">개발자 정보</div>
            <div className="text-lg font-semibold text-slate-900 mb-3">한상원 <span className="text-sm font-normal text-slate-500">(2023년 입국)</span></div>
            <p className="text-sm text-slate-700 leading-relaxed mb-2">
              Ophthalmology Flow의 완성을 진심으로 축하합니다.
            </p>
            <p className="text-sm text-slate-600 leading-relaxed">
              바쁜 수련 생활 속에서도 환자분들의 기다림을 줄이고 함께 일하는 동료들의 수고를 덜기 위해,
              진료 현장의 흐름 하나하나를 고민하며 이 프로그램을 만들었습니다.
              검사실과 진료실, 처치실을 잇는 세심한 배려가 곳곳에 담긴 이 결실에 깊은 감사와 박수를 보냅니다.
            </p>
          </div>
        </div>
      )}

      <div className="h-24" />

      {dirty && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-20">
          <div className={`${SHELL_WIDTH} mx-auto px-5 py-3 flex items-center justify-between gap-3`}>
            <span className="text-sm text-slate-600">저장하지 않은 변경사항이 있어요</span>
            <div className="flex gap-2">
              <button type="button" onClick={revert} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600">되돌리기</button>
              <button type="button" onClick={save} className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium">저장</button>
            </div>
          </div>
        </div>
      )}
    </ScreenShell>
  );
}
