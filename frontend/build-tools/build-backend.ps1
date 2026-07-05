# ==================================================================
# Build del CEREBRO EMBEBIDO (ADR-009 + ADR-011)
# ==================================================================
# Produce, dentro de frontend/resources/backend/ (gitignoreado):
#   jre/                    <- JRE de FABRICANTE FIRMADA (Microsoft OpenJDK 17,
#                              Authenticode). NO se usa jlink: su runtime queda
#                              SIN firma y Smart App Control / WDAC lo bloquea
#                              en las PCs de clientes (ADR-011 — lo bloqueó de
#                              verdad en la prueba de campo del 2026-07-05).
#                              Se recorta el contenido NO ejecutable (jmods,
#                              src.zip, include) para bajar ~120MB sin tocar
#                              un solo binario firmado.
#   veltronik-backend.jar   <- el monolito Spring (fat jar), el MISMO de Railway
#
# electron-builder los empaqueta como extraResources -> resources/backend/ del
# instalable, y electron/backend-runtime.cjs los lanza en runtime.
#
# Requiere: JDK 17 para COMPILAR (JAVA_HOME o uno conocido). La JRE que VIAJA
# es otra: se descarga firmada de Microsoft (cacheada en LOCALAPPDATA).

$ErrorActionPreference = 'Stop'
# Sin barra de progreso: Invoke-WebRequest es ~10x mas rapido asi (PS 5.1).
$ProgressPreference = 'SilentlyContinue'

$repoRoot   = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$backendDir = Join-Path $repoRoot 'backend'
$outDir     = Join-Path $repoRoot 'frontend\resources\backend'

# --- JDK para COMPILAR con mvnw (no viaja en el instalable) ---
$javaHome = $env:JAVA_HOME
if (-not $javaHome -or -not (Test-Path (Join-Path $javaHome 'bin\java.exe'))) {
    foreach ($candidate in @(
        'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot',
        'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
    )) {
        if (Test-Path (Join-Path $candidate 'bin\java.exe')) { $javaHome = $candidate; break }
    }
}
if (-not $javaHome -or -not (Test-Path (Join-Path $javaHome 'bin\java.exe'))) {
    throw 'No se encontro un JDK 17 para compilar. Setea JAVA_HOME.'
}
$env:JAVA_HOME = $javaHome
Write-Host "JDK (compilacion): $javaHome"

# --- 1. Fat jar del monolito (sin tests: la suite corre en CI aparte) ---
Write-Host '[1/3] Empaquetando el monolito (mvnw package)...'
Push-Location $backendDir
try {
    & .\mvnw.cmd -q -DskipTests package
    if ($LASTEXITCODE -ne 0) { throw "mvnw package fallo con exit $LASTEXITCODE" }
} finally { Pop-Location }

$jar = Get-ChildItem (Join-Path $backendDir 'target\*.jar') |
    Where-Object { $_.Name -notmatch '(sources|javadoc|original)' } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $jar) { throw 'No se encontro el jar en backend/target' }

# --- 2. La JRE FIRMADA que viaja en el instalable (ADR-011) ---
Write-Host '[2/3] JRE firmada de Microsoft (Authenticode)...'
$cacheDir = Join-Path $env:LOCALAPPDATA 'Veltronik\build-cache'
New-Item -ItemType Directory -Force $cacheDir | Out-Null
# aka.ms = alias estable de Microsoft al ultimo OpenJDK 17 LTS para Windows x64.
$jdkZip = Join-Path $cacheDir 'microsoft-jdk-17-windows-x64.zip'
if (-not (Test-Path $jdkZip)) {
    Write-Host '  Descargando Microsoft OpenJDK 17 (~180MB, una sola vez; queda cacheado)...'
    Invoke-WebRequest 'https://aka.ms/download-jdk/microsoft-jdk-17-windows-x64.zip' -OutFile $jdkZip
} else {
    Write-Host "  Usando el cacheado: $jdkZip (borralo para forzar re-descarga)"
}

# Limpiar el CONTENIDO sin borrar la carpeta raiz: OneDrive suele retener un handle
# del directorio (el repo vive en OneDrive) y borrar la raiz falla con "en uso por
# otro proceso". Vaciar hijos + reusar la carpeta esquiva ese lock.
if (Test-Path $outDir) {
    try {
        Get-ChildItem $outDir -Force | Remove-Item -Recurse -Force -ErrorAction Stop
    } catch {
        throw ("No se pudo vaciar $outDir : $($_.Exception.Message). " +
               "Cerra el cerebro local si esta corriendo (o pausa OneDrive) y reintenta.")
    }
} else {
    New-Item -ItemType Directory -Force $outDir | Out-Null
}

# Extraer DENTRO de outDir y renombrar la carpeta raiz (jdk-17.x.y+z) a 'jre'
# (rename en el mismo directorio: evita el limite de Move-Item entre volumenes).
Expand-Archive $jdkZip -DestinationPath $outDir
$jdkRoot = Get-ChildItem $outDir -Directory | Where-Object Name -like 'jdk*' | Select-Object -First 1
if (-not $jdkRoot) { throw 'El zip del JDK no tiene la estructura esperada (carpeta jdk-*)' }
Write-Host "  Version: $($jdkRoot.Name)"
Rename-Item $jdkRoot.FullName 'jre'

# Recorte de contenido NO ejecutable (no toca binarios firmados): ~-120MB.
foreach ($prune in @('jmods', 'include', 'demo', 'man', 'lib\src.zip')) {
    $p = Join-Path $outDir "jre\$prune"
    if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}

# La razon de ser del ADR-011: la JRE que viaja DEBE estar firmada. Sin esto,
# Smart App Control / WDAC bloquea los DLLs en las PCs de clientes. Verificacion
# DURA: si java.exe no esta firmado y valido, el build muere aca.
$sig = Get-AuthenticodeSignature (Join-Path $outDir 'jre\bin\java.exe')
if ($sig.Status -ne 'Valid') {
    throw "java.exe NO esta firmado/valido (status: $($sig.Status)) - WDAC lo bloquearia en clientes"
}
Write-Host "  Firma: $($sig.Status) - $($sig.SignerCertificate.Subject)"

# --- 3. Copiar el jar con nombre estable (backend-runtime.cjs lo busca asi) ---
Write-Host '[3/3] Copiando el jar...'
Copy-Item $jar.FullName (Join-Path $outDir 'veltronik-backend.jar')

$jreMB = [math]::Round((Get-ChildItem (Join-Path $outDir 'jre') -Recurse | Measure-Object Length -Sum).Sum / 1MB)
$jarMB = [math]::Round($jar.Length / 1MB)
Write-Host "Listo: jre FIRMADA ${jreMB}MB + jar ${jarMB}MB en $outDir"
