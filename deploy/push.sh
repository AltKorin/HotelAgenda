#!/usr/bin/env bash
# Copy the project to the server (run on the laptop). Secrets (.env) never travel this way.
# Usage: deploy/push.sh user@host:/opt/hotelagenda
set -euo pipefail
target="${1:?Podaj cel, np. konrad@10.0.0.20:/opt/hotelagenda}"
cd "$(dirname "$0")/.."
rsync -az --delete \
  --exclude .env --exclude '.env.*' --exclude .venv --exclude .remember --exclude .seed-links.txt --exclude .setup-niedzwiadek.txt \
  --exclude node_modules --exclude frontend/dist --exclude frontend/e2e/shots \
  --exclude backend/db.sqlite3 --exclude backend/staticfiles --exclude '__pycache__' \
  --exclude deploy/backups --exclude deploy/cloudflared --exclude deploy/media/logos --exclude deploy/media/slides --exclude Materiały --exclude frontend/e2e/fixtures \
  ./ "$target/"
echo "Wysłano do $target. Na serwerze: cd ${target#*:} && deploy/deploy.sh"
