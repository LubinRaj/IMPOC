import { requireSession } from "@/server/services/auth";
export const dynamic = "force-dynamic";
import { pageSchema,vmInputSchema } from "@/lib/contracts";import { createSource,listSource } from "@/server/services/sources";import { errorResponse,jsonBody } from "@/server/services/errors";
export async function GET(req:Request){try{await requireSession();return Response.json(await listSource(pageSchema.parse(Object.fromEntries(new URL(req.url).searchParams))))}catch(e){return errorResponse(e)}}
export async function POST(req:Request){try{await requireSession();return Response.json(await createSource(vmInputSchema.parse(await jsonBody(req))),{status:201})}catch(e){return errorResponse(e)}}
