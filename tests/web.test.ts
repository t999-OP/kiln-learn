import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readJson, safeNext } from "../src/lib/server/web.ts";
import * as auth from "../src/lib/server/auth.ts";
import type { Database } from "../src/lib/server/db/index.ts";
import { testDb } from "./helpers.ts";

describe("safeNext", () => {
  it.each([
    ["/studio", "/studio"],
    ["/course/x?preview=1", "/course/x?preview=1"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["https://evil.example", "/"],
    [null, "/"],
  ])("%s -> %s", (input, out) => expect(safeNext(input)).toBe(out));
});

describe("readJson", () => {
  it("requires a JSON content type", async () => {
    await expect(
      readJson(new Request("http://x", { method: "POST", body: "{}", headers: { "content-type": "text/plain" } })),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readJson(
        new Request("http://x", { method: "POST", body: '{"a":1}', headers: { "content-type": "application/json; charset=utf-8" } }),
      ),
    ).resolves.toEqual({ a: 1 });
  });
});

describe("KILN_ADMIN_EMAIL", () => {
  let d: Database;
  beforeAll(async () => {
    d = await testDb();
    process.env.KILN_ADMIN_EMAIL = "Owner@Example.com";
  });
  afterAll(async () => {
    delete process.env.KILN_ADMIN_EMAIL;
    await d.close();
  });

  it("only gives admin to the configured email", async () => {
    const early = await auth.register(d.db, { email: "squatter@example.com", name: "S", password: "long enough password" });
    const owner = await auth.register(d.db, { email: "owner@example.com", name: "O", password: "long enough password" });
    expect(early.role).toBe("user");
    expect(owner.role).toBe("admin");
  });
});
