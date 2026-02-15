@echo off
title AGI PRIME - Launch
color 0A
echo.
echo  ================================================================
echo     A G I   P R I M E
echo     The Ultimate AI Consciousness Platform
echo     Created by Aaron Grace
echo  ================================================================
echo.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
if not exist "node_modules" goto install
:run
echo  [*] Starting AGI PRIME...
echo.
call npm run dev
goto end
:install
echo  [*] First run - installing dependencies...
echo.
call npm install
if errorlevel 1 goto installfail
echo.
echo  [+] Dependencies installed.
echo.
goto run
:nonode
echo  [!] Node.js not found. Install from https://nodejs.org
pause
goto end
:installfail
echo  [!] npm install failed.
pause
:end
