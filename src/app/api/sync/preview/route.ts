import { requireSession } from "@/server/services/auth";
export const dynamic = "force-dynamic";
import { previewRequestSchema } from "@/lib/contracts";
import { preview } from "@/server/services/sync";
import { previewNetBox } from "@/server/services/netbox-sync";
import { errorResponse, jsonBody } from "@/server/services/errors";
import { requireLocalTestAdapter } from "@/server/services/local-test-adapter";
export async function POST(req: Request) {
  try {
    await requireSession();
    const input = previewRequestSchema.parse(await jsonBody(req));
    if (input.destination === "local") requireLocalTestAdapter();
    return Response.json(
      input.destination === "netbox"
        ? await previewNetBox(input.scopeIds)
        : await preview(input.scopeIds),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
