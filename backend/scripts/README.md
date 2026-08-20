# Backend scripts

`sync_to_oracle.py`는 MySQL V1.12의 23개 테이블을 Oracle 읽기 복제본으로 동기화합니다.

백엔드 디렉터리에서 `python -m scripts.sync_to_oracle`로 실행하며, 쓰기 전 비교는 `--dry-run`, 동기화 후 검증은 `--verify` 옵션을 사용합니다. 환경변수와 운영 순서는 [DB 장애 전환 문서](../../docs/DB-FAILOVER.md)를 참고하세요.
