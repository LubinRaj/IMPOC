import { NextRequest, NextResponse } from "next/server";
import { sessionConfig, sessionCookie, verifySession } from "@/lib/session";
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (
    path.startsWith("/_next/") ||
    path === "/favicon.ico" ||
    path.startsWith("/api/auth/") ||
    path === "/api/health" ||
    path === "/api/sync/worker" ||
    path === "/api/sync/events"
  )
    return NextResponse.next();
  const authenticated = verifySession(
    request.cookies.get(sessionCookie)?.value,
    sessionConfig(),
  );
  if (path === "/access")
    return authenticated
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
  if (authenticated) return NextResponse.next();
  if (path.startsWith("/api/"))
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Enter the operator passcode to continue.",
        },
      },
      { status: 401 },
    );
  return NextResponse.redirect(new URL("/access", request.url));
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2)$).*)",
  ],
};
