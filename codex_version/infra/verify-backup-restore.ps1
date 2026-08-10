param([Parameter(Mandatory = $true)][string]$BackupFile)

$ErrorActionPreference = "Stop"
$resolved = (Resolve-Path -LiteralPath $BackupFile).Path
if ([IO.Path]::GetExtension($resolved) -ne ".dump") {
    throw "custom-format .dump 백업만 검증할 수 있습니다."
}

$suffix = (Get-Date -Format "yyyyMMddHHmmss") + "_" + ([guid]::NewGuid().ToString("N").Substring(0, 8))
$verificationDatabase = "metrotrip_restore_verify_$suffix"
$containerFile = "/tmp/$verificationDatabase.dump"
$countQuery = "SELECT (SELECT count(*) FROM transit_stations), (SELECT count(*) FROM places), (SELECT count(*) FROM users), (SELECT count(*) FROM plans), (SELECT count(*) FROM reviews), (SELECT count(*) FROM recruitments), (SELECT version_num FROM alembic_version);"

try {
    $sourceCounts = docker compose exec -T postgres psql -U metrotrip -d metrotrip -At -F ',' -c $countQuery
    if ($LASTEXITCODE -ne 0) { throw "원본 건수 조회에 실패했습니다." }

    docker compose exec -T postgres createdb -U metrotrip --template=template0 $verificationDatabase
    if ($LASTEXITCODE -ne 0) { throw "복원 검증 DB 생성에 실패했습니다." }

    docker compose cp $resolved "postgres:$containerFile"
    if ($LASTEXITCODE -ne 0) { throw "백업 파일 복사에 실패했습니다." }

    docker compose exec -T postgres pg_restore -U metrotrip -d $verificationDatabase --no-owner --no-privileges $containerFile
    if ($LASTEXITCODE -ne 0) { throw "검증 DB 복원에 실패했습니다." }

    $restoredCounts = docker compose exec -T postgres psql -U metrotrip -d $verificationDatabase -At -F ',' -c $countQuery
    if ($LASTEXITCODE -ne 0) { throw "복원 DB 건수 조회에 실패했습니다." }
    if ($sourceCounts.Trim() -ne $restoredCounts.Trim()) {
        throw "원본과 복원 DB의 핵심 테이블 건수 또는 migration version이 다릅니다. 원본=$($sourceCounts.Trim()) 복원=$($restoredCounts.Trim())"
    }

    Write-Host "복원 리허설 통과: $($restoredCounts.Trim())"
}
finally {
    docker compose exec -T postgres rm -f $containerFile | Out-Null
    docker compose exec -T postgres dropdb -U metrotrip --if-exists $verificationDatabase | Out-Null
}
