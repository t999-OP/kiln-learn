// MCP endpoint (Streamable HTTP). Agents authenticate with a personal access token:
//   Authorization: Bearer kiln_pat_…
// Cookie sessions are deliberately not accepted here (no cross-site requests acting as a browser user).
import { db } from "#lib/server/db/index.ts";
import { handleMcp } from "#lib/server/mcp.ts";
import type { RequestHandler } from "./$types";

const handler: RequestHandler = async ({ request, locals }) => {
  if (!locals.user || !locals.agent)
    return new Response(JSON.stringify({ error: "Create an agent token in Settings → Agent tokens and send it as a Bearer token." }), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="kiln"' },
    });
  return handleMcp(request, { db: await db(), user: locals.user, tokenName: locals.agent });
};

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
