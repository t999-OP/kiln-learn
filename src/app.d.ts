import type { SessionUser } from "#lib/server/auth.ts";

declare global {
  namespace App {
    interface Locals {
      user: SessionUser | null;
      sessionId: string | null;
      /** Name of the API token when the request comes from an agent. */
      agent: string | null;
    }
    interface Error {
      message: string;
    }
  }
}

export {};
