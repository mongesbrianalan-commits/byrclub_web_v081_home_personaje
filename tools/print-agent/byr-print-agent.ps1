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
  # Pregunta lo que hace falta y escribe config.json. Para una PC nueva.
  [switch] $Configurar,
  # Revisa config + impresora + web y dice donde esta el problema. No imprime.
  [switch] $Diagnostico,
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

# --- Chequeo de puerto (sin imprimir nada) ---------------------------------
<#
  ¿Contesta algo en esa IP y puerto? Devuelve $true/$false.
  Se usa en el diagnóstico: distinguir "la impresora no está" de "la web no está"
  es lo primero que hay que saber cuando no sale el papel.
#>
function Test-Puerto {
  param([string] $Ip, [int] $Port, [int] $TimeoutMs = 4000)
  $client = $null
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async  = $client.BeginConnect($Ip, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) { return $false }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    if ($client) { try { $client.Close() } catch { } }
  }
}

<#
  Toca la web con el token y devuelve el código HTTP y el cuerpo, sin tirar
  excepción. Hace falta porque el diagnóstico necesita LEER el error (401, 503)
  para poder decir qué está mal, no solo que falló.
#>
function Invoke-Sonda {
  param([string] $Url, [string] $Method = 'GET', $Body = $null, [string] $Token)
  $res = @{ code = 0; body = ''; error = '' }
  try {
    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.Method  = $Method
    $req.Timeout = 20000
    $req.Headers.Add('X-BYR-Print-Token', $Token)
    if ($Method -eq 'POST') {
      $json  = $Body | ConvertTo-Json -Compress
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
      $req.ContentType   = 'application/json'
      $req.ContentLength = $bytes.Length
      $s = $req.GetRequestStream(); $s.Write($bytes, 0, $bytes.Length); $s.Close()
    }
    $resp = $req.GetResponse()
    $res.code = [int] $resp.StatusCode
    $res.body = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd()
    $resp.Close()
  } catch [System.Net.WebException] {
    if ($_.Exception.Response) {
      $r = $_.Exception.Response
      $res.code = [int] $r.StatusCode
      try { $res.body = (New-Object IO.StreamReader($r.GetResponseStream())).ReadToEnd() } catch { }
    } else {
      $res.error = $_.Exception.Message
    }
  } catch {
    $res.error = $_.Exception.Message
  }
  return $res
}

# --- Configuración asistida (Configurar.cmd) -------------------------------
<#
  Pregunta lo que hace falta y escribe config.json. Existe para que dar de alta
  una PC nueva en el local no dependa de editar JSON a mano sin equivocarse en
  una coma.
#>
function Read-Valor {
  param([string] $Titulo, [string] $Ayuda, [string] $Actual, [string] $Muestra, [switch] $Obligatorio)
  Write-Host ''
  Write-Host $Titulo -ForegroundColor Cyan
  if ($Ayuda)  { Write-Host "  $Ayuda" -ForegroundColor DarkGray }
  if ($Actual) { Write-Host "  (Enter deja lo que ya está: $(if ($Muestra) { $Muestra } else { $Actual }))" -ForegroundColor DarkGray }
  while ($true) {
    $r = (Read-Host '  >').Trim()
    if ($r -eq '' -and $Actual)   { return $Actual }
    if ($r -ne '')                { return $r }
    if (-not $Obligatorio)        { return '' }
    Write-Host '  Hace falta completarlo.' -ForegroundColor Yellow
  }
}

if ($Configurar) {
  $viejo = $null
  if (Test-Path $ConfigPath) {
    try { $viejo = Get-Content $ConfigPath -Raw -Encoding utf8 | ConvertFrom-Json } catch { }
  }

  Write-Host ''
  Write-Host '=== BYR Club - Configurar esta PC para imprimir ===' -ForegroundColor Green
  if ($viejo) {
    Write-Host 'Ya había un config.json: apretá Enter en cada paso para dejarlo como está.' -ForegroundColor DarkGray
  }

  $apiBase = Read-Valor 'Direccion de la web (apiBase)' `
    'Casi siempre: https://byrclub.com/api/' `
    $(if ($viejo) { $viejo.apiBase } else { 'https://byrclub.com/api/' }) -Obligatorio
  if (-not $apiBase.EndsWith('/')) { $apiBase += '/' }

  $tokenViejo  = if ($viejo) { [string] $viejo.token } else { '' }
  $tokenMuestra = if ($tokenViejo.Length -gt 4) { ('*' * 6) + $tokenViejo.Substring($tokenViejo.Length - 4) } else { $tokenViejo }
  $token = Read-Valor 'Token de impresion' `
    "Es el mismo texto que esta en 'print_token' dentro de api/config.php del hosting." `
    $tokenViejo $tokenMuestra -Obligatorio

  $printerIp = Read-Valor 'IP de la impresora termica' `
    'La de BYR Docksud es 192.168.0.250.' `
    $(if ($viejo -and $viejo.printerIp) { $viejo.printerIp } else { '192.168.0.250' }) -Obligatorio

  $station = Read-Valor 'Nombre de esta estacion' `
    "Con una sola impresora, dejar 'cocina'." `
    $(if ($viejo -and $viejo.station) { $viejo.station } else { 'cocina' }) -Obligatorio

  $cfgNuevo = [ordered]@{
    apiBase     = $apiBase
    token       = $token
    station     = $station
    printerIp   = $printerIp
    printerPort = $(if ($viejo -and $viejo.printerPort) { [int] $viejo.printerPort } else { 9100 })
    pollSeconds = $(if ($viejo -and $viejo.pollSeconds) { [int] $viejo.pollSeconds } else { 4 })
  }

  # Sin BOM: PowerShell 5.1 lo mete si se usa Out-File, y despues ConvertFrom-Json
  # puede quejarse al leerlo.
  $json = ($cfgNuevo | ConvertTo-Json)
  [IO.File]::WriteAllText($ConfigPath, $json, (New-Object Text.UTF8Encoding($false)))

  Write-Host ''
  Write-Host "Guardado en: $ConfigPath" -ForegroundColor Green
  Write-Host ''
  Write-Host 'Ahora conviene correr Diagnostico.cmd para ver que todo conteste.' -ForegroundColor DarkGray
  exit 0
}

