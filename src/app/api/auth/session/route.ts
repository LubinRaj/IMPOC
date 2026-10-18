import { cookies } from "next/headers";
import { sessionConfig, sessionCookie, verifySession } from "@/lib/session";
export const dynamic = "force-dynamic";
export async function GET() {
  const config = sessionConfig();
  return Response.json({
    authenticated: verifySession(
      (await cookies()).get(sessionCookie)?.value,
      config,
    ),
    configured: Boolean(config),
  });
}
