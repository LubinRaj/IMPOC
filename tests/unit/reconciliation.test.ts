import { describe,it,expect } from "vitest";
import { planChanges } from "../../src/server/reconciliation";
import type { CanonicalVm,InventoryVm } from "../../src/lib/contracts";
const base:CanonicalVm={provider:"aws",scopeId:"10000000-0000-4000-8000-000000000001",externalId:"i-1",hostname:"vm-one",ipAddresses:["10.0.0.2","10.0.0.1"],operatingSystem:"Ubuntu",cpuCores:2,memoryMB:4096,diskGB:40,powerState:"running",region:"ap-south-1",cluster:null,owner:"ops",tags:{b:"2",a:"1"}};
const target=(changes:Partial<InventoryVm>={}):InventoryVm=>({...base,id:"20000000-0000-4000-8000-000000000001",lifecycleStatus:"active",consecutiveMissingScans:0,lastSeenAt:"2026-01-01T00:00:00Z",createdAt:"2026-01-01T00:00:00Z",updatedAt:"2026-01-01T00:00:00Z",...changes});
describe("planChanges",()=>{
 it("creates without a destination and leaves inputs alone",()=>{const source=[base];expect(planChanges(source,[])[0].kind).toBe("CREATE");expect(source[0].ipAddresses).toEqual(["10.0.0.2","10.0.0.1"])});
 it("ignores IP and tag ordering",()=>{expect(planChanges([base],[target({ipAddresses:["10.0.0.1","10.0.0.2"],tags:{a:"1",b:"2"}})])[0].kind).toBe("NO_CHANGE")});
 it("shows managed field differences",()=>{const c=planChanges([{...base,cpuCores:4,hostname:"changed"}],[target()])[0];expect(c.kind).toBe("UPDATE");expect(c.fields).toEqual(expect.arrayContaining([{field:"cpuCores",before:2,after:4},{field:"hostname",before:"vm-one",after:"changed"}]))});
 it("marks first absence and decommissions second",()=>{expect(planChanges([],[target()])[0].kind).toBe("MARK_ORPHAN");expect(planChanges([],[target({lifecycleStatus:"orphaned",consecutiveMissingScans:1})])[0].kind).toBe("DECOMMISSION")});
 it("shows creation and lifecycle details before apply",()=>{
  const created=planChanges([base],[])[0];expect(created.fields).toContainEqual({field:"hostname",before:null,after:"vm-one"});
  const orphan=planChanges([],[target()])[0];expect(orphan.fields).toContainEqual({field:"lifecycleStatus",before:"active",after:"orphaned"});
  const decommission=planChanges([],[target({lifecycleStatus:"orphaned",consecutiveMissingScans:1})])[0];expect(decommission.fields).toContainEqual({field:"lifecycleStatus",before:"orphaned",after:"decommissioned"});
 });
 it("restores a returning native identity",()=>{expect(planChanges([base],[target({lifecycleStatus:"decommissioned",consecutiveMissingScans:2})])[0].kind).toBe("RESTORE")});
});
