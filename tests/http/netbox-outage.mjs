import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
const base=process.env.TEST_BASE_URL||"http://localhost:3000";
const compose=["compose","-p","impoc-netbox","-f",".local/netbox-docker/docker-compose.yml","-f",".local/netbox-docker/docker-compose.override.yml"];
async function call(path,method="GET",value,headers={}){const response=await fetch(base+path,{method,headers:{"content-type":"application/json",...headers},body:value===undefined?undefined:JSON.stringify(value)});const data=await response.json();if(!response.ok)throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`);return {response,data}}
const login=await call("/api/auth/login","POST",{passcode:process.env.APP_PASSCODE});const cookie=login.response.headers.get("set-cookie")?.split(";")[0];assert(cookie);const auth={cookie};
const scopes=(await call("/api/providers","GET",undefined,auth)).data;const scope=scopes.find(item=>item.provider==="aws"&&item.simulationMode==="ok");assert(scope);
const externalId=`i-outage-${randomUUID().slice(0,12)}`;
const input={scopeId:scope.id,externalId,hostname:`outage-${externalId.slice(-6)}`,ipAddresses:[],operatingSystem:null,cpuCores:1,memoryMB:1024,diskGB:20,powerState:"running",region:"us-east-1a",cluster:null,owner:"integration-test",tags:{purpose:"netbox-outage"}};
let source;
execFileSync("docker",[...compose,"stop","netbox"],{stdio:"ignore"});
try{
 source=(await call("/api/source-vms","POST",input,auth)).data;
 const deadline=Date.now()+90000;let job;
 while(Date.now()<deadline){job=(await call("/api/sync/jobs","GET",undefined,auth)).data.jobs.find(item=>item.scopeId===scope.id&&item.trigger==="source_change"&&item.lastError&&!item.netboxRunId);if(job)break;await new Promise(resolve=>setTimeout(resolve,1000))}
 assert(job?.lastError);
 const inventoryResponse=await fetch(base+`/api/inventory-vms?scopeId=${scope.id}&q=${externalId}`,{headers:auth});
 assert.equal(inventoryResponse.status,503);
 const dashboard=(await call("/api/dashboard","GET",undefined,auth)).data;
 assert.equal(dashboard.netbox.status,"unavailable");assert.equal(dashboard.inventoryCount,null);
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
 try{const {rows}=await pool.query("select count(*)::int as count from inventory_vms where scope_id=$1 and external_id=$2",[scope.id,externalId]);assert.equal(rows[0].count,0)}finally{await pool.end()}
 console.log("PASS outage reports unavailable inventory and retries without local inventory writes");
}finally{execFileSync("docker",[...compose,"up","-d","netbox"],{stdio:"ignore"})}
const until=Date.now()+180000;let remote;
while(Date.now()<until){try{remote=(await call(`/api/inventory-vms?destination=netbox&scopeId=${scope.id}&q=${externalId}`,"GET",undefined,auth)).data.items[0];if(remote?.externalId===externalId)break}catch{}await new Promise(resolve=>setTimeout(resolve,2000))}
assert.equal(remote?.externalId,externalId);console.log("PASS NetBox converges after service recovery");
await call(`/api/source-vms/${source.id}`,"DELETE",undefined,auth);
