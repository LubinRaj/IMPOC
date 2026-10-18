import { requireBearer } from "@/server/services/machine-auth";
import { enqueuePolls, processNextJob } from "@/server/services/automatic-sync";
import { errorResponse } from "@/server/services/errors";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireBearer(request, process.env.SYNC_WORKER_SECRET);
    await enqueuePolls();
    return Response.json(await processNextJob());
  } catch (error) {
    return errorResponse(error);
  }
}
