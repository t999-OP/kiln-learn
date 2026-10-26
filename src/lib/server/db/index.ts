// Database access. Production uses Postgres (DATABASE_URL). Without DATABASE_URL, Kiln runs
// an embedded Postgres (PGlite) in ./data/pglite, so `pnpm dev` and tests need no setup.
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.ts";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.resolve(process.env.KILN_MIGRATIONS ?? path.join(process.cwd(), "drizzle"));

export interface Database {
  db: DB;
  close: () => Promise<void>;
}

/**
 * Open a database and apply pending migrations.
 * url: a postgres:// URL, "memory://" (tests), or a PGlite directory path.
 */
export async function openDatabase(url = process.env.DATABASE_URL): Promise<Database> {
  if (url?.startsWith("postgres://") || url?.startsWith("postgresql://")) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: Number(process.env.DATABASE_POOL ?? 10), onnotice: () => {} });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return { db: db as unknown as DB, close: () => client.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = url === "memory://" ? undefined : (url ?? path.join(process.cwd(), "data", "pglite"));
  if (dir) mkdirSync(dir, { recursive: true });
  const client = dir ? new PGlite(dir) : new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db: db as unknown as DB, close: () => client.close() };
}

let shared: Promise<Database> | null = null;

/** The app-wide database, opened (and migrated) on first use. */
export function database(): Promise<Database> {
  shared ??= openDatabase();
  return shared;
}

export const db = async () => (await database()).db;

export { schema };
