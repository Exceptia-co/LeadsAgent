# Windows-safe Prisma generate with binary engines and retry + cleanup of potential locked files
$ErrorActionPreference = 'Stop'

$env:PRISMA_GENERATE_SKIP_AUTOINSTALL = "true"
$env:PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING = "1"
$env:PRISMA_CLI_QUERY_ENGINE_TYPE = "binary"
$env:PRISMA_CLIENT_ENGINE_TYPE = "binary"

# Attempt to remove previously locked engine files to avoid rename collisions
try {
  $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
  $pnpmDir = Join-Path $repoRoot "node_modules\.pnpm"
  if (Test-Path $pnpmDir) {
    # Find any @prisma+client entries
    Get-ChildItem -Path $pnpmDir -Filter "@prisma+client@*" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $clientDir = Join-Path $_.FullName "node_modules\.prisma\client"
      if (Test-Path $clientDir) {
        Write-Host "Cleaning previous Prisma client directory: $clientDir"
        try { Remove-Item -LiteralPath $clientDir -Recurse -Force -ErrorAction Stop } catch { }
      }
    }
  }
} catch {
  Write-Warning "Cleanup step failed: $($_.Exception.Message)"
}

# retry prisma generate a few times in case of transient lock
$maxAttempts = 3
for ($i = 1; $i -le $maxAttempts; $i++) {
  try {
    Write-Host "Running prisma generate (attempt $i of $maxAttempts) with binary engines..."
    npx prisma generate
    Write-Host "Prisma generate completed successfully."
    exit 0
  } catch {
    Write-Warning "Prisma generate failed: $($_.Exception.Message)"
    if ($i -eq $maxAttempts) { throw }
    Start-Sleep -Seconds 3
  }
}
