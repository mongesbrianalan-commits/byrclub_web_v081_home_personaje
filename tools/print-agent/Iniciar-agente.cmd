@echo off
rem Arranca el agente de impresion en esta ventana (se ve lo que va pasando).
rem Para cerrarlo: Ctrl+C o cerrar la ventana.
title BYR Club - Agente de impresion
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0byr-print-agent.ps1"
echo.
echo El agente se detuvo. Revisa el mensaje de arriba.
pause
