#Requires AutoHotkey v2.0
#SingleInstance Force
Persistent
#Include <OCR>  ; Lib\OCR.ahk — 윈도우에 들어 있는 화면 글자 인식(OCR)을 쓰는 공개 라이브러리 (Descolada, MIT, Lib\OCR-LICENSE.txt)
#Include <UIA>  ; Lib\UIA.ahk — 윈도우 접근성(UI Automation) 라이브러리 (Descolada/UIA-v2, MIT, Lib\UIA-LICENSE.txt). 처음 쓸 때 준비됨
IUIAutomationActivateScreenReader := 0  ; 윈도우의 '화면 읽기 프로그램 사용 중' 표시는 켜지 않음 (OCS는 이것 없이도 알려 줌)

/*
  OCS 처방 도우미 (ophthalmology flow → OCS)

  - F9  : OCS에 열린 환자의 오늘 검사 처방을 넣습니다.
  - F10 : 명단 모드. 오늘 처방을 넣을 환자를 예약 순서대로 OCS 외래 명단에서 찾아 넣고,
          환자마다 멈춥니다. 확인·서명한 뒤 F9를 누르면 다음 환자로 갑니다.
  - 서명(F2)과 Delete(D/C) 키는 누르지 않습니다.

  화면 위치를 외워 두지 않고, 매번 OCS 화면에서 찾습니다(창을 옮기거나 칸 크기가 바뀌어도 따라감).
    · 가장 먼저 UIA(윈도우 접근성): OCS가 알려 주는 칸 이름표로 처방 입력창·그 환자 칸의 환자번호·Patient List 버튼·
      외래 명단이 열렸는지를 바로 알아냄. 안 되면 아래 방법으로
    · 처방 입력창 · 명단 여는 버튼 · 명단 머리글: 등록할 때(또는 처음 찾았을 때) 찍어 둔 작은 그림을 화면에서 찾음
      그림으로 못 찾으면 그 근처 글자(예: '입력창')를 글자 인식으로 찾고, 명단 버튼은 마지막으로 등록한 위치
    · 환자번호: 화면에 여러 번 보이는 번호 (오더발행·EMR 제목의 [16318174] 등). 번호가 보이던 좁은 띠만 읽음
    · 명단의 환자: '환자번호' 머리글 아래에서 그 번호를 찾아 더블클릭 (안 보이면 휠로 내려 가며 찾음)
    · 기다리는 시간: 정해진 시간을 다 기다리지 않고, 화면이 바뀌고 멈추면 바로 다음으로 (최대는 설정값)
  흐름 프로그램 서버(server.js)의 /api/ocs/… 주소로 오늘 처방을 받고, 넣은 검사를 '처방 완료'로 표시합니다.
  (서버 쪽: scripts/ocs-api.js, src/core/ocs.js) 자세한 사용법은 같은 폴더의 README.md.
*/

APP_NAME := "OCS 처방 도우미"
INI_PATH := A_ScriptDir "\ophflow-helper.ini"
LOG_PATH := A_ScriptDir "\ophflow-helper.log"
IMG_DIR := A_ScriptDir "\img"
TAG := "OPHFLOW1"
HEAD_PAD := 3  ; 명단 머리글 그림: 글자 둘레 여백 (픽셀)

MB_YESNO := 4, MB_QUESTION := 32, MB_WARN := 48, MB_INFO := 64, MB_DEF2 := 256, MB_TOP := 0x40000

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
  "OcrScale", "2",
  "OcrLang", "",
  "PatientIdMin", "6",
  "PatientIdMax", "10",
  "ListOpenWait", "1500",
  "ListScroll", "5",
  "ListMaxPages", "40",
  "ChartOpenWait", "2500",
  "ImageFind", "1",
  "ImageVariation", "30",
  "AdaptiveWait", "1",
  "StableMs", "300",
  "WaitMinAfterType", "500",
  "WaitMinAfterEnter", "600",
  "UseUia", "1"
)

; 설정 창에서 등록하는 항목 (순서대로 표시)
ITEMS := [
  {key: "ServerUrl",  kind: "server", label: "흐름 프로그램 서버 주소",         help: ""},
  {key: "OcsWindow",  kind: "ocs",    label: "OCS 창",                         help: "OCS 진료 화면(처방을 넣는 화면) 아무 곳에"},
  {key: "OrderInput", kind: "anchor", label: "처방 입력창",                    help: "오더발행의 처방 입력창 안('입력창' 글자 위)에"},
  {key: "ListButton", kind: "anchor", label: "외래 명단 여는 버튼 (명단 모드)", help: "외래 명단을 여는 Patient List 버튼(왼쪽 메뉴) 위에"}
]

CoordMode "Mouse", "Screen"
CoordMode "ToolTip", "Screen"
CoordMode "Caret", "Screen"
CoordMode "Pixel", "Screen"
SetTitleMatchMode 2
SetKeyDelay 20, 15

Cfg := Map()
gRunning := false
gAbort := false
gRecording := ""
gPractice := false
; 한 검사의 처방 줄(예: OCT와 OCTA)을 일부만 넣고 멈췄을 때 이미 넣은 줄. 다음에 같은 환자를 하면 건너뜀 (도우미를 끄면 지워짐)
gPartial := Map()
; 빨리 읽으려고 기억해 두는 자리 (창 안 비율, 설정 파일 [Learned]에도 적어 둠): 환자번호가 보이는 띠, 외래 명단 '환자번호' 칸
gIdBand := {x1: 0, y1: 0, x2: 1, y2: 0.3}
gListCol := ""
OCR.PerformanceMode := 1
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
; 서버 주소·OCS 창·기준 글자는 트레이 아이콘 > 설정에서 등록합니다.
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

; 화면 글자 인식: 확대 배율(작은 글씨는 2~3), 언어(비우면 윈도우 기본 언어, 예: ko, en-US)
OcrScale=2
OcrLang=
; 환자번호 자릿수 (최소~최대)
PatientIdMin=6
PatientIdMax=10
; 외래 명단: 여는 버튼을 누른 뒤 기다림, 한 번에 휠을 내리는 칸 수, 최대로 내려 볼 횟수
ListOpenWait=1500
ListScroll=5
ListMaxPages=40
; 명단에서 더블클릭한 뒤 환자 화면이 열릴 때까지 기다림
ChartOpenWait=2500

; UIA(윈도우 접근성): 1 = OCS가 알려 주는 칸 이름표로 먼저 찾음(가장 빠름), 0 = 쓰지 않음
UseUia=1
; 그림 찾기: 1 = 등록할 때 찍어 둔 그림으로 먼저 찾음(빠름), 0 = 글자 인식만. 허용 색 차이(0~255)
ImageFind=1
ImageVariation=30
; 화면 변화 감지: 1 = 위의 기다리는 시간을 '최대'로 보고, 화면이 바뀐 뒤 StableMs 동안 그대로면 바로 다음으로
;   (아래 두 값은 그래도 꼭 기다리는 최소 시간) / 0 = 늘 위의 시간을 다 기다림(예전 방식)
AdaptiveWait=1
StableMs=300
WaitMinAfterType=500
WaitMinAfterEnter=600

[Server]
; 흐름 프로그램 주소 (브라우저 주소창에 쓰는 것과 같음. 예: http://192.168.0.10:3000)
Url=

[Windows]

[Anchors]
; 기준 글자|창 안 가로 위치(0~1)|세로 위치(0~1)|누를 곳까지 가로 거리|세로 거리  (설정 창에서 등록)

[Images]
; 그림 찾기용 (img 폴더의 그림): 가로|세로|누를 곳 x|y|창 왼쪽 위에서 x|y|창 안 비율 x|y  (자동으로 적음)

[Learned]
; 도우미가 스스로 기억한 자리 (환자번호가 보이는 띠, 외래 명단 '환자번호' 칸). 지워도 다시 배움
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
  for it in ITEMS
    if it.kind = "anchor"
      Cfg[it.key] := Trim(IniRead(INI_PATH, "Anchors", it.key, ""))
  LoadLearned()
}

