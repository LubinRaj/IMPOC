import "dotenv/config";
const token=process.env.SYNC_WORKER_SECRET;
if(!token||token.length<24||token.startsWith("replace-with-"))throw new Error("Set SYNC_WORKER_SECRET to a random value of at least 24 characters");
const endpoint=process.env.SYNC_WORKER_URL||"http://localhost:3000/api/sync/worker";
const delay=Number(process.env.SYNC_WORKER_INTERVAL_MS||2000);
if(!Number.isInteger(delay)||delay<500)throw new Error("SYNC_WORKER_INTERVAL_MS must be at least 500");
let stopping=false;
process.on("SIGINT",()=>{stopping=true});process.on("SIGTERM",()=>{stopping=true});
while(!stopping){
 try{
  const response=await fetch(endpoint,{method:"POST",headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error(`Worker HTTP ${response.status}: ${await response.text()}`);
  const result=await response.json();
  if(result.processed)console.log(`[sync-worker] ${result.jobId} ${result.status}${result.error?`: ${result.error}`:""}`);
 }catch(error){console.error(`[sync-worker] ${error instanceof Error?error.message:String(error)}`)}
 await new Promise(resolve=>setTimeout(resolve,delay));
}
