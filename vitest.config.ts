import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "node:path";
const url=new URL(process.env.DATABASE_URL??"postgres://inventory:inventory_local@127.0.0.1:55439/inventory");
url.pathname=`${url.pathname}_test`;
export default defineConfig({resolve:{alias:{"@":path.resolve(__dirname,"src"),"server-only":path.resolve(__dirname,"tests/server-only.ts")}},test:{env:{DATABASE_URL:url.toString()},include:["tests/**/*.test.ts"],testTimeout:30000}});
