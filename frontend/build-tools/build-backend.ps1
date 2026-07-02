# ==================================================================
# Build del CEREBRO EMBEBIDO (ADR-009, ladrillo 3 de la V3)
# ==================================================================
# Produce, dentro de frontend/resources/backend/ (gitignoreado):
#   jre/                    <- JRE recortada con jlink (~70MB): la PC del kiosco
#                              no necesita tener Java instalado
#   veltronik-backend.jar   <- el monolito Spring (fat jar), el MISMO de Railway
#
# electron-builder los empaqueta como extraResources -> resources/backend/ del
# instalable, y electron/backend-runtime.cjs los lanza en runtime.
#
# Requiere: JDK 17 (JAVA_HOME o el Adoptium local). Corre en Windows
# (el runner de release.yml es windows-latest; el instalable es win-x64).

$ErrorActionPreference = 'Stop'

$repoRoot   = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$backendDir = Join-Path $repoRoot 'backend'
$outDir     = Join-Path $repoRoot 'frontend\resources\backend'

# --- JDK: JAVA_HOME o el Adoptium conocido de la maquina de dev ---
$javaHome = $env:JAVA_HOME
if (-not $javaHome -or -not (Test-Path (Join-Path $javaHome 'bin\jlink.exe'))) {
    $adoptium = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
    if (Test-Path (Join-Path $adoptium 'bin\jlink.exe')) { $javaHome = $adoptium }
}
if (-not $javaHome -or -not (Test-Path (Join-Path $javaHome 'bin\jlink.exe'))) {
    throw 'No se encontro un JDK con jlink. Seteá JAVA_HOME a un JDK 17.'
}
Write-Host "JDK: $javaHome"

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

# --- 2. JRE recortada (jlink exige que el directorio de salida NO exista) ---
Write-Host '[2/3] Recortando la JRE con jlink...'
if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
New-Item -ItemType Directory -Force $outDir | Out-Null

# Modulos para Spring Boot 3 + Hibernate + BouncyCastle + SDK MP + SOAP ARCA.
# Lista generosa a proposito: cada modulo pesa poco y un NoClassDefFoundError
# en el kiosco cuesta caro. jdk.localedata recortado a es/en via include-locales.
$modules = @(
    'java.base','java.compiler','java.desktop','java.instrument','java.logging',
    'java.management','java.naming','java.net.http','java.prefs','java.rmi',
    'java.scripting','java.security.jgss','java.security.sasl','java.sql',
    'java.transaction.xa','java.xml','java.xml.crypto',
    'jdk.crypto.ec','jdk.crypto.cryptoki','jdk.unsupported','jdk.zipfs',
    'jdk.charsets','jdk.localedata','jdk.management'
) -join ','

& (Join-Path $javaHome 'bin\jlink.exe') `
    --add-modules $modules `
    --include-locales=en,es `
    --strip-debug --no-header-files --no-man-pages --compress=2 `
    --output (Join-Path $outDir 'jre')
if ($LASTEXITCODE -ne 0) { throw "jlink fallo con exit $LASTEXITCODE" }

# --- 3. Copiar el jar con nombre estable (backend-runtime.cjs lo busca asi) ---
Write-Host '[3/3] Copiando el jar...'
Copy-Item $jar.FullName (Join-Path $outDir 'veltronik-backend.jar')

$jreMB = [math]::Round((Get-ChildItem (Join-Path $outDir 'jre') -Recurse | Measure-Object Length -Sum).Sum / 1MB)
$jarMB = [math]::Round($jar.Length / 1MB)
Write-Host "Listo: jre ${jreMB}MB + jar ${jarMB}MB en $outDir"
