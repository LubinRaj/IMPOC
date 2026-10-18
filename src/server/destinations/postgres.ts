import { eq,and } from "drizzle-orm";
import { db } from "../db/client";
import { inventory } from "../db/schema";
import { AppError } from "../services/errors";
import type { InventoryVm,PlannedChange } from "@/lib/contracts";
import type { InventoryDestination } from "./destination";
type Transaction=Parameters<Parameters<typeof db.transaction>[0]>[0];
export function inventoryRow(row:typeof inventory.$inferSelect):InventoryVm {return {...row.canonical,id:row.id,lifecycleStatus:row.lifecycleStatus,consecutiveMissingScans:row.consecutiveMissingScans,lastSeenAt:row.lastSeenAt?.toISOString()??null,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};}
export class PostgresInventoryAdapter implements InventoryDestination {
 constructor(private tx:Transaction){}
 async listByScope(scopeId:string):Promise<InventoryVm[]>{return (await this.tx.select().from(inventory).where(eq(inventory.scopeId,scopeId))).map(inventoryRow)}
 async applyChange(c:PlannedChange,now:Date){
  const where=and(eq(inventory.scopeId,c.scopeId),eq(inventory.externalId,c.externalId));
  if(c.kind==="CREATE"){
   if(!c.after)throw new AppError("INVALID_PLAN","Create lacks source",422);
   await this.tx.insert(inventory).values({scopeId:c.scopeId,externalId:c.externalId,canonical:c.after,lifecycleStatus:"active",consecutiveMissingScans:0,lastSeenAt:now,updatedAt:now});return;
  }
  if(c.kind==="UPDATE"||c.kind==="RESTORE"){
   if(!c.after)throw new AppError("INVALID_PLAN","Update lacks source",422);
   await this.tx.update(inventory).set({canonical:c.after,lifecycleStatus:"active",consecutiveMissingScans:0,lastSeenAt:now,updatedAt:now}).where(where);return;
  }
  if(c.kind==="NO_CHANGE"&&c.after){await this.tx.update(inventory).set({lastSeenAt:now}).where(where);return;}
  if(c.kind==="MARK_ORPHAN")await this.tx.update(inventory).set({lifecycleStatus:"orphaned",consecutiveMissingScans:1,updatedAt:now}).where(where);
  if(c.kind==="DECOMMISSION")await this.tx.update(inventory).set({lifecycleStatus:"decommissioned",consecutiveMissingScans:2,updatedAt:now}).where(where);
 }
}
