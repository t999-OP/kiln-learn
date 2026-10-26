// Demo agent: connects to Kiln's MCP endpoint with a personal access token and writes a
// short course, fixing what the quality pipeline reports.
//   KILN_TOKEN=kiln_pat_… node scripts/agent-demo.ts [http://localhost:5173/mcp]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.argv[2] ?? "http://localhost:5173/mcp";
const token = process.env.KILN_TOKEN;
if (!token) throw new Error("Set KILN_TOKEN to an agent token from Settings → Agent tokens.");

const client = new Client({ name: "demo-agent", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  try {
    return JSON.parse(r.content[0].text);
  } catch {
    return r.content[0].text;
  }
};

await call("get_authoring_guide");
const { courseId } = await call("create_course", {
  title: "Italian at the Café",
  subject: "language",
  description: "Absolute beginners: greet the barista and order a coffee in Italian.",
  languages: { target: "it-IT", source: "en-US" },
  model: "scripted-demo",
});
const { unitId } = await call("add_unit", { courseId, title: "Al bar" });
const draft = await call("upsert_lesson", {
  courseId,
  unitId,
  title: "Buongiorno!",
  steps: [
    { type: "choice", prompt: 'What does "buongiorno" mean?', options: ["Good morning", "Good night"], answer: 0 },
    { type: "translate", prompt: "Good morning", answers: ["Buongiorno"] },
  ],
});
console.log(
  `draft → ${draft.course.score}/100; issues:`,
  draft.lessonIssues.map((i: { msg: string }) => i.msg),
);
const fixed = await call("upsert_lesson", {
  courseId,
  unitId,
  lessonId: draft.lessonId,
  title: "Buongiorno!",
  concepts: ["it:buongiorno", "it:ciao", "it:grazie"],
  steps: [
    {
      type: "info",
      title: "Buongiorno!",
      text: "**buongiorno** = *good morning*. **ciao** = *hi/bye*. **grazie** = *thanks*.",
      say: "Buongiorno! Ciao! Grazie!",
      lang: "it-IT",
    },
    {
      type: "choice",
      prompt: 'What does "buongiorno" mean?',
      options: ["Good morning", "Good night", "Good luck"],
      answer: 0,
      explain: "giorno = day.",
    },
    { type: "listen", say: "Grazie", lang: "it-IT", answers: ["grazie"] },
    {
      type: "translate",
      prompt: "Good morning",
      answers: ["Buongiorno", "Buon giorno"],
      words: ["Buongiorno", "Buonasera", "Ciao", "Grazie"],
    },
    {
      type: "match",
      pairs: [
        ["buongiorno", "good morning"],
        ["ciao", "hi"],
        ["grazie", "thanks"],
      ],
    },
    {
      type: "translate",
      prompt: "A coffee, please",
      answers: ["Un caffè, per favore", "Un caffè per favore"],
      words: ["Un", "caffè", "per", "favore", "grazie", "tè"],
    },
  ],
});
console.log(`fixed → ${fixed.course.score}/100 ${fixed.course.rank}`);
console.log(await call("validate_course", { courseId }));
await client.close();
