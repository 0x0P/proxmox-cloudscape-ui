import { describe, it, expect } from "vitest";
import { parsePveSession } from "@/app/lib/pve-session";

describe("parsePveSession", () => {
  it("returns null for undefined input", () => {
    expect(parsePveSession(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parsePveSession("")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parsePveSession("not-json")).toBeNull();
  });

  it("returns null for JSON missing required fields", () => {
    expect(parsePveSession(JSON.stringify({ ticket: "abc" }))).toBeNull();
    expect(parsePveSession(JSON.stringify({ ticket: "abc", csrfToken: "def" }))).toBeNull();
  });

  it("parses valid session", () => {
    const session = {
      ticket: "PVE:root@pam:12345::abc",
      csrfToken: "csrf-token-123",
      username: "root@pam",
    };
    expect(parsePveSession(JSON.stringify(session))).toEqual(session);
  });

  it("returns null for non-string field values", () => {
    expect(parsePveSession(JSON.stringify({ ticket: 123, csrfToken: "x", username: "y" }))).toBeNull();
  });
});
