import { requireSession } from "@/server/services/auth";
import { uuidSchema } from "@/lib/contracts";
export const dynamic = "force-dynamic";
import { modeSchema } from "@/lib/contracts";import { setMode } from "@/server/services/sources";import { errorResponse,jsonBody } from "@/server/services/errors";
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){try{await requireSession();const id=uuidSchema.parse((await params).id);const {simulationMode}=modeSchema.parse(await jsonBody(req));return Response.json(await setMode(id,simulationMode))}catch(e){return errorResponse(e)}}
