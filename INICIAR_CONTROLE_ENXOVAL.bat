@echo off
title SOMBRA ENXOVAL PRO
chcp 65001 > nul
echo ===================================================
echo     GRUPO SOMBRA - SISTEMA DE CONTROLE DE ENXOVAL
echo ===================================================
echo.
echo Iniciando o sistema de controle de enxoval...
echo.

set HTML_FILE=%~dp0Controle_Enxoval.html

start "" "%HTML_FILE%"

:done
echo Sistema aberto com sucesso!
timeout /t 2 > nul
