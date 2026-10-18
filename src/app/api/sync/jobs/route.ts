import { requireSession } from "@/server/services/auth";
import { jobStatus } from "@/server/services/automatic-sync";
import { errorResponse } from "@/server/services/errors";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireSession();
    return Response.json(await jobStatus());
  } catch (error) {
    return errorResponse(error);
  }
}
