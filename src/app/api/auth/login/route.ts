import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  issueSession,
  passcodeMatches,
  sessionConfig,
  sessionCookie,
  sessionLifetimeMs,
} from "@/lib/session";
import { errorResponse, jsonBody, AppError } from "@/server/services/errors";
export const dynamic = "force-dynamic";
const loginSchema = z.object({ passcode: z.string().min(1).max(512) });
const failureWindowMs = 60_000;
const maxFailures = 5;
let failures = 0;
let resetAt = 0;
export async function POST(request: NextRequest) {
  try {
    const config = sessionConfig();
    if (!config)
      throw new AppError(
        "AUTH_NOT_CONFIGURED",
        "Set APP_PASSCODE and APP_SESSION_SECRET in .env.",
        503,
      );
    const now = Date.now();
    if (now >= resetAt) {
      failures = 0;
      resetAt = now + failureWindowMs;
    }
    if (failures >= maxFailures)
      throw new AppError(
        "RATE_LIMITED",
        "Too many attempts. Try again in one minute.",
        429,
      );
    const { passcode } = loginSchema.parse(await jsonBody(request));
    if (!passcodeMatches(passcode, config.passcode)) {
      failures++;
      throw new AppError(
        "INVALID_PASSCODE",
        "That passcode was not recognized.",
        401,
      );
    }
    failures = 0;
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(sessionCookie, issueSession(config), {
      httpOnly: true,
      sameSite: "strict",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: sessionLifetimeMs / 1000,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
