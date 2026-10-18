#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NETBOX_DIR="$ROOT_DIR/.local/netbox-docker"
CREDS_FILE="$ROOT_DIR/.local/netbox-credentials"

mkdir -p "$ROOT_DIR/.local"
if [[ ! -f "$NETBOX_DIR/docker-compose.yml" ]]; then
  if [[ -e "$NETBOX_DIR" ]]; then
    echo "Incomplete NetBox directory at $NETBOX_DIR; inspect it before retrying." >&2
    exit 1
  fi
  DOWNLOAD_DIR="$(mktemp -d "$ROOT_DIR/.local/netbox-download.XXXXXX")"
  trap 'rm -rf "$DOWNLOAD_DIR"' EXIT
  curl --fail --location --retry 3 --silent --show-error \
    https://github.com/netbox-community/netbox-docker/archive/refs/tags/5.1.1.tar.gz \
    -o "$DOWNLOAD_DIR/netbox-docker.tar.gz"
  mkdir "$DOWNLOAD_DIR/netbox-docker"
  tar -xzf "$DOWNLOAD_DIR/netbox-docker.tar.gz" -C "$DOWNLOAD_DIR/netbox-docker" --strip-components=1
  mv "$DOWNLOAD_DIR/netbox-docker" "$NETBOX_DIR"
fi

if [[ ! -f "$CREDS_FILE" ]]; then
  python3 - "$NETBOX_DIR" "$CREDS_FILE" <<'PY'
import pathlib, secrets, sys

directory, credentials = map(pathlib.Path, sys.argv[1:])
password = secrets.token_urlsafe(32)
api_key = secrets.token_urlsafe(9)
api_secret = secrets.token_urlsafe(36)
values = {
    directory / 'env/netbox.env': {
        'DB_PASSWORD': secrets.token_urlsafe(32),
        'REDIS_PASSWORD': secrets.token_urlsafe(32),
        'REDIS_CACHE_PASSWORD': secrets.token_urlsafe(32),
        'SECRET_KEY': secrets.token_urlsafe(64),
        'API_TOKEN_PEPPER_1': secrets.token_urlsafe(48),
        'SKIP_SUPERUSER': 'false',
        'SUPERUSER_NAME': 'impoc_admin',
        'SUPERUSER_EMAIL': 'admin@localhost',
        'SUPERUSER_PASSWORD': password,
        'SUPERUSER_API_KEY': api_key,
        'SUPERUSER_API_TOKEN': api_secret,
    },
    directory / 'env/postgres.env': {},
    directory / 'env/redis.env': {},
    directory / 'env/redis-cache.env': {},
}
values[directory / 'env/postgres.env']['POSTGRES_PASSWORD'] = values[directory / 'env/netbox.env']['DB_PASSWORD']
values[directory / 'env/redis.env']['REDIS_PASSWORD'] = values[directory / 'env/netbox.env']['REDIS_PASSWORD']
values[directory / 'env/redis-cache.env']['REDIS_PASSWORD'] = values[directory / 'env/netbox.env']['REDIS_CACHE_PASSWORD']
for path, replacements in values.items():
    lines = [line for line in path.read_text().splitlines() if line.split('=', 1)[0] not in replacements]
    lines.extend(f'{key}={value}' for key, value in replacements.items())
    path.write_text('\n'.join(lines) + '\n')
    path.chmod(0o600)
credentials.write_text(f'NETBOX_URL=http://localhost:8000\nNETBOX_API_TOKEN=nbt_{api_key}.{api_secret}\nNETBOX_ADMIN_PASSWORD={password}\n')
credentials.chmod(0o600)
PY
fi

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
fi
if ! grep -q '^NETBOX_API_TOKEN=' "$ROOT_DIR/.env"; then
  grep -E '^(NETBOX_URL|NETBOX_API_TOKEN)=' "$CREDS_FILE" >> "$ROOT_DIR/.env"
fi
chmod 600 "$ROOT_DIR/.env" "$NETBOX_DIR"/env/*.env

cat > "$NETBOX_DIR/docker-compose.override.yml" <<'YAML'
services:
  netbox:
    ports:
      - "127.0.0.1:8000:8080"
YAML

docker compose -p impoc-netbox -f "$NETBOX_DIR/docker-compose.yml" -f "$NETBOX_DIR/docker-compose.override.yml" up -d postgres redis redis-cache netbox
for ((attempt=1; attempt<=60; attempt++)); do
  if [[ "$(docker inspect --format '{{.State.Health.Status}}' impoc-netbox-netbox-1 2>/dev/null)" == "healthy" ]]; then
    break
  fi
  if (( attempt == 60 )); then
    echo "NetBox did not become healthy. Inspect with: docker logs impoc-netbox-netbox-1" >&2
    exit 1
  fi
  sleep 5
done
docker compose -p impoc-netbox -f "$NETBOX_DIR/docker-compose.yml" -f "$NETBOX_DIR/docker-compose.override.yml" up -d netbox-worker
echo "NetBox is healthy at http://localhost:8000"
