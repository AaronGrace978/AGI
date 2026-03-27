@echo off
setlocal
cd /d "%~dp0"

if not exist ".expo-token" (
  echo.
  echo  STEP 1: Create a file named .expo-token in this folder.
  echo  STEP 2: Put ONLY your Expo access token on ONE line — no spaces before/after.
  echo  STEP 3: Get a token: https://expo.dev/accounts/aarongrace/settings/access-tokens
  echo  You can copy .expo-token.example to .expo-token and replace the placeholder line.
  echo.
  exit /b 1
)

set "EXPO_TOKEN="
for /f "usebackq delims=" %%a in (".expo-token") do (
  set "EXPO_TOKEN=%%a"
  goto :run
)

:run
if "%EXPO_TOKEN%"=="" (
  echo .expo-token is empty.
  exit /b 1
)
if "%EXPO_TOKEN%"=="paste_your_expo_access_token_here_replace_this_whole_line" (
  echo Edit .expo-token and replace the placeholder with your real token from expo.dev
  exit /b 1
)

echo [EAS] Token loaded from .expo-token
npx eas %*
exit /b %ERRORLEVEL%
