import type { InventoryVm,PlannedChange } from "@/lib/contracts";
export interface InventoryDestination {
 listByScope(scopeId:string):Promise<InventoryVm[]>;
 applyChange(change:PlannedChange,now:Date):Promise<void>;
}
