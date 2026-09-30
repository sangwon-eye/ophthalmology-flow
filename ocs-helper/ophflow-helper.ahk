#Requires AutoHotkey v2.0
#SingleInstance Force
Persistent

/*
  OCS 처방 도우미 (ophthalmology flow → OCS)

  - F9  : OCS에 열린 환자의 오늘 검사 처방을 넣습니다.
  - F10 : 명단 모드. 흐름 프로그램의 처방 대기 명단을 받아 OCS 외래 명단에서 환자를 찾아 넣고,
          환자마다 멈춥니다. 확인·서명한 뒤 F9를 누르면 다음 환자로 갑니다.
  - 서명(F2)과 Delete(D/C) 키는 누르지 않습니다.

  흐름 프로그램 서버(server.js)의 /api/ocs/… 주소로 오늘 명단·처방을 받고, 넣은 검사를 '처방 완료'로 표시합니다.
  (서버 쪽 규칙: scripts/ocs-api.js, src/core/ocs.js)
  자세한 사용법은 같은 폴더의 README.md를 보세요.
*/

APP_NAME := "OCS 처방 도우미"
INI_PATH := A_ScriptDir "\ophflow-helper.ini"
LOG_PATH := A_ScriptDir "\ophflow-helper.log"
TAG := "OPHFLOW1"

MB_YESNO := 4, MB_QUESTION := 32, MB_WARN := 48, MB_INFO := 64, MB_DEF2 := 256, MB_TOP := 0x40000

DEFAULT_STEPS := "click:ListButton|wait:1500|click:ListSearch|key:^a|type:{ID}|key:{Enter}|wait:1500|dclick:ListFirstRow|wait:3000"

GENERAL_DEFAULTS := Map(
  "HotkeyRun", "F9",
  "HotkeyBatch", "F10",
  "TypeMode", "keys",
  "WaitAfterClick", "300",
  "WaitAfterType", "800",
  "EnterToSearch", "0",
  "WaitAfterSearch", "800",
  "DownDelay", "150",
  "WaitAfterEnter", "1200",
  "BatchConfirm", "1",
  "CaretCheck", "1",
  "SizeTolerance", "40"
)

; 설정 창에서 등록하는 항목 (순서대로 표시)
POINTS := [
  {key: "ServerUrl",      kind: "server", label: "흐름 프로그램 서버 주소",         help: ""},
  {key: "OcsWindow",      kind: "ocs",   label: "OCS 창",                         help: "OCS 진료 화면(처방을 넣는 화면) 아무 곳에"},
  {key: "PatientNoStart", kind: "point", label: "환자번호 앞쪽 (드래그 시작)",      help: "OCS 화면의 환자번호 숫자 바로 왼쪽에"},
  {key: "PatientNoEnd",   kind: "point", label: "환자번호 뒤쪽 (드래그 끝)",        help: "OCS 화면의 환자번호 숫자 바로 오른쪽에"},
  {key: "OrderInput",     kind: "point", label: "처방 입력창",                     help: "오더발행의 처방 입력창 안에"},
  {key: "ListButton",     kind: "point", label: "외래 명단 여는 버튼 (명단 모드)",  help: "OCS 외래 명단을 여는 버튼 위에"},
  {key: "ListSearch",     kind: "point", label: "명단 환자검색 칸 (명단 모드)",     help: "외래 명단의 '환자정보(번호,이름)' 입력칸 안에"},
  {key: "ListFirstRow",   kind: "point", label: "명단 첫 줄 (명단 모드)",           help: "환자를 검색했을 때 나오는 명단 첫 줄의 환자이름 위에"}
]

CoordMode "Mouse", "Screen"
CoordMode "ToolTip", "Screen"
CoordMode "Caret", "Screen"
SetTitleMatchMode 2
SetKeyDelay 20, 15

Cfg := Map()
gRunning := false
gAbort := false
gRecording := ""
gPractice := false
; 한 검사의 처방 줄(예: OCT와 OCTA)을 일부만 넣고 멈췄을 때 이미 넣은 줄. 다음에 같은 환자를 하면 건너뜀 (도우미를 끄면 지워짐)
gPartial := Map()
SetupGui := 0
SetupLv := 0
Batch := {active: false, hwnd: 0, items: [], filter: "", gui: 0, lv: 0, status: 0}

EnsureIni()
LoadConfig()
BuildTray()
RegisterHotkeys()
StartupCheck()

