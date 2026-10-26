import { db } from "#lib/server/db/index.ts";
import { getProfile } from "#lib/server/profiles.ts";
import { guard } from "#lib/server/web.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => ({ profile: await guard(async () => getProfile(await db(), params.id)) });
