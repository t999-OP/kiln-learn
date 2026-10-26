import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Database } from "../src/lib/server/db/index.ts";
import type { SessionUser } from "../src/lib/server/auth.ts";
import { handleMcp } from "../src/lib/server/mcp.ts";
import { recentActivity } from "../src/lib/server/activity.ts";
import * as courses from "../src/lib/server/courses.ts";
import { makeUser, testDb } from "./helpers.ts";

let d: Database;
let user: SessionUser;
let other: SessionUser;

async function connect(as: SessionUser, name = "test-agent") {
  const client = new Client({ name, version: "1.0.0" });
  const fetchImpl = (async (url: string | URL, init?: RequestInit) =>
    handleMcp(new Request(url, init), { db: d.db, user: as, tokenName: "Test token" })) as typeof fetch;
  await client.connect(new StreamableHTTPClientTransport(new URL("http://kiln.test/mcp"), { fetch: fetchImpl }));
  const call = async (tool: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name: tool, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    let data: unknown = r.content[0].text;
    try {
      data = JSON.parse(r.content[0].text);
    } catch {}
    return { isError: !!r.isError, data: data as any };
  };
  return { client, call };
}

beforeAll(async () => {
  d = await testDb();
  user = await makeUser(d, "Owner");
  other = await makeUser(d, "Other");
});
afterAll(() => d.close());

describe("MCP", () => {
  it("lets an agent author, validate and publish a course", async () => {
    const { client, call } = await connect(user);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "get_authoring_guide",
        "create_course",
        "upsert_lesson",
        "validate_course",
        "publish_course",
        "get_lesson_stats",
      ]),
    );
    expect((await call("get_authoring_guide")).data).toMatch(/Step types/);

    const created = await call("create_course", {
      title: "German at the Bakery",
      subject: "language",
      description: "Order bread.",
      languages: { target: "de-DE", source: "en-US" },
      model: "test-model",
    });
    const courseId = created.data.courseId;
    const { data: unit } = await call("add_unit", { courseId, title: "Bakery" });

    const bad = await call("upsert_lesson", {
      courseId,
      unitId: unit.unitId,
      title: "Brot",
      steps: [{ type: "translate", prompt: "A bread, please", answers: ["Ein Brot, bitte"], words: ["Ein", "bitte"] }],
    });
    expect(bad.data.lessonIssues.some((i: { msg: string }) => /word-bank/.test(i.msg))).toBe(true);
    expect((await call("publish_course", { courseId })).isError).toBe(true);

    const steps = [
      { type: "info", text: "**das Brot** = *the bread*", say: "das Brot", lang: "de-DE" },
      { type: "choice", prompt: "bitte?", options: ["please", "bread", "thanks"], answer: 0, explain: "bitte = please" },
      { type: "translate", prompt: "A bread, please", answers: ["Ein Brot, bitte"], words: ["Ein", "Brot", "bitte", "danke"] },
      {
        type: "match",
        pairs: [
          ["Brot", "bread"],
          ["bitte", "please"],
          ["danke", "thanks"],
        ],
      },
    ];
    const good = await call("upsert_lesson", { courseId, unitId: unit.unitId, lessonId: bad.data.lessonId, title: "Brot", steps });
    expect(good.data.lessonIssues.filter((i: { level: string }) => i.level === "error")).toEqual([]);
    const pub = await call("publish_course", { courseId });
    expect(pub.data.version).toBe(1);

    const course = await courses.getPlayable(d.db, null, courseId);
    expect(course.provenance).toEqual({ kind: "agent", agent: "test-agent", model: "test-model" });
    const log = await recentActivity(d.db, user.id);
    expect(log.some((a) => a.tool === "publish_course" && a.ok && a.agent === "test-agent (Test token)")).toBe(true);
    await client.close();
  });

  it("can't edit someone else's course", async () => {
    const c = await courses.createCourse(d.db, user, { meta: { title: "Mine", subject: "math" } });
    const { client, call } = await connect(other);
    const r = await call("add_unit", { courseId: c.id, title: "x" });
    expect(r.isError).toBe(true);
    expect(r.data).toMatch(/Only the course's creator/);
    await client.close();
  });

  it("rejects invalid steps at the schema level", async () => {
    const { client, call } = await connect(user);
    const c = await courses.createCourse(d.db, user, { meta: { title: "Schema", subject: "math" } });
    const unitId = await courses.addUnit(d.db, user, c.id, "U");
    const r = await call("upsert_lesson", { courseId: c.id, unitId, title: "x", steps: [{ type: "choice", prompt: "?" }] });
    expect(r.isError).toBe(true);
    await client.close();
  });

  it("refuses to reuse another user's session", async () => {
    const { client } = await connect(user);
    const sessionId = (client as unknown as { _transport: { sessionId: string } })._transport.sessionId;
    const res = await handleMcp(
      new Request("http://kiln.test/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": sessionId },
        body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }),
      }),
      { db: d.db, user: other, tokenName: "x" },
    );
    expect(res.status).toBe(403);
    await client.close();
  });
});
