#!/bin/sh
set -e

BACKUP_DIR=/backups
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/thebox_$TIMESTAMP.sql.gz"

echo "[$(date)] Starting database backup..."

# Create backup with gzip compression
pg_dump -h postgres -U thebox thebox | gzip > "$BACKUP_FILE"

# Remove backups older than retention period
find "$BACKUP_DIR" -name "thebox_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Backup completed: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
