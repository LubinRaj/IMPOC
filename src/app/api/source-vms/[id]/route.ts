import { requireSession } from "@/server/services/auth";
import { uuidSchema } from "@/lib/contracts";
export const dynamic = "force-dynamic";
import { sourcePatchSchema } from "@/lib/contracts";import { patchSource,deleteSource } from "@/server/services/sources";import { errorResponse,jsonBody } from "@/server/services/errors";
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){try{await requireSession();const input=await jsonBody(req);const parsed=sourcePatchSchema.parse(input);const patch=Object.fromEntries(Object.entries(parsed).filter(([key])=>Object.hasOwn(input as object,key)));return Response.json(await patchSource(uuidSchema.parse((await params).id),patch))}catch(e){return errorResponse(e)}}
export async function DELETE(_req:Request,{params}:{params:Promise<{id:string}>}){try{await requireSession();return Response.json(await deleteSource(uuidSchema.parse((await params).id)))}catch(e){return errorResponse(e)}}
