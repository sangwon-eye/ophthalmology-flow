@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 안과 환자 흐름 - 서버 켜기 (창 없이)

rem 설치하지 않은 Node.js(압축 파일 버전)를 이 폴더 안의 node 폴더에 넣어두면 그것을 사용합니다.
if exist "%~dp0node\node.exe" set "PATH=%~dp0node;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto :no_node

if not exist "dist\index.html" goto :no_dist

node scripts\health.js
if not errorlevel 1 goto :already

echo 서버를 창 없이 켜는 중입니다...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath $env:ComSpec -ArgumentList '/c','scripts\run-server.bat' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden" >nul 2>nul
if errorlevel 1 start "안과 환자 흐름 서버" /min "%ComSpec%" /c scripts\run-server.bat

set /a tries=0
:wait
ping -n 2 127.0.0.1 >nul
node scripts\health.js
if not errorlevel 1 goto :ok
set /a tries+=1
if %tries% lss 15 goto :wait
echo.
echo 서버를 켜지 못했습니다.
echo 서버시작.bat 으로 켜서 검은 창에 나오는 오류를 확인하거나, data\server-log.txt 를 확인하세요.
pause
exit /b 1

:ok
node scripts\health.js --print
echo  창 없이 켜졌습니다. 이 창은 10초 뒤 저절로 닫히고, 서버는 계속 켜져 있습니다.
echo  끄려면 서버끄기.bat 을 실행하세요.
ping -n 11 127.0.0.1 >nul
exit /b 0

:already
node scripts\health.js --print
echo  이미 켜져 있어서 새로 켜지 않았습니다.
ping -n 6 127.0.0.1 >nul
exit /b 0

:no_dist
echo 화면 파일(dist)이 없습니다. 업데이트.bat 을 먼저 실행하세요.
pause
exit /b 1

:no_node
echo Node.js 를 찾지 못했습니다.
echo 방법 1: https://nodejs.org 에서 LTS 설치 파일을 받아 설치합니다.
echo 방법 2: 관리자 권한이 없으면 Node.js 압축 파일을 풀고, 그 폴더 이름을 node 로 바꿔
echo         이 폴더 안에 넣습니다. 그 안에 node.exe 가 있어야 합니다.
pause
exit /b 1
