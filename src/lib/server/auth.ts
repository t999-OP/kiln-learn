// Accounts and sessions. Passwords use scrypt (node:crypto, no native deps). Session and
// API tokens are random secrets; only their SHA-256 is stored, so a database leak can't
// be replayed as a login.
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, count, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import type { DB } from "./db/index.ts";
import { apiTokens, lessonProgress, sessions, users } from "./db/schema.ts";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 32;

export const SESSION_COOKIE = "kiln_session";
export const SESSION_DAYS = 30;
const DAY = 86_400_000;

export type Role = "user" | "moderator" | "admin";

export interface SessionUser {
  id: string;
  /** Null for guests. */
  email: string | null;
  name: string;
  role: Role;
  xp: number;
  streak: number;
  lastActiveDay: string | null;
  /** Anonymous learner without credentials. */
  guest: boolean;
}

const userColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  xp: users.xp,
  streak: users.streak,
  lastActiveDay: users.lastActiveDay,
  guest: users.isGuest,
};

export class AuthError extends Error {}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const token = (bytes = 32) => randomBytes(bytes).toString("base64url");

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, N, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return timingSafeEqual(actual, expected);
}

// Hash of a throwaway password, used to keep login timing constant for unknown emails.
let dummyHash: Promise<string> | null = null;

/** Postgres unique-violation (23505), possibly wrapped by the driver/ORM. */
export function isUniqueViolation(e: unknown): boolean {
  for (let cur = e as { code?: string; cause?: unknown } | undefined; cur; cur = cur.cause as typeof cur)
    if (cur.code === "23505") return true;
  return false;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function validatePassword(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "That password is too long.";
  return null;
}

/** Create an account. The first account on a fresh instance becomes the admin. */
export async function register(
  db: DB,
  input: { email: string; name: string; password: string },
  opts: { guestId?: string | null } = {},
): Promise<SessionUser> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError("Enter a valid email address.");
  if (name.length < 1 || name.length > 60) throw new AuthError("Enter a name between 1 and 60 characters.");
  const pwError = validatePassword(input.password);
  if (pwError) throw new AuthError(pwError);

  // The first real account becomes admin — or, if KILN_ADMIN_EMAIL is set, only that address
  // (so nobody can claim a fresh public instance before its owner signs up).
  const adminEmail = process.env.KILN_ADMIN_EMAIL ? normalizeEmail(process.env.KILN_ADMIN_EMAIL) : null;
  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "admin"), sql`${users.passwordHash} <> '!'`));
  const role: Role = n === 0 && (!adminEmail || adminEmail === email) ? "admin" : "user";
  const passwordHash = await hashPassword(input.password);
  try {
    // A guest signing up keeps their progress: upgrade the guest row in place.
    if (opts.guestId) {
      const [u] = await db
        .update(users)
        .set({ email, name, passwordHash, role, isGuest: false })
        .where(and(eq(users.id, opts.guestId), eq(users.isGuest, true)))
        .returning(userColumns);
      if (u) return u;
    }
    const [u] = await db.insert(users).values({ email, name, passwordHash, role }).returning(userColumns);
    return u;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AuthError("An account with that email already exists.");
    throw e;
  }
}

export async function login(db: DB, emailInput: string, password: string): Promise<SessionUser> {
  const email = normalizeEmail(emailInput);
  const [u] = await db
    .select({ ...userColumns, passwordHash: users.passwordHash, banned: users.banned })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);
  // Always run a hash so response time doesn't reveal whether the email exists.
  dummyHash ??= hashPassword("not-a-real-password");
  const ok = await verifyPassword(password, u?.passwordHash ?? (await dummyHash));
  if (!u || !ok) throw new AuthError("Wrong email or password.");
  if (u.banned) throw new AuthError("This account has been suspended.");
  const { passwordHash: _ph, banned: _b, ...user } = u;
  return user;
}

// ---- Guests ----

export const GUEST_SESSION_DAYS = 365;

/** An anonymous learner profile, created the first time someone finishes a lesson. */
export async function createGuest(db: DB): Promise<SessionUser> {
  const [u] = await db
    .insert(users)
    .values({ email: null, name: `Learner ${randomInt(1000, 10000)}`, passwordHash: "!", isGuest: true })
    .returning(userColumns);
  return u;
}

/** Move a guest's progress into an existing account (when a guest signs in), then delete the guest. */
export async function mergeGuest(db: DB, guestId: string, userId: string) {
  if (guestId === userId) return;
  const [g] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, guestId), eq(users.isGuest, true)));
  if (!g) return;
  await db.execute(sql`
    insert into ${lessonProgress} (user_id, course_id, lesson_id, version, best_accuracy, plays, xp, completed_at)
    select ${userId}, course_id, lesson_id, version, best_accuracy, plays, xp, completed_at
    from ${lessonProgress} where user_id = ${guestId}
    on conflict (user_id, course_id, lesson_id) do update set
      version = greatest(${lessonProgress.version}, excluded.version),
      best_accuracy = greatest(${lessonProgress.bestAccuracy}, excluded.best_accuracy),
      plays = ${lessonProgress.plays} + excluded.plays,
      xp = ${lessonProgress.xp} + excluded.xp,
      completed_at = greatest(${lessonProgress.completedAt}, excluded.completed_at)`);
  await db
    .update(users)
    .set({
      xp: sql`${users.xp} + ${g.xp}`,
      streak: sql`greatest(${users.streak}, ${g.streak})`,
      lastActiveDay: g.lastActiveDay ? sql`greatest(${users.lastActiveDay}, ${g.lastActiveDay}::date)` : sql`${users.lastActiveDay}`,
    })
    .where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, guestId));
}

