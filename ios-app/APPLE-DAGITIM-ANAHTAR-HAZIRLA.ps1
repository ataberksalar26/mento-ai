Add-Type -AssemblyName System.Windows.Forms
$ErrorActionPreference = 'Stop'

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Apple Developer indirdigin .cer dosyasini sec'
$dialog.Filter = 'Apple certificate (*.cer)|*.cer|All files (*.*)|*.*'
if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    exit 1
}

$certificatePath = $dialog.FileName
$downloaded = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certificatePath)
$thumbprint = $downloaded.Thumbprint

# Apple'in sertifikasinda Windows certreq'in tanimadigi kritik bir uzanti var.
# Bu nedenle sertifikayi dogrudan kullanici deposuna ekleyip, CSR ile olusan
# mevcut ozel anahtarla certutil araciligiyla eslestiriyoruz.
Write-Host 'Sertifika ozel anahtarla eslestiriliyor...'
& certutil.exe -user -f -addstore My $certificatePath | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Sertifika kullanici deposuna eklenemedi.' -ForegroundColor Red
    exit 1
}

& certutil.exe -user -repairstore My $thumbprint | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Sertifika eski CSR anahtariyla eslestirilemedi.' -ForegroundColor Red
    Write-Host 'CSR ve distribution.cer ayni sertifika icin olmali.' -ForegroundColor Yellow
    exit 1
}

$certificate = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Thumbprint -eq $downloaded.Thumbprint -and $_.HasPrivateKey } |
    Select-Object -First 1

if (-not $certificate) {
    Write-Host 'Sertifika bulundu fakat bu bilgisayardaki ozel anahtarla eslesmedi.' -ForegroundColor Red
    Write-Host 'Once APPLE-DAGITIM-CSR-OLUSTUR.cmd dosyasini ayni bilgisayarda calistirdigindan emin ol.' -ForegroundColor Yellow
    exit 1
}

$rsa = $certificate.PrivateKey
if (-not $rsa) {
    Write-Host 'RSA ozel anahtari bulunamadi.' -ForegroundColor Red
    exit 1
}

function Encode-Length([int]$length) {
    if ($length -lt 128) { return [byte[]]@($length) }
    $bytes = New-Object System.Collections.Generic.List[byte]
    while ($length -gt 0) {
        $bytes.Insert(0, [byte]($length -band 0xff))
        $length = $length -shr 8
    }
    return [byte[]]@([byte](0x80 -bor $bytes.Count)) + $bytes.ToArray()
}

function Encode-Integer([byte[]]$value) {
    $trim = 0
    while ($trim -lt ($value.Length - 1) -and $value[$trim] -eq 0) { $trim++ }
    $body = $value[$trim..($value.Length - 1)]
    if (($body[0] -band 0x80) -ne 0) { $body = [byte[]]@(0) + $body }
    return [byte[]]@(2) + (Encode-Length $body.Length) + $body
}

try {
    $parameters = $rsa.ExportParameters($true)
} catch {
    Write-Host 'Ozel anahtar disa aktarilamiyor. Sertifika istegini yeniden olusturup devam et.' -ForegroundColor Red
    exit 1
}

$parts = @(
    (Encode-Integer ([byte[]]@(0))),
    (Encode-Integer $parameters.Modulus),
    (Encode-Integer $parameters.Exponent),
    (Encode-Integer $parameters.D),
    (Encode-Integer $parameters.P),
    (Encode-Integer $parameters.Q),
    (Encode-Integer $parameters.DP),
    (Encode-Integer $parameters.DQ),
    (Encode-Integer $parameters.InverseQ)
)
$body = [byte[]]($parts | ForEach-Object { $_ })
$der = [byte[]]@(0x30) + (Encode-Length $body.Length) + $body
$base64 = [Convert]::ToBase64String($der, [Base64FormattingOptions]::InsertLineBreaks)
$pem = "-----BEGIN RSA PRIVATE KEY-----`r`n$base64`r`n-----END RSA PRIVATE KEY-----"

$outputDirectory = Join-Path $env:USERPROFILE 'Desktop\Mento-Apple-Signing'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$outputPath = Join-Path $outputDirectory 'codemagic_certificate_private_key.pem'
[System.IO.File]::WriteAllText($outputPath, $pem)
Set-Clipboard -Value $pem

Write-Host ''
Write-Host 'Hazir. Anahtar panoya kopyalandi.' -ForegroundColor Green
Write-Host "Dosya: $outputPath"
Write-Host 'Codemagicte CERTIFICATE_PRIVATE_KEY adiyla appstore_credentials grubuna ekle.' -ForegroundColor Yellow
