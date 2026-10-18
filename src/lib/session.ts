import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export const sessionCookie = "impoc_session";
export const sessionLifetimeMs = 8 * 60 * 60 * 1000;
export type SessionConfig = { passcode: string; secret: string };
export function sessionConfig(): SessionConfig | null {
  const passcode = process.env.APP_PASSCODE;
  const secret = process.env.APP_SESSION_SECRET;
  return passcode && /^\d{6}$/.test(passcode) && secret && secret.length >= 32
    ? { passcode, secret }
    : null;
}
export function passcodeMatches(input: string, expected: string) {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
function signingKey(config: SessionConfig) {
  return createHash("sha256")
    .update(config.secret)
    .update("\0")
    .update(config.passcode)
    .digest();
}
function signature(payload: string, config: SessionConfig) {
  return createHmac("sha256", signingKey(config))
    .update(payload)
    .digest("base64url");
}
export function issueSession(config: SessionConfig, now = Date.now()) {
  const expiry = now + sessionLifetimeMs;
  const payload = `${expiry}.${randomBytes(16).toString("base64url")}`;
  return `${payload}.${signature(payload, config)}`;
}
export function verifySession(
  token: string | undefined,
  config: SessionConfig | null,
  now = Date.now(),
) {
  if (!token || !config || token.length > 512) return false;
  const [expiry, nonce, mac, ...extra] = token.split(".");
  if (
    extra.length ||
    !/^\d{1,13}$/.test(expiry ?? "") ||
    !/^[-_A-Za-z0-9]{22}$/.test(nonce ?? "") ||
    !/^[-_A-Za-z0-9]{43}$/.test(mac ?? "")
  )
    return false;
  const expiration = Number(expiry);
  if (expiration < now || expiration > now + sessionLifetimeMs) return false;
  const expected = signature(`${expiry}.${nonce}`, config);
  return timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}
