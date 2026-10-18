import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { scopes,sources } from "./schema";
import { toNative } from "../collectors/native";
import type { Provider, VmInput } from "../../lib/contracts";
const scopeDefs:[string,Provider,string,string][]=[
 ["10000000-0000-4000-8000-000000000001","aws","AWS production","account-prod / ap-south-1"],
 ["10000000-0000-4000-8000-000000000002","aws","AWS staging","account-stage / us-east-1"],
 ["10000000-0000-4000-8000-000000000003","azure","Azure subscription","subscription-sim-01"],
 ["10000000-0000-4000-8000-000000000004","gcp","GCP project","project-sim-01"],
 ["10000000-0000-4000-8000-000000000005","vmware","vSphere cluster","vcenter-sim / compute-a"],
 ["10000000-0000-4000-8000-000000000006","proxmox","Proxmox cluster","pve-sim / cluster-a"]];
const pool=new Pool({connectionString:process.env.DATABASE_URL});const db=drizzle(pool);
async function main(){await db.transaction(async tx=>{
 for(const [id,provider,name,environment] of scopeDefs){await tx.insert(scopes).values({id,provider,name,environment}).onConflictDoNothing();}
 for(const [si,[scopeId,provider]] of scopeDefs.entries()) for(let i=1;i<= (si<2?3:4);i++){
  const id=provider==="aws"?`i-sim-${i}`:provider==="azure"?`/subscriptions/sim/vms/vm-${i}`:provider==="gcp"?`gcp-${i}`:provider==="vmware"?`vm-${i}`:`${100+i}`;
  const input:VmInput={scopeId,externalId:id,hostname:`${provider}-${si+1}-vm-${i}`,ipAddresses:i===4?[]:[`10.${si+1}.0.${10+i}`],operatingSystem:i%2?"Ubuntu 22.04":"Windows Server 2022",cpuCores:i*2,memoryMB:i*2048,diskGB:i*40,powerState:i===3?"stopped":"running",region:provider==="aws"?"ap-south-1a":provider==="azure"?"centralindia":provider==="gcp"?"asia-south1-a":null,cluster:provider==="vmware"?"compute-a":provider==="proxmox"?"pve-a":null,owner:i%2?"platform":"operations",tags:{team:i%2?"platform":"ops",tier:i===1?"critical":"standard"}};
  await tx.insert(sources).values({scopeId,externalId:id,nativePayload:toNative(provider,input)}).onConflictDoNothing();
 }
 });const result=await db.execute(sql`select count(*)::int as count from simulated_source_vms`);console.log(`Seeded source records: ${result.rows[0].count}`);}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>pool.end());
