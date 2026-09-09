@echo off
title GRUPO SOMBRA — Finance Hub
color 0B

echo.
echo  ================================================
echo   GRUPO SOMBRA Finance Hub — Avvio in corso...
echo  ================================================
echo.

:: ── AUTO BACKUP CODICE ── (eseguito ad ogni avvio)
echo  [0/3] Backup automatico codice...
set BKTS=%date:~6,4%-%date:~3,2%-%date:~0,2%_%time:~0,2%-%time:~3,2%
set BKTS=%BKTS: =0%
set BKDIR=%~dp0_backups\codice
mkdir "%BKDIR%" >nul 2>&1
set BKTMPDIR=%BKDIR%\%BKTS%
mkdir "%BKTMPDIR%" >nul 2>&1
xcopy "%~dp0src" "%BKTMPDIR%\src" /E /I /Q >nul 2>&1
for %%f in (package.json vite.config.js index.html DEVLOG.md TECHNICAL_DOC.md) do (
    if exist "%~dp0%%f" copy /Y "%~dp0%%f" "%BKTMPDIR%\%%f" >nul 2>&1
)
powershell -Command "Compress-Archive -Path '%BKTMPDIR%' -DestinationPath '%BKDIR%\%BKTS%.zip' -Force" >nul 2>&1
rmdir /s /q "%BKTMPDIR%" >nul 2>&1
:: Conserva solo gli ultimi 15 ZIP (rimuove i più vecchi)
powershell -Command "Get-ChildItem '%BKDIR%\*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 15 | Remove-Item -Force" >nul 2>&1
echo  [0/3] Backup codice OK: _backups\codice\%BKTS%.zip

:: Chiude eventuali processi node/vite esistenti sulla porta 5180
echo  [1/3] Pulizia porte in uso...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5180" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Cancella la cache Vite per evitare problemi
echo  [2/3] Pulizia cache Vite...
if exist "node_modules\.vite" (
    rmdir /s /q "node_modules\.vite" >nul 2>&1
)

:: Apre il browser dopo 3 secondi (in background)
echo  [3/3] Avvio server...
start "" /b powershell -Command "Start-Sleep 3; Start-Process 'http://localhost:5180'"

:: Avvia il dev server
echo.
echo  ================================================
echo   App disponibile su: http://localhost:5180
echo   Premi CTRL+C per fermare il server
echo  ================================================
echo.

npx vite --port 5180 --force

pause
