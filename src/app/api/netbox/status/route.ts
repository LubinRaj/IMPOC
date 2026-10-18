import { requireSession } from "@/server/services/auth";
import { NetBoxClient } from "@/server/destinations/netbox";
import { errorResponse } from "@/server/services/errors";
export const dynamic = "force-dynamic";
export async function GET(){try{await requireSession();const client=new NetBoxClient();const status=await client.health();return Response.json({status:"connected",url:client.base.origin,version:status["netbox-version"]})}catch(error){return errorResponse(error)}}
