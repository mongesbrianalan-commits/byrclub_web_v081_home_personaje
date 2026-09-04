@echo off
rem Revisa config, impresora y conexion con la web. No imprime nada.
rem Sirve para saber cual de los tres eslabones esta fallando.
title BYR Club - Diagnostico de impresion
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0byr-print-agent.ps1" -Diagnostico
echo.
pause
