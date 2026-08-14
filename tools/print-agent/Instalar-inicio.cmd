@echo off
rem Deja el agente arrancando solo cada vez que se prende la PC del local.
rem No hace falta ser administrador: se instala en la carpeta de Inicio del usuario.
setlocal
title BYR Club - Instalar inicio automatico
cd /d "%~dp0"

if not exist "%~dp0config.json" (
  echo.
  echo FALTA config.json
  echo Copia config.example.json como config.json y completa el token antes de instalar.
  echo.
  pause
  exit /b 1
)

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LAUNCHER=%STARTUP%\BYR-agente-impresion.vbs"

rem Un .vbs para que arranque sin ventana negra en la cara del que atiende.
> "%LAUNCHER%" echo Set sh = CreateObject("WScript.Shell")
>> "%LAUNCHER%" echo sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -File ""%~dp0byr-print-agent.ps1""", 0, False

if exist "%LAUNCHER%" (
  echo.
  echo LISTO. El agente va a arrancar solo cada vez que se prenda la PC.
  echo.
  rem Si ya habia uno corriendo lo cerramos, para no dejar dos dando vueltas
  rem si alguien corre este instalador mas de una vez.
  rem OJO: hay que excluir el proceso actual ($PID). Su propia linea de comandos
  rem contiene "byr-print-agent.ps1", asi que sin el filtro se mata a si mismo.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*-File*byr-print-agent.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" 2>nul
  echo Arrancandolo ahora...
  start "" wscript "%LAUNCHER%"
  echo.
  echo Para ver que esta haciendo, abri: agente.log
  echo Para desactivarlo: Desinstalar-inicio.cmd
) else (
  echo.
  echo No se pudo crear el acceso en la carpeta de Inicio.
)
echo.
pause
