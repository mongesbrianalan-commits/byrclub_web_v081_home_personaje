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
  echo Arrancandolo ahora tambien...
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
