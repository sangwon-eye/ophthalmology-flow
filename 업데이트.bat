@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 안과 환자 흐름 - 업데이트

where node >nul 2>nul
if errorlevel 1 goto :no_node

echo [1/2] 필요한 파일을 확인합니다...
call npm.cmd install
if errorlevel 1 goto :fail

echo [2/2] 수정한 코드로 새 화면 파일을 만듭니다...
call npm.cmd run build
if errorlevel 1 goto :fail

echo.
echo 업데이트가 끝났습니다.
echo 서버는 다시 켤 필요가 없습니다. 각 컴퓨터에 "새 버전이 있습니다" 알림이 뜨면 새로고침을 누르세요.
echo 단, server.js 를 수정했다면 서버 창을 닫고 서버시작.bat 을 다시 실행하세요.
pause
exit /b

:no_node
echo Node.js 가 설치되어 있지 않습니다.
echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
pause
exit /b 1

:fail
echo.
echo 오류가 났습니다. 위의 빨간 메시지를 확인하세요. 서버는 이전 버전 그대로 계속 동작합니다.
pause
exit /b 1
