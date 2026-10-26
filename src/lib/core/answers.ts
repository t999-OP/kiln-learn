// Lenient but honest answer matching for typed answers: case, punctuation and accents
// are forgiven (with a note); one typo is forgiven on longer answers.

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export const normalizeAnswer = (s: string, keepAccents = false) =>
  (keepAccents ? s : strip(s))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export type Match = { correct: true; note?: string; matched: string } | { correct: false; expected: string };

export function matchAnswer(input: string, answers: string[]): Match {
  const given = normalizeAnswer(input);
  for (const a of answers)
    if (normalizeAnswer(a) === given)
      return normalizeAnswer(a, true) === normalizeAnswer(input, true)
        ? { correct: true, matched: a }
        : { correct: true, matched: a, note: "accents" };
  for (const a of answers) {
    const n = normalizeAnswer(a);
    if (n.length >= 5 && levenshtein(n, given) <= 1) return { correct: true, matched: a, note: "typo" };
  }
  return { correct: false, expected: answers[0] ?? "" };
}
