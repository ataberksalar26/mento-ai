@echo off
cd /d "%~dp0"
title Mento AI Server
cls
echo ===============================
echo        Mento AI Server
echo ===============================
echo.
if not exist .env (
  echo .env dosyasi bulunamadi.
  echo .env.example dosyasini .env olarak kopyalayip API anahtarini ekle.
  echo.
  pause
  exit /b 1
)
echo Site birazdan acilacak: http://localhost:3000
echo Bu pencereyi kapatma. Kapatirsan site durur.
echo.
start "" http://localhost:3000
node server.js
echo.
echo Sunucu kapandi. Hata varsa yukarida gorunur.
pause
