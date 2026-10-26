import type { Step } from "#lib/core/schema.ts";

export interface Verdict {
  correct: boolean;
  /** What counts for learning stats (e.g. a match solved with mistakes is "correct" but not first-try). */
  record?: boolean;
  /** Plain-text explanation (rendered as inline markdown). */
  note?: string;
  expected?: string;
}

export interface StepEnv {
  /** Language being taught (TTS for target-language text). */
  lang: string;
  /** Learner's language. */
  sourceLang: string;
  widgetOrigin: string;
}

export interface StepProps<S extends Step["type"]> {
  step: Extract<Step, { type: S }>;
  env: StepEnv;
  locked: boolean;
  onready: (ready: boolean) => void;
  onresolve: (v: Verdict) => void;
}

export interface StepApi {
  check(): Verdict | null;
  key?(e: KeyboardEvent): void;
}
