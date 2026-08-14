<#
  BYR Club — Agente de impresión del local
  =========================================
  Corre en la PC del local. Cada pocos segundos le pregunta a byrclub.com si
  hay comandas o tickets para imprimir y los manda a la térmica por TCP 9100.

  Por qué hace falta: la web vive en un hosting en internet y no puede hablarle
  directo a una impresora que está en la red del local. Entonces el server deja
  el trabajo listo en una cola y este programita lo viene a buscar.

  No necesita instalar nada: es PowerShell, que ya viene con Windows.

  Configuración: config.json al lado de este archivo (copiar de
  config.example.json). Ahí van la dirección de la web, el token y la IP de la
  impresora.

  Para arrancarlo: doble clic en Iniciar-agente.cmd
  Para que arranque solo al prender la PC: doble clic en Instalar-inicio.cmd
#>

[CmdletBinding()]
param(
  [string] $ConfigPath,
  # Imprime una prueba y sale (sin conectarse a la web).
  [switch] $TestPrinter,
  # Una sola vuelta y sale. Sirve para probar sin dejarlo corriendo.
  [switch] $Once
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ConfigPath) { $ConfigPath = Join-Path $here 'config.json' }
$logPath = Join-Path $here 'agente.log'

# Hostinger habla TLS 1.2; Windows 10 con PowerShell 5.1 a veces arranca en TLS 1.0.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Log {
  param([string] $Message, [string] $Level = 'INFO')
  $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
  Write-Host $line
  try {
    # Log chico: si pasa de 1 MB, se empieza de nuevo (no queremos llenar el disco).
    if ((Test-Path $logPath) -and ((Get-Item $logPath).Length -gt 1MB)) {
      Remove-Item $logPath -Force -ErrorAction SilentlyContinue
    }
    Add-Content -Path $logPath -Value $line -Encoding utf8
  } catch { }
}

function Read-Config {
  if (-not (Test-Path $ConfigPath)) {
    throw "No encuentro config.json. Copiá config.example.json a config.json y completalo."
  }
  $cfg = Get-Content $ConfigPath -Raw -Encoding utf8 | ConvertFrom-Json

  if (-not $cfg.apiBase)   { throw "Falta 'apiBase' en config.json (ej: https://byrclub.com/api/)" }
  if (-not $cfg.token)     { throw "Falta 'token' en config.json (tiene que ser el mismo print_token del server)" }
  if (-not $cfg.printerIp) { throw "Falta 'printerIp' en config.json (ej: 192.168.0.250)" }

  if (-not $cfg.apiBase.EndsWith('/')) { $cfg.apiBase = $cfg.apiBase + '/' }
  if (-not $cfg.station)     { $cfg | Add-Member station 'cocina' -Force }
  if (-not $cfg.printerPort) { $cfg | Add-Member printerPort 9100 -Force }
  if (-not $cfg.pollSeconds) { $cfg | Add-Member pollSeconds 4 -Force }
  return $cfg
}

<#
  Manda bytes crudos a la impresora por TCP 9100.
  Devuelve $null si salió bien, o el motivo del error.
#>
function Send-ToPrinter {
  param(
    [byte[]] $Bytes,
    [string] $Ip,
    [int]    $Port
  )
  $client = $null
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async  = $client.BeginConnect($Ip, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(5000, $false)) {
      return "La impresora no responde en $Ip`:$Port (¿apagada o sin red?)"
    }
    $client.EndConnect($async)
    $stream = $client.GetStream()
    $stream.Write($Bytes, 0, $Bytes.Length)
    $stream.Flush()
    # Sin esta pausa el cierre del socket puede cortar el último pedazo.
    Start-Sleep -Milliseconds 400
    $stream.Close()
    return $null
  } catch {
    return $_.Exception.Message
  } finally {
    if ($client) { try { $client.Close() } catch { } }
  }
}

