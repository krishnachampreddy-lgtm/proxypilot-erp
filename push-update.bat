@echo off
cd /d "%~dp0"
echo.
echo  Sending the latest changes to GitHub...
echo.
git add -A
if exist .commit-msg.txt (git commit -F .commit-msg.txt) else (git commit -m "Update")
git push
echo.
echo  Done. This window closes in 10 seconds.
timeout /t 10 >nul
