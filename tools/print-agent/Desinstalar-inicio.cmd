@echo off
rem Saca el agente del arranque automatico y cierra el que este corriendo.
setlocal
title BYR Club - Desinstalar inicio automatico

set "LAUNCHER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\BYR-agente-impresion.vbs"
if exist "%LAUNCHER%" (
  del "%LAUNCHER%"
  echo Sacado del arranque automatico.
) else (
  echo No estaba instalado en el arranque.
)

echo Cerrando el agente si esta corriendo...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*byr-print-agent.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo.
echo Listo.
pause
