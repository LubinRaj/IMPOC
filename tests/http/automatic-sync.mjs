import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
const origin=process.env.TEST_BASE_URL||"http://localhost:3000";
async function request(path,method="GET",data,headers={}){
 const response=await fetch(origin+path,{method,headers:{"content-type":"application/json",...headers},body:data===undefined?undefined:JSON.stringify(data)});
 const value=await response.json();if(!response.ok)throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(value)}`);
 return {response,value};
}
const login=await request("/api/auth/login","POST",{passcode:process.env.APP_PASSCODE});
const cookie=login.response.headers.get("set-cookie")?.split(";")[0];assert(cookie);
const auth={cookie};
async function get(path){return (await request(path,"GET",undefined,auth)).value}
async function waitFor(description,fn){const until=Date.now()+120000;let last;while(Date.now()<until){try{const result=await fn();if(result)return result}catch(error){last=error}await new Promise(resolve=>setTimeout(resolve,1500))}throw new Error(`Timed out: ${description}; ${last||"condition unmet"}`)}
const scopes=await get("/api/providers");const aws=scopes.find(scope=>scope.provider==="aws"&&scope.simulationMode==="ok");assert(aws,"Need a healthy AWS simulation scope");
const externalId=`i-auto-${randomUUID().slice(0,12)}`;
const input={scopeId:aws.id,externalId,hostname:`auto-${externalId.slice(-6)}`,ipAddresses:["10.250.90.10"],operatingSystem:"Linux",cpuCores:2,memoryMB:2048,diskGB:30,powerState:"running",region:"us-east-1a",cluster:null,owner:"integration-test",tags:{purpose:"auto-sync"}};
const created=(await request("/api/source-vms","POST",input,auth)).value;
async function vm(){const data=await get(`/api/inventory-vms?scopeId=${aws.id}&q=${externalId}&pageSize=100`);return data.items.find(item=>item.externalId===externalId)}
await waitFor("create in NetBox",async()=>{const netbox=await vm();return netbox?.lifecycleStatus==="active"&&netbox.hostname===input.hostname});
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{const {rows}=await pool.query("select count(*)::int as count from inventory_vms where scope_id=$1 and external_id=$2",[aws.id,externalId]);assert.equal(rows[0].count,0)}finally{await pool.end()}
console.log("PASS automatic create in real NetBox without a local inventory write");
await request(`/api/source-vms/${created.id}`,"PATCH",{hostname:`updated-${input.hostname}`,cpuCores:4},auth);
await waitFor("update in NetBox",async()=>{const netbox=await vm();return netbox?.hostname===`updated-${input.hostname}`&&netbox.cpuCores===4});
console.log("PASS automatic update in NetBox");
const eventId=randomUUID();const machine={Authorization:`Bearer ${process.env.EVENT_INGEST_SECRET}`};
const first=(await request("/api/sync/events","POST",{scopeId:aws.id,eventId},machine)).value;
const duplicate=(await request("/api/sync/events","POST",{scopeId:aws.id,eventId},machine)).value;
assert.equal(first.jobId,duplicate.jobId);
await waitFor("event job completed",async()=>{const data=await get("/api/sync/jobs");return data.jobs.find(job=>job.id===first.jobId)?.status==="completed"});
const netboxRows=await get(`/api/inventory-vms?scopeId=${aws.id}&q=${externalId}`);
assert.equal(netboxRows.total,1);
console.log("PASS duplicate event suppression and idempotent resync");
await request(`/api/source-vms/${created.id}`,"DELETE",undefined,auth);
await waitFor("orphan in NetBox",async()=>{const netbox=await vm();return netbox?.lifecycleStatus==="orphaned"});
console.log("PASS safe orphan in NetBox");
const restored=(await request("/api/source-vms","POST",{...input,hostname:`restored-${input.hostname}`},auth)).value;
await waitFor("restore in NetBox",async()=>{const netbox=await vm();return netbox?.lifecycleStatus==="active"&&netbox.hostname===`restored-${input.hostname}`});
console.log("PASS NetBox restores the same native identity");
const jobs=await get("/api/sync/jobs");assert(jobs.jobs.some(job=>job.trigger==="poll"&&job.status==="completed"));
console.log("PASS scheduled polling jobs completed");
await request(`/api/source-vms/${restored.id}`,"DELETE",undefined,auth);
