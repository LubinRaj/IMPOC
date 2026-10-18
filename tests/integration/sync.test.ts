import {describe,it,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {eq} from "drizzle-orm";
import {db} from "../../src/server/db/client";
import {scopes,sources,inventory,runs} from "../../src/server/db/schema";
import {createSource,patchSource,deleteSource,setMode} from "../../src/server/services/sources";
import {preview,apply,runDetail} from "../../src/server/services/sync";
import type {VmInput} from "../../src/lib/contracts";
async function setup(provider:"aws"|"azure"="aws"){
 const id=randomUUID();await db.insert(scopes).values({id,provider,name:`Test ${id}`,environment:"test"});return id;
}
function vm(scopeId:string,externalId="same-id"):VmInput{return {scopeId,externalId,hostname:"first",ipAddresses:["10.0.0.1"],operatingSystem:"Ubuntu",cpuCores:2,memoryMB:4096,diskGB:40,powerState:"running",region:null,cluster:null,owner:"ops",tags:{team:"ops"}}}
async function row(scopeId:string){return (await db.select().from(inventory).where(eq(inventory.scopeId,scopeId)))[0]}
describe("PostgreSQL synchronization",()=>{
 it("keeps source independent, creates, remains idempotent, updates, orphans, decommissions and restores",async()=>{
  const id=await setup();const source=await createSource(vm(id));expect(await row(id)).toBeUndefined();
  let p=await preview([id]);expect(p.summary.CREATE).toBe(1);expect(await row(id)).toBeUndefined();
  const first=await apply(p.planId);expect(first.status).toBe("completed");const dest=await row(id);expect(dest.canonical.hostname).toBe("first");expect((await apply(p.planId)).replayed).toBe(true);
  await db.update(inventory).set({lastSeenAt:new Date("2020-01-01T00:00:00Z")}).where(eq(inventory.scopeId,id));
  p=await preview([id]);expect(p.summary.NO_CHANGE).toBe(1);await apply(p.planId);expect((await row(id)).id).toBe(dest.id);expect((await row(id)).lastSeenAt!.getFullYear()).toBeGreaterThan(2020);
  await patchSource(source.id,{hostname:"edited",cpuCores:4,ipAddresses:["10.0.0.2"]});expect((await row(id)).canonical.hostname).toBe("first");
  p=await preview([id]);expect(p.summary.UPDATE).toBe(1);expect(p.scopes[0].changes[0].fields).toEqual(expect.arrayContaining([{field:"hostname",before:"first",after:"edited"},{field:"cpuCores",before:2,after:4}]));await apply(p.planId);expect((await row(id)).canonical.hostname).toBe("edited");
  await deleteSource(source.id);p=await preview([id]);expect(p.summary.MARK_ORPHAN).toBe(1);await apply(p.planId);expect((await row(id)).lifecycleStatus).toBe("orphaned");
  p=await preview([id]);expect(p.summary.DECOMMISSION).toBe(1);await apply(p.planId);expect((await row(id)).lifecycleStatus).toBe("decommissioned");
  await createSource(vm(id));p=await preview([id]);expect(p.summary.RESTORE).toBe(1);await apply(p.planId);expect((await row(id)).id).toBe(dest.id);expect((await row(id)).consecutiveMissingScans).toBe(0);
 });
 it("isolates failed and partial scopes while another scope succeeds",async()=>{
  const bad=await setup(),good=await setup("azure");const record=await createSource(vm(bad));await createSource(vm(good));let p=await preview([bad,good]);await apply(p.planId);
  await deleteSource(record.id);await setMode(bad,"failed");p=await preview([bad,good]);const result=await apply(p.planId);expect(result.status).toBe("partial");expect((await row(bad)).lifecycleStatus).toBe("active");expect((await runDetail(result.runId)).scopes.some(s=>s.resultStatus==="skipped")).toBe(true);
  await setMode(bad,"partial");p=await preview([bad]);expect((await apply(p.planId)).status).toBe("failed");expect((await row(bad)).lifecycleStatus).toBe("active");
  await setMode(bad,"ok");p=await preview([bad]);await apply(p.planId);expect((await row(bad)).lifecycleStatus).toBe("orphaned");
 });
 it("rejects stale source plans and concurrent applies safely",async()=>{
  const id=await setup();const src=await createSource(vm(id));let p=await preview([id]);await patchSource(src.id,{hostname:"changed"});await expect(apply(p.planId)).rejects.toMatchObject({code:"REPREVIEW_REQUIRED"});
  p=await preview([id]);const responses=await Promise.all([apply(p.planId),apply(p.planId)]);expect(responses[0].runId).toBe(responses[1].runId);expect((await db.select().from(inventory).where(eq(inventory.scopeId,id))).length).toBe(1);
 });
 it("records a failed destination write without partial inventory changes",async()=>{
  const id=await setup();await createSource(vm(id,"first"));await createSource(vm(id,"second"));const p=await preview([id]);
  const first=p.scopes[0].changes.find(c=>c.externalId==="first")!;
  await db.insert(inventory).values({scopeId:id,externalId:"first",canonical:first.after!});
  await expect(apply(p.planId)).rejects.toThrow();
  const rows=await db.select().from(inventory).where(eq(inventory.scopeId,id));expect(rows).toHaveLength(1);
  const failures=await db.select().from(runs).where(eq(runs.planId,p.planId));expect(failures).toHaveLength(1);expect(failures[0].status).toBe("failed");
 });
 it("rejects a stale destination revision",async()=>{
  const id=await setup();await createSource(vm(id));const first=await preview([id]);await apply(first.planId);
  const stale=await preview([id]);const newer=await preview([id]);await apply(newer.planId);
  await expect(apply(stale.planId)).rejects.toMatchObject({code:"REPREVIEW_REQUIRED"});
 });
 it("separates duplicate IDs across scopes and rejects invalid native identity",async()=>{
  const a=await setup(),b=await setup();await createSource(vm(a));await createSource(vm(b));let p=await preview([a,b]);await apply(p.planId);expect((await row(a)).id).not.toBe((await row(b)).id);
  await db.update(sources).set({nativePayload:{Name:"bad"}}).where(eq(sources.scopeId,a));p=await preview([a]);expect(p.scopes[0].collectionStatus).toBe("failed");expect(p.scopes[0].changes).toHaveLength(0);
 });
});
