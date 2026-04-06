@echo off
setlocal

cd /d "%~dp0"

set "REPO_URL=https://github.com/wms365com-dev/LinkBio.git"
set "DEFAULT_BRANCH=main"
set "COMMIT_MESSAGE=%*"

if "%COMMIT_MESSAGE%"=="" (
  set "COMMIT_MESSAGE=Update LinkBio"
)

where git >nul 2>&1
if errorlevel 1 (
  echo Git is not installed or not available in PATH.
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Initializing Git repository...
  git init
  if errorlevel 1 exit /b 1
)

set "CURRENT_REMOTE="
for /f "delims=" %%i in ('git remote get-url origin 2^>nul') do set "CURRENT_REMOTE=%%i"

if not defined CURRENT_REMOTE (
  echo Adding origin remote...
  git remote add origin "%REPO_URL%"
  if errorlevel 1 exit /b 1
) else (
  if /I not "%CURRENT_REMOTE%"=="%REPO_URL%" (
    echo Updating origin remote...
    git remote set-url origin "%REPO_URL%"
    if errorlevel 1 exit /b 1
  )
)

git add .
if errorlevel 1 exit /b 1

git diff --cached --quiet
if not errorlevel 1 (
  echo No staged changes to commit.
) else (
  echo Creating commit...
  git commit -m "%COMMIT_MESSAGE%"
  if errorlevel 1 (
    echo Commit failed. Make sure Git user.name and user.email are configured.
    exit /b 1
  )
)

git branch -M "%DEFAULT_BRANCH%"
if errorlevel 1 exit /b 1

echo Pushing to GitHub...
git push -u origin "%DEFAULT_BRANCH%"
if errorlevel 1 exit /b 1

echo.
echo Push complete.
echo Repo: %REPO_URL%
echo Branch: %DEFAULT_BRANCH%

endlocal