function Invoke-Api {
  param(
    [string] $Url,
    [string] $Method = 'GET',
    $Body = $null,
    [string] $Token
  )
  $headers = @{ 'X-BYR-Print-Token' = $Token }
  if ($Method -eq 'GET') {
    return Invoke-RestMethod -Uri $Url -Headers $headers -TimeoutSec 20
  }
  $json = $Body | ConvertTo-Json -Compress
  return Invoke-RestMethod -Uri $Url -Method Post -Headers $headers `
    -ContentType 'application/json' -Body $json -TimeoutSec 20
}

# --- Prueba directa de impresora (no toca la web) --------------------------
if ($TestPrinter) {
  $cfg = Read-Config
  $ESC = [char]27; $GS = [char]29
  $txt = "$ESC@" + "$ESC" + "a" + [char]1 +
         "$GS" + "!" + [char]17 + "BYR CLUB`n" + "$GS" + "!" + [char]0 +
         "Agente de impresion OK`n" + (Get-Date -Format 'dd/MM/yyyy HH:mm') + "`n" +
         "$ESC" + "a" + [char]0 +
         ("-" * 48) + "`n" +
         "Estacion: $($cfg.station)`n" +
         "Impresora: $($cfg.printerIp):$($cfg.printerPort)`n" +
         "`n`n`n" + "$GS" + "V" + [char]66 + [char]0
  $bytes = [System.Text.Encoding]::GetEncoding(437).GetBytes($txt)
  $err = Send-ToPrinter -Bytes $bytes -Ip $cfg.printerIp -Port $cfg.printerPort
  if ($err) { Write-Log "Prueba FALLIDA: $err" 'ERROR'; exit 1 }
  Write-Log "Prueba enviada a $($cfg.printerIp):$($cfg.printerPort). Fijate si salio el papel."
  exit 0
}

# --- Bucle principal --------------------------------------------------------
$cfg = Read-Config
Write-Log "Agente iniciado. Estacion '$($cfg.station)' -> $($cfg.printerIp):$($cfg.printerPort) | web: $($cfg.apiBase)"

$jobsUrl = "{0}print/jobs.php?station={1}&max=5" -f $cfg.apiBase, [uri]::EscapeDataString($cfg.station)
$ackUrl  = "{0}print/ack.php" -f $cfg.apiBase

$quietErrors = 0   # para no llenar el log si se cae internet

while ($true) {
  try {
    $resp = Invoke-Api -Url $jobsUrl -Token $cfg.token
    if ($quietErrors -gt 0) {
      Write-Log "Conexion con la web restablecida."
      $quietErrors = 0
    }

    $jobs = @($resp.jobs)
    foreach ($job in $jobs) {
      if (-not $job) { continue }
      $bytes = [Convert]::FromBase64String($job.payload)
      $err   = Send-ToPrinter -Bytes $bytes -Ip $cfg.printerIp -Port $cfg.printerPort

      if ($err) {
        Write-Log "Trabajo #$($job.id) ($($job.kind)) NO salio: $err" 'ERROR'
        try { Invoke-Api -Url $ackUrl -Method POST -Token $cfg.token -Body @{ jobId = $job.id; ok = $false; error = $err } | Out-Null } catch { }
      } else {
        $ref = if ($job.orderId) { "pedido #$($job.orderId)" } else { "prueba" }
        Write-Log "Impreso: $($job.kind) de $ref (trabajo #$($job.id))"
        try { Invoke-Api -Url $ackUrl -Method POST -Token $cfg.token -Body @{ jobId = $job.id; ok = $true } | Out-Null } catch {
          Write-Log "Se imprimio el trabajo #$($job.id) pero no pude confirmarlo. Se va a reintentar." 'WARN'
        }
      }
    }
  } catch {
    # Sin internet, hosting caido o token mal: avisamos la primera vez y despues
    # cada 20 vueltas, para que el log siga siendo legible.
    if ($quietErrors % 20 -eq 0) {
      Write-Log "No pude consultar la cola: $($_.Exception.Message)" 'WARN'
    }
    $quietErrors++
  }

  if ($Once) { break }
  Start-Sleep -Seconds $cfg.pollSeconds
}
