// Per-user "bring your own key" AI settings. Keys are encrypted at rest and never sent back to the browser.
import { eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { aiSettings } from "../db/schema.ts";
import { invalid } from "../errors.ts";
import { decrypt, encrypt } from "./crypto.ts";

export const PROVIDERS = {
  anthropic: {
    label: "Anthropic (Claude)",
    needsKey: true,
    needsUrl: false,
    defaultModel: "claude-opus-5",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
  },
  openai: { label: "OpenAI", needsKey: true, needsUrl: false, defaultModel: "", models: [] },
  openrouter: { label: "OpenRouter (any model)", needsKey: true, needsUrl: false, defaultModel: "", models: [] },
  ollama: {
    label: "Ollama (local, free)",
    needsKey: false,
    needsUrl: true,
    defaultModel: "",
    models: [],
    defaultUrl: "http://localhost:11434",
  },
  openai_compatible: {
    label: "OpenAI-compatible server (vLLM, LM Studio, …)",
    needsKey: false,
    needsUrl: true,
    defaultModel: "",
    models: [],
  },
} as const;
export type Provider = keyof typeof PROVIDERS;

export interface AiConfig {
  provider: Provider;
  model: string;
  baseUrl: string | null;
  apiKey: string | null;
}

export async function getAiConfig(db: DB, userId: string): Promise<AiConfig | null> {
  const [row] = await db.select().from(aiSettings).where(eq(aiSettings.userId, userId));
  if (!row) return null;
  return { provider: row.provider, model: row.model, baseUrl: row.baseUrl, apiKey: row.apiKeyEnc ? decrypt(row.apiKeyEnc) : null };
}

/** What the UI may see: never the key itself. */
export async function aiStatus(db: DB, userId: string) {
  const [row] = await db.select().from(aiSettings).where(eq(aiSettings.userId, userId));
  return row
    ? { configured: true as const, provider: row.provider, model: row.model, baseUrl: row.baseUrl, hasKey: !!row.apiKeyEnc }
    : { configured: false as const };
}

export async function saveAiSettings(
  db: DB,
  userId: string,
  input: { provider: string; model: string; baseUrl?: string; apiKey?: string; keepKey?: boolean },
  opts: { allowCustomUrl: boolean },
) {
  if (!(input.provider in PROVIDERS)) throw invalid("Pick a provider.");
  const provider = input.provider as Provider;
  const info = PROVIDERS[provider];
  const model = input.model.trim();
  if (!model) throw invalid("Enter a model name.");
  let baseUrl: string | null = input.baseUrl?.trim() || null;
  if (info.needsUrl && !baseUrl) baseUrl = "defaultUrl" in info ? info.defaultUrl : null;
  if (info.needsUrl && !baseUrl) throw invalid("Enter the server URL.");
  if (baseUrl && !/^https?:\/\//.test(baseUrl)) throw invalid("The server URL must start with http:// or https://.");
  if (baseUrl && !opts.allowCustomUrl)
    throw invalid("On this instance, only admins can connect custom AI servers. Use a hosted provider with your own key.");

  const [existing] = await db.select().from(aiSettings).where(eq(aiSettings.userId, userId));
  const apiKeyEnc = input.apiKey?.trim()
    ? encrypt(input.apiKey.trim())
    : input.keepKey && existing?.provider === provider
      ? existing.apiKeyEnc
      : null;
  if (info.needsKey && !apiKeyEnc) throw invalid("Enter your API key.");
  await db
    .insert(aiSettings)
    .values({ userId, provider, model, baseUrl, apiKeyEnc, updatedAt: new Date() })
    .onConflictDoUpdate({ target: aiSettings.userId, set: { provider, model, baseUrl, apiKeyEnc, updatedAt: new Date() } });
}

export async function deleteAiSettings(db: DB, userId: string) {
  await db.delete(aiSettings).where(eq(aiSettings.userId, userId));
}
