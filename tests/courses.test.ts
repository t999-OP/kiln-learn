import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/lib/server/db/index.ts";
import type { SessionUser } from "../src/lib/server/auth.ts";
import * as courses from "../src/lib/server/courses.ts";
import * as progress from "../src/lib/server/progress.ts";
import * as community from "../src/lib/server/community.ts";
import { seedIfEmpty } from "../src/lib/server/seed.ts";
import { makeUser, testDb } from "./helpers.ts";

let d: Database;
let admin: SessionUser, ana: SessionUser, ben: SessionUser;
const today = () => new Date().toISOString().slice(0, 10);

const goodLesson = (id = "l1") => ({
  id,
  title: "Hola",
  concepts: [],
  steps: [
    { type: "info", text: "**hola** = hello" },
    { type: "choice", prompt: "hola?", options: ["hello", "bye", "thanks"], answer: 0, explain: "hola = hello" },
    {
      type: "match",
      pairs: [
        ["hola", "hello"],
        ["adiós", "bye"],
        ["gracias", "thanks"],
      ],
    },
    { type: "fill", prompt: "___ means hello", answers: ["hola"] },
  ],
});

beforeAll(async () => {
  d = await testDb();
  admin = await makeUser(d, "Admin");
  ana = await makeUser(d, "Ana");
  ben = await makeUser(d, "Ben");
});
afterAll(() => d.close());

