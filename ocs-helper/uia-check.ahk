#Requires AutoHotkey v2.0
#SingleInstance Force
/*
  화면 요소 확인 (UIA 시험) — OCS 처방 도우미의 부록 (도우미 트레이 아이콘 > 화면 요소 확인)

  OCS 프로그램이 화면의 글자·칸(환자번호, 처방 입력창, 버튼, 명단 줄)을 윈도우 접근성 기능(UI Automation)으로
  알려 주는지 알아봅니다. 알려 준다면 도우미가 글자 인식·그림 찾기 없이 바로 읽고 누를 수 있어 훨씬 빨라집니다.
  - 읽기만 합니다 (누르거나 입력하지 않음).
  - 이름·번호는 가려서 보여 줍니다 (한글 → ○, 숫자 → #). 결과를 [복사]해서 Claude에게 붙여 넣어 주세요.
  - 파일로 저장하지 않습니다.
*/
IUIAutomationActivateScreenReader := 0  ; 윈도우의 '화면 읽기 프로그램 사용 중' 표시는 켜지 않음
#Include <UIA>  ; Lib\UIA.ahk (Descolada/UIA-v2, MIT — Lib\UIA-LICENSE.txt)

CoordMode "Mouse", "Screen"
CoordMode "ToolTip", "Screen"
TITLE := "화면 요소 확인 (UIA 시험)"
MAX_ELEMENTS := 4000, MAX_MS := 10000  ; 창 전체를 셀 때 이만큼에서 멈춤 (OCS에 부담을 주지 않도록)
gSummarized := Map()
gBusy := false

g := Gui("+AlwaysOnTop", TITLE)
g.SetFont("s10", "Malgun Gothic")
g.AddText("w660", "OCS 화면에서 알아볼 곳에 마우스를 올리고 F7을 누르세요 (클릭하지 않아도 돼요. 읽기만 해요).`n"
  . "① 환자번호  ② 처방 입력창  ③ Patient List 버튼  ④ 외래 명단의 환자 줄 — 차례로 한 번씩 눌러 주세요.`n"
  . "처음 F7을 누를 때 그 창 전체도 한 번 세어 봐요 (몇 초 걸릴 수 있어요).`n"
  . "이름·번호는 ○·#로 가려져요. 다 되면 [복사]를 눌러 Claude에게 붙여 넣어 주세요.")
gOut := g.AddEdit("w660 r24 ReadOnly -Wrap +HScroll", "")
g.AddButton("w160", "복사").OnEvent("Click", CopyAll)
g.AddButton("x+8 w160", "지우기").OnEvent("Click", ClearAll)
g.AddButton("x+8 w160", "닫기").OnEvent("Click", (*) => ExitApp())
g.OnEvent("Close", (*) => ExitApp())
g.Show("x20 y40")
Append("OS " A_OSVersion " · AutoHotkey " A_AhkVersion " (" (A_PtrSize = 8 ? 64 : 32) "비트)")

F7::Inspect()

