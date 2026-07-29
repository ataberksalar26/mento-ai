Add-Type -AssemblyName System.Windows.Forms

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = "Apple API Key (*.p8)|*.p8|All files (*.*)|*.*"
$dialog.Title = "Apple API anahtari (.p8) dosyasini sec"

if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    exit
}

$base64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($dialog.FileName))
Set-Clipboard -Value $base64
[System.Windows.Forms.MessageBox]::Show(
    "Base64 metni panoya kopyalandi. Codemagic'te Variable value alanina yapistir.",
    "Mento AI"
)
