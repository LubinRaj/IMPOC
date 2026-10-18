import "server-only";
import { timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";
export function requireBearer(request: Request, secret: string | undefined) {
  if (!secret || secret.length < 24 || secret.startsWith("replace-with-"))
    throw new AppError(
      "NOT_CONFIGURED",
      "Machine endpoint secret is not configured",
      503,
    );
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer /i, "") || "";
  const a = Buffer.from(supplied),
    b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new AppError("UNAUTHORIZED", "Invalid machine token", 401);
}
