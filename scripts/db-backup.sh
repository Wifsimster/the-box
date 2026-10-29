#!/bin/sh
set -eu
if (set -o pipefail) 2>/dev/null; then set -o pipefail; fi

BACKUP_DIR=/backups
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/thebox_$TIMESTAMP.sql.gz"
TMP_FILE="$BACKUP_FILE.tmp"

echo "[$(date)] Starting database backup..."

if ! pg_dump -h postgres -U thebox thebox | gzip > "$TMP_FILE"; then
  echo "[$(date)] Backup FAILED — leaving prior backups intact" >&2
  rm -f "$TMP_FILE"
  exit 1
fi
mv "$TMP_FILE" "$BACKUP_FILE"

find "$BACKUP_DIR" -name "thebox_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Backup completed: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
