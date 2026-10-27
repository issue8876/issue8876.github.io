@echo off
setlocal
set "MAEUM_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%MAEUM_NODE%" set "MAEUM_NODE=node.exe"
cd /d "%~dp0"
"%MAEUM_NODE%" scripts\openai-key-setup.mjs --open
pause
