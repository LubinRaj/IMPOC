import { describe, it, expect } from "vitest";
import {
  issueSession,
  verifySession,
  passcodeMatches,
} from "../../src/lib/session";
const config = {
  passcode: "a strong local passcode",
  secret: "this-is-a-long-local-session-secret-at-least-32-characters",
};
describe("passcode session", () => {
  it("compares passcodes without accepting near matches", () => {
    expect(passcodeMatches(config.passcode, config.passcode)).toBe(true);
    expect(passcodeMatches("wrong", config.passcode)).toBe(false);
  });
  it("accepts signed token until expiry and rejects tampering", () => {
    const token = issueSession(config, 1000);
    expect(verifySession(token, config, 1001)).toBe(true);
    expect(verifySession(token, config, 1000 + 8 * 60 * 60 * 1000 + 1)).toBe(
      false,
    );
    expect(verifySession(token + "x", config, 1001)).toBe(false);
  });
  it("invalidates the cookie when the passcode rotates", () => {
    const token = issueSession(config, 1000);
    expect(
      verifySession(token, { ...config, passcode: "new passcode" }, 1001),
    ).toBe(false);
  });
});
