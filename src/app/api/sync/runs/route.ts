import { requireSession } from "@/server/services/auth";
export const dynamic = "force-dynamic";
import { listRuns } from "@/server/services/sync";import { errorResponse } from "@/server/services/errors";
export async function GET(){try{await requireSession();return Response.json(await listRuns())}catch(e){return errorResponse(e)}}