; =====================================================================
; 설정 파일
; =====================================================================
EnsureIni() {
  if FileExist(INI_PATH)
    return
  text := "
  (
; OCS 처방 도우미 설정 파일
; 창과 위치는 트레이 아이콘 > 설정 (위치 등록)에서 등록합니다.
; 이 파일을 고친 뒤에는 트레이 아이콘 > 설정 다시 불러오기를 누르세요.

[General]
; 단축키 (예: F9, F10 / Ctrl은 ^, Shift는 +, Alt는 ! 예: ^F9)
HotkeyRun=F9
HotkeyBatch=F10
; 검색어 입력 방식: keys = 키보드로 한 글자씩, text = 유니코드 입력, paste = 붙여넣기
TypeMode=keys
; 처방 입력창을 누른 뒤 기다리는 시간 (밀리초, 1000 = 1초)
WaitAfterClick=300
; 검색어를 친 뒤 후보 목록이 뜰 때까지 기다리는 시간
WaitAfterType=800
; 1 = 검색어를 친 뒤 Enter를 한 번 눌러야 후보 목록이 뜨는 경우
EnterToSearch=0
WaitAfterSearch=800
; 아래 화살표 사이 간격
DownDelay=150
; 처방을 고른 뒤(Enter) 다음 처방까지 기다리는 시간
WaitAfterEnter=1200
; 명단 모드에서 환자마다 확인 창 띄우기 (1 = 띄움, 0 = 단축키만 누르면 바로 진행)
BatchConfirm=1
; 1 = 입력창을 누른 뒤 글자 커서 위치로 입력창이 맞는지 확인 (OCS가 커서 위치를 알려주지 않으면 건너뜀)
CaretCheck=1
; OCS 창 크기가 등록할 때와 이 값(픽셀)보다 많이 다르면 멈춤
SizeTolerance=40

[Server]
; 흐름 프로그램 주소 (브라우저 주소창에 쓰는 것과 같음. 예: http://192.168.0.10:3000)
Url=

[Windows]

[Points]

[OpenPatient]
; 명단 모드에서 OCS 외래 명단으로 환자를 여는 순서 ( | 로 구분 )
;   click:위치이름   dclick:위치이름 (더블클릭)   type:글자 ({ID} = 환자번호)   key:키 (AutoHotkey 표기)   wait:밀리초
;   위치이름: ListButton (명단 여는 버튼), ListSearch (환자검색 칸), ListFirstRow (명단 첫 줄)
;   Delete 키(D/C)와 F2(서명)는 쓸 수 없습니다.
Steps=click:ListButton|wait:1500|click:ListSearch|key:^a|type:{ID}|key:{Enter}|wait:1500|dclick:ListFirstRow|wait:3000
  )"
  FileAppend StrReplace(text, "`n", "`r`n"), INI_PATH, "UTF-16"
}

LoadConfig() {
  global Cfg
  Cfg := Map()
  for k, v in GENERAL_DEFAULTS
    Cfg[k] := Trim(IniRead(INI_PATH, "General", k, v))
  Cfg["ServerUrl"] := RTrim(Trim(IniRead(INI_PATH, "Server", "Url", "")), "/")
  for k in ["OcsExe", "OcsClass", "OcsW", "OcsH"]
    Cfg[k] := Trim(IniRead(INI_PATH, "Windows", k, ""))
  for p in POINTS
    if p.kind = "point"
      Cfg[p.key] := Trim(IniRead(INI_PATH, "Points", p.key, ""))
  Cfg["Steps"] := Trim(IniRead(INI_PATH, "OpenPatient", "Steps", DEFAULT_STEPS))
}

Num(key) {
  try return Integer(Cfg[key])
  return Integer(GENERAL_DEFAULTS[key])
}

; =====================================================================
; 트레이 메뉴 · 단축키
; =====================================================================
BuildTray() {
  A_IconTip := APP_NAME
  tray := A_TrayMenu
  tray.Delete()
  tray.Add("설정 (위치 등록)", ShowSetup)
  tray.Add("흐름 연결 시험", TestFlow)
  tray.Add("연습 모드 (메모장)", TogglePractice)
  tray.Add()
  tray.Add("사용법 열기", (*) => OpenReadme())
  tray.Add("기록 파일 열기", (*) => Run('notepad.exe "' LOG_PATH '"'))
  tray.Add("설정 파일 열기", (*) => Run('notepad.exe "' INI_PATH '"'))
  tray.Add("설정 다시 불러오기", (*) => Reload())
  tray.Add()
  tray.Add("종료", (*) => ExitApp())
  tray.Default := "설정 (위치 등록)"
}

RegisterHotkeys() {
  HotIf OcsTargetCrit
  for name, fn in Map(Cfg["HotkeyRun"], OnRunKey, Cfg["HotkeyBatch"], OnBatchKey) {
    try {
      Hotkey name, fn, "On"
    } catch as e {
      MsgBox "단축키 '" name "'를 등록하지 못했어요. 설정 파일의 단축키를 확인해주세요.`n" e.Message, APP_NAME, MB_WARN | MB_TOP
    }
  }
  HotIf RunningCrit
  Hotkey "Esc", AbortNow, "On"
  HotIf RecordingCrit
  Hotkey "F8", RecordNow, "On"
  Hotkey "Esc", CancelRecord, "On"
  HotIf
}

; 단축키는 OCS 창(연습 모드에서는 메모장)이 앞에 있을 때만 동작
OcsTargetCrit(*) {
  if gRecording != ""
    return false
  if gPractice
    return !!WinActive("ahk_exe notepad.exe")
  return Cfg["OcsExe"] != "" && !!WinActive(OcsCriteria())
}
RunningCrit(*) => gRunning
RecordingCrit(*) => gRecording != ""
OcsCriteria() => "ahk_exe " Cfg["OcsExe"] (Cfg["OcsClass"] != "" ? " ahk_class " Cfg["OcsClass"] : "")

OnRunKey(*) {
  if gRunning
    return
  if Batch.active
    BatchNext()
  else
    RunCurrent()
}

OnBatchKey(*) {
  if gRunning
    return
  if Batch.active {
    if MsgBox("명단 모드를 끝낼까요?", APP_NAME, MB_YESNO | MB_QUESTION | MB_TOP) = "Yes"
      BatchEnd()
    return
  }
  BatchStart()
}

AbortNow(*) {
  global gAbort
  gAbort := true
  ShowTip("멈추는 중…")
}

StartupCheck() {
  missing := []
  if Cfg["OcsExe"] = ""
    missing.Push("OCS 창")
  if Cfg["ServerUrl"] = ""
    missing.Push("흐름 프로그램 서버 주소")
  for k in ["PatientNoStart", "PatientNoEnd", "OrderInput"]
    if !HasPoint(k)
      missing.Push(PointLabel(k))
  if missing.Length {
    MsgBox "처음 쓰시려면 아래 항목을 먼저 등록해야 해요.`n`n· " Join(missing, "`n· ") "`n`n설정 창을 엽니다.", APP_NAME, MB_INFO | MB_TOP
    ShowSetup()
  } else {
    ShowTip(APP_NAME " 준비됨 · OCS에서 " Cfg["HotkeyRun"] ": 현재 환자, " Cfg["HotkeyBatch"] ": 명단 모드", 4000)
  }
}

; =====================================================================
; 작은 도구들
; =====================================================================
ShowTip(text, ms := 0) {
  ToolTip text, A_ScreenWidth // 2 - 260, 12, 1
  SetTimer ClearTip, ms ? -ms : 0
}
ClearTip(*) {
  ToolTip(, , , 1)
}

Log(msg) {
  try FileAppend FormatTime(, "yyyy-MM-dd HH:mm:ss") "  " msg "`n", LOG_PATH, "UTF-8"
}

Join(arr, sep) {
  out := ""
  for v in arr
    out .= (A_Index > 1 ? sep : "") v
  return out
}

SameId(a, b) {
  a := Trim(a), b := Trim(b)
  return a != "" && (a = b || LTrim(a, "0") = LTrim(b, "0"))
}

PointByKey(key) {
  for p in POINTS
    if p.key = key
      return p
  return {key: key, kind: "point", label: key, help: ""}
}
PointLabel(key) => PointByKey(key).label
HasPoint(key) => Cfg.Has(key) && RegExMatch(Cfg[key], "^-?\d+,-?\d+$")

; 등록한 위치(OCS 창 안쪽 기준)를 화면 좌표로
PointXY(hwnd, key) {
  if !HasPoint(key)
    throw Error("'" PointLabel(key) "' 위치가 등록되지 않았어요. 트레이 아이콘 > 설정에서 등록해주세요.")
  xy := StrSplit(Cfg[key], ",")
  WinGetClientPos(&cx, &cy, , , "ahk_id " hwnd)
  return {x: cx + Integer(xy[1]), y: cy + Integer(xy[2])}
}

; OCS 프로그램 창 중 가장 큰 창 (팝업이 아닌 메인 화면)
MainOcsWindow() {
  best := 0, bestArea := 0
  if Cfg["OcsExe"] = ""
    return 0
  for win in WinGetList(OcsCriteria()) {
    try {
      WinGetClientPos(, , &w, &h, "ahk_id " win)
      if w * h > bestArea
        best := win, bestArea := w * h
    }
  }
  return best
}

; 지금 앞에 있는 창이 등록한 OCS 메인 화면과 같은 크기인지 (팝업이 앞에 있거나 창 크기가 바뀌면 위치가 틀어짐)
CheckOcsWindow(hwnd) {
  if gPractice || Cfg["OcsW"] = "" || Cfg["OcsH"] = ""
    return
  WinGetClientPos(, , &w, &h, "ahk_id " hwnd)
  tol := Num("SizeTolerance")
  if Abs(w - Cfg["OcsW"]) > tol || Abs(h - Cfg["OcsH"]) > tol
    throw Error("지금 앞에 있는 OCS 창 크기(" w "×" h ")가 등록할 때(" Cfg["OcsW"] "×" Cfg["OcsH"] ")와 달라요.`n`n"
      . "· 팝업 창이 떠 있다면 닫고 OCS 메인 화면을 클릭한 뒤 다시 시도하세요.`n"
      . "· OCS를 최대화했는지 확인하세요. 크기를 바꿔 쓰실 거라면 설정에서 창과 위치를 다시 등록하세요.")
}

ActivateOcs(hwnd) {
  if WinActive("ahk_id " hwnd)
    return
  WinActivate "ahk_id " hwnd
  if !WinWaitActive("ahk_id " hwnd, , 2)
    throw Error("OCS 창을 앞으로 가져오지 못했어요.")
  Sleep 200
}

AbortableSleep(ms) {
  end := A_TickCount + ms
  while A_TickCount < end {
    if gAbort
      throw Error("Esc를 눌러 멈췄어요.")
    Sleep 30
  }
}

; 한글 입력 상태를 영문으로 (검색어와 숫자가 한글로 바뀌지 않도록)
ImeOff(hwnd := 0) {
  try {
    if !hwnd
      hwnd := WinExist("A")
    info := Buffer(A_PtrSize = 8 ? 72 : 48, 0)
    NumPut "UInt", info.Size, info, 0
    tid := DllCall("GetWindowThreadProcessId", "Ptr", hwnd, "Ptr", 0, "UInt")
    if DllCall("GetGUIThreadInfo", "UInt", tid, "Ptr", info) {
      focus := NumGet(info, 8 + A_PtrSize, "Ptr")
      if focus
        hwnd := focus
    }
    ime := DllCall("imm32\ImmGetDefaultIMEWnd", "Ptr", hwnd, "Ptr")
    res := 0
    if ime
      DllCall("SendMessageTimeout", "Ptr", ime, "UInt", 0x283, "Ptr", 0x006, "Ptr", 0, "UInt", 0x2, "UInt", 300, "Ptr*", &res)
  }
}

OpenReadme() {
  path := A_ScriptDir "\README.md"
  if !FileExist(path) {
    MsgBox "README.md 파일이 도우미와 같은 폴더에 없어요.", APP_NAME, MB_INFO | MB_TOP
    return
  }
  try Run('notepad.exe "' path '"')
}

; =====================================================================
; 흐름 프로그램 서버와 주고받기
; =====================================================================
; 서버 주소 /api/ocs/… 에 묻고, 탭으로 나눈 글('OPHFLOW1 <종류>' … 'END')로 답을 받음
Api(path, body := "") {
  if Cfg["ServerUrl"] = ""
    throw Error("흐름 프로그램 서버 주소가 등록되지 않았어요. 트레이 아이콘 > 설정에서 등록해주세요.")
  url := Cfg["ServerUrl"] "/api/ocs/" path
  try {
    whr := ComObject("WinHttp.WinHttpRequest.5.1")
    whr.Open(body = "" ? "GET" : "POST", url, false)
    whr.SetProxy(1)  ; 병원 내부망 서버라 프록시를 거치지 않음
    whr.SetTimeouts(3000, 3000, 5000, 8000)
    if body = "" {
      whr.Send()
    } else {
      whr.SetRequestHeader("Content-Type", "text/plain; charset=utf-8")
      whr.Send(body)
    }
    status := whr.Status
    text := whr.ResponseText
  } catch as e {
    throw Error("흐름 프로그램 서버에 연결하지 못했어요 (" Cfg["ServerUrl"] ").`n서버 PC가 켜져 있는지, 주소가 맞는지 확인해주세요.`n`n" e.Message)
  }
  if status != 200
    throw Error("흐름 프로그램 서버가 도우미 요청을 모르는 것 같아요 (응답 " status ").`n서버를 최신 버전으로 업데이트했는지 확인해주세요.")
  r := ParseReply(text)
  if r.kind = "ERROR"
    throw Error(r.message != "" ? r.message : "흐름 프로그램 서버에서 오류가 났어요.")
  if r.kind = ""
    throw Error("흐름 프로그램 서버의 답을 읽지 못했어요. 서버 주소를 확인해주세요.")
  return r
}

ParseReply(text) {
  r := {kind: "", message: "", fields: Map(), orders: [], manual: [], done: [], patients: [], skipped: [], allOrders: []}
  lines := StrSplit(StrReplace(text, "`r"), "`n")
  if InStr(lines[1], TAG " ") != 1
    return r
  r.kind := Trim(SubStr(lines[1], StrLen(TAG) + 2))
  for line in lines {
    if A_Index = 1 || line = "" || line = "END"
      continue
    f := StrSplit(line, "`t")
    switch f[1] {
      case "order":
        if f.Length >= 6 && f[4] != ""
          r.orders.Push({key: f[2], label: f[3], text: f[4], down: Integer(f[5]), testId: f[6]})
      case "manual":
        r.manual.Push(f[2] (f.Length >= 3 && f[3] != "" ? " (" f[3] ")" : ""))
      case "done":
        r.done.Push(f[2])
      case "patient":
        if f.Length >= 9
          r.patients.Push({id: f[2], name: f[3], doctor: f[4], auto: Integer(f[5]), manual: Integer(f[6]), summary: f[7], reservation: f[8], checkedIn: f[9] = "1"})
      case "message":
        r.message := f.Length >= 2 ? f[2] : ""
      default:
        r.fields[f[1]] := f.Length >= 2 ? f[2] : ""
    }
  }
  r.allOrders := r.orders.Clone()
  return r
}

F(r, key) => r.fields.Has(key) ? r.fields[key] : ""

; 그 환자의 넣을 처방. 전에 일부만 넣고 멈춘 처방 줄은 빼고(r.skipped) 남은 것만 r.orders에
PatientPlan(id) {
  r := Api("patient?id=" RegExReplace(id, "\D"))
  keep := [], skipped := []
  for o in r.orders {
    if gPartial.Has(PartialKey(r, o))
      skipped.Push(o)
    else
      keep.Push(o)
  }
  r.orders := keep, r.skipped := skipped
  return r
}
PartialKey(r, o) => F(r, "today") "|" F(r, "id") "|" o.key

TestFlow(*) {
  try {
    r := Api("ping")
    MsgBox "흐름 프로그램 서버와 연결됐어요.`n`n오늘(" F(r, "today") ") 명단 " F(r, "patients") "명 · 처방 넣을 환자 " F(r, "pending") "명", APP_NAME, MB_INFO | MB_TOP
    return true
  } catch as e {
    MsgBox e.Message, APP_NAME, MB_WARN | MB_TOP
    return false
  }
}

; =====================================================================
; OCS 조작
; =====================================================================
; OCS 화면의 환자번호를 드래그해서 복사
ReadPatientNo(hwnd) {
  if gPractice {
    r := InputBox("연습 모드: OCS 화면에 열린 환자번호라고 생각하고 번호를 입력하세요.", APP_NAME, "w360 h140")
    return r.Result = "OK" ? RegExReplace(r.Value, "\D") : ""
  }
  return ReadPatientNoReal(hwnd)
}

ReadPatientNoReal(hwnd) {
  p1 := PointXY(hwnd, "PatientNoStart")
  p2 := PointXY(hwnd, "PatientNoEnd")
  MouseGetPos &mx, &my
  A_Clipboard := ""
  MouseClickDrag "Left", p1.x, p1.y, p2.x, p2.y, 5
  Sleep 150
  Send "^c"
  ok := ClipWait(1.5)
  MouseMove mx, my, 0
  if !ok
    return ""
  return RegExMatch(A_Clipboard, "\d{5,12}", &m) ? m[0] : ""
}

; 환자를 연 직후에는 화면이 늦게 바뀔 수 있어 몇 번 다시 읽음
ReadPatientNoRetry(hwnd, expect, tries := 3) {
  no := ""
  loop tries {
    no := ReadPatientNoReal(hwnd)
    if SameId(no, expect)
      return no
    if A_Index < tries
      AbortableSleep(1000)
  }
  return no
}

CheckCaretNear(p) {
  if CaretGetPos(&x, &y) {
    if Abs(x - p.x) > 250 || Abs(y - p.y) > 60
      throw Error("처방 입력창에 커서가 들어가지 않은 것 같아요. '처방 입력창' 위치를 다시 등록해주세요.`n(이 확인이 계속 잘못 걸리면 설정 파일에서 CaretCheck=0)")
  }
}

StepCheck(hwnd) {
  if gAbort
    throw Error("Esc를 눌러 멈췄어요.")
  if !WinActive("ahk_id " hwnd)
    throw Error("OCS 창이 앞에 있지 않아요 (새 창이 떴거나 다른 창이 선택됨).")
}

TypeSearch(text) {
  mode := Cfg["TypeMode"]
  if mode = "paste" {
    A_Clipboard := text
    ClipWait 1
    Send "^v"
  } else if mode = "text" {
    SendText text
  } else {
    SendEvent "{Raw}" text
  }
}

; 처방을 한 줄씩 입력: 입력창 클릭 → 검색어 → (Enter) → ↓ N번 → Enter
; 입력창을 지우려고 Ctrl+A나 Delete를 쓰지 않는다 (OCS에서 Delete는 D/C).
EnterOrders(hwnd, orders) {
  done := 0
  MouseGetPos &mx, &my
  try {
    for o in orders {
      StepCheck(hwnd)
      if gPractice {
        SendText "[처방 " A_Index "] 입력창 클릭 → '" o.text "' 입력 → ↓ " o.down "번 → Enter   (" o.label ")`n"
        done++
        AbortableSleep(300)
        continue
      }
      p := PointXY(hwnd, "OrderInput")
      Click p.x " " p.y
      AbortableSleep(Num("WaitAfterClick"))
      if Cfg["CaretCheck"] = "1"
        CheckCaretNear(p)
      StepCheck(hwnd)
      ImeOff(hwnd)
      TypeSearch(o.text)
      AbortableSleep(Num("WaitAfterType"))
      if Cfg["EnterToSearch"] = "1" {
        StepCheck(hwnd)
        Send "{Enter}"
        AbortableSleep(Num("WaitAfterSearch"))
      }
      loop o.down {
        StepCheck(hwnd)
        Send "{Down}"
        AbortableSleep(Num("DownDelay"))
      }
      StepCheck(hwnd)
      Send "{Enter}"
      done++
      Log("  처방 입력: " o.label)
      AbortableSleep(Num("WaitAfterEnter"))
      if !WinActive("ahk_id " hwnd)
        throw Error("'" o.label "'을 넣은 뒤 새 창이 떴어요. 창 내용을 확인해주세요.")
    }
  } catch as e {
    MouseMove mx, my, 0
    return {count: done, error: e.Message}
  }
  MouseMove mx, my, 0
  return {count: done, error: ""}
}

CheckForbiddenKey(keys) {
  if RegExMatch(keys, "i)\{\s*(Del|Delete|F2)\b")
    throw Error("환자 열기 순서(Steps)에 쓸 수 없는 키가 있어요 (Delete = D/C, F2 = 서명): " keys)
}

CheckStepsReady() {
  missing := []
  for step in StrSplit(Cfg["Steps"], "|") {
    parts := StrSplit(Trim(step), ":", , 2)
    if parts.Length < 2
      continue
    act := Trim(parts[1]), arg := Trim(parts[2])
    if (act = "click" || act = "dclick") && !HasPoint(arg)
      missing.Push(PointLabel(arg))
    if act = "key"
      CheckForbiddenKey(arg)
  }
  if missing.Length
    throw Error("명단 모드에 필요한 위치가 등록되지 않았어요:`n· " Join(missing, "`n· ") "`n`n트레이 아이콘 > 설정에서 등록해주세요.")
}

; 설정 파일 [OpenPatient] Steps 순서대로 OCS 외래 명단에서 환자를 연다
OpenPatient(hwnd, id) {
  if gPractice {
    SendText "`n[환자 열기] OCS 외래 명단에서 " id " 검색 → 첫 줄 더블클릭`n"
    return
  }
  for step in StrSplit(Cfg["Steps"], "|") {
    step := Trim(step)
    if step = ""
      continue
    if gAbort
      throw Error("Esc를 눌러 멈췄어요.")
    parts := StrSplit(step, ":", , 2)
    act := Trim(parts[1]), arg := parts.Length >= 2 ? parts[2] : ""
    switch act {
      case "click":
        p := PointXY(hwnd, Trim(arg))
        Click p.x " " p.y
        AbortableSleep(Num("WaitAfterClick"))
      case "dclick":
        p := PointXY(hwnd, Trim(arg))
        Click p.x " " p.y " 2"
        AbortableSleep(Num("WaitAfterClick"))
      case "type":
        ImeOff()
        SendEvent "{Raw}" StrReplace(arg, "{ID}", id)
      case "key":
        CheckForbiddenKey(arg)
        Send arg
      case "wait":
        AbortableSleep(Integer(Trim(arg)))
      default:
        throw Error("환자 열기 순서(Steps)에 모르는 동작이 있어요: " step)
    }
  }
}

; =====================================================================
; 안내 문구
; =====================================================================
ConfirmText(r, fromList := false) {
  if r.orders.Length = 0
    t := "이 환자의 처방은 전에 이미 넣었어요 (처방 완료 표시만 못 했음).`n흐름 프로그램에 '처방 완료' 표시만 다시 할까요?`n`n"
  else
    t := "OCS에 아래 처방을 넣을까요?`n`n"
  t .= "환자:  " F(r, "name") "  (" F(r, "id") ")`n"
  if F(r, "doctor") != ""
    t .= "담당:  " F(r, "doctor") "`n"
  if fromList
    t .= "   → OCS 외래 명단에서 이 환자를 열고, 환자번호가 같은지 확인한 뒤 넣어요.`n"
  else
    t .= "   → OCS 화면에서 읽은 환자번호와 같아요. 이름도 확인해주세요.`n"
  t .= "`n넣을 처방 " r.orders.Length "건`n"
  for o in r.orders
    t .= "   •  " o.label "      [" o.text "  ↓" o.down "]`n"
  if r.skipped.Length
    t .= "`n전에 넣고 멈춘 것 (건너뜀): " JoinLabels(r.skipped) "`n"
  if r.manual.Length
    t .= "`n직접 넣을 것: " Join(r.manual, ", ") "`n"
  if r.done.Length
    t .= "이미 처방 완료: " Join(r.done, ", ") "`n"
  t .= "`n넣는 동안 마우스·키보드를 만지지 마세요. 멈추려면 Esc.`n서명은 넣은 뒤 직접 해주세요."
  return t
}

JoinLabels(orders) {
  out := []
  for o in orders
    out.Push(o.label)
  return Join(out, ", ")
}

NoOrdersText(r) {
  t := F(r, "name") " (" F(r, "id") "): 도우미가 넣을 처방이 없어요."
  if r.done.Length
    t .= "`n이미 처방 완료: " Join(r.done, ", ")
  if r.manual.Length
    t .= "`n직접 넣을 것: " Join(r.manual, ", ")
  return t
}

; 입력을 마친 뒤: 처방 줄을 모두 넣은 검사만 흐름 프로그램에 '처방 완료'로 표시하고 결과 문구를 만든다
FinishPatient(hwnd, r, res) {
  name := F(r, "name"), id := F(r, "id")
  entered := Map()
  for o in r.skipped
    entered[o.key] := true
  loop res.count
    entered[r.orders[A_Index].key] := true
  ; 검사별로 묶어서: 모두 넣었으면 처방 완료, 일부만 넣었으면 넣은 줄을 기억(다음에 건너뜀)
  byTest := Map(), testOrder := []
  for o in r.allOrders {
    if !byTest.Has(o.testId) {
      byTest[o.testId] := []
      testOrder.Push(o.testId)
    }
    byTest[o.testId].Push(o)
  }
  complete := [], completeLines := [], partial := []
  for testId in testOrder {
    lines := byTest[testId]
    full := true
    for o in lines
      if !entered.Has(o.key)
        full := false
    if full {
      complete.Push(testId)
      for o in lines
        completeLines.Push(o)
    } else {
      for o in lines {
        if entered.Has(o.key) {
          gPartial[PartialKey(r, o)] := true
          partial.Push(o.label)
        }
      }
    }
  }

  marked := false, markErr := ""
  if complete.Length {
    doMark := true
    if gPractice
      doMark := MsgBox("연습 모드예요. 흐름 프로그램에도 '처방 완료'로 표시할까요?`n(가상 환자로 연습할 때만 '예')", APP_NAME, MB_YESNO | MB_QUESTION | MB_DEF2 | MB_TOP) = "Yes"
    if doMark {
      try {
        Api("done", "id=" id "`ntests=" Join(complete, ","))
        marked := true
      } catch as e {
        markErr := e.Message
      }
    }
  }
  ; 표시하지 못했으면 넣은 줄을 기억해서, 다시 F9를 눌러도 같은 처방을 두 번 넣지 않고 표시만 다시 시도
  for o in completeLines {
    k := PartialKey(r, o)
    if markErr != ""
      gPartial[k] := true
    else if gPartial.Has(k)
      gPartial.Delete(k)
  }
  try ActivateOcs(hwnd)
  Log((gPractice ? "[연습] " : "") id " 입력 " res.count "/" r.orders.Length "건" (marked ? ", 흐름 처방 완료 표시" : "") (res.error != "" ? ", 멈춤: " res.error : ""))

  msg := name " (" id "): OCS에 " res.count "/" r.orders.Length "건 넣었어요."
  if res.error != ""
    msg .= "`n`n멈춘 이유: " res.error "`n입력창에 글자가 남아 있을 수 있어요. 오더 목록을 확인해주세요."
  if marked
    msg .= "`n흐름 프로그램에 '처방 완료'로 표시했어요."
  else if markErr != ""
    msg .= "`n`n흐름 프로그램에 처방 완료 표시를 못 했어요: " markErr "`n같은 환자에서 " Cfg["HotkeyRun"] "를 다시 누르면 처방은 다시 넣지 않고 표시만 해요. 또는 검사실 화면에서 [처방 전]을 직접 눌러주세요."
  if partial.Length
    msg .= "`n`n일부만 넣은 검사가 있어요 (넣은 것: " Join(partial, ", ") ").`n같은 환자에서 다시 " Cfg["HotkeyRun"] "를 누르면 남은 것만 넣어요."
  if r.manual.Length
    msg .= "`n`n직접 넣어야 할 처방: " Join(r.manual, ", ")
  msg .= "`n`nOCS 오더 목록을 확인하고 직접 서명해주세요."
  ok := res.error = "" && markErr = ""
  clean := ok && !r.manual.Length && !partial.Length
  short := name ": " res.count "건 넣었어요 · 오더 확인 후 서명하세요"
  return {msg: msg, ok: ok, clean: clean, short: short}
}

; =====================================================================
; F9: 지금 열린 환자
; =====================================================================
RunCurrent() {
  global gRunning, gAbort
  hwnd := WinExist("A")
  gRunning := true, gAbort := false
  saved := ClipboardAll()
  try {
    CheckOcsWindow(hwnd)
    ShowTip("OCS 환자번호 읽는 중… (멈춤: Esc)")
    no := ReadPatientNo(hwnd)
    if no = ""
      throw Error("OCS 화면에서 환자번호를 읽지 못했어요.`n환자 화면이 열려 있는지 확인하고, 안 되면 설정에서 '환자번호' 위치를 다시 등록해주세요.")
    ShowTip("흐름 프로그램에서 " no " 처방을 가져오는 중…")
    r := PatientPlan(no)
    ActivateOcs(hwnd)
    ClearTip()
    if !SameId(F(r, "id"), no)
      throw Error("흐름 프로그램이 다른 환자 정보를 보냈어요. 아무것도 넣지 않았어요. 다시 시도해주세요.")
    if r.orders.Length = 0 && r.skipped.Length = 0 {
      MsgBox NoOrdersText(r), APP_NAME, MB_INFO | MB_TOP
      return
    }
    if MsgBox(ConfirmText(r), APP_NAME " · 처방 넣기", MB_YESNO | MB_QUESTION | MB_TOP) != "Yes"
      return
    ActivateOcs(hwnd)
    ; 확인 창을 보는 사이 OCS 환자가 바뀌지 않았는지 다시 읽음
    again := gPractice ? no : ReadPatientNoReal(hwnd)
    if !SameId(again, no)
      throw Error("확인하는 동안 OCS의 환자가 바뀌었어요 (지금: " (again = "" ? "읽지 못함" : again) "). 아무것도 넣지 않았어요.")
    Log((gPractice ? "[연습] " : "") "현재 환자 " no " 입력 시작 " r.orders.Length "건")
    ShowTip(F(r, "name") " 처방 입력 중… 마우스·키보드를 만지지 마세요 (멈춤: Esc)")
    res := EnterOrders(hwnd, r.orders)
    out := FinishPatient(hwnd, r, res)
    ClearTip()
    if out.clean
      ShowTip(out.short, 6000)
    else
      MsgBox out.msg, APP_NAME, (out.ok ? MB_INFO : MB_WARN) | MB_TOP
  } catch as e {
    ClearTip()
    Log("오류: " e.Message)
    MsgBox e.Message, APP_NAME, MB_WARN | MB_TOP
  } finally {
    Sleep 200
    A_Clipboard := saved
    gRunning := false
  }
}

; =====================================================================
; F10: 명단 모드
; =====================================================================
BatchStart() {
  global gRunning, gAbort
  hwnd := WinExist("A")
  gRunning := true, gAbort := false
  try {
    CheckOcsWindow(hwnd)
    if !gPractice
      CheckStepsReady()
    ShowTip("흐름 프로그램에서 오늘 처방 대기 명단을 가져오는 중…")
    r := Api("list")
    ClearTip()
    all := []
    for p in r.patients
      if p.auto > 0
        all.Push(p)
    if !all.Length {
      MsgBox "오늘(" F(r, "today") ") 도우미가 넣을 처방이 있는 환자가 없어요.", APP_NAME, MB_INFO | MB_TOP
      return
    }
    gRunning := false  ; 고르는 창에서 Esc로 닫을 수 있도록 (창이 앞에 있어 OCS 단축키는 동작하지 않음)
    choice := ChooseBatchFilter(all, F(r, "today"))
    gRunning := true
    ActivateOcs(hwnd)
    if !IsObject(choice)
      return
    items := []
    for p in all
      if (choice.doctor = "" || InStr(", " p.doctor ", ", ", " choice.doctor ", ")) && (!choice.checkedOnly || p.checkedIn)
        items.Push({id: p.id, name: p.name, summary: p.summary, reservation: p.reservation, status: "대기", finished: false})
    if !items.Length {
      MsgBox "고른 조건에 맞는 환자가 없어요.", APP_NAME, MB_INFO | MB_TOP
      return
    }
    Batch.active := true, Batch.hwnd := hwnd, Batch.items := items
    Batch.filter := (choice.doctor = "" ? "전체 교수" : choice.doctor) (choice.checkedOnly ? " · 접수한 환자만" : "")
    ShowBatchGui()
    Log((gPractice ? "[연습] " : "") "명단 모드 시작 " items.Length "명 (" Batch.filter ")")
  } catch as e {
    ClearTip()
    Log("오류(명단 시작): " e.Message)
    MsgBox e.Message, APP_NAME, MB_WARN | MB_TOP
  } finally {
    gRunning := false
  }
}

; 명단 모드 조건 고르기 (교수 · 접수한 환자만). 취소하면 ""
ChooseBatchFilter(patients, today) {
  doctors := ["전체 교수"]
  for p in patients {
    for d in StrSplit(p.doctor, ",") {
      d := Trim(d)
      known := false
      for x in doctors
        if x = d
          known := true
      if d != "" && !known
        doctors.Push(d)
    }
  }
  holder := {value: ""}
  g := Gui("+AlwaysOnTop", APP_NAME " · 명단 모드")
  g.SetFont("s10", "Malgun Gothic")
  g.AddText("w300", "오늘(" today ") 도우미가 넣을 환자 " patients.Length "명`n예약 시간 순서로 한 명씩 진행해요.")
  g.AddText("w300 y+12", "교수")
  dd := g.AddDropDownList("w300 Choose1", doctors)
  cb := g.AddCheckbox("y+10", "접수한 환자만")
  start := g.AddButton("w145 y+14 Default", "시작")
  cancel := g.AddButton("x+10 w145", "취소")
  start.OnEvent("Click", (*) => (holder.value := {doctor: dd.Value > 1 ? dd.Text : "", checkedOnly: cb.Value = 1}, g.Destroy()))
  cancel.OnEvent("Click", (*) => g.Destroy())
  g.OnEvent("Close", (*) => g.Destroy())
  g.OnEvent("Escape", (*) => g.Destroy())
  hwnd := g.Hwnd
  g.Show()
  WinWaitClose("ahk_id " hwnd)
  return holder.value
}

ShowBatchGui() {
  if Batch.gui
    try Batch.gui.Destroy()
  ; 누르기만 하고 초점을 가져가지 않는 창 (OCS가 계속 앞에 있도록)
  g := Gui("+AlwaysOnTop +ToolWindow +E0x08000000", APP_NAME " · 명단 모드")
  g.SetFont("s10", "Malgun Gothic")
  g.AddText("w540", "조건: " Batch.filter "  ·  " Batch.items.Length "명 (예약 순)")
  lv := g.AddListView("w540 r10 -Multi NoSortHdr", ["#", "예약", "환자번호", "이름", "넣을 처방", "상태"])
  for i, it in Batch.items
    lv.Add("", i, it.reservation, it.id, it.name, it.summary, it.status)
  lv.ModifyCol(1, 30), lv.ModifyCol(2, 48), lv.ModifyCol(3, 76), lv.ModifyCol(4, 62), lv.ModifyCol(5, 230), lv.ModifyCol(6, 86)
  st := g.AddEdit("w540 r7 ReadOnly", "")
  g.AddButton("w176", "다음 환자 (" Cfg["HotkeyRun"] ")").OnEvent("Click", (*) => BatchNext())
  g.AddButton("x+6 w176", "이 환자 건너뛰기").OnEvent("Click", (*) => BatchSkip())
  g.AddButton("x+6 w176", "명단 모드 끝내기").OnEvent("Click", (*) => BatchEnd())
  g.OnEvent("Close", (*) => BatchEnd())
  Batch.gui := g, Batch.lv := lv, Batch.status := st
  g.Show("x" (A_ScreenWidth - 600) " y80 NoActivate")
  BatchSetStatus("OCS에서 " Cfg["HotkeyRun"] "를 누를 때마다 한 명씩 진행해요. 환자마다 멈추니, 오더를 확인하고 서명한 뒤 다음 환자로 가세요." NextText())
}

BatchSetStatus(text) {
  try Batch.status.Value := text
}

NextPending() {
  for i, it in Batch.items
    if !it.finished
      return i
  return 0
}

SetItem(idx, status, finished := false) {
  it := Batch.items[idx]
  it.status := status, it.finished := finished
  try Batch.lv.Modify(idx, "Col6", status)
}

NextText() {
  idx := NextPending()
  if !idx
    return "`n`n명단의 환자를 모두 마쳤어요. 서명을 마치면 [명단 모드 끝내기]를 눌러주세요."
  it := Batch.items[idx]
  return "`n`n다음: " it.name " (" it.id ") · " it.summary "`n서명까지 마쳤으면 " Cfg["HotkeyRun"] "를 누르세요."
}

BatchNext() {
  global gRunning, gAbort
  if gRunning || !Batch.active
    return
  idx := NextPending()
  if !idx {
    BatchSetStatus("명단의 환자를 모두 마쳤어요. [명단 모드 끝내기]를 눌러주세요.")
    return
  }
  hwnd := Batch.hwnd
  item := Batch.items[idx]
  if !WinExist("ahk_id " hwnd) {
    BatchSetStatus("명단 모드를 시작한 OCS 창이 닫혔어요. 명단 모드를 끝내고 다시 시작해주세요.")
    return
  }
  gRunning := true, gAbort := false
  saved := ClipboardAll()
  try {
    try Batch.lv.Modify(idx, "Select Focus Vis")
    ActivateOcs(hwnd)
    CheckOcsWindow(hwnd)
    BatchSetStatus(item.name " (" item.id ") 처방을 가져오는 중…")
    r := PatientPlan(item.id)
    ActivateOcs(hwnd)
    if r.orders.Length = 0 && r.skipped.Length = 0 {
      SetItem(idx, "넣을 것 없음", true)
      BatchSetStatus(NoOrdersText(r) NextText())
      return
    }
    if Cfg["BatchConfirm"] = "1" && MsgBox(ConfirmText(r, true), APP_NAME " · 명단 모드", MB_YESNO | MB_QUESTION | MB_TOP) != "Yes" {
      BatchSetStatus("취소했어요. " Cfg["HotkeyRun"] "를 누르면 이 환자부터 다시 하고, [이 환자 건너뛰기]로 넘길 수 있어요.")
      return
    }
    ActivateOcs(hwnd)
    if r.orders.Length = 0 {
      ; 전에 넣고 표시만 못 한 환자: OCS를 다시 열지 않고 처방 완료 표시만
      out := FinishPatient(hwnd, r, {count: 0, error: ""})
      SetItem(idx, out.ok ? "표시만 다시" : "표시 실패", out.ok)
      BatchSetStatus(out.msg (out.ok ? NextText() : ""))
      return
    }
    ShowTip(item.name " 환자를 여는 중… 마우스·키보드를 만지지 마세요 (멈춤: Esc)")
    OpenPatient(hwnd, item.id)
    if !WinWaitActive("ahk_id " hwnd, , 5)
      throw Error("환자를 연 뒤 OCS 메인 화면이 앞에 오지 않았어요. 떠 있는 창을 확인해주세요. 처방은 넣지 않았어요.")
    no := gPractice ? item.id : ReadPatientNoRetry(hwnd, item.id)
    if !SameId(no, item.id) {
      SetItem(idx, "열기 실패")
      throw Error("OCS에서 " item.name " (" item.id ") 환자를 열지 못했어요 (읽은 번호: " (no = "" ? "없음" : no) ").`n처방은 넣지 않았어요.`n`n"
        . Cfg["HotkeyRun"] "로 다시 시도하거나 [이 환자 건너뛰기]를 눌러주세요.")
    }
    Log((gPractice ? "[연습] " : "") "명단 모드 " item.id " 입력 시작 " r.orders.Length "건")
    ShowTip(item.name " 처방 입력 중… 마우스·키보드를 만지지 마세요 (멈춤: Esc)")
    res := EnterOrders(hwnd, r.orders)
    out := FinishPatient(hwnd, r, res)
    ClearTip()
    if res.error = "" {
      SetItem(idx, "입력 " res.count "건", true)
      BatchSetStatus(out.msg NextText())
      if !out.ok
        MsgBox out.msg, APP_NAME, MB_WARN | MB_TOP
    } else {
      SetItem(idx, "멈춤 " res.count "/" r.orders.Length)
      BatchSetStatus(out.msg "`n`n" Cfg["HotkeyRun"] "를 누르면 이 환자를 다시 열고 남은 처방만 넣어요. [이 환자 건너뛰기]로 넘길 수도 있어요.")
      MsgBox out.msg, APP_NAME, MB_WARN | MB_TOP
    }
  } catch as e {
    ClearTip()
    Log("오류(명단) " item.id ": " e.Message)
    BatchSetStatus(e.Message)
    MsgBox e.Message, APP_NAME, MB_WARN | MB_TOP
  } finally {
    Sleep 200
    A_Clipboard := saved
    gRunning := false
  }
}

BatchSkip() {
  if gRunning || !Batch.active
    return
  idx := NextPending()
  if !idx
    return
  SetItem(idx, "건너뜀", true)
  Log("명단 모드 " Batch.items[idx].id " 건너뜀")
  BatchSetStatus(Batch.items[idx].name " 환자를 건너뛰었어요." NextText())
}

BatchEnd() {
  if gRunning {
    AbortNow()
    return
  }
  if Batch.gui
    try Batch.gui.Destroy()
  Batch.active := false, Batch.gui := 0, Batch.lv := 0, Batch.status := 0
  Log("명단 모드 끝")
  ShowTip("명단 모드를 끝냈어요.", 2500)
}

; =====================================================================
; 연습 모드
; =====================================================================
TogglePractice(*) {
  global gPractice
  if Batch.active {
    MsgBox "명단 모드를 끝낸 뒤 바꿔주세요.", APP_NAME, MB_INFO | MB_TOP
    return
  }
  gPractice := !gPractice
  if gPractice {
    A_TrayMenu.Check("연습 모드 (메모장)")
    MsgBox "연습 모드를 켰어요.`n`n메모장을 열고 그 안에서 " Cfg["HotkeyRun"] "(현재 환자) 또는 " Cfg["HotkeyBatch"] "(명단 모드)를 눌러보세요.`n"
      . "OCS 대신 메모장에 무엇을 어떤 순서로 넣을지 글로 적어 줘요.`n흐름 프로그램과는 실제로 주고받아요.", APP_NAME, MB_INFO | MB_TOP
  } else {
    A_TrayMenu.Uncheck("연습 모드 (메모장)")
    MsgBox "연습 모드를 껐어요. 이제 OCS에서 동작합니다.", APP_NAME, MB_INFO | MB_TOP
  }
}

; =====================================================================
; 설정 창 (위치 등록)
; =====================================================================
ShowSetup(*) {
  global SetupGui, SetupLv
  if !SetupGui {
    g := Gui("+AlwaysOnTop", APP_NAME " · 설정")
    g.SetFont("s10", "Malgun Gothic")
    g.AddText("w640", "항목을 고르고 [선택 항목 등록]을 누르세요. 서버 주소는 직접 적고, 창·위치는 이 창이 잠시 숨겨진 뒤 안내대로 마우스를 올리고 F8을 누르세요 (취소: Esc).`n"
      . "OCS는 평소 쓰는 크기(최대화)로 두고 등록하세요. 창 크기나 화면 배치가 바뀌면 다시 등록해야 해요.`n"
      . "명단 모드 위치 3개는 OCS 외래 명단을 연 상태에서 등록하세요.")
    lv := g.AddListView("w640 r9 -Multi NoSortHdr", ["항목", "등록된 값"])
    lv.OnEvent("DoubleClick", (*) => StartRecord())
    g.AddButton("w155", "선택 항목 등록").OnEvent("Click", (*) => StartRecord())
    g.AddButton("x+6 w155", "환자번호 읽기 시험").OnEvent("Click", (*) => TestReadNo())
    g.AddButton("x+6 w155", "흐름 연결 시험").OnEvent("Click", TestFlow)
    g.AddButton("x+6 w155", "설정 파일 열기").OnEvent("Click", (*) => Run('notepad.exe "' INI_PATH '"'))
    g.OnEvent("Close", (*) => g.Hide())
    SetupGui := g, SetupLv := lv
  }
  RefreshSetup()
  SetupGui.Show()
}

RefreshSetup() {
  if !SetupLv
    return
  SetupLv.Delete()
  for p in POINTS {
    switch p.kind {
      case "ocs":
        v := Cfg["OcsExe"] = "" ? "" : Cfg["OcsExe"] "   (창 크기 " Cfg["OcsW"] "×" Cfg["OcsH"] ")"
      case "server":
        v := Cfg["ServerUrl"]
      default:
        v := Cfg[p.key]
    }
    SetupLv.Add("", p.label, v = "" ? "— 미등록" : v)
  }
  SetupLv.ModifyCol(1, 250), SetupLv.ModifyCol(2, 370)
}

StartRecord() {
  global gRecording
  row := SetupLv.GetNext(0)
  if !row {
    MsgBox "등록할 항목을 먼저 고르세요.", APP_NAME, MB_INFO | MB_TOP
    return
  }
  p := POINTS[row]
  if p.kind = "server" {
    AskServerUrl()
    return
  }
  if p.kind = "point" && Cfg["OcsExe"] = "" {
    MsgBox "먼저 'OCS 창'을 등록해주세요.", APP_NAME, MB_INFO | MB_TOP
    return
  }
  gRecording := p.key
  SetupGui.Hide()
  ToolTip "[" p.label " 등록]`n" p.help " 마우스를 올리고 F8을 누르세요.`n(클릭하지 않아도 돼요 · 취소: Esc)", A_ScreenWidth // 2 - 260, 12, 2
}

; 서버 주소는 직접 적음 (브라우저 주소창의 주소와 같음)
AskServerUrl() {
  r := InputBox("흐름 프로그램 주소를 적어 주세요.`n브라우저 주소창에 쓰는 주소와 같아요. 예: http://192.168.0.10:3000`n(이 PC가 서버 PC라면 http://localhost:3000)",
    APP_NAME " · 서버 주소", "w460 h170", Cfg["ServerUrl"] != "" ? Cfg["ServerUrl"] : "http://")
  if r.Result != "OK"
    return
  url := RTrim(Trim(r.Value), "/")
  if url != "" && !RegExMatch(url, "i)^https?://")
    url := "http://" url
  IniWrite url, INI_PATH, "Server", "Url"
  LoadConfig()
  RefreshSetup()
  if url != ""
    TestFlow()
}

CancelRecord(*) {
  global gRecording
  gRecording := ""
  ToolTip(, , , 2)
  ShowSetup()
}

RecordNow(*) {
  global gRecording
  p := PointByKey(gRecording)
  gRecording := ""
  ToolTip(, , , 2)
  MouseGetPos &mx, &my, &win
  try {
    exe := WinGetProcessName("ahk_id " win)
    switch p.kind {
      case "ocs":
        WinGetClientPos(, , &w, &h, "ahk_id " win)
        IniWrite exe, INI_PATH, "Windows", "OcsExe"
        IniWrite WinGetClass("ahk_id " win), INI_PATH, "Windows", "OcsClass"
        IniWrite w, INI_PATH, "Windows", "OcsW"
        IniWrite h, INI_PATH, "Windows", "OcsH"
        note := "OCS 창을 등록했어요: " exe " (창 크기 " w "×" h ")`n창 크기가 바뀌었다면 아래 위치들도 다시 등록해주세요."
      default:
        if exe != Cfg["OcsExe"]
          throw Error("OCS 화면 위에 마우스를 올리고 F8을 눌러주세요.`n(지금 마우스 아래 프로그램: " exe ")")
        main := MainOcsWindow()
        if !main
          throw Error("OCS 창을 찾지 못했어요.")
        WinGetClientPos(&cx, &cy, &w, &h, "ahk_id " main)
        IniWrite((mx - cx) "," (my - cy), INI_PATH, "Points", p.key)
        note := "'" p.label "' 위치를 등록했어요 (" (mx - cx) ", " (my - cy) ")."
        if Cfg["OcsW"] != "" && (Abs(w - Cfg["OcsW"]) > Num("SizeTolerance") || Abs(h - Cfg["OcsH"]) > Num("SizeTolerance"))
          note .= "`n`n⚠ 지금 OCS 창 크기(" w "×" h ")가 'OCS 창'을 등록할 때(" Cfg["OcsW"] "×" Cfg["OcsH"] ")와 달라요. 'OCS 창'부터 다시 등록해주세요."
    }
    LoadConfig()
    ShowSetup()
    MsgBox note, APP_NAME, MB_INFO | MB_TOP
  } catch as e {
    ShowSetup()
    MsgBox e.Message, APP_NAME, MB_WARN | MB_TOP
  }
}

TestReadNo() {
  global gRunning
  if gRunning
    return
  main := MainOcsWindow()
  if !main {
    MsgBox "OCS 창을 찾지 못했어요. OCS를 켜고 'OCS 창'을 등록했는지 확인해주세요.", APP_NAME, MB_WARN | MB_TOP
    return
  }
  gRunning := true
  saved := ClipboardAll()
  try {
    SetupGui.Hide()
    ActivateOcs(main)
    no := ReadPatientNoReal(main)
    ShowSetup()
    if no = ""
      MsgBox "환자번호를 읽지 못했어요.`n환자 화면이 열려 있는지, '환자번호 앞쪽·뒤쪽' 위치가 숫자 양 끝에 맞는지 확인해주세요.", APP_NAME, MB_WARN | MB_TOP
    else
      MsgBox "읽은 환자번호: " no "`n`nOCS 화면의 번호와 같은지 확인하세요.", APP_NAME, MB_INFO | MB_TOP
  } catch as e {
    ShowSetup()
    MsgBox e.Message, APP_NAME, MB_WARN | MB_TOP
  } finally {
    Sleep 200
    A_Clipboard := saved
    gRunning := false
  }
}
