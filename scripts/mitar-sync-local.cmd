@echo off
rem Runs the local MITAR sync and appends its output to logs\mitar-sync.log.
rem Meant to be launched by Windows Task Scheduler (see the header of mitar-sync-local.ts).
setlocal
cd /d "%~dp0.."
if not exist logs mkdir logs
set MITAR_SYNC_DNS=8.8.8.8,1.1.1.1
call npx --yes tsx scripts\mitar-sync-local.ts >> logs\mitar-sync.log 2>&1
exit /b %ERRORLEVEL%
