#!/bin/sh
set -eu

# MySQL 클라이언트가 UTF-8 SQL을 latin1로 오해하지 않도록 문자셋을 명시한다.
export MYSQL_PWD="${MYSQL_ROOT_PASSWORD}"

run_sql() {
  mysql \
    --protocol=socket \
    --user=root \
    --default-character-set=utf8mb4 \
    < "$1"
}

run_sql /opt/metrotrip/schema/schema_mysql_V1.11.sql

for seed_file in /opt/metrotrip/seed/seed_*.sql; do
  run_sql "$seed_file"
done

unset MYSQL_PWD
