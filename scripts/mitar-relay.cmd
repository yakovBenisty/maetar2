@echo off
rem Runs the MITAR relay (download from MITAR on this machine, upload to production)
rem and appends its output to logs\mitar-sync.log. Meant for Windows Task Scheduler;
rem see the header of mitar-relay.ts for the one-time registration command.
setlocal
cd /d "%~dp0.."
if not exist logs mkdir logs
call npx --yes tsx scripts\mitar-relay.ts >> logs\mitar-sync.log 2>&1
exit /b %ERRORLEVEL%
