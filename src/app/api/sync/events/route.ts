import { z } from "zod";
import { requireBearer } from "@/server/services/machine-auth";
import { enqueue } from "@/server/services/automatic-sync";
import { errorResponse, jsonBody } from "@/server/services/errors";
export const dynamic = "force-dynamic";
const event = z.object({
  scopeId: z.string().uuid(),
  eventId: z.string().min(1).max(200),
});
export async function POST(request: Request) {
  try {
    requireBearer(request, process.env.EVENT_INGEST_SECRET);
    const input = event.parse(await jsonBody(request));
    const job = await enqueue(input.scopeId, `event:${input.eventId}`, "event");
    return Response.json(
      { jobId: job.id, status: job.status },
      { status: 202 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
