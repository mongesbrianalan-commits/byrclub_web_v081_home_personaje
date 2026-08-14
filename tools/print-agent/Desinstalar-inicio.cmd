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
rem OJO: hay que excluir el proceso actual ($PID). Su propia linea de comandos
rem contiene "byr-print-agent.ps1", asi que sin el filtro se mata a si mismo
rem antes de llegar a cerrar el agente de verdad.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*-File*byr-print-agent.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo.
echo Listo.
pause
