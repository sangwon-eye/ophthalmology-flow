@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 안과 환자 흐름 - 공유 서버

rem 백업을 공유폴더에도 남기려면 아래 줄 맨 앞의 rem 을 지우고 경로를 바꾸세요.
rem set BACKUP_DIR=\\공유PC이름\공유폴더\안과백업

where node >nul 2>nul
if errorlevel 1 goto :no_node

if exist "dist\index.html" goto :run
echo 화면 파일(dist)이 없어서 처음 한 번 만듭니다. 인터넷 연결이 필요할 수 있습니다...
if not exist "node_modules" call npm.cmd install
if errorlevel 1 goto :fail
call npm.cmd run build
if errorlevel 1 goto :fail

:run
node server.js
echo.
echo 서버가 멈췄습니다. 위의 메시지를 확인하세요.
pause
exit /b

:no_node
echo Node.js 가 설치되어 있지 않습니다.
echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
pause
exit /b 1

:fail
echo.
echo 준비 중 오류가 났습니다. 위의 메시지를 확인하세요.
pause
exit /b 1