/** Forget guests who never came back: unused after a day, or inactive for a year. */
export async function deleteStaleGuests(db: DB) {
  const dayAgo = new Date(Date.now() - DAY);
  const yearAgo = new Date(Date.now() - 365 * DAY).toISOString().slice(0, 10);
  const gone = await db
    .delete(users)
    .where(
      and(eq(users.isGuest, true), or(and(isNull(users.lastActiveDay), lt(users.createdAt, dayAgo)), lt(users.lastActiveDay, yearAgo))),
    )
    .returning({ id: users.id });
  return gone.length;
}

/** Delete a guest profile and its progress (no password to confirm). */
export async function deleteGuest(db: DB, userId: string) {
  await db.delete(users).where(and(eq(users.id, userId), eq(users.isGuest, true)));
}

export async function createSession(db: DB, userId: string, days = SESSION_DAYS): Promise<{ token: string; expiresAt: Date }> {
  const t = token();
  const expiresAt = new Date(Date.now() + days * DAY);
  await db.insert(sessions).values({ id: sha256(t), userId, expiresAt });
  return { token: t, expiresAt };
}

/** Resolve a session cookie. Extends sessions that are past half their lifetime. */
export async function validateSession(
  db: DB,
  t: string,
): Promise<{ user: SessionUser; sessionId: string; renewedUntil: Date | null } | null> {
  const id = sha256(t);
  const [row] = await db
    .select({ ...userColumns, expiresAt: sessions.expiresAt, banned: users.banned })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  if (!row || row.banned) return null;
  let renewedUntil: Date | null = null;
  const lifetime = row.guest ? GUEST_SESSION_DAYS : SESSION_DAYS;
  if (row.expiresAt.getTime() - Date.now() < (lifetime / 2) * DAY) {
    renewedUntil = new Date(Date.now() + lifetime * DAY);
    await db.update(sessions).set({ expiresAt: renewedUntil }).where(eq(sessions.id, id));
  }
  const { expiresAt: _e, banned: _b, ...user } = row;
  return { user, sessionId: id, renewedUntil };
}

export async function deleteSession(db: DB, sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteUserSessions(db: DB, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function changePassword(db: DB, userId: string, current: string, next: string) {
  const [u] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId));
  if (!u || !(await verifyPassword(current, u.passwordHash))) throw new AuthError("Your current password is wrong.");
  const pwError = validatePassword(next);
  if (pwError) throw new AuthError(pwError);
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, userId));
  await deleteUserSessions(db, userId);
}

// ---- Personal access tokens (MCP agents, API) ----

export const TOKEN_PREFIX = "kiln_pat_";

export async function createApiToken(db: DB, userId: string, name: string) {
  const raw = TOKEN_PREFIX + token(24);
  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name: name.trim().slice(0, 60) || "Agent", tokenHash: sha256(raw), prefix: raw.slice(0, TOKEN_PREFIX.length + 4) })
    .returning({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, createdAt: apiTokens.createdAt });
  return { ...row, token: raw };
}

export async function listApiTokens(db: DB, userId: string) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .orderBy(apiTokens.createdAt);
}

export async function revokeApiToken(db: DB, userId: string, id: string) {
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)));
}

export async function validateApiToken(db: DB, raw: string): Promise<{ user: SessionUser; tokenName: string } | null> {
  if (!raw.startsWith(TOKEN_PREFIX)) return null;
  const [row] = await db
    .select({ ...userColumns, tokenId: apiTokens.id, tokenName: apiTokens.name, banned: users.banned, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(and(eq(apiTokens.tokenHash, sha256(raw)), isNull(apiTokens.revokedAt)));
  if (!row || row.banned) return null;
  // Avoid a write on every request: refresh last-used at most once a minute.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000)
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.tokenId));
  const { tokenId: _t, tokenName, banned: _b, lastUsedAt: _l, ...user } = row;
  return { user, tokenName };
}

export const can = {
  /** A real account (not a guest learner). */
  account: (u: SessionUser | null): u is SessionUser => !!u && !u.guest,
  moderate: (u: SessionUser | null) => u?.role === "moderator" || u?.role === "admin",
  admin: (u: SessionUser | null) => u?.role === "admin",
};

export async function updateName(db: DB, userId: string, name: string) {
  const n = name.trim();
  if (n.length < 1 || n.length > 60) throw new AuthError("Enter a name between 1 and 60 characters.");
  await db.update(users).set({ name: n }).where(eq(users.id, userId));
}

/** Permanently delete an account and everything it owns (GDPR right to erasure). */
export async function deleteAccount(db: DB, userId: string, password: string) {
  const [u] = await db.select({ passwordHash: users.passwordHash, role: users.role }).from(users).where(eq(users.id, userId));
  if (!u || !(await verifyPassword(password, u.passwordHash))) throw new AuthError("Your password is wrong.");
  if (u.role === "admin") {
    const [{ n }] = await db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), sql`${users.passwordHash} <> '!'`));
    if (n <= 1) throw new AuthError("You're the only admin. Make someone else an admin before deleting your account.");
  }
  await db.delete(users).where(eq(users.id, userId));
}
