// Provider adapters for "bring your own key" AI. One call shape for the app:
//   generateObject(config, { system, prompt, schema }) -> validated object
// Anthropic goes through the official SDK with structured outputs; OpenAI, OpenRouter,
// Ollama and self-hosted servers share an OpenAI-compatible chat-completions adapter.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { AiConfig } from "./settings.ts";

export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export interface GenerateRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
}

const TIMEOUT_MS = 5 * 60_000;

/** Models that support server-side refusal fallbacks (re-routes a declined request instead of failing). */
const supportsFallbacks = (model: string) => /^claude-(opus-5|fable-5)/.test(model);

async function anthropic<T>(cfg: AiConfig, req: GenerateRequest<T>): Promise<T> {
  const client = new Anthropic({
    apiKey: cfg.apiKey ?? undefined,
    ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}),
    timeout: TIMEOUT_MS,
    maxRetries: 2,
  });
  try {
    const res = await client.beta.messages.parse({
      model: cfg.model,
      max_tokens: req.maxTokens ?? 16000,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
      output_config: { format: betaZodOutputFormat(req.schema) },
      ...(supportsFallbacks(cfg.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (res.stop_reason === "refusal") throw new AiError("The model declined this request. Try rephrasing your instructions.", 422);
    if (res.stop_reason === "max_tokens") throw new AiError("The answer was cut off (too long). Ask for a shorter lesson.", 422);
    if (!res.parsed_output) throw new AiError("The model's answer didn't match the lesson format. Try again.");
    return res.parsed_output as T;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError)
      throw new AiError("Anthropic rejected your API key. Check it in Settings → AI models.", 401);
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError("Your Anthropic key can't use this model.", 403);
    if (e instanceof Anthropic.NotFoundError) throw new AiError(`Model "${cfg.model}" wasn't found.`, 404);
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Anthropic rate limit reached. Wait a moment and try again.", 429);
    if (e instanceof Anthropic.BadRequestError) throw new AiError(`Anthropic couldn't process the request: ${e.message}`, 400);
    if (e instanceof Anthropic.APIConnectionError) throw new AiError("Couldn't reach Anthropic. Check the server's internet connection.");
    if (e instanceof Anthropic.APIError) throw new AiError(`Anthropic error ${e.status}: ${e.message}`);
    throw e;
  }
}

function openAiBase(cfg: AiConfig) {
  switch (cfg.provider) {
    case "openai":
      return cfg.baseUrl ?? "https://api.openai.com/v1";
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "ollama":
      return `${(cfg.baseUrl ?? "http://localhost:11434").replace(/\/$/, "")}/v1`;
    default:
      return (cfg.baseUrl ?? "").replace(/\/$/, "");
  }
}

/** Pull a JSON object out of a reply that may be wrapped in prose or ``` fences. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in the reply.");
  return JSON.parse(body.slice(start, end + 1));
}

async function openAiCompatible<T>(cfg: AiConfig, req: GenerateRequest<T>, fetchImpl: typeof fetch = fetch): Promise<T> {
  const schemaJson = JSON.stringify(z.toJSONSchema(req.schema));
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    {
      role: "system",
      content: `${req.system}\n\nReply with ONE JSON object and nothing else. It must match this JSON Schema:\n${schemaJson}`,
    },
    { role: "user", content: req.prompt },
  ];
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(`${openAiBase(cfg)}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
          ...(cfg.provider === "openrouter" ? { "x-title": "Kiln" } : {}),
        },
        body: JSON.stringify({ model: cfg.model, messages, response_format: { type: "json_object" } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new AiError(`Couldn't reach the AI server (${(e as Error).message}).`);
    }
    const body = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string } | string;
    };
    if (!res.ok) {
      const msg = typeof body.error === "string" ? body.error : body.error?.message;
      if (res.status === 401) throw new AiError("The AI provider rejected your API key. Check it in Settings → AI models.", 401);
      if (res.status === 404) throw new AiError(`Model "${cfg.model}" wasn't found${msg ? `: ${msg}` : ""}.`, 404);
      if (res.status === 429) throw new AiError("Rate limit reached at the AI provider. Wait a moment and try again.", 429);
      throw new AiError(`AI provider error ${res.status}${msg ? `: ${msg}` : ""}`);
    }
    const text = body.choices?.[0]?.message?.content ?? "";
    try {
      const parsed = req.schema.safeParse(extractJson(text));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } catch (e) {
      lastError = (e as Error).message;
    }
    // One repair round: show the model what was wrong.
    messages.push(
      { role: "assistant", content: text },
      { role: "user", content: `That JSON was invalid (${lastError}). Reply with the corrected JSON object only.` },
    );
  }
  throw new AiError(`The model's answer didn't match the lesson format (${lastError}). Try a more capable model.`);
}

export async function generateObject<T>(cfg: AiConfig, req: GenerateRequest<T>, fetchImpl?: typeof fetch): Promise<T> {
  return cfg.provider === "anthropic" ? anthropic(cfg, req) : openAiCompatible(cfg, req, fetchImpl);
}
