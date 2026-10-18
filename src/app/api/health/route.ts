export const dynamic = "force-dynamic";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { errorResponse } from "@/server/services/errors";
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({
      status: "ok",
      database: "connected",
      inventory: "NetBox",
      netboxConfigured: !!(
        process.env.NETBOX_URL && process.env.NETBOX_API_TOKEN
      ),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
