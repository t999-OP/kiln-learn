import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Database } from "../src/lib/server/db/index.ts";
import * as s from "../src/lib/server/db/schema.ts";
import * as auth from "../src/lib/server/auth.ts";
import * as courses from "../src/lib/server/courses.ts";
import * as progress from "../src/lib/server/progress.ts";
import * as community from "../src/lib/server/community.ts";
import { makeUser, testDb } from "./helpers.ts";

let d: Database;
let courseId: string;
const today = () => new Date().toISOString().slice(0, 10);
const steps = [
  { type: "info", text: "hi" },
  { type: "choice", prompt: "a?", options: ["a", "b", "c"], answer: 0, explain: "a" },
  { type: "fill", prompt: "___ x", answers: ["a"] },
  {
    type: "match",
    pairs: [
      ["a", "1"],
      ["b", "2"],
      ["c", "3"],
    ],
  },
];
const finish = (user: auth.SessionUser, lessonId: string) =>
  progress.completeLesson(d.db, user, {
    courseId,
    version: 1,
    lessonId,
    day: today(),
    results: [
      { step: 1, correct: true },
      { step: 2, correct: true },
    ],
  });

beforeAll(async () => {
  d = await testDb();
  const owner = await makeUser(d, "Owner");
  const c = await courses.createCourse(d.db, owner, {
    meta: { title: "Guest Course", subject: "math", description: "x" },
    content: {
      units: [
        {
          id: "u",
          title: "U",
          lessons: [
            { id: "l1", title: "One", concepts: [], steps },
            { id: "l2", title: "Two", concepts: [], steps },
          ],
        },
      ],
    },
  });
  courseId = c.id;
  await courses.publish(d.db, owner, courseId);
});
afterAll(() => d.close());

describe("guest learning", () => {
  it("lets a guest learn and earn XP without an account", async () => {
    const g = await auth.createGuest(d.db);
    expect(g.guest).toBe(true);
    expect(g.email).toBeNull();
    const r = await finish(g, "l1");
    expect(r.xp).toBeGreaterThan(0);
    expect(r.streak).toBe(1);
  });

  it("keeps guests away from account-only features and the leaderboard", async () => {
    const g = await auth.createGuest(d.db);
    await finish(g, "l1");
    await expect(courses.createCourse(d.db, g, { meta: { title: "Nope", subject: "math" } })).rejects.toMatchObject({ status: 401 });
    await expect(community.rateCourse(d.db, g, courseId, 5)).rejects.toMatchObject({ status: 401 });
    expect((await progress.leaderboard(d.db)).some((u) => u.id === g.id)).toBe(false);
  });

  it("keeps progress when a guest signs up", async () => {
    const g = await auth.createGuest(d.db);
    const r = await finish(g, "l1");
    const u = await auth.register(d.db, { email: "kept@example.com", name: "Kept", password: "a long test password" }, { guestId: g.id });
    expect(u.id).toBe(g.id);
    expect(u.guest).toBe(false);
    expect(u.xp).toBe(r.totalXp);
    expect((await progress.courseProgress(d.db, u.id, courseId)).l1).toBeTruthy();
  });

  it("merges guest progress into an existing account on sign-in", async () => {
    const acct = await makeUser(d, "Merge");
    const a = await finish(acct, "l1");
    const g = await auth.createGuest(d.db);
    const b = await finish({ ...g }, "l1");
    await finish(g, "l2");
    await auth.mergeGuest(d.db, g.id, acct.id);
    const [after] = await d.db.select().from(s.users).where(eq(s.users.id, acct.id));
    expect(after.xp).toBeGreaterThan(a.totalXp + b.xp - 1);
    const p = await progress.courseProgress(d.db, acct.id, courseId);
    expect(p.l1.plays).toBe(2);
    expect(p.l2).toBeTruthy();
    expect(await d.db.select().from(s.users).where(eq(s.users.id, g.id))).toHaveLength(0);
  });

  it("cleans up guests that never came back", async () => {
    const unused = await auth.createGuest(d.db);
    const active = await auth.createGuest(d.db);
    await finish(active, "l1");
    await d.db
      .update(s.users)
      .set({ createdAt: new Date(Date.now() - 2 * 86_400_000) })
      .where(eq(s.users.id, unused.id));
    expect(await auth.deleteStaleGuests(d.db)).toBeGreaterThanOrEqual(1);
    expect(await d.db.select().from(s.users).where(eq(s.users.id, unused.id))).toHaveLength(0);
    expect(await d.db.select().from(s.users).where(eq(s.users.id, active.id))).toHaveLength(1);
  });
});
