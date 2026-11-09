@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title Calculo de Apoyos BT - Subir a GitHub
echo ==========================================================
echo   Calculo de Apoyos BT - subir el programa a GitHub
echo ==========================================================
echo.
where git >nul 2>nul || (echo ERROR: no esta instalado Git. Instalalo desde https://git-scm.com y vuelve a ejecutar este archivo. & pause & exit /b 1)
if not exist ".git" (echo ERROR: esta carpeta no tiene el historial de versiones. Descomprime de nuevo el paquete completo. & pause & exit /b 1)

git config user.name >nul 2>nul || git config user.name "Tecnicos Elecanto"
git config user.email >nul 2>nul || git config user.email "tecnicos@elecanto.es"

rem --- 1. Proyecto de Firebase (solo la primera vez) ---
findstr /c:"PON-AQUI" "web\.firebaserc" >nul 2>nul
if not errorlevel 1 (
  echo Falta el ID del proyecto de Firebase.
  echo Lo ves en la consola de Firebase, rueda dentada ^> Configuracion del proyecto ^> "ID del proyecto".
  set /p FBID="Escribe el ID del proyecto y pulsa Intro: "
  if "!FBID!"=="" (echo No has escrito nada. & pause & exit /b 1)
  powershell -NoProfile -Command "(Get-Content 'web\.firebaserc') -replace 'PON-AQUI-EL-ID-DEL-PROYECTO','!FBID!' | Set-Content -Encoding ascii 'web\.firebaserc'"
  echo Proyecto de Firebase guardado: !FBID!
  echo.
)

rem --- 2. Enlace con el repositorio de GitHub (solo la primera vez) ---
git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo Esta carpeta todavia no esta enlazada con GitHub.
  echo Crea en github.com un repositorio PRIVADO y VACIO, por ejemplo "calculo-apoyos-bt".
  set /p REPO="Pega aqui su direccion, del tipo https://github.com/usuario/calculo-apoyos-bt, y pulsa Intro: "
  if "!REPO!"=="" (echo No has escrito nada. & pause & exit /b 1)
  git remote add origin "!REPO!"
)

rem --- 3. Quitar claves que se hayan colado ---
for %%F in (*serviceAccount*.json *-firebase-adminsdk-*.json cuenta*.json web\*-firebase-adminsdk-*.json) do (
  if exist "%%F" (git rm --cached -q "%%F" >nul 2>nul & echo AVISO: "%%F" es una clave privada. No se sube a GitHub; guardala fuera de esta carpeta.)
)

rem --- 4. Guardar y subir ---
git add -A
git diff --cached --quiet || git commit -q -m "Cambios locales" 
git branch -M main
git push -u origin main --tags
if errorlevel 1 (
  echo.
  echo ERROR al subir. Si GitHub pide usuario, entra con tu cuenta en la ventana que se abre.
  echo Si dice "rejected", ejecuta:  git pull --rebase origin main   y repite.
  pause & exit /b 1
)
echo.
echo LISTO: el programa esta guardado en GitHub.
echo La publicacion en la web la hace GitHub sola: mira la pestana Actions, "Publicar web".
pause
