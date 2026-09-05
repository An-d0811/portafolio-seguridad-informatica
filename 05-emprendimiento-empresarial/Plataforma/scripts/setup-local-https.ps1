param(
  [string]$HostName = "riesgo-ia.gt.local",
  [string]$CertDir = "$PSScriptRoot\..\infra\certs",
  [switch]$Force,
  [switch]$Trust
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "==> $Message"
}

New-Item -ItemType Directory -Force -Path $CertDir | Out-Null
$CertDir = (Resolve-Path $CertDir).Path

$certPath = Join-Path $CertDir "$HostName.pem"
$keyPath = Join-Path $CertDir "$HostName-key.pem"
$caPath = Join-Path $CertDir "riesgo-ia-local-ca.pem"
$generateScript = Join-Path $PSScriptRoot "generate-local-certs.sh"

$certsExist = (Test-Path $certPath) -and (Test-Path $keyPath) -and (Test-Path $caPath)
if ($certsExist -and -not $Force) {
  Write-Step "Certificates already exist. Use -Force to regenerate."
} else {
  Write-Step "Generating CA and server certificate with OpenSSL (Docker)..."
  docker run --rm --entrypoint sh `
    -v "${CertDir}:/certs" `
    -v "${generateScript}:/generate-local-certs.sh:ro" `
    alpine/openssl /generate-local-certs.sh $HostName /certs
  Write-Step "Certificates created:"
  Write-Host "  $certPath"
  Write-Host "  $keyPath"
  Write-Host "  $caPath"
}

if ($Trust) {
  Write-Step "Installing local CA into CurrentUser\Root (Windows may show a security prompt)..."
  certutil -user -delstore Root "Riesgo IA Local Dev Root" 2>$null | Out-Null
  certutil -user -addstore Root $caPath
  Write-Step "Local CA trusted."
} else {
  Write-Host ""
  Write-Host "To trust the certificate in Windows, run:"
  Write-Host "  .\scripts\setup-local-https.ps1 -Trust"
  Write-Host "Or double-click: $caPath"
  Write-Host ""
}

$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$hostsEntry = "127.0.0.1 $HostName"
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if ($isAdmin -and -not (Select-String -Path $hostsPath -Pattern "^\s*127\.0\.0\.1\s+$([regex]::Escape($HostName))\s*$" -Quiet)) {
  Add-Content -Path $hostsPath -Value $hostsEntry
  Write-Step "Added hosts entry: $hostsEntry"
} elseif (-not $isAdmin) {
  Write-Host "Hosts entry (add as Administrator if missing): $hostsEntry"
}

Write-Step "Done. Restart frontend: docker compose up --build -d frontend"
