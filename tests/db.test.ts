import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Database } from "../src/lib/server/db/index.ts";
import { testDb } from "./helpers.ts";
import * as s from "../src/lib/server/db/schema.ts";

let d: Database;
beforeAll(async () => {
  d = await testDb();
});
afterAll(() => d.close());

describe("database", () => {
  it("migrates and stores a user", async () => {
    const [u] = await d.db.insert(s.users).values({ email: "ada@example.com", name: "Ada", passwordHash: "x" }).returning();
    expect(u.role).toBe("user");
    const rows = await d.db.select().from(s.users).where(eq(s.users.id, u.id));
    expect(rows[0].email).toBe("ada@example.com");
  });

  it("enforces case-insensitive unique emails", async () => {
    await expect(d.db.insert(s.users).values({ email: "ADA@example.com", name: "Ada 2", passwordHash: "x" })).rejects.toThrow();
  });
});
