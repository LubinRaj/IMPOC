import { requireSession } from "@/server/services/auth";
export const dynamic = "force-dynamic";
import { applyRequestSchema } from "@/lib/contracts";
import { apply } from "@/server/services/sync";
import { applyNetBox } from "@/server/services/netbox-sync";
import { db } from "@/server/db/client";
import { plans } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { AppError, errorResponse, jsonBody } from "@/server/services/errors";
import { requireLocalTestAdapter } from "@/server/services/local-test-adapter";
export async function POST(req: Request) {
  try {
    await requireSession();
    const { planId } = applyRequestSchema.parse(await jsonBody(req));
    const [plan] = await db
      .select({ destination: plans.destination })
      .from(plans)
      .where(eq(plans.id, planId));
    if (!plan) throw new AppError("NOT_FOUND", "Preview not found", 404);
    if (plan.destination === "local") requireLocalTestAdapter();
    return Response.json(
      plan.destination === "netbox"
        ? await applyNetBox(planId)
        : await apply(planId),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
