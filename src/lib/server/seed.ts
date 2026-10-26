// First-run content: on an empty instance, import the example courses from seed/ under a
// built-in "Kiln" account (which can't sign in). Disable with KILN_SEED=false.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { count, eq } from "drizzle-orm";
import type { SessionUser } from "./auth.ts";
import type { DB } from "./db/index.ts";
import { courses, users } from "./db/schema.ts";
import { createCourse, publish } from "./courses.ts";

export const SYSTEM_EMAIL = "system@kiln.local";

export async function seedIfEmpty(db: DB, dir = path.join(process.cwd(), "seed")) {
  if (process.env.KILN_SEED === "false") return 0;
  const [{ n }] = await db.select({ n: count() }).from(courses);
  if (n > 0) return 0;

  let [system] = await db.select().from(users).where(eq(users.email, SYSTEM_EMAIL));
  // passwordHash "!" never verifies, so this account can't be used to sign in.
  system ??= (await db.insert(users).values({ email: SYSTEM_EMAIL, name: "Kiln", passwordHash: "!", role: "admin" }).returning())[0];
  const owner: SessionUser = { ...system, guest: false };

  let imported = 0;
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const raw = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const course = await createCourse(db, owner, {
      meta: { title: raw.title, subject: raw.subject, description: raw.description, languages: raw.languages },
      content: { units: raw.units },
      provenance:
        raw.author?.kind === "agent"
          ? { kind: "agent", agent: raw.author.agent ?? raw.author.name, model: raw.author.model }
          : { kind: "human" },
    });
    await publish(db, owner, course.id);
    imported++;
  }
  return imported;
}
