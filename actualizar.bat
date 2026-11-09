@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title Calculo de Apoyos BT - Actualizar
echo ==========================================================
echo   Calculo de Apoyos BT - instalar una actualizacion
echo ==========================================================
echo.
where git >nul 2>nul || (echo ERROR: no esta instalado Git. & pause & exit /b 1)
set "DESC=%USERPROFILE%\Downloads"
set "ZIP="
for /f "delims=" %%Z in ('powershell -NoProfile -Command "Get-ChildItem -Path '%DESC%','%~dp0' -Filter 'apoyos-bt-actualizacion-v*.zip' -ErrorAction SilentlyContinue | Sort-Object { [version](($_.BaseName -replace '^apoyos-bt-actualizacion-v','') -replace '[^0-9.]','') } | Select-Object -Last 1 -ExpandProperty FullName"') do set "ZIP=%%Z"
if "%ZIP%"=="" (echo No encuentro ningun apoyos-bt-actualizacion-v*.zip en Descargas ni en esta carpeta. & pause & exit /b 1)
echo Paquete: %ZIP%

rem Cambios sin subir: primero hay que subirlos
git diff --quiet HEAD -- . 2>nul
if errorlevel 1 (
  echo.
  echo Hay archivos cambiados que todavia no estan en GitHub.
  echo Ejecuta subir-a-github.bat, espera a LISTO y vuelve a ejecutar este archivo.
  pause & exit /b 1
)
powershell -NoProfile -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%~dp0' -Force" || (echo ERROR al descomprimir. & pause & exit /b 1)
set /p VER=<VERSION
echo -^> version del paquete: %VER%

git add -A
git diff --cached --quiet
if errorlevel 1 (git commit -q -m "v%VER%") else (echo La carpeta ya esta en la version %VER%.)
git rev-parse -q --verify "refs/tags/v%VER%" >nul || git tag -a "v%VER%" -m "v%VER%"
git push origin main --tags
if errorlevel 1 (echo ERROR al subir a GitHub. Ejecuta subir-a-github.bat. & pause & exit /b 1)
echo.
echo LISTO: version %VER% guardada en GitHub con su etiqueta v%VER%.
echo GitHub la publica sola en la web en 1-2 minutos (pestana Actions, "Publicar web").
echo Despues abre la web y pulsa Ctrl+F5: debe poner v%VER%.
pause
