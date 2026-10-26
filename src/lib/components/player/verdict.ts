import type { Match } from "#lib/core/answers.ts";
import type { Verdict } from "./types.ts";

export function verdictFromMatch(m: Match, explain?: string): Verdict {
  if (!m.correct) return { correct: false, expected: m.expected, note: explain };
  const note =
    m.note === "accents"
      ? `Watch the accents: **${m.matched}**`
      : m.note === "typo"
        ? `You have a typo. Correct: **${m.matched}**`
        : undefined;
  return { correct: true, note: [note, explain].filter(Boolean).join(" ") || undefined };
}
