@echo off
setlocal
title Mento AI Apple Sertifika Istegi

set "OUT=%USERPROFILE%\Desktop\Mento-Apple-Signing"
if not exist "%OUT%" mkdir "%OUT%"

> "%OUT%\MentoAI-AppleDistribution.inf" (
  echo [Version]
  echo Signature="$Windows NT$"
  echo.
  echo [NewRequest]
  echo Subject = "CN=Mento AI Distribution, C=TR"
  echo KeyAlgorithm = RSA
  echo KeyLength = 2048
  echo Exportable = TRUE
  echo MachineKeySet = FALSE
  echo RequestType = PKCS10
  echo HashAlgorithm = sha256
  echo KeyUsage = 0xa0
  echo.
  echo [Extensions]
  echo 2.5.29.37 = "{text}"
  echo _continue_ = "1.3.6.1.5.5.7.3.3"
)

certreq -new "%OUT%\MentoAI-AppleDistribution.inf" "%OUT%\MentoAI-AppleDistribution.csr"
if errorlevel 1 (
  echo.
  echo Sertifika istegi olusturulamadi. Bu pencerenin ekran goruntusunu gonder.
  pause
  exit /b 1
)

echo.
echo Hazir. Masaustunde Mento-Apple-Signing klasoru acildi.
echo Apple Developer portalinda Certificates bolumune gir.
echo + dugmesine bas, Apple Distribution sec, sonra bu .csr dosyasini yukle.
start "" "%OUT%"
pause
