import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/lib/server/db/index.ts";
import { testDb } from "./helpers.ts";
import * as auth from "../src/lib/server/auth.ts";

let d: Database;
beforeAll(async () => {
  d = await testDb();
});
afterAll(() => d.close());

describe("auth", () => {
  it("makes the first account admin, later ones users", async () => {
    const a = await auth.register(d.db, { email: "Admin@Example.com", name: "Admin", password: "correct horse battery" });
    const b = await auth.register(d.db, { email: "bea@example.com", name: "Bea", password: "another long password" });
    expect(a.role).toBe("admin");
    expect(a.email).toBe("admin@example.com");
    expect(b.role).toBe("user");
  });

  it("rejects duplicate emails, weak passwords and bad input", async () => {
    await expect(auth.register(d.db, { email: "BEA@example.com", name: "B", password: "long enough pw" })).rejects.toThrow(
      /already exists/,
    );
    await expect(auth.register(d.db, { email: "c@example.com", name: "C", password: "short" })).rejects.toThrow(/10 characters/);
    await expect(auth.register(d.db, { email: "nope", name: "C", password: "long enough pw" })).rejects.toThrow(/valid email/);
  });

  it("logs in with the right password only", async () => {
    const u = await auth.login(d.db, "ADMIN@example.com", "correct horse battery");
    expect(u.name).toBe("Admin");
    await expect(auth.login(d.db, "admin@example.com", "wrong password!!")).rejects.toThrow(/Wrong email or password/);
    await expect(auth.login(d.db, "ghost@example.com", "whatever pw 123")).rejects.toThrow(/Wrong email or password/);
  });

  it("creates, validates and deletes sessions", async () => {
    const u = await auth.login(d.db, "bea@example.com", "another long password");
    const { token } = await auth.createSession(d.db, u.id);
    const s = await auth.validateSession(d.db, token);
    expect(s?.user.id).toBe(u.id);
    expect(await auth.validateSession(d.db, token + "x")).toBeNull();
    await auth.deleteSession(d.db, s!.sessionId);
    expect(await auth.validateSession(d.db, token)).toBeNull();
  });

  it("changing the password signs out everywhere", async () => {
    const u = await auth.login(d.db, "bea@example.com", "another long password");
    const { token } = await auth.createSession(d.db, u.id);
    await expect(auth.changePassword(d.db, u.id, "wrong", "brand new password")).rejects.toThrow(/current password/);
    await auth.changePassword(d.db, u.id, "another long password", "brand new password");
    expect(await auth.validateSession(d.db, token)).toBeNull();
    await expect(auth.login(d.db, "bea@example.com", "brand new password")).resolves.toBeTruthy();
  });

  it("issues API tokens that can be revoked", async () => {
    const u = await auth.login(d.db, "admin@example.com", "correct horse battery");
    const t = await auth.createApiToken(d.db, u.id, "Claude Code");
    expect(t.token.startsWith("kiln_pat_")).toBe(true);
    expect((await auth.validateApiToken(d.db, t.token))?.user.id).toBe(u.id);
    expect(await auth.listApiTokens(d.db, u.id)).toHaveLength(1);
    await auth.revokeApiToken(d.db, u.id, t.id);
    expect(await auth.validateApiToken(d.db, t.token)).toBeNull();
    expect(await auth.listApiTokens(d.db, u.id)).toHaveLength(0);
  });
});
