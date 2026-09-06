@echo off
title Mento AI Siteye Yukle
cls
echo ==============================
echo Mento AI siteye yukleme basladi
echo ==============================
echo.

set "SOURCE=C:\Users\atabe\Documents\Codex\2026-06-22\ai-destekli-bir-ko-luk-ayt\outputs\mento-astra-dark"
set "IOS_SOURCE=C:\Users\atabe\Documents\Codex\2026-06-22\ai-destekli-bir-ko-luk-ayt\outputs\mento-ios-app"
set "TARGET=C:\Users\atabe\OneDrive\Desktop\Mento Al"

if not exist "%SOURCE%\index.html" (
  echo Kaynak index.html bulunamadi:
  echo %SOURCE%\index.html
  echo.
  pause
  exit /b 1
)

if not exist "%TARGET%\.git" (
  echo GitHub proje klasoru bulunamadi:
  echo %TARGET%
  echo.
  pause
  exit /b 1
)

echo Dosyalar proje klasorune kopyalaniyor...
copy /Y "%SOURCE%\index.html" "%TARGET%\index.html" >nul
copy /Y "%SOURCE%\gizlilik.html" "%TARGET%\gizlilik.html" >nul
copy /Y "%SOURCE%\kosullar.html" "%TARGET%\kosullar.html" >nul
copy /Y "%SOURCE%\404.html" "%TARGET%\404.html" >nul
copy /Y "%SOURCE%\tesekkurler.html" "%TARGET%\tesekkurler.html" >nul
copy /Y "%SOURCE%\robots.txt" "%TARGET%\robots.txt" >nul
copy /Y "%SOURCE%\sitemap.xml" "%TARGET%\sitemap.xml" >nul
copy /Y "%SOURCE%\favicon.svg" "%TARGET%\favicon.svg" >nul
copy /Y "%SOURCE%\site.webmanifest" "%TARGET%\site.webmanifest" >nul
copy /Y "%SOURCE%\sw.js" "%TARGET%\sw.js" >nul
copy /Y "%SOURCE%\server.js" "%TARGET%\server.js" >nul
copy /Y "%SOURCE%\ai-budget.js" "%TARGET%\ai-budget.js" >nul
copy /Y "%SOURCE%\question-bank.js" "%TARGET%\question-bank.js" >nul
copy /Y "%SOURCE%\.env.example" "%TARGET%\.env.example" >nul
copy /Y "%SOURCE%\SORU-TOPLAMA-SABLONU.md" "%TARGET%\SORU-TOPLAMA-SABLONU.md" >nul
if not exist "%TARGET%\data" mkdir "%TARGET%\data"
if not exist "%TARGET%\scripts" mkdir "%TARGET%\scripts"
if not exist "%TARGET%\assets" mkdir "%TARGET%\assets"
xcopy /E /I /Y "%SOURCE%\data" "%TARGET%\data" >nul
xcopy /E /I /Y "%SOURCE%\scripts" "%TARGET%\scripts" >nul
xcopy /E /I /Y "%SOURCE%\assets" "%TARGET%\assets" >nul
if exist "%IOS_SOURCE%\MentoAI.xcodeproj\project.pbxproj" (
  echo iPhone uygulama projesi de ekleniyor...
  xcopy /E /I /Y "%IOS_SOURCE%" "%TARGET%\ios-app" >nul
  copy /Y "%IOS_SOURCE%\codemagic.yaml" "%TARGET%\codemagic.yaml" >nul
)

cd /d "%TARGET%"

echo.
echo Eski yarim kalmis Git islemi varsa temizleniyor...
git rebase --abort >nul 2>nul

echo.
echo Degisiklikler kaydediliyor...
git add index.html gizlilik.html kosullar.html 404.html tesekkurler.html robots.txt sitemap.xml assets favicon.svg site.webmanifest sw.js server.js ai-budget.js question-bank.js .env.example SORU-TOPLAMA-SABLONU.md data scripts ios-app codemagic.yaml
git commit -m "Improve site SEO and publishing pages"

echo.
echo GitHub'daki son degisiklikler aliniyor...
git pull --rebase origin main

if errorlevel 1 (
  echo.
  echo GitHub'dan alma sirasinda hata oldu.
  echo Ekran goruntusunu at, ona gore duzeltecegiz.
  pause
  exit /b 1
)

echo.
echo GitHub'a gonderiliyor...
git push origin main

if errorlevel 1 (
  echo.
  echo Push basarisiz oldu. SON-PUSH-COZ.cmd dosyasini calistir.
  pause
  exit /b 1
)

echo.
echo ==============================
echo Bitti. Site GitHub'a gonderildi.
echo Render 2-5 dakika icinde yayina alir.
echo ==============================
pause
