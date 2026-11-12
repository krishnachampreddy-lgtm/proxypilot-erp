@echo off
cd /d "%~dp0"
echo.
echo  First push of ProxyPilot ERP edition to GitHub
echo  (create an EMPTY repo named proxypilot-erp on github.com first)
echo.
if exist .git (
  echo This folder is already a git repository. Nothing to do.
  pause
  exit /b
)
git init
git add .
git commit -m "ProxyPilot ERP edition: connect to a school's ERP (API, signed webhooks, sync, demo ERP)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01Efak7F4NtjktbTRW9KP4hF"
git branch -M main
git remote add origin https://github.com/krishnachampreddy-lgtm/proxypilot-erp.git
git push -u origin main
echo.
echo Done. You can close this window.
pause
