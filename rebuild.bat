@echo off
title AGI PRIME - Rebuild
color 0B
echo.
echo  ================================================================
echo     A G I   P R I M E   -   R E B U I L D
echo  ================================================================
echo.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
if exist "dist" rmdir /s /q dist
echo  [*] Building...
echo.
call npm run build
if errorlevel 1 goto fail
echo.
echo  [+] Rebuild complete.
echo.
echo  [*] Launching AGI PRIME...
echo.
call npm run dev
goto end
:nonode
echo  [!] Node.js not found. Install from https://nodejs.org
pause
goto end
:fail
echo  [!] Build failed.
pause
:end
