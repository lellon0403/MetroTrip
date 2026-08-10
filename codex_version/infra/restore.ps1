param([Parameter(Mandatory=$true)][string]$BackupFile, [switch]$ConfirmRestore)
$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) { throw "복원은 현재 DB를 변경합니다. -ConfirmRestore를 명시하세요." }
$resolved = (Resolve-Path -LiteralPath $BackupFile).Path
if ([IO.Path]::GetExtension($resolved) -ne ".dump") { throw "custom-format .dump 백업만 복원할 수 있습니다." }
$containerFile = "/tmp/metrotrip-restore-$([guid]::NewGuid().ToString('N')).dump"
try {
    docker compose cp $resolved "postgres:$containerFile"
    if ($LASTEXITCODE -ne 0) { throw "복원 파일 복사에 실패했습니다." }
    docker compose exec -T postgres pg_restore -U metrotrip -d metrotrip --clean --if-exists --no-owner --no-privileges $containerFile
    if ($LASTEXITCODE -ne 0) { throw "pg_restore 실행에 실패했습니다." }
}
finally {
    docker compose exec -T postgres rm -f $containerFile | Out-Null
}
Write-Host "복원 완료: $resolved"
