import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base=process.env.TEST_BASE_URL||"http://localhost:3000";
async function call(path,method="GET",value,headers={}){const response=await fetch(base+path,{method,headers:{"content-type":"application/json",...headers},body:value===undefined?undefined:JSON.stringify(value)});const data=await response.json();if(!response.ok)throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`);return {response,data}}
const login=await call("/api/auth/login","POST",{passcode:process.env.APP_PASSCODE});const cookie=login.response.headers.get("set-cookie")?.split(";")[0];assert(cookie);const auth={cookie};
const scopes=(await call("/api/providers","GET",undefined,auth)).data;const scope=scopes.find(item=>item.provider==="aws"&&item.simulationMode==="ok");assert(scope);
const before=(await call(`/api/inventory-vms?scopeId=${scope.id}&pageSize=100`,"GET",undefined,auth)).data;
let restored=false;
try{
 await call(`/api/providers/${scope.id}`,"PATCH",{simulationMode:"failed"},auth);
 const event=(await call("/api/sync/events","POST",{scopeId:scope.id,eventId:randomUUID()},{Authorization:`Bearer ${process.env.EVENT_INGEST_SECRET}`})).data;
 const until=Date.now()+60000;let job;
 while(Date.now()<until){job=(await call("/api/sync/jobs","GET",undefined,auth)).data.jobs.find(item=>item.id===event.jobId);if(job?.attempts>=1&&job.lastError)break;await new Promise(resolve=>setTimeout(resolve,1000))}
 assert(job?.lastError?.includes("Simulated provider outage"));
 const after=(await call(`/api/inventory-vms?scopeId=${scope.id}&pageSize=100`,"GET",undefined,auth)).data;
 assert.equal(after.total,before.total);console.log("PASS failed collection retried without changing inventory");
 await call(`/api/providers/${scope.id}`,"PATCH",{simulationMode:"ok"},auth);restored=true;
 const deadline=Date.now()+90000;let completed=false;
 while(Date.now()<deadline){const rows=(await call("/api/sync/jobs","GET",undefined,auth)).data.jobs;completed=rows.some(item=>item.scopeId===scope.id&&item.trigger==="source_change"&&item.status==="completed"&&new Date(item.createdAt).getTime()>Date.now()-120000);if(completed)break;await new Promise(resolve=>setTimeout(resolve,1500))}
 assert(completed);console.log("PASS recovery after provider restored");
}finally{if(!restored)await call(`/api/providers/${scope.id}`,"PATCH",{simulationMode:"ok"},auth)}
