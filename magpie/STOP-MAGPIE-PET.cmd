@echo off
cd /d "%~dp0"
node app.mjs stop
if errorlevel 1 pause
