import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
async function main(){
const base=process.env.DATABASE_URL;
if(!base)throw new Error("DATABASE_URL is required");
const dbUrl=new URL(base);
const name=dbUrl.pathname.slice(1)+"_test";
const adminUrl=new URL(base);adminUrl.pathname="/postgres";
const admin=new Pool({connectionString:adminUrl.toString()});
try{
 const exists=await admin.query("select 1 from pg_database where datname=$1",[name]);
 if(!exists.rowCount)await admin.query(`create database "${name.replaceAll('"','""')}"`);
}finally{await admin.end()}
dbUrl.pathname=`/${name}`;
const pool=new Pool({connectionString:dbUrl.toString()});
try{await migrate(drizzle(pool),{migrationsFolder:path.join(process.cwd(),"src/server/db/migrations")});console.log(`Test database ready: ${name}`)}finally{await pool.end()}

}
main().catch(error=>{console.error(error);process.exitCode=1});
