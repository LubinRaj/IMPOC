# IMPOC

A local Next.js application for reconciling AWS, Azure, GCP, VMware, and Proxmox VM inventory into a **real, locally running NetBox** instance. NetBox is the authoritative VM inventory. PostgreSQL stores simulated sources, sync jobs, plans, and history. Persistent simulated sources are the default. Optional read-only live collectors are configurable but have not been validated against real cloud accounts.

## Run locally

Requires Node.js 22+ and Docker with Compose. From this directory:

```bash
cp .env.example .env
# In .env, set APP_PASSCODE to six digits and set APP_SESSION_SECRET (32+ characters).
# Also set distinct random SYNC_WORKER_SECRET and EVENT_INGEST_SECRET values (24+ characters each).
docker compose up -d db
npm ci
npm run db:migrate
npm run db:seed
bash scripts/setup-netbox.sh
npm run dev
# In another terminal, run the automatic sync worker:
npm run worker
```

On later starts, use `docker compose up -d db`, `bash scripts/setup-netbox.sh`, `npm run dev`, and `npm run worker`. Keep the app and worker in separate terminals. Run `npm ci` when dependencies change and `npm run db:migrate` when migrations change. The first-run seed creates the provider scopes required by the current UI and 22 sample source VMs. It is safe to rerun for setup: it leaves existing rows and edits intact, but restores any missing seeded rows. You do not need to seed NetBox; synchronization creates the managed NetBox structures and VM records.

Docker Compose creates the container networks and persistent volumes automatically; no manual network setup is needed. The root Compose file starts the application PostgreSQL service and publishes it only on `127.0.0.1:55439`. `scripts/setup-netbox.sh` downloads the NetBox Docker release on its first run, generates local credentials, and starts NetBox, its separate PostgreSQL database, Redis, and worker under the `impoc-netbox` Compose project. NetBox is published only on `127.0.0.1:8000`. The Next.js app runs on the host at `localhost:3000` and reaches both databases through their localhost ports and NetBox through its REST API. Docker manages the internal service-to-service networks. PostgreSQL data remains in named Docker volumes across normal stops and restarts.

Open <http://localhost:3000/access> and enter the six-digit passcode from `.env`. The passcode is checked on the server; successful access creates an eight-hour, signed, HTTP-only session cookie. Signing out clears the browser cookie. The database binds only to `127.0.0.1:55439`; the app binds to `localhost`. Check database health with `docker compose ps` and app health at <http://localhost:3000/api/health>. `db:seed` adds the same 22 native sample VMs across six scopes when they are missing; it does not clear existing records.

This is shared local access, not individual user authentication. A copied signed cookie remains usable until expiry; rotating `APP_PASSCODE` or `APP_SESSION_SECRET` invalidates all existing cookies.

## How the pieces connect

The browser talks to the Next.js API on `localhost:3000`. In the default `SOURCE_MODE=simulation`, **Cloud sources** edits provider-style VM records stored in the application's PostgreSQL database (`localhost:55439`). The edit also queues a sync job. `npm run worker` calls the local worker API, which collects a complete source snapshot, normalizes provider-specific fields, compares it with NetBox, and applies guarded create/update/lifecycle changes through NetBox's REST API (`localhost:8000`). **VM inventory** reads those NetBox records directly; PostgreSQL keeps source data, jobs, previews, and audit history. You can also preview and apply a sync manually from **Synchronization**.

NetBox runs in its own Docker services with its own PostgreSQL and Redis. `NETBOX_URL` and `NETBOX_API_TOKEN` in `.env` connect the app to it; `APP_PASSCODE` protects the local UI. `SOURCE_MODE=live` replaces simulated source collection with read-only provider API collectors configured as described in [Live collection and automatic sync](docs/live-sync.md). Live cloud connections have not been verified with real accounts.

