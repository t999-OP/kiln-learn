import { json } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import type { RequestHandler } from "./$types";

/** Liveness + database check for container orchestrators and uptime monitors. */
export const GET: RequestHandler = async () => {
  try {
    await (await db()).execute(sql`select 1`);
    return json({ status: "ok" });
  } catch (e) {
    return json({ status: "error", error: (e as Error).message }, { status: 503 });
  }
};
