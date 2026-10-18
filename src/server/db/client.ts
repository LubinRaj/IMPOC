import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
const globalDb = globalThis as unknown as { inventoryPool?: Pool };
const pool = globalDb.inventoryPool ?? new Pool({connectionString:process.env.DATABASE_URL,max:10});
if(process.env.NODE_ENV!=="production") globalDb.inventoryPool=pool;
export const db=drizzle(pool,{schema});
export {pool};
