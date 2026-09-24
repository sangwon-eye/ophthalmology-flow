@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 안과 환자 흐름 - 서버 끄기

rem 설치하지 않은 Node.js(압축 파일 버전)를 이 폴더 안의 node 폴더에 넣어두면 그것을 사용합니다.
if exist "%~dp0node\node.exe" set "PATH=%~dp0node;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto :no_node

echo 서버를 끄면 모든 컴퓨터에서 사용할 수 없습니다.
choice /c YN /m "정말 끌까요? 끄려면 Y, 취소하려면 N"
if errorlevel 2 exit /b 0
node scripts\stop.js
pause
exit /b 0

:no_node
echo Node.js 를 찾지 못했습니다.
echo 방법 1: https://nodejs.org 에서 LTS 설치 파일을 받아 설치합니다.
echo 방법 2: 관리자 권한이 없으면 Node.js 압축 파일을 풀고, 그 폴더 이름을 node 로 바꿔
echo         이 폴더 안에 넣습니다. 그 안에 node.exe 가 있어야 합니다.
pause
exit /b 1
