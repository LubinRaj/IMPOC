import { NextRequest, NextResponse } from "next/server";
import { sessionCookie } from "@/lib/session";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(sessionCookie, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 0,
  });
  return response;
}
