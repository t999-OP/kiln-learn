import { error } from "@sveltejs/kit";
import { db } from "#lib/server/db/index.ts";
import { exportUserData } from "#lib/server/privacy.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) error(401, "Please sign in.");
  const data = await exportUserData(await db(), locals.user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="kiln-data-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
};
