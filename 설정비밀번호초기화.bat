@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 안과 환자 흐름 - 설정 비밀번호 초기화

rem 설정 비밀번호를 잊었을 때 서버 PC에서 실행합니다. 서버를 다시 켤 필요는 없습니다.
if not exist "data\settings-lock.json" (
  echo 설정 비밀번호가 정해져 있지 않습니다. 설정에 바로 들어갈 수 있습니다.
  pause
  exit /b 0
)
choice /c YN /m "설정 비밀번호를 없앨까요? 없애려면 Y, 취소하려면 N"
if errorlevel 2 exit /b 0
del "data\settings-lock.json"
echo 설정 비밀번호를 없앴습니다. 설정에 들어가 새 비밀번호를 정할 수 있습니다.
pause