; 마우스 아래 요소 알아보기 (+ 그 창을 처음 볼 때는 창 전체 요약)
Inspect() {
  global gBusy
  if gBusy
    return
  gBusy := true
  try {
    MouseGetPos &mx, &my, &win, &ctl, 2
    if win = g.Hwnd
      return
    exe := ""
    try exe := WinGetProcessName("ahk_id " win)
    ToolTip "읽는 중…", mx + 16, my + 16
    s := "■ 마우스 (" mx ", " my ") · 프로그램 " exe " · 창 " ClassOf(win) "`n"
    t0 := A_TickCount
    try {
      el := UIA.ElementFromPoint(mx, my)
      s .= "  UIA 요소 (" (A_TickCount - t0) "ms)`n" Describe(el, "    ")
      s .= Ancestors(el)
      s .= Children(el)
    } catch as e {
      s .= "  UIA로 읽지 못함: " e.Message "`n"
    }
    s .= Win32Info(win, ctl)
    Append(s)
    if !gSummarized.Has(win) {
      gSummarized[win] := true
      ToolTip "창 전체를 세는 중… (최대 " (MAX_MS // 1000) "초)", mx + 16, my + 16
      Append(WindowSummary(win))
    }
  } finally {
    ToolTip()
    gBusy := false
  }
}

Describe(el, ind) {
  s := ind "종류: " TypeOf(el) "`n"
  s .= ind "ClassName: " Nz(Get(el, "ClassName")) " · FrameworkId: " Nz(Get(el, "FrameworkId")) " · AutomationId: " Mask(Get(el, "AutomationId"), false) "`n"
  s .= ind "Name: " Mask(Get(el, "Name")) "`n"
  s .= ind "Value: " Mask(Prop(el, "Value")) "`n"
  s .= ind "Legacy: 이름 " Mask(Prop(el, "LegacyIAccessibleName")) " · 값 " Mask(Prop(el, "LegacyIAccessibleValue")) " · 역할 " Nz(Prop(el, "LegacyIAccessibleRole")) "`n"
  try {
    loc := el.Location
    s .= ind "위치: " loc.x ", " loc.y " · 크기 " loc.w "×" loc.h "`n"
  }
  s .= ind "할 수 있는 것: " Patterns(el) "`n"
  hw := Prop(el, "NativeWindowHandle")
  s .= ind "자기 창: " (hw ? "있음 (" ClassOf(hw) ")" : "없음") "`n"
  return s
}

Ancestors(el) {
  s := "  부모 (위로):`n", p := el
  loop 12 {
    try p := p.Parent
    catch
      break
    if Get(p, "ClassName") = "#32769"  ; 바탕 화면
      break
    s .= "    " Short(p) "`n"
  }
  return s
}

Children(el) {
  try kids := el.GetChildren()
  catch
    return ""
  s := "  바로 아래 요소 " kids.Length "개`n"
  for k in kids {
    if A_Index > 12 {
      s .= "    …`n"
      break
    }
    s .= "    " Short(k) "`n"
  }
  return s
}

Short(el) {
  aid := Get(el, "AutomationId"), nm := Get(el, "Name")
  return TypeOf(el) " · " Nz(Get(el, "ClassName")) (aid != "" ? " · id " Mask(aid, false) : "") (nm != "" ? " · 이름 " Mask(nm, true, 30) : "")
}

Win32Info(win, ctl) {
  s := "  Win32: 창 " ClassOf(win)
  if ctl {
    txt := ""
    try txt := ControlGetText(ctl)
    s .= " · 칸 " ClassOf(ctl) " · 칸 글자 " Mask(txt)
  }
  return s "`n"
}

; 창 전체 요약: 요소 수·종류, 글자(이름·값)가 보이는지, 환자번호 같은 숫자가 보이는지 (개수만)
WindowSummary(win) {
  t0 := A_TickCount
  s := "■ 창 전체 요약 (" ClassOf(win) ")`n"
  try {
    root := UIA.ElementFromHandle(win)
    cr := UIA.CreateCacheRequest(["Type", "ClassName", "Name", "AutomationId", "FrameworkId", "Value"])
    tw := UIA.TreeWalkerTrue
    count := 0, types := Map(), classes := Map(), fws := Map()
    named := 0, hangul := 0, idNamed := 0, valued := 0, idValued := 0, edits := 0
    stack := []
    if first := tw.TryGetFirstChildElementBuildCache(cr, root)
      stack.Push(first)
    while stack.Length && count < MAX_ELEMENTS && A_TickCount - t0 < MAX_MS {
      el := stack.Pop()
      count++
      t := Cached(el, "Type"), tn := t
      try tn := UIA.Type[t]
      Bump(types, tn), Bump(classes, Cached(el, "ClassName")), Bump(fws, Cached(el, "FrameworkId"))
      if tn = "Edit"
        edits++
      nm := Cached(el, "Name"), v := Cached(el, "Value")
      if nm != "" {
        named++
        if RegExMatch(nm, "[\x{AC00}-\x{D7A3}]")
          hangul++
        if RegExMatch(nm, "(?<!\d)\d{6,10}(?!\d)")
          idNamed++
      }
      if v != "" {
        valued++
        if RegExMatch(v, "(?<!\d)\d{6,10}(?!\d)")
          idValued++
      }
      if nx := tw.TryGetNextSiblingElementBuildCache(cr, el)
        stack.Push(nx)
      if ch := tw.TryGetFirstChildElementBuildCache(cr, el)
        stack.Push(ch)
    }
    cut := stack.Length ? " 이상 (여기서 멈춤)" : ""
    s .= "  요소 " count "개" cut " · " Round((A_TickCount - t0) / 1000, 1) "초`n"
    s .= "  종류: " Top(types, 12) "`n"
    s .= "  ClassName: " Top(classes, 10) "`n"
    s .= "  FrameworkId: " Top(fws, 5) "`n"
    s .= "  이름이 있는 요소 " named "개 (한글이 든 것 " hangul " · 환자번호 같은 숫자가 든 것 " idNamed ")`n"
    s .= "  값이 있는 요소 " valued "개 (환자번호 같은 숫자가 든 것 " idValued ") · 입력칸(Edit) " edits "개`n"
    s .= "  → " Verdict(count, named, idNamed + idValued) "`n"
  } catch as e {
    s .= "  읽지 못함: " e.Message "`n"
  }
  return s
}

Verdict(count, named, ids) {
  if count < 10
    return "이 창은 UIA로 거의 아무것도 알려 주지 않아요. 지금 방식(그림 찾기·글자 인식)이 맞아요."
  if ids
    return "환자번호 같은 숫자가 UIA로 보여요. 글자 인식 없이 바로 읽을 수 있을 가능성이 높아요."
  if named >= 20
    return "글자가 UIA로 꽤 보여요. 칸별로 알아보면 더 빨라질 수 있어요."
  return "요소는 있지만 글자는 거의 안 보여요. 칸 위치를 찾는 데만 쓸 수 있을 것 같아요."
}

; ---------------------------------------------------------------------
TypeOf(el) {
  t := Get(el, "Type"), name := ""
  try name := UIA.Type[t]
  lt := Get(el, "LocalizedType")
  return (name != "" ? name : Nz(t)) (lt != "" ? " (" lt ")" : "")
}

Patterns(el) {
  out := []
  for name in ["Invoke", "Value", "Text", "LegacyIAccessible", "Selection", "SelectionItem", "Grid", "GridItem", "Table", "TableItem", "Scroll", "ScrollItem", "ExpandCollapse", "Toggle"]
    if Prop(el, "Is" name "PatternAvailable")
      out.Push(name)
  return out.Length ? Join(out, ", ") : "(없음)"
}

; 요소의 값 읽기 (못 읽으면 "")
Get(el, name) {
  try {
    v := el.%name%
    return IsObject(v) ? "" : v
  }
  return ""
}
Prop(el, name) {
  try {
    v := el.GetPropertyValue(UIA.Property.%name%)
    return IsObject(v) ? "" : v
  }
  return ""
}
Cached(el, name) {
  try {
    v := el.GetCachedPropertyValue(UIA.Property.%name%)
    return IsObject(v) ? "" : v
  }
  return ""
}

ClassOf(hwnd) {
  try return WinGetClass("ahk_id " hwnd)
  return "?"
}

; 이름·번호 가리기: 숫자 → #, 한글 → ○ (영문·기호는 그대로). 길면 앞부분만
Mask(s, hideHangul := true, maxLen := 60) {
  s := String(s)
  if s = ""
    return "(없음)"
  s := RegExReplace(s, "\d", "#")
  if hideHangul
    s := RegExReplace(s, "[\x{AC00}-\x{D7A3}\x{3131}-\x{318E}]", "○")
  s := RegExReplace(s, "\s+", " ")
  return StrLen(s) > maxLen ? SubStr(s, 1, maxLen) "…(" StrLen(s) "자)" : s
}
Nz(v) => v = "" ? "(없음)" : v

Bump(m, k) {
  m[k] := (m.Has(k) ? m[k] : 0) + 1
}
; 많은 순서로 n개 ("Edit 12, Text 50 …")
Top(m, n) {
  arr := []
  for k, v in m
    arr.Push({k: k, v: v})
  out := []
  loop Min(n, arr.Length) {
    bi := 1
    for i, x in arr
      if x.v > arr[bi].v
        bi := i
    out.Push(Nz(arr[bi].k) " " arr[bi].v)
    arr.RemoveAt(bi)
  }
  return out.Length ? Join(out, ", ") (arr.Length ? " 외 " arr.Length "가지" : "") : "(없음)"
}
Join(arr, sep) {
  out := ""
  for v in arr
    out .= (A_Index > 1 ? sep : "") v
  return out
}

Append(s) {
  gOut.Value .= StrReplace(s, "`n", "`r`n") "`r`n"
  try SendMessage(0x0115, 7, 0, gOut)  ; 맨 아래로
}
ClearAll(*) {
  gOut.Value := ""
  gSummarized.Clear()
}
CopyAll(*) {
  A_Clipboard := gOut.Value
  ToolTip "복사했어요. Claude 대화창에 붙여 넣어 주세요 (Ctrl+V)."
  SetTimer () => ToolTip(), -2500
}
