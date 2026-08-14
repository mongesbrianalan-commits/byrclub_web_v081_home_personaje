@echo off
rem Imprime una tirita de prueba directo a la termica, sin pasar por la web.
rem Sirve para saber si el problema es la impresora o la conexion con byrclub.com.
title BYR Club - Probar impresora
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0byr-print-agent.ps1" -TestPrinter
echo.
pause
