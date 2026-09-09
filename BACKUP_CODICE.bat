@echo off
title GRUPO SOMBRA — Backup Codice
color 0A

set TIMESTAMP=%date:~6,4%-%date:~3,2%-%date:~0,2%_%time:~0,2%-%time:~3,2%
set TIMESTAMP=%TIMESTAMP: =0%
set DESTDIR=%~dp0_backups\codice\%TIMESTAMP%

echo.
echo  ================================================
echo   GRUPO SOMBRA — Backup Codice
echo   Destinazione: _backups\codice\%TIMESTAMP%
echo  ================================================
echo.

:: Crea cartella di backup
mkdir "%DESTDIR%" >nul 2>&1

:: Copia i file sorgente (escludi node_modules e .vite)
echo  Copiando /src ...
xcopy "%~dp0src" "%DESTDIR%\src" /E /I /Q >nul

echo  Copiando file di configurazione...
for %%f in (package.json vite.config.js index.html START_APP.bat BACKUP_CODICE.bat DEVLOG.md TECHNICAL_DOC.md) do (
    if exist "%~dp0%%f" copy /Y "%~dp0%%f" "%DESTDIR%\%%f" >nul
)

:: Crea ZIP del backup
echo  Creando archivio ZIP...
powershell -Command "Compress-Archive -Path '%DESTDIR%' -DestinationPath '%DESTDIR%.zip' -Force" >nul 2>&1

:: Rimuovi cartella temporanea
rmdir /s /q "%DESTDIR%" >nul 2>&1

echo.
echo  ================================================
echo  [OK] Backup creato: _backups\codice\%TIMESTAMP%.zip
echo  ================================================
echo.
echo  Premi un tasto per chiudere.
pause >nul
