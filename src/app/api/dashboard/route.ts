import { requireSession } from "@/server/services/auth";
export const dynamic = "force-dynamic";
import { dashboard } from "@/server/services/sources";import { errorResponse } from "@/server/services/errors";
export async function GET(){try{await requireSession();return Response.json(await dashboard())}catch(e){return errorResponse(e)}}
