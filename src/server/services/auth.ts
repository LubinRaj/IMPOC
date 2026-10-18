import "server-only";
import { cookies } from "next/headers";
import { sessionConfig, sessionCookie, verifySession } from "@/lib/session";
import { AppError } from "./errors";
export async function requireSession() {
  const config = sessionConfig();
  if (!config)
    throw new AppError(
      "AUTH_NOT_CONFIGURED",
      "Operator access is not configured.",
      503,
    );
  const cookie = (await cookies()).get(sessionCookie)?.value;
  if (!verifySession(cookie, config))
    throw new AppError(
      "UNAUTHORIZED",
      "Enter the operator passcode to continue.",
      401,
    );
}
