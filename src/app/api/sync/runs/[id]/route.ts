import { requireSession } from "@/server/services/auth";
import { uuidSchema } from "@/lib/contracts";
export const dynamic = "force-dynamic";
import { runDetail } from "@/server/services/sync";import { errorResponse } from "@/server/services/errors";
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{await requireSession();return Response.json(await runDetail(uuidSchema.parse((await params).id)))}catch(e){return errorResponse(e)}}