; 스스로 기억한 자리 (창 안 비율 x1|y1|x2|y2)
LoadLearned() {
  global gIdBand, gListCol
  gIdBand := RelOf(IniRead(INI_PATH, "Learned", "IdBand", ""), {x1: 0, y1: 0, x2: 1, y2: 0.3})
  gListCol := RelOf(IniRead(INI_PATH, "Learned", "ListCol", ""), "")
}
RelOf(s, def) {
  f := StrSplit(Trim(s), "|")
  if f.Length != 4
    return def
  for v in f
    if !IsNumber(v)
      return def
  return {x1: Number(f[1]), y1: Number(f[2]), x2: Number(f[3]), y2: Number(f[4])}
}
SaveRel(key, r) {
  try IniWrite(Round(r.x1, 4) "|" Round(r.y1, 4) "|" Round(r.x2, 4) "|" Round(r.y2, 4), INI_PATH, "Learned", key)
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
  tray.Add("설정 (등록)", ShowSetup)
  tray.Add("화면 글자 읽기 시험", (*) => TestOcr())
  tray.Add("흐름 연결 시험", TestFlow)
  tray.Add("화면 요소 확인 (UIA 시험)", (*) => RunUiaCheck())
  tray.Add("연습 모드 (메모장)", TogglePractice)
  tray.Add()
  tray.Add("사용법 열기", (*) => OpenReadme())
  tray.Add("기록 파일 열기", (*) => Run('notepad.exe "' LOG_PATH '"'))
  tray.Add("설정 파일 열기", (*) => Run('notepad.exe "' INI_PATH '"'))
  tray.Add("설정 다시 불러오기", (*) => Reload())
  tray.Add()
  tray.Add("종료", (*) => ExitApp())
  tray.Default := "설정 (등록)"
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
  ; OCS 프로그램의 어느 창이든 (외래 명단이 따로 된 창이어도 F10이 되도록)
  return Cfg["OcsExe"] != "" && !!WinActive("ahk_exe " Cfg["OcsExe"])
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
  if Cfg["ServerUrl"] = ""
    missing.Push("흐름 프로그램 서버 주소")
  if Cfg["OcsExe"] = ""
    missing.Push("OCS 창")
  if !HasAnchor("OrderInput")
    missing.Push("처방 입력창")
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

ItemByKey(key) {
  for it in ITEMS
    if it.key = key
      return it
  return {key: key, kind: "anchor", label: key, help: ""}
}

; 화면에 빨간 네모를 잠깐 표시 (찾은 곳 확인용, 누르지 않음)
ShowBox(x, y, w, h, ms := 3000, color := "Red", d := 3) {
  g := Gui("+AlwaysOnTop -Caption +ToolWindow -DPIScale +E0x08000000 +E0x20")
  g.BackColor := color
  iw := w + d, ih := h + d, w := w + d * 2, h := h + d * 2, x := x - d, y := y - d
  WinSetRegion("0-0 " w "-0 " w "-" h " 0-" h " 0-0 " d "-" d " " iw "-" d " " iw "-" ih " " d "-" ih " " d "-" d, g.Hwnd)
  g.Show("NA x" x " y" y " w" w " h" h)
  SetTimer((*) => g.Destroy(), -ms)
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

; 지금 앞에 있는 창이 OCS 메인 화면인지 (팝업이 앞에 있으면 멈춤)
CheckMainWindow(hwnd) {
  if gPractice
    return
  main := MainOcsWindow()
  if main && main != hwnd
    throw Error("OCS의 작은 창(팝업)이 앞에 있어요. 닫고 OCS 메인 화면을 클릭한 뒤 다시 해 주세요.")
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

; 한글 입력 상태를 영문으로 (검색어가 한글로 바뀌지 않도록)
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

; 화면 요소 확인 (UIA 시험): 따로 된 작은 프로그램(uia-check.ahk)을 엶. OCS가 화면 글자를 윈도우 접근성으로 알려 주는지 알아봄
RunUiaCheck() {
  path := A_ScriptDir "\uia-check.ahk"
  if !FileExist(path) {
    MsgBox "uia-check.ahk 파일이 도우미와 같은 폴더에 없어요.", APP_NAME, MB_INFO | MB_TOP
    return
  }
  try {
    Run('"' A_AhkPath '" "' path '"')
  } catch as e {
    MsgBox "화면 요소 확인을 열지 못했어요: " e.Message, APP_NAME, MB_WARN | MB_TOP
  }
}

; 창에서 화면에 보이는 부분 {x, y, w, h}와 창 왼쪽 위 {ox, oy} (최대화 창은 테두리가 화면 밖으로 조금 나감)
WinBox(hwnd) {
  WinGetPos(&x, &y, &w, &h, "ahk_id " hwnd)
  vx := SysGet(76), vy := SysGet(77), vw := SysGet(78), vh := SysGet(79)
  x1 := Max(x, vx), y1 := Max(y, vy), x2 := Min(x + w, vx + vw), y2 := Min(y + h, vy + vh)
  return {x: x1, y: y1, w: x2 - x1, h: y2 - y1, ox: x, oy: y}
}

; 마우스가 그 네모에서 떨어져 있는지 (마우스가 올라가 있으면 강조된 모양이 찍힐 수 있어 그림으로 기억하지 않음)
MouseFar(x, y, w, h, gap := 60) {
  MouseGetPos &mx, &my
  return mx < x - gap || mx > x + w + gap || my < y - gap || my > y + h + gap
}

; =====================================================================
; 화면 글자 인식 (OCR)
; =====================================================================
; OCS 창에 지금 보이는 글자를 읽어 둔 것. 단어: {text, x, y, w, h, cx, cy} (화면 좌표)
; 어두운 바탕의 글씨도 읽도록 두 가지로 읽음: 1 = 흑백, 2 = 흑백 + 색 반전 (필요할 때만)
; rel을 주면 창의 일부만 읽음 (빠름): {x1, y1, x2, y2} = 창 안 비율 0~1
;   wx·wy·ww·wh = 창(화면에 보이는 부분), x·y·w·h = 실제로 읽은 부분
class OcsScreen {
  __New(hwnd, rel := "") {
    b := WinBox(hwnd)
    if b.w < 40 || b.h < 40
      throw Error("OCS 창이 화면에 보이지 않아요.")
    x1 := b.x, y1 := b.y, x2 := b.x + b.w, y2 := b.y + b.h
    this.hwnd := hwnd, this.wx := x1, this.wy := y1, this.ww := b.w, this.wh := b.h
    this.x := x1, this.y := y1, this.w := x2 - x1, this.h := y2 - y1
    if IsObject(rel) {
      cx1 := x1 + Round(this.ww * Max(0, rel.x1)), cy1 := y1 + Round(this.wh * Max(0, rel.y1))
      cx2 := x1 + Round(this.ww * Min(1, rel.x2)), cy2 := y1 + Round(this.wh * Min(1, rel.y2))
      ; 너무 작으면 글자 인식이 안 되므로 최소 크기
      if cx2 - cx1 < 80
        cx1 := Max(x1, cx1 - 40), cx2 := Min(x2, cx2 + 40)
      if cy2 - cy1 < 60
        cy1 := Max(y1, cy1 - 30), cy2 := Min(y2, cy2 + 30)
      this.x := cx1, this.y := cy1, this.w := cx2 - cx1, this.h := cy2 - cy1
    }
    this.cache := Map()
  }
  Words(v) {
    if !this.cache.Has(v)
      this.cache[v] := this.Read(v)
    return this.cache[v]
  }
  Read(v) {
    scale := IsNumber(Cfg["OcrScale"]) ? Number(Cfg["OcrScale"]) : 2
    if scale < 1
      scale := 2
    maxDim := OCR.MaxImageDimension
    scale := Min(scale, (maxDim - 1) / Max(this.w, this.h))
    opts := {scale: scale, grayscale: 1}
    if v = 2
      opts.invertcolors := 1
    if Cfg["OcrLang"] != ""
      opts.lang := Cfg["OcrLang"]
    try {
      res := OCR.FromRect(this.x, this.y, this.w, this.h, opts)
    } catch as e {
      throw Error("화면 글자를 읽지 못했어요: " e.Message "`n`n윈도우 언어에 글자 인식 기능이 없으면 설정 파일에서 OcrLang=en-US 로 바꿔 보세요.")
    }
    words := []
    for w in res.Words
      words.Push({text: Trim(w.Text), x: w.x, y: w.y, w: w.w, h: w.h, cx: w.x + w.w // 2, cy: w.y + w.h // 2})
    return words
  }
}

; 글자 인식에서 흔히 헷갈리는 글자를 숫자로 (O→0, l·I·|→1)
DigitsOf(text) {
  t := RegExReplace(text, "^[\[\(]+|[\]\)\.,:]+$")
  if !RegExMatch(t, "^[0-9OolI|]+$")
    return ""
  fixed := RegExReplace(RegExReplace(t, "[Oo]", "0"), "[lI|]", "1")
  ; 바꾼 글자가 한 개를 넘으면 숫자로 보지 않음
  return StrLen(RegExReplace(t, "\D")) >= StrLen(t) - 1 ? fixed : ""
}
IsPatientId(d) => d != "" && StrLen(d) >= Num("PatientIdMin") && StrLen(d) <= Num("PatientIdMax")

; 지금 열린 환자의 번호: 화면에 두 번 이상 보이는 번호 ([ ]로 감싼 번호는 두 번으로 셈). 애매하면 ""
PatientIdIn(words) {
  score := Map()
  for w in words {
    d := DigitsOf(w.text)
    if !IsPatientId(d)
      continue
    score[d] := (score.Has(d) ? score[d] : 0) + (InStr(w.text, "[") || InStr(w.text, "]") ? 2 : 1)
  }
  best := "", bestScore := 0, tie := false
  for id, s in score {
    if s > bestScore
      best := id, bestScore := s, tie := false
    else if s = bestScore
      tie := true
  }
  return bestScore >= 2 && !tie ? best : ""
}
PatientIdFrom(scr) {
  for v in [1, 2] {
    id := PatientIdIn(scr.Words(v))
    if id != ""
      return id
  }
  return ""
}

; 환자번호를 빨리 읽기: 먼저 지난번에 번호가 보인 좁은 띠만 읽고(처음에는 창 위쪽), 없으면 창 전체
ReadPatientId(hwnd, bandOnly := false) {
  id := PatientIdFrom(OcsScreen(hwnd, gIdBand))
  if id != "" || bandOnly
    return id
  full := OcsScreen(hwnd)
  id := PatientIdFrom(full)
  if id != ""
    LearnIdBand(full, id)
  return id
}

; 번호가 보인 곳들을 둘러싼 띠를 기억 (위아래는 글자 높이 두 배, 좌우는 이름 길이가 달라도 들어오도록 넉넉히)
LearnIdBand(full, id) {
  global gIdBand
  x1 := 1000000000, y1 := 1000000000, x2 := -1000000000, y2 := -1000000000, hmax := 0
  for v in [1, 2] {
    for w in full.Words(v) {
      if DigitsOf(w.text) != id
        continue
      x1 := Min(x1, w.x), y1 := Min(y1, w.y), x2 := Max(x2, w.x + w.w), y2 := Max(y2, w.y + w.h), hmax := Max(hmax, w.h)
    }
    if hmax
      break
  }
  if !hmax
    return
  padY := Max(12, hmax * 2), padX := Max(200, hmax * 12)
  rx1 := Max(0, (x1 - padX - full.wx) / full.ww), ry1 := Max(0, (y1 - padY - full.wy) / full.wh)
  rx2 := Min(1, (x2 + padX - full.wx) / full.ww), ry2 := Min(1, (y2 + padY - full.wy) / full.wh)
  gIdBand := {x1: rx1, y1: ry1, x2: rx2, y2: ry2}
  SaveRel("IdBand", gIdBand)
}

; 기준 글자 (설정 창에서 등록): "글자|가로비율|세로비율|dx|dy|px|py"
;   px·py = 창 왼쪽 위에서 누를 곳까지 거리(픽셀). 명단 버튼처럼 창 가장자리에 붙은 버튼은 글자를 못 읽어도 이 위치로 누름
;   글자가 비어 있으면 위치로만 등록한 것
HasAnchor(key) => Cfg.Has(key) && Cfg[key] != ""
AnchorOf(key) {
  if !HasAnchor(key)
    throw Error("'" ItemByKey(key).label "'이(가) 등록되지 않았어요. 트레이 아이콘 > 설정에서 등록해주세요.")
  f := StrSplit(Cfg[key], "|")
  if f.Length < 5
    throw Error("'" ItemByKey(key).label "' 등록 값이 잘못됐어요. 설정에서 다시 등록해주세요.")
  a := {text: f[1], rx: Number(f[2]), ry: Number(f[3]), dx: Integer(f[4]), dy: Integer(f[5]), px: "", py: ""}
  if f.Length >= 7 && IsInteger(f[6]) && IsInteger(f[7])
    a.px := Integer(f[6]), a.py := Integer(f[7])
  return a
}
SameWord(a, b) => StrReplace(a, " ") = StrReplace(b, " ")

; 기준 글자를 화면에서 찾아 누를 곳 {x, y, word}. 같은 글자가 여러 개면 등록할 때 자리와 가장 가까운 것. 못 찾으면 ""
FindAnchor(scr, key) {
  a := AnchorOf(key)
  if a.text = ""
    return ""
  for v in [1, 2] {
    best := "", bestD := 1000000000
    for w in scr.Words(v) {
      if !SameWord(w.text, a.text)
        continue
      d := ((w.cx - scr.wx) / scr.ww - a.rx) ** 2 + ((w.cy - scr.wy) / scr.wh - a.ry) ** 2
      if d < bestD
        best := w, bestD := d
    }
    if IsObject(best)
      return {x: best.cx + a.dx, y: best.cy + a.dy, word: best, how: "text"}
  }
  return ""
}

; 외래 명단의 '환자번호' 칸 머리글들 (명단이 열려 있지 않으면 빈 배열)
ListHeads(scr) {
  for v in [1, 2] {
    heads := HeadsFromWords(scr.Words(v))
    if heads.Length
      return heads
  }
  return []
}
; 머리글 '환자번호'(띄어 읽히거나 한 글자 틀린 것도). 머리글을 못 읽어도 환자번호가 세로로 3개 이상
; 늘어서 있으면 명단으로 보고, 맨 위 번호 두 줄 위를 머리글 자리로 씀
HeadsFromWords(words) {
  heads := []
  for w in words
    if RegExMatch(w.text, "자\s*번\s*호|환\s*자\s*번")
      heads.Push(w)
  if heads.Length
    return heads
  ids := []
  for w in words
    if IsPatientId(DigitsOf(w.text))
      ids.Push(w)
  for a in ids {
    col := [], ys := Map()
    for b in ids {
      if Abs(b.cx - a.cx) < 30 && !ys.Has(b.cy // 5) {
        col.Push(b)
        ys[b.cy // 5] := true
      }
    }
    if col.Length >= 3 {
      top := col[1]
      for b in col
        if b.y < top.y
          top := b
      return [{text: "환자번호", x: top.x, y: top.y - top.h * 2, w: top.w, h: top.h, cx: top.cx, cy: top.cy - top.h * 2, fake: true}]
    }
  }
  return []
}
; 머리글 아래 같은 칸에 있는 환자번호 단어들
ListIds(scr, heads, v) {
  out := []
  for w in scr.Words(v) {
    d := DigitsOf(w.text)
    if !IsPatientId(d)
      continue
    for hd in heads {
      if w.cy > hd.cy + hd.h // 2 && Abs(w.cx - hd.cx) < Max(hd.w, 60) * 1.5 {
        out.Push({id: d, word: w})
        break
      }
    }
  }
  return out
}
; 명단에서 읽을 세로줄 ('환자번호' 칸 좌우 조금, 머리글부터 창 아래까지, 창 안 비율)
ListColumn(scr, heads) {
  x1 := 1, x2 := 0, y1 := 1
  for hd in heads {
    half := Max(hd.w, 60) * 2
    x1 := Min(x1, (hd.cx - half - scr.wx) / scr.ww)
    x2 := Max(x2, (hd.cx + half - scr.wx) / scr.ww)
    y1 := Min(y1, (hd.y - hd.h - scr.wy) / scr.wh)
  }
  return {x1: Max(0, x1), y1: Max(0, y1), x2: Min(1, x2), y2: 1}
}

; 명단 세로줄을 한 번 읽음: {ids: 보이는 번호들, sig, found: 찾는 번호의 단어 또는 ""}
; 머리글을 이번에 못 읽으면 처음 찾은 머리글 자리를 씀. 번호가 하나도 안 보이면 두 번 더 읽어 보고 멈춤
ListRead(hwnd, col, heads, id) {
  loop 3 {
    scr := OcsScreen(hwnd, col)
    hs := HeadsFromWords(scr.Words(1))
    if !hs.Length
      hs := heads
    ids := ListIds(scr, hs, 1)
    if !ids.Length
      ids := ListIds(scr, hs, 2)
    if ids.Length {
      out := {ids: [], sig: "", found: ""}
      for x in ids {
        out.ids.Push(x.id)
        if SameId(x.id, id)
          out.found := x.word
      }
      out.sig := Join(out.ids, ",")
      return out
    }
    AbortableSleep(400)
  }
  throw Error("외래 명단의 환자번호를 읽지 못했어요 (명단이 닫혔거나 가려진 것 같아요). 처방은 넣지 않았어요.`n트레이 아이콘 > 화면 글자 읽기 시험으로 명단의 번호(파랑)가 잡히는지 확인해주세요.")
}

Overlaps(a, b) {
  for x in a
    for y in b
      if x = y
        return true
  return false
}

; 휠을 조금씩 굴려 가며 찾음: 아래로 끝까지, 없으면 위로 끝까지.
; 굴린 뒤 보이는 번호가 앞 화면과 하나도 안 겹치면(줄을 건너뛰었을 수 있음) 되돌리고 더 조금씩 굴림
ScrollFind(hwnd, col, heads, id, gx, gy, first) {
  for dir in ["Down", "Up"] {
    prev := first, step := Max(1, Num("ListScroll")), pages := 0
    while ++pages <= Num("ListMaxPages") {
      Wheel(hwnd, col, gx, gy, dir, step)
      cur := ListRead(hwnd, col, heads, id)
      if IsObject(cur.found)
        return cur.found
      if cur.sig = prev.sig  ; 더 움직이지 않음 = 목록 끝
        break
      if step > 1 && prev.ids.Length >= 3 && !Overlaps(prev.ids, cur.ids) {
        Wheel(hwnd, col, gx, gy, dir = "Down" ? "Up" : "Down", step)
        step := Max(1, step // 2)
        cur := ListRead(hwnd, col, heads, id)
        if IsObject(cur.found)
          return cur.found
      }
      prev := cur
    }
    first := prev
  }
  return ""
}
; 휠을 굴리고 명단 칸이 바뀌어 멈출 때까지 (끝이라 안 바뀌면 0.35초)
Wheel(hwnd, col, gx, gy, dir, step) {
  watch := ChangeWatch([RelRect(hwnd, col)])
  MouseMove gx, gy, 0
  Send "{Wheel" dir " " step "}"
  WaitSettle(watch, 60, 350, 100)
}

; =====================================================================
; UIA (윈도우 접근성, 가장 빠름): OCS(HIS.exe, WPF)가 알려 주는 칸 이름표로 바로 찾음
;   ('화면 요소 확인' 결과) 처방 입력창 = 'ucOrderSearchList' 안의 'txtSearch'
;   그 입력창이 들어 있는 환자 칸(목록 항목)의 이름 = "… [환자번호] 이름 (F/45세)" → [ ] 안의 번호
;   Patient List 버튼 = 'btnPatient', 외래 명단 = 'ucSavePatientManagement' 안의 'ListControlContainer'
;   (명단 줄 내용은 알려 주지 않으므로 명단에서 번호 찾기는 글자 인식)
; 못 찾거나 UIA를 쓸 수 없으면 ""를 돌려주고, 부르는 쪽이 그림 찾기·글자 인식으로 넘어감. UseUia=0 이면 쓰지 않음
; =====================================================================
UiaRoot(hwnd) {
  static roots := Map(), logged := false
  if Cfg["UseUia"] != "1" || gPractice || !hwnd
    return ""
  if roots.Has(hwnd)
    return roots[hwnd]
  try {
    root := UIA.ElementFromHandle(hwnd, , 0)
  } catch as e {
    if !logged
      Log("UIA를 쓰지 못해 그림·글자 인식으로 찾아요: " e.Message)
    logged := true
    return ""
  }
  roots[hwnd] := root
  return root
}

UiaFindAll(el, id) {
  try return el.FindAll({AutomationId: id})
  return []
}

; 화면에 보이는 요소의 네모 {x, y, w, h, cx, cy} (안 보이면 "")
UiaRect(el) {
  try {
    if el.IsOffscreen
      return ""
    r := el.BoundingRectangle
    if r.r - r.l < 4 || r.b - r.t < 4
      return ""
    return {x: r.l, y: r.t, w: r.r - r.l, h: r.b - r.t, cx: (r.l + r.r) // 2, cy: (r.t + r.b) // 2}
  }
  return ""
}

UiaValue(el) {
  try {
    v := el.GetPropertyValue(UIA.Property.Value)
    return IsObject(v) ? "" : Trim(v)
  }
  return ""
}

; 그 요소가 들어 있는 환자 칸의 환자번호 (칸 이름의 [ ] 안 번호). 모르면 ""
UiaPatientOf(el) {
  p := el
  loop 15 {
    try p := p.Parent
    catch
      return ""
    try {
      if RegExMatch(p.Name, "\[(\d{" Num("PatientIdMin") "," Num("PatientIdMax") "})\]", &m)
        return m[1]
    }
  }
  return ""
}

; 화면에 보이는 처방 입력창들 [{x, y (누를 곳), el, rect, id (그 환자 칸의 환자번호), how}]. UIA를 못 쓰면 ""
UiaOrderInputs(hwnd) {
  root := UiaRoot(hwnd)
  if !IsObject(root)
    return ""
  out := []
  for lst in UiaFindAll(root, "ucOrderSearchList") {
    try box := lst.FindFirst({AutomationId: "txtSearch"})
    catch
      continue
    r := UiaRect(box)
    if !IsObject(r)
      continue
    ; 입력창 왼쪽 부분을 누름 (오른쪽 끝에는 지우기(X) 단추가 있음)
    out.Push({x: r.x + Min(80, r.w // 3), y: r.cy, el: box, rect: r, id: UiaPatientOf(box), how: "uia"})
  }
  return out
}

; 지금 보이는 처방 입력창 하나 (환자번호까지 읽힌 것). 다른 환자 칸이 둘 이상 보이거나 못 찾으면 ""
UiaCurrentInput(hwnd) {
  ins := UiaOrderInputs(hwnd)
  if !IsObject(ins)
    return ""
  found := ""
  for x in ins {
    if x.id = ""
      continue
    if !IsObject(found)
      found := x
    else if !SameId(found.id, x.id)
      return ""
  }
  return found
}

; 명단에서 연 환자의 처방 입력창이 보일 때까지 (최대 ChartOpenWait + 3초)
; UIA를 못 쓰거나 입력창이 하나도 안 보이면 "" (글자 인식으로 확인), 다른 환자만 보이면 멈춤
UiaWaitPatient(hwnd, id) {
  if !IsObject(UiaRoot(hwnd))
    return ""
  deadline := A_TickCount + Num("ChartOpenWait") + 3000, seen := ""
  loop {
    if WinActive("ahk_id " hwnd) {
      ins := UiaOrderInputs(hwnd)
      if IsObject(ins) {
        for x in ins {
          if SameId(x.id, id)
            return x
          if x.id != ""
            seen := x.id
        }
      }
    }
    if A_TickCount > deadline
      break
    AbortableSleep(120)
  }
  if seen != ""
    throw Error("OCS에 " id " 환자 화면이 열리지 않았어요 (지금 보이는 환자번호: " seen "). 처방은 넣지 않았어요.")
  return ""
}

; Patient List 버튼 {x, y, rect, word, how} (못 찾으면 "")
UiaButton(hwnd) {
  root := UiaRoot(hwnd)
  if !IsObject(root)
    return ""
  for el in UiaFindAll(root, "btnPatient")
    if IsObject(r := UiaRect(el))
      return {x: r.cx, y: r.cy, rect: r, word: "", how: "uia"}
  return ""
}

; 외래 명단: {open: true, rect: 명단 칸 네모} / {open: false} / UIA로 알 수 없으면 ""
UiaListState(hwnd) {
  root := UiaRoot(hwnd)
  if !IsObject(root)
    return ""
  for pm in UiaFindAll(root, "ucSavePatientManagement") {
    if !IsObject(UiaRect(pm))
      continue
    for el in UiaFindAll(pm, "ListControlContainer")
      if IsObject(r := UiaRect(el))
        return {open: true, rect: r}
  }
  ; 명단 칸이 안 보이는데 Patient List 버튼은 보이면 '닫힘'. 버튼도 못 찾으면 이 화면 구성을 모르는 것
  return IsObject(UiaButton(hwnd)) ? {open: false} : ""
}

; Patient List 버튼을 누른 뒤 명단 칸이 보일 때까지 (최대 ListOpenWait + 3초). 명단 칸 네모 또는 ""
UiaWaitListOpen(hwnd) {
  deadline := A_TickCount + Num("ListOpenWait") + 3000
  loop {
    ls := UiaListState(hwnd)
    if IsObject(ls) && ls.open
      return ls.rect
    if A_TickCount > deadline
      return ""
    AbortableSleep(100)
  }
}

; 입력창을 누른 뒤 글자 커서가 들어갔는지 (CaretCheck=0 이면 확인하지 않고 WaitAfterClick만 기다림)
UiaWaitFocus(el) {
  if Cfg["CaretCheck"] != "1" {
    AbortableSleep(Num("WaitAfterClick"))
    return
  }
  start := A_TickCount
  AbortableSleep(50)
  loop {
    try {
      if el.HasKeyboardFocus
        return
    }
    if A_TickCount - start > Num("WaitAfterClick") + 700
      throw Error("처방 입력창에 커서가 들어가지 않았어요 (다른 칸이 선택됐거나 창이 가려짐). 이 처방은 넣지 않았어요.`n(이 확인이 계속 잘못 걸리면 설정 파일에서 CaretCheck=0)")
    AbortableSleep(30)
  }
}

; 처방을 고른 뒤 입력창이 비워질 때까지 (최소 minMs). 최대 maxMs 안에 비워지면 true
UiaWaitCleared(el, minMs, maxMs) {
  start := A_TickCount
  loop {
    if gAbort
      throw Error("Esc를 눌러 멈췄어요.")
    empty := UiaValue(el) = ""
    if empty && A_TickCount - start >= minMs
      return true
    if A_TickCount - start >= maxMs
      return empty
    Sleep 30
  }
}

; =====================================================================
; 그림 찾기 (UIA 다음으로 빠름) · 화면 변화 감지
; =====================================================================
; 사람이 아이콘 모양을 보고 바로 찾듯이, 등록할 때(또는 처음 글자로 찾았을 때) 찍어 둔 작은 그림을 화면에서 찾음
;   img\<항목>.bmp + 설정 파일 [Images] <항목>=가로|세로|누를 곳 x|y|창 왼쪽 위에서 x|y|창 안 비율 x|y
;   항목: OrderInput(처방 입력창의 기준 글자), ListButton(Patient List 버튼), ListHead(외래 명단 '환자번호' 머리글)

; 화면 (x, y, w, h)를 복사해 fn(bits, stride)에 넘김. bits는 아래 줄부터(BMP 파일과 같은 순서), fn이 끝나면 지워짐
WithScreenBits(x, y, w, h, bpp, fn) {
  bi := Buffer(40, 0)
  NumPut("UInt", 40, "Int", w, "Int", h, "UShort", 1, "UShort", bpp, bi)
  sdc := DllCall("GetDC", "Ptr", 0, "Ptr")
  mdc := DllCall("CreateCompatibleDC", "Ptr", sdc, "Ptr")
  bits := 0
  hbm := DllCall("CreateDIBSection", "Ptr", mdc, "Ptr", bi, "UInt", 0, "Ptr*", &bits, "Ptr", 0, "UInt", 0, "Ptr")
  old := hbm ? DllCall("SelectObject", "Ptr", mdc, "Ptr", hbm, "Ptr") : 0
  try {
    if !hbm || !bits
      throw Error("화면을 복사하지 못했어요.")
    DllCall("BitBlt", "Ptr", mdc, "Int", 0, "Int", 0, "Int", w, "Int", h, "Ptr", sdc, "Int", x, "Int", y, "UInt", 0x00CC0020)
    return fn(bits, (w * bpp // 8 + 3) & ~3)
  } finally {
    if old
      DllCall("SelectObject", "Ptr", mdc, "Ptr", old, "Ptr")
    if hbm
      DllCall("DeleteObject", "Ptr", hbm)
    DllCall("DeleteDC", "Ptr", mdc)
    DllCall("ReleaseDC", "Ptr", 0, "Ptr", sdc)
  }
}

; 화면 (x, y, w, h)의 모양 요약값 (조금이라도 바뀌면 달라짐)
RegionCrc(x, y, w, h) => WithScreenBits(x, y, w, h, 32, (bits, stride) => DllCall("ntdll\RtlComputeCrc32", "UInt", 0, "Ptr", bits, "UInt", stride * h, "UInt"))

; 화면 (x, y, w, h)를 BMP 그림 파일로 저장. 거의 한 가지 색이면(찾을 수 없는 그림) 저장하지 않고 false
SaveScreenBmp(path, x, y, w, h) {
  return WithScreenBits(x, y, w, h, 24, SaveBits)
  SaveBits(bits, stride) {
    lo := 255, hi := 0
    loop h {
      row := bits + (A_Index - 1) * stride
      loop w * 3 {
        v := NumGet(row, A_Index - 1, "UChar")
        lo := Min(lo, v), hi := Max(hi, v)
      }
    }
    if hi - lo < 60
      return false
    size := stride * h
    buf := Buffer(54 + size, 0)
    NumPut("UShort", 0x4D42, "UInt", 54 + size, "UInt", 0, "UInt", 54, buf, 0)
    NumPut("UInt", 40, "Int", w, "Int", h, "UShort", 1, "UShort", 24, "UInt", 0, "UInt", size, "Int", 2835, "Int", 2835, buf, 14)
    DllCall("RtlMoveMemory", "Ptr", buf.Ptr + 54, "Ptr", bits, "UPtr", size)
    f := FileOpen(path, "w", "CP0")
    f.RawWrite(buf)
    f.Close()
    return true
  }
}

ImgPath(key) => IMG_DIR "\" key ".bmp"
HasImage(key) => IsObject(ImageOf(key))

; 등록된 그림 정보 (없거나 그림 찾기를 끈 경우 "")
ImageOf(key) {
  if Cfg["ImageFind"] != "1" || !FileExist(ImgPath(key))
    return ""
  f := StrSplit(Trim(IniRead(INI_PATH, "Images", key, "")), "|")
  if f.Length < 8
    return ""
  for v in f
    if !IsNumber(v)
      return ""
  im := {key: key, file: ImgPath(key), w: Integer(f[1]), h: Integer(f[2]), ox: Integer(f[3]), oy: Integer(f[4])}
  im.px := Integer(f[5]), im.py := Integer(f[6]), im.rx := Number(f[7]), im.ry := Number(f[8])
  return im
}

ForgetImage(key) {
  try IniDelete(INI_PATH, "Images", key)
  try FileDelete(ImgPath(key))
}

; 네모 r = [x1, y1, x2, y2](화면 좌표) 안에서 그림이 보이는 곳들 (반 넘게 겹치는 곳은 하나로, 최대 4곳)
ImageAll(im, r) {
  hits := [], todo := [r], hw := Max(1, im.w // 2), hh := Max(1, im.h // 2), tries := 0
  opt := "*" Num("ImageVariation") " " im.file
  while todo.Length && hits.Length < 4 && ++tries <= 20 {
    q := todo.RemoveAt(1)
    x1 := Round(q[1]), y1 := Round(q[2]), x2 := Round(q[3]), y2 := Round(q[4])
    if x2 - x1 + 1 < im.w || y2 - y1 + 1 < im.h
      continue
    try {
      found := ImageSearch(&fx, &fy, x1, y1, x2, y2, opt)
    } catch as e {
      Log("그림 찾기 오류 (" im.key "): " e.Message)
      return []
    }
    if !found
      continue
    hits.Push({x: fx, y: fy})
    ; 남은 자리: 같은 줄 오른쪽, 조금 아래 줄 왼쪽, 그 아래 전체 (찾은 곳과 반 넘게 겹치는 자리는 뺌)
    todo.Push([fx + hw, fy, x2, Min(y2, fy + hh + im.h - 2)])
    todo.Push([x1, fy + 1, Min(x2, fx - hw + im.w - 1), Min(y2, fy + hh + im.h - 2)])
    todo.Push([x1, fy + hh, x2, y2])
  }
  return hits
}

; 그림을 OCS 창에서 찾기: 등록 자리 근처 → 창 안 비율로 본 자리 근처 → 창 전체. 여러 곳이면 등록 자리와 가장 가까운 곳
; 찾으면 {x, y: 누를 곳, ix, iy: 그림 왼쪽 위, im, how: "image"}. 없거나 비슷한 곳이 너무 많으면 ""
FindImage(hwnd, key) {
  im := ImageOf(key)
  if !IsObject(im)
    return ""
  b := WinBox(hwnd)
  if b.w < 40 || b.h < 40
    return ""
  ex := b.ox + im.px, ey := b.oy + im.py
  fx := b.x + Round(im.rx * b.w), fy := b.y + Round(im.ry * b.h)
  mx := Round(b.w * 0.15), my := Round(b.h * 0.1)
  for q in [[ex - 60, ey - 40, ex + im.w + 60, ey + im.h + 40], [fx - mx, fy - my, fx + im.w + mx, fy + im.h + my], [b.x, b.y, b.x + b.w - 1, b.y + b.h - 1]] {
    hits := ImageAll(im, [Max(q[1], b.x), Max(q[2], b.y), Min(q[3], b.x + b.w - 1), Min(q[4], b.y + b.h - 1)])
    if !hits.Length
      continue
    if hits.Length >= 4
      return ""
    best := hits[1], bestD := 1000000000
    for p in hits {
      d := Min((p.x - ex) ** 2 + (p.y - ey) ** 2, (p.x - fx) ** 2 + (p.y - fy) ** 2)
      if d < bestD
        best := p, bestD := d
    }
    return {x: best.x + im.ox, y: best.y + im.oy, ix: best.x, iy: best.y, im: im, how: "image"}
  }
  return ""
}

; 지금 화면의 (x, y, w, h)를 그 항목의 그림으로 기억. (cx, cy) = 누를 곳
; 창 전체에서 1~3곳에만 보이는 그림만 기억 (너무 흔하면 버림). 돌려주는 값: 보이는 곳 수 (0 = 기억하지 않음)
LearnImage(hwnd, key, x, y, w, h, cx, cy) {
  if Cfg["ImageFind"] != "1"
    return 0
  x := Round(x), y := Round(y), w := Round(w), h := Round(h)
  b := WinBox(hwnd)
  if w < 8 || h < 8 || x < b.x || y < b.y || x + w > b.x + b.w || y + h > b.y + b.h
    return 0
  tmp := IMG_DIR "\" key "-new.bmp"
  try {
    DirCreate IMG_DIR
    if !SaveScreenBmp(tmp, x, y, w, h)
      return 0
    im := {key: key, file: tmp, w: w, h: h, ox: Round(cx) - x, oy: Round(cy) - y, px: x - b.ox, py: y - b.oy}
    im.rx := Round((x - b.x) / b.w, 4), im.ry := Round((y - b.y) / b.h, 4)
    n := ImageAll(im, [b.x, b.y, b.x + b.w - 1, b.y + b.h - 1]).Length
    if n < 1 || n > 3 {
      FileDelete tmp
      return 0
    }
    FileMove tmp, ImgPath(key), 1
    IniWrite(Join([w, h, im.ox, im.oy, im.px, im.py, im.rx, im.ry], "|"), INI_PATH, "Images", key)
    Log("그림 기억: " key)
    return n
  } catch as e {
    Log("그림 기억 못 함 (" key "): " e.Message)
    try FileDelete tmp
    return 0
  }
}

; 명단 머리글을 그림으로 찾았을 때 머리글 글자 자리 (글자 인식 결과와 같은 모양)
HeadOfImage(hit) {
  x := hit.ix + HEAD_PAD, y := hit.iy + HEAD_PAD, w := hit.im.w - HEAD_PAD * 2, h := hit.im.h - HEAD_PAD * 2
  return {text: "환자번호", x: x, y: y, w: w, h: h, cx: x + w // 2, cy: y + h // 2}
}
; 글자로 찾은 진짜 머리글이면 다음부터 그림으로 바로 찾도록 기억 (기억했으면 0이 아닌 값)
LearnHead(hwnd, hd) {
  if !IsObject(hd) || hd.HasOwnProp("fake") || !MouseFar(hd.x - HEAD_PAD, hd.y - HEAD_PAD, hd.w + HEAD_PAD * 2, hd.h + HEAD_PAD * 2, 10)
    return 0
  return LearnImage(hwnd, "ListHead", hd.x - HEAD_PAD, hd.y - HEAD_PAD, hd.w + HEAD_PAD * 2, hd.h + HEAD_PAD * 2, hd.cx, hd.cy)
}
; 찾은 환자번호 단어 바로 위의 머리글
HeadAbove(heads, w) {
  best := ""
  for hd in heads
    if hd.cy < w.cy && Abs(w.cx - hd.cx) < Max(hd.w, 60) * 1.5 && (!IsObject(best) || hd.cy > best.cy)
      best := hd
  return best
}

; 화면 변화 감시: 네모들({x, y, w, h}, 화면 좌표)의 모양 요약값을 처음과 비교
class ChangeWatch {
  __New(rects) {
    this.rects := []
    for r in rects
      if r.w >= 4 && r.h >= 4
        this.rects.Push({x: Round(r.x), y: Round(r.y), w: Round(r.w), h: Round(r.h)})
    this.base := this.Hash()
  }
  Hash() {
    s := ""
    for r in this.rects {
      try s .= RegionCrc(r.x, r.y, r.w, r.h) ","
      catch
        s .= "?,"
    }
    return s
  }
}

; 처방 입력창 둘레 (입력창 줄은 뺌: 글자 커서가 깜박여서). 후보 목록이 입력창 아래나 위에 뜨고 닫히는 것을 봄
InputWatch(hwnd, pt) {
  b := WinBox(hwnd)
  x1 := Max(b.x, pt.x - 350), x2 := Min(b.x + b.w, pt.x + 650)
  up1 := Max(b.y, pt.y - 320), up2 := pt.y - 24
  dn1 := pt.y + 24, dn2 := Min(b.y + b.h, pt.y + 420)
  return ChangeWatch([{x: x1, y: up1, w: x2 - x1, h: up2 - up1}, {x: x1, y: dn1, w: x2 - x1, h: dn2 - dn1}])
}
; 창 안 비율 네모 → 화면 좌표 네모
RelRect(hwnd, r) {
  b := WinBox(hwnd)
  return {x: b.x + b.w * r.x1, y: b.y + b.h * r.y1, w: b.w * (r.x2 - r.x1), h: b.h * (r.y2 - r.y1)}
}

; 화면이 바뀐 뒤 stable 밀리초 동안 그대로면 끝 (그래도 최소 minMs는 기다림).
; 끝내 안 바뀌거나 계속 바뀌면 maxMs까지 기다림(예전의 정해진 기다림과 같음). AdaptiveWait=0 이면 늘 maxMs
WaitSettle(watch, minMs, maxMs, stable := 0) {
  if Cfg["AdaptiveWait"] != "1" || !IsObject(watch) {
    AbortableSleep(maxMs)
    return maxMs
  }
  stable := stable ? stable : Num("StableMs")
  start := A_TickCount, last := watch.base, changedAt := 0
  loop {
    if gAbort
      throw Error("Esc를 눌러 멈췄어요.")
    h := watch.Hash()
    now := A_TickCount
    if h != last
      last := h, changedAt := now
    if changedAt && now - changedAt >= stable && now - start >= minMs
      return now - start
    if now - start >= maxMs
      return now - start
    Sleep 30
  }
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
; 지금 화면의 환자번호 (연습 모드에서는 직접 입력)
ReadPatientNo(hwnd) {
  if gPractice {
    r := InputBox("연습 모드: OCS 화면에 열린 환자번호라고 생각하고 번호를 입력하세요.", APP_NAME, "w360 h140")
    return r.Result = "OK" ? RegExReplace(r.Value, "\D") : ""
  }
  return ReadPatientId(hwnd)
}

CheckCaretNear(p) {
  if CaretGetPos(&x, &y) {
    if Abs(x - p.x) > 250 || Abs(y - p.y) > 60
      throw Error("처방 입력창에 커서가 들어가지 않은 것 같아요. '처방 입력창'을 다시 등록해주세요.`n(이 확인이 계속 잘못 걸리면 설정 파일에서 CaretCheck=0)")
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

; 처방 입력창 찾기 (그 환자의 첫 처방 전에 한 번. 넣는 동안에는 화면 배치가 그대로이므로 같은 자리를 씀)
; 그림으로 먼저(가장 빠름) → 기준 글자를 등록 자리 근처만 읽어서 → 창 전체
FindOrderInput(hwnd) {
  hit := FindImage(hwnd, "OrderInput")
  if IsObject(hit)
    return hit
  a := AnchorOf("OrderInput")
  pt := FindAnchor(OcsScreen(hwnd, {x1: a.rx - 0.15, y1: a.ry - 0.1, x2: a.rx + 0.15, y2: a.ry + 0.1}), "OrderInput")
  if !IsObject(pt)
    pt := FindAnchor(OcsScreen(hwnd), "OrderInput")
  if !IsObject(pt)
    throw Error("처방 입력창을 화면에서 찾지 못했어요 (기준 글자 '" a.text "').`n오더발행 화면이 보이는지, 입력창이 비어 있는지 확인해주세요. 아무것도 넣지 않았어요.")
  ; 다음부터는 그림으로 바로 찾도록 기준 글자 모양을 기억 (마우스가 올라가 있지 않을 때만)
  w := pt.word
  if MouseFar(w.x - 3, w.y - 3, w.w + 6, w.h + 6)
    LearnImage(hwnd, "OrderInput", w.x - 3, w.y - 3, w.w + 6, w.h + 6, pt.x, pt.y)
  return pt
}

; 처방을 한 줄씩 입력: 입력창 클릭 → 검색어 → (Enter) → ↓ N번 → Enter
; 입력창을 지우려고 Ctrl+A나 Delete를 쓰지 않는다 (OCS에서 Delete는 D/C).
; 기다리는 시간: 후보 목록이 뜨고(검색어 뒤) 닫히는(Enter 뒤) 화면 변화를 보고, 멈추면 바로 다음으로 (WaitSettle)
EnterOrders(hwnd, orders, pt) {
  done := 0, t0 := A_TickCount
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
      byUia := pt.HasOwnProp("el")
      Click pt.x " " pt.y
      if byUia {
        ; UIA: 입력창에 커서가 들어갔는지 바로 확인하고, 비어 있는지도 확인 (지우는 키는 쓰지 않으므로 남은 글자가 있으면 멈춤)
        UiaWaitFocus(pt.el)
        if UiaValue(pt.el) != ""
          throw Error("처방 입력창에 글자가 남아 있어요 (앞 처방이 들어가지 않았을 수 있어요). 입력창과 오더 목록을 확인해주세요.`n도우미는 입력창을 지우는 키를 쓰지 않아요. 이 처방은 넣지 않았어요.")
      } else {
        AbortableSleep(Num("WaitAfterClick"))
        if Cfg["CaretCheck"] = "1"
          CheckCaretNear(pt)
      }
      StepCheck(hwnd)
      ImeOff(hwnd)
      watch := InputWatch(hwnd, pt)
      TypeSearch(o.text)
      WaitSettle(watch, Num("WaitMinAfterType"), Num("WaitAfterType"))
      if Cfg["EnterToSearch"] = "1" {
        StepCheck(hwnd)
        watch := InputWatch(hwnd, pt)
        Send "{Enter}"
        WaitSettle(watch, Num("WaitMinAfterType"), Num("WaitAfterSearch"))
      }
      loop o.down {
        StepCheck(hwnd)
        Send "{Down}"
        AbortableSleep(Num("DownDelay"))
      }
      StepCheck(hwnd)
      watch := byUia ? "" : InputWatch(hwnd, pt)
      Send "{Enter}"
      done++
      Log("  처방 입력: " o.label)
      cleared := true
      if byUia  ; UIA: 처방이 들어가면 입력창이 비워짐 → 비워지는 대로 다음으로 (최소 시간은 기다림)
        cleared := UiaWaitCleared(pt.el, Num("WaitMinAfterEnter"), Num("WaitAfterEnter"))
      else
        WaitSettle(watch, Num("WaitMinAfterEnter"), Num("WaitAfterEnter"))
      if !WinActive("ahk_id " hwnd)
        throw Error("'" o.label "'을 넣은 뒤 새 창이 떴어요. 창 내용을 확인해주세요.")
      if !cleared
        throw Error("'" o.label "'을 고른 뒤 입력창이 비워지지 않았어요. 처방이 들어갔는지 오더 목록을 확인해주세요.")
    }
  } catch as e {
    MouseMove mx, my, 0
    return {count: done, error: e.Message}
  }
  MouseMove mx, my, 0
  if done && !gPractice
    Log("  입력 " done "건 " Round((A_TickCount - t0) / 1000, 1) "초")
  return {count: done, error: ""}
}

; 명단 모드: OCS 외래 명단에서 환자번호를 찾아 그 줄을 더블클릭 (검색칸은 쓰지 않음)
; 처음 한 번은 창 전체를 읽어 '환자번호' 칸 자리를 찾고, 그 뒤로는 그 세로줄만 읽음 (빠름)
OpenFromList(hwnd, id) {
  global gListCol
  if gPractice {
    SendText "`n[환자 열기] OCS 외래 명단에서 " id " 줄을 찾아 더블클릭`n"
    return
  }
  t0 := A_TickCount
  heads := [], byImage := false
  full := OcsScreen(hwnd)  ; 창 전체 (글자는 필요할 때만 읽음)
  ls := UiaListState(hwnd)
  if IsObject(ls) {
    ; UIA로 명단이 열렸는지 바로 앎: 열려 있으면 머리글을 찾고, 닫혀 있거나 머리글이 안 보이면 Patient List를 눌러 엶
    if ls.open
      heads := WaitHeads(hwnd, ls.rect, 1000, &byImage)
    if !heads.Length {
      if !ClickListButton(hwnd, full)
        throw Error("외래 명단이 열려 있지 않고, Patient List 버튼을 누르지 못했어요. 처방은 넣지 않았어요.")
      lr := UiaWaitListOpen(hwnd)
      if !IsObject(lr)
        throw Error("Patient List 버튼을 눌렀는데 외래 명단이 열리지 않았어요. 처방은 넣지 않았어요.")
      heads := WaitHeads(hwnd, lr, Num("ListOpenWait") + 3000, &byImage)
      if !heads.Length
        throw Error("외래 명단은 열렸는데 '환자번호' 칸을 읽지 못했어요. 처방은 넣지 않았어요.`n화면 글자 읽기 시험에서 명단의 파랑 네모가 잡히는지 확인해주세요.")
    }
  } else {
    ; UIA로 모르면: 머리글 그림(가장 빠름) → 지난번 '환자번호' 칸 자리만 글자로 읽기
    hit := FindImage(hwnd, "ListHead")
    if IsObject(hit)
      heads := [HeadOfImage(hit)], byImage := true
    else if IsObject(gListCol)
      heads := HeadsIn(OcsScreen(hwnd, gListCol))
    ; 머리글 그림을 아직 모르면 창 전체를 읽어 명단이 열려 있는지 확인 (처음 한 번만 느림)
    if !heads.Length && !HasImage("ListHead")
      heads := ListHeads(full)
  }
  if !heads.Length {
    ; 명단이 닫혀 있음 (다음 환자로 넘어갈 때는 보통 진료 화면) → Patient List 버튼을 눌러 엶
    watch := ChangeWatch([{x: full.wx, y: full.wy, w: full.ww, h: full.wh}])
    if !ClickListButton(hwnd, full)
      throw Error("외래 명단이 열려 있지 않고, '외래 명단 여는 버튼'(Patient List)을 누르지 못했어요.`n트레이 아이콘 > 설정에서 '외래 명단 여는 버튼'을 등록해주세요 (그 버튼 위에 마우스를 올리고 F8). 처방은 넣지 않았어요.")
    heads := WaitListOpen(hwnd, watch, &byImage)
    if !heads.Length
      throw Error("Patient List 버튼을 눌렀는데 외래 명단이 보이지 않아요 (환자번호 칸을 읽지 못함). 처방은 넣지 않았어요.`n명단이 열렸다면 화면 글자 읽기 시험에서 파랑 네모가 잡히는지 확인해주세요.")
  }
  col := ListColumn(full, heads)
  if !IsObject(gListCol) || Abs(col.x1 - gListCol.x1) + Abs(col.y1 - gListCol.y1) + Abs(col.x2 - gListCol.x2) > 0.01 {
    gListCol := col
    SaveRel("ListCol", col)
  }
  ; 휠은 명단 줄 위(머리글 조금 아래)에서 굴림
  gx := heads[1].cx, gy := heads[1].cy + heads[1].h * 3
  cur := ListRead(hwnd, col, heads, id)
  w := IsObject(cur.found) ? cur.found : ScrollFind(hwnd, col, heads, id, gx, gy, cur)
  if !IsObject(w)
    throw Error("OCS 외래 명단에서 " id " 환자를 찾지 못했어요 (명단 위아래 끝까지 찾아봄). 처방은 넣지 않았어요.`n명단 조건(날짜·진료의)이 맞는지 확인해주세요.")
  if !byImage
    LearnHead(hwnd, HeadAbove(heads, w))
  Log("  명단에서 찾음 " Round((A_TickCount - t0) / 1000, 1) "초" (byImage ? " (머리글 그림)" : ""))
  Click w.cx " " w.cy " 2"
}

HeadsIn(scr) => HeadsFromWords(scr.Words(1))

; 명단(UIA로 안 명단 칸 lr 안)의 '환자번호' 머리글: 그림 → 지난번 칸 자리 → 명단 칸 글자 인식, 최대 ms 동안 다시 봄
WaitHeads(hwnd, lr, ms, &byImage) {
  deadline := A_TickCount + ms
  loop {
    hit := FindImage(hwnd, "ListHead")
    if IsObject(hit) {
      byImage := true
      return [HeadOfImage(hit)]
    }
    if IsObject(gListCol) {
      heads := HeadsIn(OcsScreen(hwnd, gListCol))
      if heads.Length
        return heads
    }
    b := WinBox(hwnd)
    heads := ListHeads(OcsScreen(hwnd, {x1: (lr.x - b.x) / b.w, y1: (lr.y - b.y) / b.h, x2: (lr.x + lr.w - b.x) / b.w, y2: (lr.y + lr.h - b.y) / b.h}))
    if heads.Length || A_TickCount > deadline
      return heads
    AbortableSleep(200)
  }
}

; 버튼을 누른 뒤 명단이 뜰 때까지 확인 (최대 ListOpenWait + 3초)
; 머리글 그림을 알면 그림으로 자주 확인(빠름), 모르면 화면이 바뀌어 멈춘 뒤 글자로 읽음
WaitListOpen(hwnd, watch, &byImage) {
  start := A_TickCount, deadline := start + Num("ListOpenWait") + 3000
  if HasImage("ListHead") {
    while A_TickCount - start < Num("ListOpenWait") + 1000 {
      hit := FindImage(hwnd, "ListHead")
      if IsObject(hit) {
        byImage := true
        return [HeadOfImage(hit)]
      }
      AbortableSleep(80)
    }
  } else {
    WaitSettle(watch, 200, Num("ListOpenWait"))
  }
  loop {
    heads := ListHeads(OcsScreen(hwnd))
    if heads.Length || A_TickCount > deadline
      return heads
    AbortableSleep(300)
  }
}

; '외래 명단 여는 버튼'(Patient List)의 누를 곳: UIA(btnPatient) → 그림(아이콘 모양) → 기준 글자(등록 자리 근처 → 창 전체) → 창 왼쪽 위 기준 위치
ListButtonPoint(hwnd, full := "") {
  u := UiaButton(hwnd)
  if IsObject(u)
    return u
  hit := FindImage(hwnd, "ListButton")
  if IsObject(hit)
    return hit
  if !HasAnchor("ListButton")
    return ""
  a := AnchorOf("ListButton")
  if a.text != "" {
    pt := FindAnchor(OcsScreen(hwnd, {x1: a.rx - 0.15, y1: a.ry - 0.1, x2: a.rx + 0.15, y2: a.ry + 0.1}), "ListButton")
    if !IsObject(pt) && IsObject(full)
      pt := FindAnchor(full, "ListButton")
    if IsObject(pt)
      return pt
  }
  if a.px = ""
    return ""
  WinGetPos(&wx, &wy, , , "ahk_id " hwnd)
  return {x: wx + a.px, y: wy + a.py, word: "", how: "pos"}
}
ClickListButton(hwnd, full := "") {
  pt := ListButtonPoint(hwnd, full)
  if !IsObject(pt)
    return false
  Click pt.x " " pt.y
  return true
}

; 명단에서 연 뒤 그 환자 화면이 맞는지: 화면이 바뀌는 대로 바로 확인 (최대 ChartOpenWait + 3초)
WaitPatientScreen(hwnd, id) {
  AbortableSleep(250)
  start := A_TickCount, deadline := start + Num("ChartOpenWait") + 3000
  no := ""
  while A_TickCount < deadline {
    if WinActive("ahk_id " hwnd) {
      ; 처음에는 번호가 보이던 띠만(빠름), 그래도 안 보이면 창 전체도 (번호 자리가 바뀌었을 수 있음)
      no := ReadPatientId(hwnd, A_TickCount - start < Num("ChartOpenWait"))
      if SameId(no, id)
        return
    }
    AbortableSleep(150)
  }
  if !WinActive("ahk_id " hwnd)
    throw Error("환자를 연 뒤 OCS 메인 화면이 앞에 오지 않았어요. 떠 있는 창을 확인해주세요. 처방은 넣지 않았어요.")
  no := ReadPatientId(hwnd)  ; 마지막으로 창 전체
  if SameId(no, id)
    return
  throw Error("OCS에 " id " 환자 화면이 열리지 않았어요 (읽은 번호: " (no = "" ? "없음" : no) "). 처방은 넣지 않았어요.")
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
    t .= "   → OCS 외래 명단에서 이 환자를 찾아 열고, 환자번호가 같은지 확인한 뒤 넣어요.`n"
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
    CheckMainWindow(hwnd)
    t0 := A_TickCount
    ShowTip("OCS 화면 읽는 중… (멈춤: Esc)")
    ; UIA로 처방 입력창과 그 환자 칸의 환자번호를 바로 (안 되면 화면 글자 인식)
    u := gPractice ? "" : UiaCurrentInput(hwnd)
    no := IsObject(u) ? u.id : ReadPatientNo(hwnd)
    if no = ""
      throw Error("OCS 화면에서 환자번호를 읽지 못했어요.`n환자 화면(오더발행)이 열려 있는지 확인하고, 트레이 아이콘 > 화면 글자 읽기 시험으로 확인해 보세요.")
    ShowTip("흐름 프로그램에서 " no " 처방을 가져오는 중…")
    r := PatientPlan(no)
    if !SameId(F(r, "id"), no)
      throw Error("흐름 프로그램이 다른 환자 정보를 보냈어요. 아무것도 넣지 않았어요. 다시 시도해주세요.")
    if r.orders.Length = 0 && r.skipped.Length = 0 {
      ClearTip()
      MsgBox NoOrdersText(r), APP_NAME, MB_INFO | MB_TOP
      return
    }
    ; 처방 입력창은 확인 창을 띄우기 전에 미리 찾아 둠 ([예]를 누르면 바로 시작하도록)
    pt := !gPractice && r.orders.Length ? (IsObject(u) ? u : FindOrderInput(hwnd)) : ""
    ClearTip()
    Log("  확인 창까지 " Round((A_TickCount - t0) / 1000, 1) "초" (IsObject(u) ? " (UIA)" : ""))
    if MsgBox(ConfirmText(r), APP_NAME " · 처방 넣기", MB_YESNO | MB_QUESTION | MB_TOP) != "Yes"
      return
    ActivateOcs(hwnd)
    if !gPractice && r.orders.Length {
      ; 확인 창을 보는 사이 OCS 환자가 바뀌지 않았는지 다시 읽음 (UIA면 입력창도 다시 찾음)
      if IsObject(u) {
        u2 := UiaCurrentInput(hwnd)
        again := IsObject(u2) ? u2.id : ReadPatientId(hwnd)
        if IsObject(u2)
          pt := u2
      } else {
        again := ReadPatientId(hwnd)
      }
      if !SameId(again, no)
        throw Error("확인하는 동안 OCS의 환자가 바뀌었어요 (지금: " (again = "" ? "읽지 못함" : again) "). 아무것도 넣지 않았어요.")
    }
    Log((gPractice ? "[연습] " : "") "현재 환자 " no " 입력 시작 " r.orders.Length "건")
    ShowTip(F(r, "name") " 처방 입력 중… 마우스·키보드를 만지지 마세요 (멈춤: Esc)")
    res := EnterOrders(hwnd, r.orders, pt)
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
  ; 외래 명단이 열린 채로 시작해도 되도록, 명단 모드는 OCS 메인 화면 기준
  hwnd := gPractice ? WinExist("A") : MainOcsWindow()
  gRunning := true, gAbort := false
  try {
    if !hwnd
      throw Error("OCS 창을 찾지 못했어요.")
    if !gPractice && !HasAnchor("ListButton") && !IsObject(UiaButton(hwnd))
      throw Error("명단 모드는 다음 환자로 넘어갈 때 Patient List 버튼을 눌러 외래 명단을 열어요.`n트레이 아이콘 > 설정에서 '외래 명단 여는 버튼'을 먼저 등록해주세요 (그 버튼 위에 마우스를 올리고 F8).")
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
    ShowTip(item.name " 환자를 명단에서 찾는 중… 마우스·키보드를 만지지 마세요 (멈춤: Esc)")
    BatchGuiVisible(false)  ; 명단 모드 창이 OCS 화면을 가리지 않도록 일하는 동안 숨김
    ; 이미 그 환자 화면이면(멈춘 뒤 다시 하기 등) 명단을 열지 않음 (UIA로 알 때만)
    pt := gPractice ? "" : UiaCurrentInput(hwnd)
    if IsObject(pt) && !SameId(pt.id, item.id)
      pt := ""
    if !IsObject(pt) {
      OpenFromList(hwnd, item.id)
      if !gPractice {
        ; UIA: 그 환자 칸의 처방 입력창이 보이면 바로 (안 되면 화면 글자로 환자번호를 확인하고 입력창을 찾음)
        pt := UiaWaitPatient(hwnd, item.id)
        if !IsObject(pt) {
          WaitPatientScreen(hwnd, item.id)
          pt := FindOrderInput(hwnd)
        }
      }
    }
    Log((gPractice ? "[연습] " : "") "명단 모드 " item.id " 입력 시작 " r.orders.Length "건")
    ShowTip(item.name " 처방 입력 중… 마우스·키보드를 만지지 마세요 (멈춤: Esc)")
    res := EnterOrders(hwnd, r.orders, pt)
    out := FinishPatient(hwnd, r, res)
    ClearTip()
    BatchGuiVisible(true)
    if res.error = "" {
      SetItem(idx, "입력 " res.count "건", true)
      BatchSetStatus(out.msg NextText())
      if !out.ok
        MsgBox out.msg, APP_NAME, MB_WARN | MB_TOP
    } else {
      SetItem(idx, "멈춤 " res.count "/" r.orders.Length)
      BatchSetStatus(out.msg "`n`n" Cfg["HotkeyRun"] "를 누르면 이 환자를 다시 찾아 남은 처방만 넣어요. [이 환자 건너뛰기]로 넘길 수도 있어요.")
      MsgBox out.msg, APP_NAME, MB_WARN | MB_TOP
    }
  } catch as e {
    ClearTip()
    if InStr(e.Message, "찾지 못했어요") || InStr(e.Message, "열리지 않았어요")
      SetItem(idx, "열기 실패")
    Log("오류(명단) " item.id ": " e.Message)
    BatchSetStatus(e.Message "`n`n" Cfg["HotkeyRun"] "로 다시 시도하거나 [이 환자 건너뛰기]를 눌러주세요.")
    BatchGuiVisible(true)
    MsgBox e.Message, APP_NAME, MB_WARN | MB_TOP
  } finally {
    BatchGuiVisible(true)
    Sleep 200
    A_Clipboard := saved
    gRunning := false
  }
}

BatchGuiVisible(show) {
  if !Batch.gui
    return
  try {
    if show
      Batch.gui.Show("NoActivate")
    else
      Batch.gui.Hide()
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
      . "OCS 대신 메모장에 무엇을 어떤 순서로 넣을지 글로 적어 줘요.`n흐름 프로그램 서버와는 실제로 주고받아요.`n`n"
      . "OCS 화면을 제대로 읽는지는 트레이 아이콘 > 화면 글자 읽기 시험으로 확인하세요.", APP_NAME, MB_INFO | MB_TOP
  } else {
    A_TrayMenu.Uncheck("연습 모드 (메모장)")
    MsgBox "연습 모드를 껐어요. 이제 OCS에서 동작합니다.", APP_NAME, MB_INFO | MB_TOP
  }
}

; =====================================================================
; 화면 글자 읽기 시험 (누르지 않고 읽기만, 찾은 곳을 빨간 네모로 표시)
; =====================================================================
TestOcr() {
  global gRunning
  if gRunning
    return
  main := MainOcsWindow()
  if !main {
    MsgBox "OCS 창을 찾지 못했어요. OCS를 켜고 'OCS 창'을 등록했는지 확인해주세요.", APP_NAME, MB_WARN | MB_TOP
    return
  }
  gRunning := true
  try {
    if SetupGui
      SetupGui.Hide()
    ActivateOcs(main)
    ; 0) UIA (가장 빠름): OCS가 알려 주는 칸 이름표
    t := A_TickCount
    uOn := IsObject(UiaRoot(main))
    uIn := uOn ? UiaCurrentInput(main) : ""
    uBtn := uOn ? UiaButton(main) : ""
    uList := uOn ? UiaListState(main) : ""
    tUia := A_TickCount - t
    uIns := uOn ? UiaOrderInputs(main) : ""
    ; 1) UIA로 못 찾을 때 쓰는 빠른 방법: 그림 찾기, 환자번호가 보이던 좁은 띠
    t := A_TickCount
    imgIn := FindImage(main, "OrderInput"), imgBtn := FindImage(main, "ListButton"), imgHead := FindImage(main, "ListHead")
    tImg := A_TickCount - t
    t := A_TickCount
    fastNo := ReadPatientId(main, true)
    tBand := A_TickCount - t
    ; 2) 화면 전체 글자 읽기 (확인용, 느림 · 그림으로 못 찾을 때만 씀)
    t := A_TickCount
    scr := OcsScreen(main)
    no := PatientIdFrom(scr)
    txtIn := HasAnchor("OrderInput") ? FindAnchor(scr, "OrderInput") : ""
    a := HasAnchor("ListButton") ? AnchorOf("ListButton") : ""
    txtBtn := IsObject(a) && a.text != "" ? FindAnchor(scr, "ListButton") : ""
    heads := ListHeads(scr)
    listHits := heads.Length ? ListIds(scr, heads, 1) : []
    tFull := A_TickCount - t

    ; 이번에 찾은 것으로 배워 두기 (다음부터 빠르게)
    learned := []
    if no != ""
      LearnIdBand(scr, no)
    if !IsObject(imgIn) && IsObject(txtIn) {
      w := txtIn.word
      if MouseFar(w.x - 3, w.y - 3, w.w + 6, w.h + 6) && LearnImage(main, "OrderInput", w.x - 3, w.y - 3, w.w + 6, w.h + 6, txtIn.x, txtIn.y)
        learned.Push("처방 입력창")
    }
    if !IsObject(imgHead) && listHits.Length >= 2 {
      best := "", bestN := 1
      for hd in heads {
        n := ListIds(scr, [hd], 1).Length
        if !hd.HasOwnProp("fake") && n > bestN
          best := hd, bestN := n
      }
      if LearnHead(main, best)
        learned.Push("외래 명단 머리글")
    }

    ; 찾은 곳 표시: 환자번호(초록), 처방 입력창·명단 버튼(빨강), 명단 환자번호(파랑)
    if no != ""
      for v in [1, 2]
        for w in scr.Words(v)
          if DigitsOf(w.text) = no
            ShowBox(w.x, w.y, w.w, w.h, 6000, "Lime")
    for hit in [imgIn, imgBtn, imgHead]
      if IsObject(hit)
        ShowBox(hit.ix, hit.iy, hit.im.w, hit.im.h, 6000, hit.im.key = "ListHead" ? "Blue" : "Red")
    if !IsObject(imgIn) && IsObject(txtIn)
      ShowBox(txtIn.x - 12, txtIn.y - 8, 24, 16, 6000, "Red")
    btnPos := IsObject(a) && a.px != "" ? a : ""
    if !IsObject(imgBtn) && IsObject(txtBtn)
      ShowBox(txtBtn.x - 12, txtBtn.y - 8, 24, 16, 6000, "Red")
    else if !IsObject(imgBtn) && IsObject(btnPos) {
      WinGetPos(&wx, &wy, , , "ahk_id " main)
      ShowBox(wx + a.px - 12, wy + a.py - 8, 24, 16, 6000, "Red")
    }
    for x in listHits
      ShowBox(x.word.x, x.word.y, x.word.w, x.word.h, 6000, "Blue")
    for x in [uIn, uBtn]
      if IsObject(x)
        ShowBox(x.rect.x, x.rect.y, x.rect.w, x.rect.h, 6000, "Red")
    if IsObject(uList) && uList.open
      ShowBox(uList.rect.x, uList.rect.y, uList.rect.w, uList.rect.h, 6000, "Blue")

    msg := "찾은 곳을 6초 동안 네모로 표시해요.`n`n"
    if Cfg["UseUia"] != "1" {
      msg .= "UIA: 쓰지 않음 (설정 파일 UseUia=0)`n`n"
    } else if !uOn {
      msg .= "UIA: 쓸 수 없음 (아래 그림·글자 인식으로 찾아요)`n`n"
    } else {
      if IsObject(uIn)
        inState := "찾음"
      else if IsObject(uIns) && uIns.Length > 1
        inState := "환자 칸이 여러 개 보여 고르지 못함 (그림·글자 인식으로 찾아요)"
      else if IsObject(uIns) && uIns.Length
        inState := "입력창은 찾았는데 환자번호를 못 읽음"
      else
        inState := "못 찾음 (오더발행 화면이 보이는지 확인)"
      msg .= "UIA — 가장 빠름, 실제로 먼저 씀 (" Sec(tUia) "초)`n"
      msg .= "  · 환자번호: " (IsObject(uIn) ? uIn.id : "못 읽음") "`n"
      msg .= "  · 처방 입력창 (빨강): " inState "`n"
      msg .= "  · Patient List 버튼 (빨강): " (IsObject(uBtn) ? "찾음" : "못 찾음") "`n"
      msg .= "  · 외래 명단 (파랑): " (!IsObject(uList) ? "모름" : uList.open ? "열려 있음" : "닫혀 있음") "`n`n"
    }
    msg .= "UIA로 못 찾을 때: 그림 찾기 · 좁은 띠`n"
    msg .= "  · 환자번호: " (fastNo != "" ? fastNo " — 좁은 띠만 읽어 " Sec(tBand) "초" : "좁은 띠에서 못 읽음 (아래처럼 창 전체를 읽어 찾고, 그 자리를 기억해요)") "`n"
    msg .= "  · 그림 찾기 3가지 모두 " Sec(tImg) "초`n"
    msg .= "      처방 입력창: " ImgState("OrderInput", imgIn) "`n"
    msg .= "      Patient List 버튼: " ImgState("ListButton", imgBtn) "`n"
    msg .= "      외래 명단 머리글: " ImgState("ListHead", imgHead) "`n`n"
    msg .= "화면 전체 글자 읽기 " Sec(tFull) "초 (확인용 · 그림으로 못 찾을 때만 씀)`n"
    msg .= "  · 환자번호 (초록): " (no != "" ? no : "읽지 못함 — 환자 화면이 열려 있는지 확인") "`n"
    msg .= "  · 처방 입력창 (빨강): " (!HasAnchor("OrderInput") ? "아직 등록 안 함" : IsObject(txtIn) ? "글자로 찾음" : "글자로 못 찾음 (입력창이 비어 있는지 확인)") "`n"
    msg .= "  · Patient List 버튼 (빨강): " (!IsObject(a) ? "등록 안 함" : IsObject(txtBtn) ? "글자로 찾음" : IsObject(btnPos) ? "글자는 못 읽어 등록한 위치로 누름" : "못 찾음") "`n"
    msg .= "  · 외래 명단 (파랑): " (heads.Length ? "열려 있음 · 환자번호 " listHits.Length "개 읽음" : "열려 있지 않음 (명단을 연 상태에서도 한 번 시험해 보세요)") "`n"
    if learned.Length
      msg .= "`n이번에 그림으로 기억했어요: " Join(learned, ", ") " (다음부터 빨리 찾아요)`n"
    msg .= "`n네모가 엉뚱한 곳에 있으면 그 항목을 다시 등록하세요. 글자를 잘 못 읽으면 설정 파일의 OcrScale을 3으로 올려 보세요."
    MsgBox msg, APP_NAME " · 화면 글자 읽기 시험", MB_INFO | MB_TOP
  } catch as e {
    MsgBox e.Message, APP_NAME, MB_WARN | MB_TOP
  } finally {
    gRunning := false
  }
}

Sec(ms) => Round(ms / 1000, 2)

ImgState(key, hit) {
  if IsObject(hit)
    return "그림으로 찾음"
  if HasImage(key)
    return "그림은 있는데 지금 화면에서 못 찾음 (가려졌거나 모양이 바뀜 → 글자로 찾아요)"
  if Cfg["ImageFind"] != "1"
    return "그림 찾기 꺼짐 (설정 파일 ImageFind=0)"
  switch key {
    case "OrderInput": return "그림 없음 (글자로 한 번 찾으면 기억해요)"
    case "ListButton": return "그림 없음 (설정에서 이 버튼을 다시 등록하면 모양을 찍어 둬요)"
    default: return "그림 없음 (명단이 열린 화면에서 이 시험을 하거나 명단 모드로 한 번 찾으면 기억해요)"
  }
}

; =====================================================================
; 설정 창 (등록)
; =====================================================================
ShowSetup(*) {
  global SetupGui, SetupLv
  if !SetupGui {
    g := Gui("+AlwaysOnTop", APP_NAME " · 설정")
    g.SetFont("s10", "Malgun Gothic")
    g.AddText("w640", "항목을 고르고 [선택 항목 등록]을 누르세요. 서버 주소는 직접 적고, 나머지는 이 창이 잠시 숨겨진 뒤 안내대로 마우스를 올리고 F8을 누르세요 (취소: Esc).`n"
      . "처방 입력창·명단 버튼은 위치가 아니라 모양(작은 그림)과 근처 글자를 기억해요. 창을 옮기거나 칸 크기가 바뀌어도 찾아 누릅니다.`n"
      . "등록한 뒤 [화면 글자 읽기 시험]으로 제대로 찾는지 확인하세요.")
    lv := g.AddListView("w640 r6 -Multi NoSortHdr", ["항목", "등록된 값"])
    lv.OnEvent("DoubleClick", (*) => StartRecord())
    g.AddButton("w155", "선택 항목 등록").OnEvent("Click", (*) => StartRecord())
    g.AddButton("x+6 w155", "화면 글자 읽기 시험").OnEvent("Click", (*) => TestOcr())
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
  for it in ITEMS {
    switch it.kind {
      case "server":
        v := Cfg["ServerUrl"]
      case "ocs":
        v := Cfg["OcsExe"] = "" ? "" : Cfg["OcsExe"]
      default:
        v := !HasAnchor(it.key) ? "" : StrSplit(Cfg[it.key], "|")[1] = "" ? "위치로 등록 (창 왼쪽 위 기준)" : "기준 글자 '" StrSplit(Cfg[it.key], "|")[1] "'"
        if v != "" && HasImage(it.key)
          v .= " + 모양(그림)"
    }
    SetupLv.Add("", it.label, v = "" ? "— 미등록" : v)
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
  it := ITEMS[row]
  if it.kind = "server" {
    AskServerUrl()
    return
  }
  if it.kind = "anchor" && Cfg["OcsExe"] = "" {
    MsgBox "먼저 'OCS 창'을 등록해주세요.", APP_NAME, MB_INFO | MB_TOP
    return
  }
  gRecording := it.key
  SetupGui.Hide()
  ToolTip "[" it.label " 등록]`n" it.help " 마우스를 올리고 F8을 누르세요.`n(클릭하지 않아도 돼요 · 취소: Esc)", A_ScreenWidth // 2 - 260, 12, 2
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

; 마우스를 위(또는 아래)로 300픽셀 치우고 잠깐 기다림 (마우스가 올라가 있던 곳의 강조·풍선 도움말이 사라지도록)
AwayMouse(mx, my) {
  vy := SysGet(77), vh := SysGet(79)
  MouseMove mx, my + 300 < vy + vh - 20 ? my + 300 : my - 300, 0
  Sleep 300
}

CancelRecord(*) {
  global gRecording
  gRecording := ""
  ToolTip(, , , 2)
  ShowSetup()
}

RecordNow(*) {
  global gRecording
  it := ItemByKey(gRecording)
  gRecording := ""
  ToolTip(, , , 2)
  MouseGetPos &mx, &my, &win
  try {
    exe := WinGetProcessName("ahk_id " win)
    if it.kind = "ocs" {
      WinGetClientPos(, , &w, &h, "ahk_id " win)
      IniWrite exe, INI_PATH, "Windows", "OcsExe"
      IniWrite WinGetClass("ahk_id " win), INI_PATH, "Windows", "OcsClass"
      IniWrite w, INI_PATH, "Windows", "OcsW"
      IniWrite h, INI_PATH, "Windows", "OcsH"
      note := "OCS 창을 등록했어요: " exe
    } else {
      if exe != Cfg["OcsExe"]
        throw Error("OCS 화면 위에 마우스를 올리고 F8을 눌러주세요.`n(지금 마우스 아래 프로그램: " exe ")")
      main := MainOcsWindow()
      if !main
        throw Error("OCS 창을 찾지 못했어요.")
      isButton := it.key = "ListButton"
      ForgetImage(it.key)
      ; 마우스를 잠깐 치워 둠 (버튼이 마우스에 반응해 강조되거나 풍선 도움말이 뜬 모양이 찍히지 않도록)
      AwayMouse(mx, my)
      try {
        ShowTip("화면 글자 읽는 중…")
        scr := OcsScreen(main)
        ; 마우스와 가장 가까운 글자(두 글자 이상, 숫자만 있는 것은 뺌)를 기준으로
        best := "", bestD := 1000000000
        for v in [1, 2] {
          for w in scr.Words(v) {
            if StrLen(w.text) < 2 || RegExMatch(w.text, "^[0-9\s\[\]\(\)\.,:;/|_-]+$")
              continue
            ddx := Max(w.x - mx, 0, mx - (w.x + w.w)), ddy := Max(w.y - my, 0, my - (w.y + w.h))
            d := ddx * ddx + ddy * ddy
            if d < bestD
              best := w, bestD := d
          }
          if IsObject(best) && bestD = 0
            break
        }
        ClearTip()
        near := IsObject(best) && bestD <= (isButton ? 40 * 40 : 150 * 150)
        ; 모양도 그림으로 기억 (가장 빨리 찾는 방법): 버튼은 마우스 둘레 40×40(아이콘), 입력창은 기준 글자 둘레
        imgN := 0
        if isButton {
          b := WinBox(main)
          ix := Max(b.x, Min(mx - 20, b.x + b.w - 40)), iy := Max(b.y, Min(my - 20, b.y + b.h - 40))
          imgN := LearnImage(main, it.key, ix, iy, 40, 40, mx, my)
        } else if near {
          imgN := LearnImage(main, it.key, best.x - 3, best.y - 3, best.w + 6, best.h + 6, mx, my)
        }
      } finally {
        MouseMove mx, my, 0
      }
      if imgN
        imgNote := "`n`n모양도 그림으로 기억했어요 (가장 빨리 찾는 방법)." (imgN > 1 ? " 비슷한 모양이 " imgN "곳 있어 등록한 자리와 가장 가까운 곳을 눌러요." : "")
      else
        imgNote := "`n`n(모양을 그림으로는 기억하지 못했어요: 둘레가 거의 한 가지 색이거나 비슷한 모양이 너무 많음. 글자·위치로 찾아요.)"
      ; 창 왼쪽 위에서 마우스까지 거리 (명단 버튼은 창 가장자리 메뉴에 붙어 있어 글자를 못 읽으면 이 위치로 누름)
      WinGetPos(&wx, &wy, , , "ahk_id " main)
      pos := (mx - wx) "|" (my - wy)
      if !near {
        if !isButton
          throw Error("마우스 근처에서 글자를 찾지 못했어요. 글자(예: '입력창') 위나 바로 옆에 마우스를 올리고 다시 등록해주세요.")
        IniWrite("|0|0|0|0|" pos, INI_PATH, "Anchors", it.key)
        ShowBox(mx - 12, my - 12, 24, 24, 4000, "Red")
        note := "'" it.label "'은(는) 글자를 읽지 못해 위치로 등록했어요 (빨간 네모).`n창 왼쪽 위에서의 거리로 기억하므로, 창을 옮겨도 따라갑니다. 창 왼쪽 메뉴 줄의 배치가 바뀌면 다시 등록해주세요." imgNote
      } else {
        rx := Round((best.cx - scr.wx) / scr.ww, 4), ry := Round((best.cy - scr.wy) / scr.wh, 4)
        IniWrite(StrReplace(best.text, "|") "|" rx "|" ry "|" (mx - best.cx) "|" (my - best.cy) (isButton ? "|" pos : ""), INI_PATH, "Anchors", it.key)
        ShowBox(best.x, best.y, best.w, best.h, 4000, "Red")
        note := "'" it.label "'의 기준 글자를 '" best.text "'(으)로 등록했어요 (빨간 네모).`n앞으로 이 글자를 찾아서, 지금 마우스가 있던 자리를 누릅니다."
        if isButton
          note .= "`n글자를 못 읽을 때는 창 왼쪽 위에서의 위치로 누릅니다."
        else if Sqrt(bestD) > 40
          note .= "`n`n⚠ 기준 글자가 마우스에서 조금 떨어져 있어요. 더 가까운 글자가 있으면 그 위에서 다시 등록해 보세요."
        note .= imgNote
      }
    }
    LoadConfig()
    ShowSetup()
    MsgBox note, APP_NAME, MB_INFO | MB_TOP
  } catch as e {
    ClearTip()
    ShowSetup()
    MsgBox e.Message, APP_NAME, MB_WARN | MB_TOP
  }
}