The worker polls enabled scopes every five minutes by default and processes simulated source changes as soon as they are queued. Start at **Synchronization** to preview and apply manually at any time. One complete absent scan marks an inventory record orphaned; a second soft-decommissions it. Reintroducing the same native ID restores the record. Partial and failed collections skip all changes in their scope. The **Run history** page shows automatic jobs and their retry errors.

For live read-only collectors, event ingestion, and scheduled sync configuration, see [Live collection and automatic sync](docs/live-sync.md). Live connections have not been validated against real cloud accounts.

## Real NetBox destination

From the project directory, with Docker running:

```bash
bash scripts/setup-netbox.sh
# Restart npm run dev if it was already running so it reads the generated NetBox token.
```

The script downloads the official NetBox Docker release **5.1.1** into ignored `.local/netbox-docker`, generates local credentials in ignored `.local/netbox-credentials`, adds `NETBOX_URL` and `NETBOX_API_TOKEN` to ignored `.env`, and starts NetBox at <http://localhost:8000>. It uses a separate PostgreSQL volume and Redis services; the app's existing database is untouched. NetBox's admin username is `impoc_admin`; its generated password is in `.local/netbox-credentials`. All exposed service ports bind to localhost. Run this before starting the app and worker so both read the NetBox configuration.

**Synchronization** previews and applies against NetBox, and **VM inventory** reads NetBox directly. During a NetBox outage, inventory displays an error rather than old local data; automatic jobs retain their error and retry. NetBox VM name, status, CPU, memory, and disk are native fields. A NetBox JSON custom field named `impoc_record` holds the stable `(scope, native ID)` identity, remaining normalized source fields, and lifecycle metadata. The adapter creates one NetBox cluster per source scope. It only changes VMs carrying its managed identity field and never physically deletes an orphan.

The earlier PostgreSQL `inventory_vms` table and local adapter are retained for existing data and isolated tests, but the normal app neither reads nor writes them. To run the legacy local HTTP workflow on the separate test database, set `ENABLE_LOCAL_INVENTORY_TEST_ADAPTER=true` on that test server only. Existing local history stays visible and is labeled as legacy; no local inventory records are migrated or erased automatically.

NetBox apply reads the live inventory again and rejects a stale preview. External NetBox writes cannot share a database transaction with the app, so a mid-run failure may leave some actions applied. Run history records each confirmed action and failed scope; generate a new preview to converge safely. NetBox reads and writes use the official REST API with a generated v2 token. For shutdown and restart, use the same Compose files in `.local/netbox-docker` with `docker compose -p impoc-netbox -f .local/netbox-docker/docker-compose.yml -f .local/netbox-docker/docker-compose.override.yml stop` or `up -d`. Do not run `down -v` unless you intend to erase NetBox's local data.

## Verification

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

With the app, worker, and NetBox running, use `node tests/http/automatic-sync.mjs` for automatic create/update/orphan, polling, and event deduplication; `node tests/http/failure-sync.mjs` for failed collection recovery; and `node tests/http/netbox-outage.mjs` for NetBox outage recovery. The last script temporarily stops and restarts only this project's NetBox web service. These HTTP tests create clearly named local test records and sync history.

`npm run test` creates and migrates a separate `inventory_test` database in the project PostgreSQL container. A running-app HTTP workflow creates isolated scopes in the test database and refuses other database names. Start a second app with `DATABASE_URL=postgres://inventory:inventory_local@127.0.0.1:55439/inventory_test ENABLE_LOCAL_INVENTORY_TEST_ADAPTER=true NEXT_DIST_DIR=.next-test npx next dev --hostname localhost --port 3002`, then run `node tests/http/workflow.mjs`. The script checks authentication and the full sync lifecycle of the retained test adapter.

To deliberately erase this project's application PostgreSQL volume and restart from scratch, run `docker compose down -v`, then repeat the setup commands. This removes simulated sources, jobs, history, and legacy local inventory records in that volume. NetBox uses a separate volume.
