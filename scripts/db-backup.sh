#!/bin/sh
# Fail fast on errors AND propagate failures through the pg_dump | gzip
# pipe — without pipefail, a failed pg_dump silently produces a zero-byte
# gz file and the retention sweep then deletes the last good backup.
set -eu
if (set -o pipefail) 2>/dev/null; then set -o pipefail; fi

BACKUP_DIR=/backups
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/thebox_$TIMESTAMP.sql.gz"
TMP_FILE="$BACKUP_FILE.tmp"

echo "[$(date)] Starting database backup..."

# Credentials come from ~/.pgpass (written by the container entrypoint
# from the mounted Docker secret) rather than PGPASSWORD — the env var
# is visible in process listings and `docker inspect`.
if ! pg_dump -h postgres -U thebox thebox | gzip > "$TMP_FILE"; then
  echo "[$(date)] Backup FAILED — leaving prior backups intact" >&2
  rm -f "$TMP_FILE"
  exit 1
fi
mv "$TMP_FILE" "$BACKUP_FILE"

# Only sweep retention after a verified-successful new backup so a string
# of failures can't erase the entire history.
find "$BACKUP_DIR" -name "thebox_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Backup completed: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
