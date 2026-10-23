#!/usr/bin/env bash
# Dedicated LOCAL cluster. Never accepts a connection URL or production database name.
set -euo pipefail
umask 077
root=/home/nika1578/.local/share/livasports-pr75
bin=/usr/lib/postgresql/18/bin
export PATH="$bin:$PATH"
unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE
mkdir -p "$root/data" "$root/socket" "$root/backups"
case "$(findmnt -n -o FSTYPE -T "$root")" in ext4|xfs|btrfs) ;; *) echo PERSISTENT_DISK_REQUIRED; exit 1;; esac
test "$(id -un)" = nika1578
sql() { psql -h "$root/socket" -p 55475 -U livasports_v3_qa -d livasports_v3_qa -X -v ON_ERROR_STOP=1 "$@"; }
start() {
 test -f "$root/data/PG_VERSION"
 pg_ctl -D "$root/data" status >/dev/null 2>&1 || pg_ctl -D "$root/data" -l "$root/server.log" -o "-p 55475 -k $root/socket -h 127.0.0.1" -w start
}
case "${1:-status}" in
 init)
  test ! -f "$root/data/PG_VERSION" || { echo EXISTING_CLUSTER_USE_START; exit 1; }
  initdb -D "$root/data" -U livasports_v3_qa --auth-local=trust --auth-host=scram-sha-256 >/dev/null
  start
  createdb -h "$root/socket" -p 55475 -U livasports_v3_qa livasports_v3_qa
  for migration in 021_owner_qa_login_rate_limit 072_v2_editorial_newsroom 073_v3_sports_snapshots 074_v3_news_automation 075_v3_news_review_evidence; do sql -f "db/migrations/$migration.sql" >/dev/null; done
  sql -f scripts/v3-local-accounting.sql
  ;;
 start) start ;;
 stop) pg_ctl -D "$root/data" -m fast -w stop ;;
 backup)
  start
  exec 9>"$root/backup.lock"; flock -n 9 || exit 0
  target="$root/backups/$(date -u +%Y%m%dT%H%M%S)-$$.dump"
  pg_dump -h "$root/socket" -p 55475 -U livasports_v3_qa -d livasports_v3_qa -Fc -f "$target.partial"
  pg_restore -l "$target.partial" >/dev/null
  mv "$target.partial" "$target"
  # Retain at least seven newest complete backups, and all backups younger than 14 days.
  mapfile -t backups < <(find "$root/backups" -maxdepth 1 -type f -name '*.dump' -printf '%f\n' | sort -r)
  for ((i=7;i<${#backups[@]};i++)); do find "$root/backups/${backups[$i]}" -maxdepth 0 -mtime +14 -delete; done
  echo "BACKUP_OK $target"
  ;;
 verify-restore)
  start
  backup=$(find "$root/backups" -maxdepth 1 -name '*.dump' -type f | sort | tail -1)
  test -n "$backup"
  # Never overwrite an existing database. Retain restore proof for inspection.
  restored="livasports_restore_$(date -u +%Y%m%d%H%M%S)"
  createdb -h "$root/socket" -p 55475 -U livasports_v3_qa "$restored"
  pg_restore -h "$root/socket" -p 55475 -U livasports_v3_qa -d "$restored" --no-owner --exit-on-error "$backup"
  psql -h "$root/socket" -p 55475 -U livasports_v3_qa -d "$restored" -X -v ON_ERROR_STOP=1 -c 'UPDATE editorial_automation_control SET paused=true' >/dev/null
  psql -h "$root/socket" -p 55475 -U livasports_v3_qa -d "$restored" -X -At -v ON_ERROR_STOP=1 -c 'SELECT epoch, historical_reserved_microusd, historical_reported_microusd FROM local_validation_epoch; SELECT paused FROM editorial_automation_control;'
  echo "RESTORE_OK $restored"
  ;;
 status) start; sql -At -c 'SELECT current_database(); SELECT epoch,historical_reserved_microusd,historical_reported_microusd FROM local_validation_epoch; SELECT paused FROM editorial_automation_control;' ;;
 *) exit 2 ;;
esac
