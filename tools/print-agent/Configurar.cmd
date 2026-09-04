@echo off
rem Configura esta PC para imprimir: pregunta el token y la IP de la termica
rem y escribe config.json. Es lo primero que hay que correr en una PC nueva.
title BYR Club - Configurar esta PC
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0byr-print-agent.ps1" -Configurar
echo.
pause
