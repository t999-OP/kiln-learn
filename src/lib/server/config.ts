// Runtime configuration from environment variables (see .env.example).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

if (existsSync(".env") && !process.env.KILN_ENV_LOADED) {
  process.loadEnvFile(".env");
  process.env.KILN_ENV_LOADED = "1";
}

/** Secret used to encrypt stored AI keys. Generated once and kept in data/ if not provided. */
function loadSecret(): string {
  if (process.env.KILN_SECRET) return process.env.KILN_SECRET;
  const file = path.join(process.cwd(), "data", ".secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  mkdirSync(path.dirname(file), { recursive: true });
  const secret = randomBytes(32).toString("base64url");
  writeFileSync(file, secret, { mode: 0o600 });
  console.warn(`KILN_SECRET not set — generated one in ${file}. Set KILN_SECRET in production and back it up.`);
  return secret;
}

export const config = {
  /** Port of the separate widget sandbox origin. */
  widgetPort: Number(process.env.WIDGET_PORT ?? 3001),
  /** Public URL of the widget origin when behind a proxy, e.g. https://widgets.kiln.example. */
  widgetOrigin: process.env.WIDGET_ORIGIN || null,
  /** "open" (anyone can sign up) or "closed" (admins create accounts). */
  registration: process.env.KILN_REGISTRATION === "closed" ? ("closed" as const) : ("open" as const),
  instanceName: process.env.KILN_NAME || "Kiln",
  /** Legal links shown in the footer (an imprint is required for many EU operators). */
  imprintUrl: process.env.KILN_IMPRINT_URL || null,
  privacyUrl: process.env.KILN_PRIVACY_URL || null,
  /**
   * Where this instance's source code is published. AGPL-3.0 requires offering the source of a
   * modified version to its users — point this at your fork if you change Kiln.
   */
  sourceUrl: process.env.KILN_SOURCE_URL || "https://github.com/t999-OP/kiln-learn",
  /**
   * Who may point AI features at a custom server URL (Ollama, self-hosted). Custom URLs make the
   * server send requests to arbitrary addresses, so the default limits it to admins.
   */
  aiCustomUrls: (["all", "admins", "none"].includes(process.env.KILN_AI_CUSTOM_URLS ?? "") ? process.env.KILN_AI_CUSTOM_URLS : "admins") as
    "all" | "admins" | "none",
  get secret() {
    return (secretCache ??= loadSecret());
  },
};
let secretCache: string | null = null;

/** Widget origin as seen by this request's browser. */
export function widgetOriginFor(url: URL): string {
  return config.widgetOrigin ?? `${url.protocol}//${url.hostname}:${config.widgetPort}`;
}
