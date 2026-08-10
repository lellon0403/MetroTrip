param([string]$OutputDirectory = ".\backups")
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path (Resolve-Path -LiteralPath $OutputDirectory).Path "metrotrip-$stamp.dump"
$containerFile = "/tmp/metrotrip-$stamp.dump"
try {
    docker compose exec -T postgres pg_dump -U metrotrip -d metrotrip --format=custom --no-owner --no-privileges --file=$containerFile
    if ($LASTEXITCODE -ne 0) { throw "pg_dump 실행에 실패했습니다." }
    docker compose cp "postgres:$containerFile" $target
    if ($LASTEXITCODE -ne 0) { throw "백업 파일 복사에 실패했습니다." }
}
finally {
    docker compose exec -T postgres rm -f $containerFile | Out-Null
}
Write-Host "검증 가능한 custom-format 백업 생성: $target"
