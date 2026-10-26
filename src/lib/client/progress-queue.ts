// Offline-safe lesson results: if saving fails (offline, server hiccup) the result waits in
// localStorage and is retried on the next page load or when the connection comes back.
const KEY = "kiln:pending-progress";

export interface PendingResult {
  courseId: string;
  version: number;
  lessonId: string;
  day: string;
  results: { step: number; correct: boolean }[];
}

function read(): PendingResult[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}
function write(items: PendingResult[]) {
  try {
    if (items.length) localStorage.setItem(KEY, JSON.stringify(items.slice(-50)));
    else localStorage.removeItem(KEY);
  } catch {}
}

export const queueResult = (r: PendingResult) => write([...read(), r]);

/** POST a result. Returns the server reply, or null if it was queued for later. */
export async function submitResult(r: PendingResult): Promise<{ ok: true; body: any } | { ok: false; error: string; queued: boolean }> {
  try {
    const res = await fetch("/api/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(r) });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, body };
    // Server errors are worth retrying; client errors (e.g. course removed) are not.
    if (res.status >= 500) {
      queueResult(r);
      return { ok: false, error: body.error ?? res.statusText, queued: true };
    }
    return { ok: false, error: body.error ?? res.statusText, queued: false };
  } catch {
    queueResult(r);
    return { ok: false, error: "You're offline.", queued: true };
  }
}

let flushing = false;
export async function flushPending(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let synced = 0;
  try {
    const items = read();
    write([]);
    for (const r of items) {
      const out = await submitResult(r); // re-queues itself on failure
      if (out.ok) synced++;
    }
  } finally {
    flushing = false;
  }
  return synced;
}