# --- Diagnostico (Diagnostico.cmd) -----------------------------------------
<#
  Revisa de punta a punta y dice EN CUAL de los tres eslabones esta el problema:
  la configuracion, la impresora del local, o la web.

  No consume trabajos de la cola: para probar el token usa ack.php con jobId=0,
  que valida el token y recien despues se queja del trabajo. Pedirle trabajos a
  jobs.php los marcaria como tomados y quedarian 2 minutos sin salir.
#>
if ($Diagnostico) {
  Write-Host ''
  Write-Host '=== BYR Club - Diagnostico de impresion ===' -ForegroundColor Green
  $problemas = 0

  # 1. Configuración
  if (-not (Test-Path $ConfigPath)) {
    Write-Host '[ X ] Falta config.json.' -ForegroundColor Red
    Write-Host '      Corre Configurar.cmd primero.' -ForegroundColor Yellow
    exit 1
  }
  try {
    $cfg = Read-Config
  } catch {
    Write-Host "[ X ] config.json tiene un problema: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '      Corre Configurar.cmd para rehacerlo.' -ForegroundColor Yellow
    exit 1
  }
  Write-Host "[ OK ] config.json leido. Estacion '$($cfg.station)', web $($cfg.apiBase)"

  # 2. Impresora
  if (Test-Puerto -Ip $cfg.printerIp -Port $cfg.printerPort) {
    Write-Host "[ OK ] La impresora contesta en $($cfg.printerIp):$($cfg.printerPort)"
  } else {
    $problemas++
    Write-Host "[ X ] La impresora NO contesta en $($cfg.printerIp):$($cfg.printerPort)" -ForegroundColor Red
    Write-Host '      Fijate que este prendida, con papel y conectada a la misma red.' -ForegroundColor Yellow
    Write-Host '      Si le cambiaron la IP, corre Configurar.cmd con la nueva.' -ForegroundColor Yellow
  }

  # 3. Web + token + migración
  $sonda = Invoke-Sonda -Url ("{0}print/ack.php" -f $cfg.apiBase) -Method POST `
    -Token $cfg.token -Body @{ jobId = 0; ok = $false }

  if ($sonda.code -eq 0) {
    $problemas++
    Write-Host "[ X ] No pude llegar a la web: $($sonda.error)" -ForegroundColor Red
    Write-Host '      Revisa que esta PC tenga internet y que la direccion sea correcta.' -ForegroundColor Yellow
  } elseif ($sonda.code -eq 422) {
    # 422 = paso el token y la cola existe; solo se quejo del trabajo inventado.
    Write-Host '[ OK ] La web contesta y el token es correcto.'
    Write-Host '[ OK ] La cola de impresion esta creada en la base.'
  } elseif ($sonda.code -eq 401) {
    $problemas++
    Write-Host '[ X ] Token de impresion invalido.' -ForegroundColor Red
    Write-Host "      El token de esta PC no coincide con 'print_token' de api/config.php." -ForegroundColor Yellow
  } elseif ($sonda.code -eq 503 -and $sonda.body -like '*no-token*') {
    $problemas++
    Write-Host '[ X ] El hosting no tiene la impresion configurada.' -ForegroundColor Red
    Write-Host "      Falta poner 'print_token' en api/config.php del hosting." -ForegroundColor Yellow
  } elseif ($sonda.code -eq 503) {
    $problemas++
    Write-Host '[ X ] Falta crear la cola en la base de datos.' -ForegroundColor Red
    Write-Host '      Entra a phpMyAdmin y corre api/migrations/2026-08-print-jobs.sql' -ForegroundColor Yellow
  } else {
    $problemas++
    Write-Host "[ X ] La web contesto algo inesperado (HTTP $($sonda.code))." -ForegroundColor Red
    if ($sonda.body) { Write-Host "      $($sonda.body)" -ForegroundColor DarkGray }
  }

  # 4. ¿Está corriendo el agente?
  $corriendo = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*-File*byr-print-agent.ps1*' })
  if ($corriendo.Count -gt 0) {
    Write-Host "[ OK ] El agente esta corriendo ($($corriendo.Count) proceso/s)."
  } else {
    Write-Host '[ ! ] El agente NO esta corriendo ahora mismo.' -ForegroundColor Yellow
    Write-Host '      Corre Instalar-inicio.cmd para que arranque solo al prender la PC.' -ForegroundColor Yellow
  }

  Write-Host ''
  if ($problemas -eq 0) {
    Write-Host 'Todo en orden. Proba con Probar-impresora.cmd y despues con un pedido real.' -ForegroundColor Green
  } else {
    Write-Host "Hay $problemas cosa/s para resolver (arriba, en rojo)." -ForegroundColor Red
  }
  Write-Host ''
  exit $(if ($problemas -eq 0) { 0 } else { 1 })
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