describe("course lifecycle", () => {
  let id: string;

  it("creates a draft that only its creator can edit", async () => {
    const c = await courses.createCourse(d.db, ana, { meta: { title: "Spanish Café", subject: "language", description: "Order coffee." } });
    id = c.id;
    expect(c.id).toBe("spanish-cafe");
    expect(c.status).toBe("draft");
    await expect(courses.getForEdit(d.db, ben, id)).rejects.toMatchObject({ status: 403 });
    await expect(courses.getForEdit(d.db, null, id)).rejects.toMatchObject({ status: 401 });
    await expect(courses.getForEdit(d.db, admin, id)).resolves.toBeTruthy(); // admins moderate
  });

  it("gives duplicate titles a unique id", async () => {
    const c = await courses.createCourse(d.db, ben, { meta: { title: "Spanish Café", subject: "language" } });
    expect(c.id).toMatch(/^spanish-cafe-[0-9a-f]{4}$/);
  });

  it("detects concurrent draft edits", async () => {
    const { course } = await courses.getForEdit(d.db, ana, id);
    await courses.saveDraft(d.db, ana, id, {
      content: { units: [{ id: "u1", title: "Basics", lessons: [goodLesson()] }] },
      baseRevision: course.draftRevision,
    });
    await expect(courses.saveDraft(d.db, ana, id, { content: { units: [] }, baseRevision: course.draftRevision })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("rejects malformed content", async () => {
    await expect(
      courses.saveDraft(d.db, ana, id, {
        content: { units: [{ id: "u", title: "x", lessons: [{ id: "l", title: "t", steps: [{ type: "nope" }] }] }] },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("hides drafts from learners and the catalog", async () => {
    await expect(courses.getPlayable(d.db, ben, id)).rejects.toMatchObject({ status: 404 });
    expect((await courses.listCatalog(d.db)).map((c) => c.id)).not.toContain(id);
    const preview = await courses.getPlayable(d.db, ana, id, { preview: true });
    expect(preview.preview).toBe(true);
  });

  it("refuses to publish a course with errors", async () => {
    const c = await courses.createCourse(d.db, ana, { meta: { title: "Empty", subject: "math" } });
    await expect(courses.publish(d.db, ana, c.id)).rejects.toMatchObject({ status: 400 });
  });

  it("publishes immutable versions; learners keep theirs", async () => {
    const v1 = await courses.publish(d.db, ana, id);
    expect(v1.version).toBe(1);
    await courses.upsertLesson(d.db, ana, id, "u1", { lessonId: "l1", title: "Hola v2", steps: goodLesson().steps });
    const v2 = await courses.publish(d.db, ana, id);
    expect(v2.version).toBe(2);
    expect((await courses.getPlayable(d.db, ben, id)).content.units[0].lessons[0].title).toBe("Hola v2");
    expect((await courses.getPlayable(d.db, ben, id, { version: 1 })).content.units[0].lessons[0].title).toBe("Hola");
    expect((await courses.listCatalog(d.db)).find((c) => c.id === id)?.lessons).toBe(1);
  });

  it("private courses stay out of the catalog and switch license", async () => {
    const c = await courses.updateSettings(d.db, ana, id, { visibility: "private" });
    expect(c.license).toBe(courses.CLOSED_LICENSE);
    expect((await courses.listCatalog(d.db)).map((x) => x.id)).not.toContain(id);
    await expect(courses.getPlayable(d.db, ben, id)).rejects.toMatchObject({ status: 404 });
    const back = await courses.updateSettings(d.db, ana, id, { visibility: "public" });
    expect(back.license).toBe(courses.OPEN_LICENSE);
  });

  it("records progress, XP, streak and step stats", async () => {
    const r = await progress.completeLesson(d.db, ben, {
      courseId: id,
      version: 2,
      lessonId: "l1",
      day: today(),
      results: [
        { step: 1, correct: true },
        { step: 2, correct: false },
        { step: 3, correct: true },
        { step: 0, correct: true }, // info step: not graded, ignored
        { step: 99, correct: true }, // out of range: ignored
      ],
    });
    expect(r.accuracy).toBe(67);
    expect(r.xp).toBe(progress.xpFor(67));
    expect(r.streak).toBe(1);
    const stats = await progress.stepStatsFor(d.db, id, 2);
    expect(stats.l1[2]).toEqual({ attempts: 1, correct: 0 });
    expect(stats.l1[0]).toBeUndefined();
    expect((await progress.courseProgress(d.db, ben.id, id)).l1.bestAccuracy).toBe(67);
  });

  it("only lets learners who played rate, and not their own course", async () => {
    await expect(community.rateCourse(d.db, admin, id, 5)).rejects.toMatchObject({ status: 403 });
    await expect(community.rateCourse(d.db, ana, id, 5)).rejects.toMatchObject({ status: 403 });
    const agg = await community.rateCourse(d.db, ben, id, 4, "Nice");
    expect(agg).toEqual({ avg: 4, n: 1 });
  });

  it("lets moderators remove reported courses", async () => {
    await community.reportCourse(d.db, ben, id, "wrong", "Step 2 is wrong");
    expect((await community.reportCourse(d.db, ben, id, "wrong")).duplicate).toBe(true);
    await expect(community.listReports(d.db, ben)).rejects.toMatchObject({ status: 403 });
    const [report] = await community.listReports(d.db, admin);
    await community.resolveReport(d.db, admin, report.id, "remove_course", "Factually wrong");
    await expect(courses.getPlayable(d.db, ben, id)).rejects.toMatchObject({ status: 404 });
    await expect(courses.publish(d.db, ana, id)).rejects.toMatchObject({ status: 403 });
    expect(await community.listReports(d.db, admin)).toHaveLength(0);
  });
});

describe("seeding", () => {
  it("imports and publishes the example courses once", async () => {
    const fresh = await testDb();
    try {
      expect(await seedIfEmpty(fresh.db)).toBe(5);
      expect(await seedIfEmpty(fresh.db)).toBe(0);
      const catalog = await courses.listCatalog(fresh.db);
      expect(catalog).toHaveLength(5);
      expect(catalog.every((c) => c.qualityRank === "Gold")).toBe(true);
      expect(catalog.find((c) => c.id === "calculus-1")?.provenance).toMatchObject({ kind: "agent" });
    } finally {
      await fresh.close();
    }
  });
});
