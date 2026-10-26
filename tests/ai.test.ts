import { readdirSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CourseDoc } from "../src/lib/core/schema.ts";
import { AiLesson, fromLesson, toSteps } from "../src/lib/server/ai/lessons.ts";
import { extractJson, generateObject } from "../src/lib/server/ai/providers.ts";
import { aiStatus, getAiConfig, saveAiSettings } from "../src/lib/server/ai/settings.ts";
import type { Database } from "../src/lib/server/db/index.ts";
import { makeUser, testDb } from "./helpers.ts";

process.env.KILN_SECRET = "test-secret-for-ai-key-encryption";

const seeds = readdirSync("seed").map((f) => JSON.parse(readFileSync(`seed/${f}`, "utf8")) as CourseDoc);
const lessons = seeds.flatMap((c) => c.units.flatMap((u) => u.lessons));

describe("AI lesson format", () => {
  it.each(lessons.map((l) => [l.title, l] as const))("round-trips %s through the flat AI shape", (_, lesson) => {
    const flat = fromLesson(lesson);
    expect(AiLesson.safeParse(flat).success).toBe(true);
    const { steps, problems } = toSteps(flat);
    expect(problems).toEqual([]);
    expect(steps).toEqual(lesson.steps);
  });

  it("reports unusable steps instead of crashing", () => {
    const { steps, problems } = toSteps({
      title: "x",
      concepts: [],
      steps: [
        { type: "info", text: "ok" },
        { type: "widget", widget: "pendulum", widgetParamsJson: "{not json", goal: "go" },
        { type: "numeric", prompt: "?" }, // no answerNumber
      ],
    });
    expect(steps).toHaveLength(2);
    expect(problems.join(" ")).toMatch(/widgetParamsJson is not valid JSON/);
    expect(problems.join(" ")).toMatch(/step 3 \(numeric\)/);
  });
});

describe("OpenAI-compatible adapter", () => {
  it("extracts JSON from fenced replies", () => {
    expect(extractJson('Sure!\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("repairs an invalid first reply", async () => {
    const replies = ['{"title": 5}', '{"title": "Hola", "concepts": [], "steps": [{"type": "info", "text": "hi"}]}'];
    const calls: { url: string; body: { messages: { role: string }[] } }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ choices: [{ message: { content: replies.shift() } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await generateObject(
      { provider: "openrouter", model: "some/model", baseUrl: null, apiKey: "k" },
      { system: "s", prompt: "p", schema: AiLesson },
      fake,
    );
    expect(out.title).toBe("Hola");
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[1].body.messages.at(-1)!.role).toBe("user"); // repair request
  });

  it("maps auth errors to a clear message", async () => {
    const fake = (async () => new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 })) as unknown as typeof fetch;
    await expect(
      generateObject({ provider: "openai", model: "m", baseUrl: null, apiKey: "k" }, { system: "s", prompt: "p", schema: AiLesson }, fake),
    ).rejects.toThrow(/rejected your API key/);
  });
});

describe("AI settings", () => {
  let d: Database;
  beforeAll(async () => {
    d = await testDb();
  });
  afterAll(() => d.close());

  it("encrypts keys at rest and never exposes them in status", async () => {
    const u = await makeUser(d, "Ai");
    await saveAiSettings(d.db, u.id, { provider: "anthropic", model: "claude-opus-5", apiKey: "sk-ant-secret" }, { allowCustomUrl: false });
    const raw = await d.db.query.aiSettings.findFirst();
    expect(raw?.apiKeyEnc).not.toContain("sk-ant-secret");
    expect((await getAiConfig(d.db, u.id))?.apiKey).toBe("sk-ant-secret");
    expect(JSON.stringify(await aiStatus(d.db, u.id))).not.toContain("sk-ant-secret");
    // Keep the stored key when the form leaves it blank.
    await saveAiSettings(d.db, u.id, { provider: "anthropic", model: "claude-sonnet-5", keepKey: true }, { allowCustomUrl: false });
    expect((await getAiConfig(d.db, u.id))?.apiKey).toBe("sk-ant-secret");
  });

  it("blocks custom server URLs for non-admins", async () => {
    const u = await makeUser(d, "Ollama");
    await expect(saveAiSettings(d.db, u.id, { provider: "ollama", model: "llama3" }, { allowCustomUrl: false })).rejects.toThrow(
      /only admins/,
    );
    await saveAiSettings(d.db, u.id, { provider: "ollama", model: "llama3" }, { allowCustomUrl: true });
    expect((await getAiConfig(d.db, u.id))?.baseUrl).toBe("http://localhost:11434");
  });
});
