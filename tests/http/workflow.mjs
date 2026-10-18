import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import pg from "pg";
const root = process.env.BASE_URL ?? "http://localhost:3002";
let sessionCookie = "";
async function call(path, method = "GET", payload, authenticated = true) {
  const res = await fetch(root + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authenticated && sessionCookie ? { Cookie: sessionCookie } : {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await res.json();
  return { status: res.status, data, headers: res.headers };
}
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://inventory:inventory_local@127.0.0.1:55439/inventory_test";
if (!new URL(databaseUrl).pathname.endsWith("_test"))
  throw new Error("HTTP workflow requires a test database");
let auth = await call("/api/providers", "GET", undefined, false);
assert.equal(auth.status, 401);
auth = await call("/api/source-vms", "POST", {}, false);
assert.equal(auth.status, 401);
auth = await call("/api/source-vms/not-a-uuid", "DELETE", undefined, false);
assert.equal(auth.status, 401);
auth = await call("/api/auth/login", "POST", { passcode: "000000" }, false);
assert.equal(auth.status, 401);
auth = await call(
  "/api/auth/login",
  "POST",
  { passcode: process.env.APP_PASSCODE },
  false,
);
assert.equal(auth.status, 200);
sessionCookie = auth.headers.get("set-cookie")?.split(";")[0] ?? "";
assert.ok(sessionCookie.startsWith("impoc_session="));
auth = await call("/api/auth/session");
assert.equal(auth.data.authenticated, true);
const tampered = sessionCookie;
sessionCookie =
  sessionCookie.slice(0, -1) + (sessionCookie.endsWith("x") ? "y" : "x");
auth = await call("/api/providers");
assert.equal(auth.status, 401);
sessionCookie = tampered;
const pool = new pg.Pool({ connectionString: databaseUrl });
const good = randomUUID(),
  bad = randomUUID();
for (const [id, name] of [
  [good, "HTTP healthy scope"],
  [bad, "HTTP outage scope"],
])
  await pool.query(
    "insert into provider_scopes (id,provider,name,environment) values ($1,$2,$3,$4)",
    [id, "aws", name, "http-test"],
  );
await pool.end();
const nativeId = `http-test-${Date.now()}`;
const input = {
  scopeId: good,
  externalId: nativeId,
  hostname: "http-vm",
  ipAddresses: ["10.99.0.1"],
  operatingSystem: "Ubuntu",
  cpuCores: 2,
  memoryMB: 2048,
  diskGB: 40,
  powerState: "running",
  region: "ap-south-1a",
  cluster: null,
  owner: "test",
  tags: { suite: "http" },
};
let r = await call("/api/source-vms", "POST", input);
assert.equal(r.status, 201);
r = await call("/api/source-vms", "POST", {
  ...input,
  scopeId: bad,
  externalId: `bad-${nativeId}`,
});
assert.equal(r.status, 201);
const badSourceId = r.data.id;
r = await call("/api/health");
assert.equal(r.status, 200);
r = await call("/api/providers");
assert.equal(r.status, 200);
assert.equal(r.data.length >= 6, true);
r = await call("/api/sync/preview", "POST", { scopeIds: [good], destination: "local" });
assert.equal(r.status, 200);
assert.equal(r.data.summary.CREATE, 1);
const initialPlan = r.data.planId;
r = await call(`/api/inventory-vms?destination=local&scopeId=${good}`);
assert.equal(r.data.total, 0);
r = await call("/api/sync/apply", "POST", { planId: initialPlan });
assert.equal(r.status, 200);
assert.equal(r.data.counts.CREATE, 1);
r = await call("/api/sync/apply", "POST", { planId: initialPlan });
assert.equal(r.data.replayed, true);
r = await call("/api/sync/preview", "POST", { scopeIds: [good], destination: "local" });
assert.equal(r.data.summary.NO_CHANGE, 1);
await call("/api/sync/apply", "POST", { planId: r.data.planId });
r = await call("/api/source-vms", "POST", {
  ...input,
  externalId: `second-${nativeId}`,
});
assert.equal(r.status, 201);
const sourceId = r.data.id;
const changedId = `second-${nativeId}`;
r = await call(`/api/inventory-vms?destination=local&scopeId=${good}&q=${changedId}`);
assert.equal(r.data.total, 0);
r = await call("/api/sync/preview", "POST", { scopeIds: [good], destination: "local" });
assert.equal(r.data.summary.CREATE, 1);
await call("/api/sync/apply", "POST", { planId: r.data.planId });
r = await call(`/api/source-vms/${sourceId}`, "PATCH", {
  hostname: "http-vm-edited",
  cpuCores: 4,
  ipAddresses: ["10.99.0.2"],
});
assert.equal(r.status, 200);
assert.equal(r.data.nativePayload.PlatformDetails, "Ubuntu");
assert.equal(r.data.nativePayload.Owner, "test");
assert.equal(r.data.nativePayload.VolumeGiB, 40);
r = await call("/api/sync/preview", "POST", { scopeIds: [good], destination: "local" });
assert.equal(r.data.summary.UPDATE, 1);
assert.ok(
  r.data.scopes[0].changes
    .find((c) => c.externalId === changedId)
    .fields.some((f) => f.field === "cpuCores"),
);
const stale = r.data.planId;
await call(`/api/source-vms/${sourceId}`, "PATCH", { memoryMB: 4096 });
r = await call("/api/sync/apply", "POST", { planId: stale });
assert.equal(r.status, 409);
assert.equal(r.data.error.code, "REPREVIEW_REQUIRED");
r = await call("/api/sync/preview", "POST", { scopeIds: [good], destination: "local" });
assert.equal(r.data.summary.UPDATE, 1);
await call("/api/sync/apply", "POST", { planId: r.data.planId });
r = await call(`/api/inventory-vms?destination=local&scopeId=${good}&q=${changedId}`);
assert.equal(r.data.items[0].hostname, "http-vm-edited");
assert.equal(r.data.items[0].memoryMB, 4096);
r = await call(`/api/source-vms/${sourceId}`, "DELETE");
assert.equal(r.status, 200);
r = await call("/api/sync/preview", "POST", { scopeIds: [good], destination: "local" });
assert.equal(r.data.summary.MARK_ORPHAN, 1);
await call("/api/sync/apply", "POST", { planId: r.data.planId });
r = await call(`/api/inventory-vms?destination=local&scopeId=${good}&q=${changedId}`);
assert.equal(r.data.items[0].lifecycleStatus, "orphaned");
r = await call("/api/sync/preview", "POST", { scopeIds: [good], destination: "local" });
assert.equal(r.data.summary.DECOMMISSION, 1);
await call("/api/sync/apply", "POST", { planId: r.data.planId });
r = await call(`/api/inventory-vms?destination=local&scopeId=${good}&q=${changedId}`);
assert.equal(r.data.items[0].lifecycleStatus, "decommissioned");
r = await call("/api/source-vms", "POST", { ...input, externalId: changedId });
assert.equal(r.status, 201);
r = await call("/api/sync/preview", "POST", { scopeIds: [good], destination: "local" });
assert.equal(r.data.summary.RESTORE, 1);
await call("/api/sync/apply", "POST", { planId: r.data.planId });
r = await call(`/api/inventory-vms?destination=local&scopeId=${good}&q=${changedId}`);
assert.equal(r.data.items[0].lifecycleStatus, "active");
assert.equal(r.data.total, 1);
r = await call("/api/sync/preview", "POST", { scopeIds: [bad], destination: "local" });
await call("/api/sync/apply", "POST", { planId: r.data.planId });
await call(`/api/source-vms/${badSourceId}`, "DELETE");
await call(`/api/providers/${bad}`, "PATCH", { simulationMode: "failed" });
r = await call("/api/sync/preview", "POST", { scopeIds: [bad, good], destination: "local" });
assert.equal(
  r.data.scopes.find((s) => s.scopeId === bad).collectionStatus,
  "failed",
);
r = await call("/api/sync/apply", "POST", { planId: r.data.planId });
assert.equal(r.data.status, "partial");
const runId = r.data.runId;
r = await call(`/api/sync/runs/${runId}`);
assert.equal(
  r.data.scopes.some((s) => s.resultStatus === "skipped"),
  true,
);
r = await call(`/api/inventory-vms?destination=local&scopeId=${bad}`);
assert.equal(r.data.items[0].lifecycleStatus, "active");
r = await call("/api/sync/preview", "POST", { scopeIds: [bad], destination: "local" });
r = await call("/api/sync/apply", "POST", { planId: r.data.planId });
assert.equal(r.data.status, "failed");
await call(`/api/providers/${bad}`, "PATCH", { simulationMode: "ok" });
r = await call("/api/source-vms/not-a-uuid", "DELETE");
assert.equal(r.status, 400);
for (const [path, label] of [
  ["/", "Inventory overview"],
  ["/sources", "Cloud sources"],
  ["/inventory", "VM inventory"],
  ["/sync", "Synchronization"],
  ["/history", "Run history"],
]) {
  const res = await fetch(root + path, { headers: { Cookie: sessionCookie } });
  assert.equal(res.status, 200, path);
  assert.ok((await res.text()).includes(label), path);
}
auth = await call("/api/auth/logout", "POST");
assert.equal(auth.status, 200);
const signedOut = await call("/api/providers", "GET", undefined, false);
assert.equal(signedOut.status, 401);
console.log(
  "HTTP workflow passed: auth, initial sync, replay, unchanged, source CRUD, drift, stale conflict, orphan, decommission, restore, partial failure, history, and five page responses.",
);
