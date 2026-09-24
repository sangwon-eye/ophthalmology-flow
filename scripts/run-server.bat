@echo off
rem Runs the server with no window and restarts it if it stops unexpectedly.
rem Started by the hidden-start batch file in the parent folder. Do not run directly.
cd /d "%~dp0.."
if exist "node\node.exe" set "PATH=%CD%\node;%PATH%"
set "OPH_HIDDEN=1"

:loop
node server.js
set "CODE=%errorlevel%"
rem 0 = stopped on purpose, 2 = data file problem, 3 = already running
if "%CODE%"=="0" exit /b 0
if "%CODE%"=="2" exit /b 2
if "%CODE%"=="3" exit /b 3
ping -n 6 127.0.0.1 >nul
goto loop
