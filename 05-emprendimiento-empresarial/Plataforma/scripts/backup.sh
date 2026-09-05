#!/bin/sh
set -e

echo "[GuardIA] Iniciando respaldo automatico de Postgres..."
while true; do
  TS=$(date +%Y%m%d-%H%M%S)
  pg_dump -h postgres -U risk_user -d risk_platform > "/backups/guardia-${TS}.sql"
  echo "[GuardIA] Respaldo guardado: guardia-${TS}.sql"
  find /backups -name 'guardia-*.sql' -mtime +14 -delete
  sleep 86400
done
