import type { CanonicalVm, InventoryVm, PlannedChange, FieldDiff } from "@/lib/contracts";
import { canonical } from "./collectors/native";
const fields=["hostname","ipAddresses","operatingSystem","cpuCores","memoryMB","diskGB","powerState","region","cluster","owner","tags"] as const;
function diff(source:CanonicalVm,target:InventoryVm):FieldDiff[]{
 const a=canonical(source),b=canonical(target);
 return fields.flatMap(field=>JSON.stringify(a[field])===JSON.stringify(b[field])?[]:[{field,before:b[field],after:a[field]}]);
}
export function planChanges(source:CanonicalVm[],target:InventoryVm[]):PlannedChange[]{
 const byId=new Map(target.map(vm=>[vm.externalId,vm]));const observed=new Set<string>();const result:PlannedChange[]=[];
 for(const vm of [...source].sort((a,b)=>a.externalId.localeCompare(b.externalId))){
  if(observed.has(vm.externalId)) throw new Error(`Duplicate resource ID: ${vm.externalId}`);observed.add(vm.externalId);
  const before=byId.get(vm.externalId)??null;const fieldsDiff=before?diff(vm,before):fields.map(field=>({field,before:null,after:canonical(vm)[field]}));
  const isRestored=before?.lifecycleStatus!=="active"&&before!==null;
  if(isRestored)fieldsDiff.unshift({field:"lifecycleStatus",before:before.lifecycleStatus,after:"active"},{field:"consecutiveMissingScans",before:before.consecutiveMissingScans,after:0});
  result.push({kind:!before?"CREATE":before.lifecycleStatus!=="active"?"RESTORE":fieldsDiff.length?"UPDATE":"NO_CHANGE",scopeId:vm.scopeId,provider:vm.provider,externalId:vm.externalId,before,after:canonical(vm),fields:fieldsDiff});
 }
 for(const vm of target.filter(t=>!observed.has(t.externalId)).sort((a,b)=>a.externalId.localeCompare(b.externalId))){
  result.push({kind:vm.lifecycleStatus==="active"?"MARK_ORPHAN":vm.lifecycleStatus==="orphaned"?"DECOMMISSION":"NO_CHANGE",scopeId:vm.scopeId,provider:vm.provider,externalId:vm.externalId,before:vm,after:null,fields:vm.lifecycleStatus==="active"?[{field:"lifecycleStatus",before:"active",after:"orphaned"},{field:"consecutiveMissingScans",before:vm.consecutiveMissingScans,after:1}]:vm.lifecycleStatus==="orphaned"?[{field:"lifecycleStatus",before:"orphaned",after:"decommissioned"},{field:"consecutiveMissingScans",before:vm.consecutiveMissingScans,after:2}]:[]});
 }
 return result.sort((a,b)=>a.externalId.localeCompare(b.externalId));
}
