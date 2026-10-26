import { randomBytes } from "node:crypto";
import { openDatabase, type Database } from "../src/lib/server/db/index.ts";
import * as auth from "../src/lib/server/auth.ts";

/**
 * A fresh, migrated database per test file. Uses embedded Postgres by default; set
 * TEST_DATABASE_URL (e.g. postgres://postgres:postgres@localhost:5432/postgres) to run the
 * same tests against a real Postgres server — each file gets its own throwaway database.
 */
export async function testDb(): Promise<Database> {
  const admin = process.env.TEST_DATABASE_URL;
  if (!admin) return openDatabase("memory://");
  const { default: postgres } = await import("postgres");
  const name = `kiln_test_${randomBytes(4).toString("hex")}`;
  const sql = postgres(admin, { max: 1, onnotice: () => {} });
  await sql.unsafe(`create database ${name}`);
  const url = new URL(admin);
  url.pathname = `/${name}`;
  const d = await openDatabase(url.toString());
  return {
    db: d.db,
    close: async () => {
      await d.close();
      await sql.unsafe(`drop database if exists ${name} with (force)`);
      await sql.end();
    },
  };
}

let n = 0;
export async function makeUser(d: Database, name = "User") {
  n++;
  return auth.register(d.db, { email: `${name.toLowerCase()}${n}@example.com`, name, password: "a long test password" });
}
