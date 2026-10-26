import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessCourse } from "./quality.ts";
import { CourseContentSchema, CourseMetaSchema, type CourseDoc } from "./schema.ts";

const seeds = readdirSync("seed").map((f) => JSON.parse(readFileSync(`seed/${f}`, "utf8")) as CourseDoc & { id: string });

const doc = (units: CourseDoc["units"]): CourseDoc => ({ title: "T", subject: "math", description: "d", units });
const lesson = (steps: unknown[]) => [{ id: "u", title: "U", lessons: [{ id: "l", title: "L", concepts: [], steps: steps as never }] }];

describe("seed courses", () => {
  it.each(seeds.map((s) => [s.id, s] as const))("%s parses and ranks Gold", (_, course) => {
    expect(() => CourseMetaSchema.parse(course)).not.toThrow();
    expect(() => CourseContentSchema.parse(course)).not.toThrow();
    const r = assessCourse(course);
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(r.rank).toBe("Gold");
  });
});

describe("assessCourse", () => {
  it("blocks publishing an empty course", () => {
    const r = assessCourse(doc([]));
    expect(r.publishable).toBe(false);
    expect(r.issues[0].msg).toMatch(/no units/);
  });

  it("catches a word bank that can't build any answer", () => {
    const r = assessCourse(
      doc(lesson([{ type: "translate", prompt: "A bread, please", answers: ["Ein Brot, bitte"], words: ["Ein", "bitte"] }])),
    );
    expect(r.issues).toContainEqual(
      expect.objectContaining({ level: "error", lessonId: "l", step: 0, msg: expect.stringMatching(/word-bank/) }),
    );
  });

  it("validates math in expressions, widgets and graphs", () => {
    const r = assessCourse(
      doc(
        lesson([
          { type: "info", text: "hi" },
          { type: "expression", prompt: "d/dx x^3", answer: "3x^" },
          { type: "widget", widget: "tangent", params: { fn: "x^^2", a: 1 }, goal: "Find the slope." },
          { type: "numeric", prompt: "lim", answer: 1, graph: { fns: ["sin(x)/x"], x: [3, -3] } },
        ]),
      ),
    );
    const errors = r.issues.filter((i) => i.level === "error").map((i) => i.msg);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/answer must be a valid expression/),
        expect.stringMatching(/widget fn "x\^\^2"/),
        expect.stringMatching(/graph.x must be \[min, max\]/),
      ]),
    );
  });

  it("warns when a lesson tests before teaching", () => {
    const r = assessCourse(doc(lesson([{ type: "choice", prompt: "?", options: ["a", "b", "c"], answer: 0, explain: "x" }])));
    expect(r.issues.some((i) => /tests before teaching/.test(i.msg))).toBe(true);
  });
});
