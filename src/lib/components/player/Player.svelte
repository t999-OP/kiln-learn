<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { untrack, type Component } from "svelte";
  import type { Lesson, Step } from "#lib/core/schema.ts";
  import { icon } from "#lib/client/icons.ts";
  import { md } from "#lib/client/md.ts";
  import { submitResult } from "#lib/client/progress-queue.ts";
  import { play, setSound, soundOn } from "#lib/client/sound.ts";
  import ChoiceStep from "./ChoiceStep.svelte";
  import ExpressionStep from "./ExpressionStep.svelte";
  import FillStep from "./FillStep.svelte";
  import InfoStep from "./InfoStep.svelte";
  import ListenStep from "./ListenStep.svelte";
  import MatchStep from "./MatchStep.svelte";
  import NumericStep from "./NumericStep.svelte";
  import TranslateStep from "./TranslateStep.svelte";
  import WidgetStep from "./WidgetStep.svelte";
  import type { StepApi, StepEnv, Verdict } from "./types.ts";

  interface Props {
    course: { id: string; title: string; version: number; preview: boolean };
    lesson: Lesson;
    env: StepEnv;
    nextLessonId: string | null;
    /** True for visitors without an account (no profile yet, or a guest profile). */
    guest: boolean;
  }
  let { course, lesson, env, nextLessonId, guest }: Props = $props();

  const HEARTS = 5;
  const COMPONENTS: Record<Step["type"], Component<any, StepApi>> = {
    info: InfoStep,
    choice: ChoiceStep,
    predict: ChoiceStep,
    translate: TranslateStep,
    fill: FillStep,
    listen: ListenStep,
    match: MatchStep,
    numeric: NumericStep,
    expression: ExpressionStep,
    widget: WidgetStep,
  };
  const KIND_LABEL: Record<Step["type"], string> = {
    info: "New",
    choice: "Select the correct answer",
    predict: "Make a prediction",
    translate: "",
    fill: "Fill in the blank",
    listen: "Type what you hear",
    match: "Tap the matching pairs",
    numeric: "Calculate",
    expression: "Write the expression",
    widget: "Experiment",
  };
  const PRAISE = ["Nice!", "Correct!", "Great job!", "Excellent!"];

  const steps = untrack(() => lesson.steps); // the page re-mounts the player per lesson
  let queue = $state(steps.map((_, i) => i));
  let pos = $state(0);
  let hearts = $state(HEARTS);
  let firstTry = $state<Record<number, boolean>>({});
  let cleared = $state<number[]>([]);
  let phase = $state<"answer" | "feedback" | "done" | "failed">("answer");
  let ready = $state(false);
  let verdict = $state<(Verdict & { title: string }) | null>(null);
  let api = $state<StepApi | null>(null);
  let summary = $state<{ xp: number; accuracy: number; seconds: number; streak?: number; saved: boolean; error?: string } | null>(null);
  const startedAt = Date.now();
  let sound = $state(true);
  $effect(() => {
    sound = soundOn();
  });
  function toggleSound() {
    sound = !sound;
    setSound(sound);
  }

  const index = $derived(queue[pos]);
  const step = $derived(steps[index]);
  const autoResolves = $derived(step?.type === "match" || step?.type === "widget");
  const progress = $derived((cleared.length / steps.length) * 100);

  function check() {
    if (phase !== "answer") return;
    if (step.type === "info") {
      cleared = [...cleared, index];
      return advance();
    }
    const v = api?.check();
    if (v) resolve(v);
  }

  function resolve(v: Verdict) {
    if (phase !== "answer") return;
    const predict = step.type === "predict";
    if (!(index in firstTry)) firstTry = { ...firstTry, [index]: v.record ?? v.correct };
    if (v.correct || predict) cleared = [...cleared, index];
    else {
      queue = [...queue, index];
      hearts--;
    }
    const title = v.correct
      ? predict
        ? "Good prediction!"
        : PRAISE[Math.floor(Math.random() * PRAISE.length)]
      : predict
        ? "Interesting guess — here's what happens"
        : "Not quite";
    verdict = { ...v, title };
    phase = "feedback";
    play(v.correct || predict ? "right" : "wrong");
  }

  function advance() {
    if (hearts <= 0) {
      phase = "failed";
      return;
    }
    verdict = null;
    ready = false;
    api = null;
    if (pos + 1 >= queue.length) return finish();
    pos++;
    phase = "answer";
  }

  async function finish() {
    phase = "done";
    play("complete");
    const graded = Object.entries(firstTry);
    const right = graded.filter(([, ok]) => ok).length;
    const accuracy = graded.length ? Math.round((right / graded.length) * 100) : 100;
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    summary = { xp: 10 + Math.round(accuracy / 10) + (accuracy === 100 ? 5 : 0), accuracy, seconds, saved: false };
    if (course.preview) return;
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const out = await submitResult({
      courseId: course.id,
      version: course.version,
      lessonId: lesson.id,
      day,
      results: graded.map(([s, ok]) => ({ step: Number(s), correct: ok })),
    });
    if (out.ok) {
      summary = { ...summary, xp: out.body.xp, accuracy: out.body.accuracy, streak: out.body.streak, saved: true };
      await invalidateAll();
    } else
      summary = {
        ...summary,
        error: out.queued ? `${out.error} Your result is saved on this device and will sync automatically.` : out.error,
      };
  }

  function skip() {
    resolve({ correct: false, note: "explain" in step ? step.explain : "Come back to it at the end." });
  }

  function onkeydown(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement)?.matches?.("input, textarea");
    if (e.key === "Enter" && !e.shiftKey) {
      if (phase === "answer" && ready && !autoResolves) (e.preventDefault(), check());
      else if (phase === "feedback") (e.preventDefault(), advance());
      return;
    }
    if (phase === "answer" && !typing) api?.key?.(e);
  }

  function retry() {
    queue = steps.map((_, i) => i);
    pos = 0;
    hearts = HEARTS;
    firstTry = {};
    cleared = [];
    verdict = null;
    ready = false;
    phase = "answer";
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const backHref = $derived(`/course/${course.id}${course.preview ? "?preview=1" : ""}`);
</script>

<svelte:window {onkeydown} />

<div class="player">
  {#if phase === "done" && summary}
    <div class="done-screen">
      <div class="trophy" aria-hidden="true">{summary.accuracy === 100 ? "🏆" : "🎉"}</div>
      <h1>Lesson complete!</h1>
      <p class="muted">{lesson.title} · {course.title}</p>
      <div class="tiles3">
        <div>
          <span class="muted small">XP earned</span>
          <b>+{summary.xp}</b>
        </div>
        <div>
          <span class="muted small">Accuracy</span>
          <b>{summary.accuracy}%</b>
        </div>
        <div>
          <span class="muted small">Time</span>
          <b>{mmss(summary.seconds)}</b>
        </div>
        {#if summary.streak}<div>
            <span class="muted small">Day streak</span>
            <b>🔥 {summary.streak}</b>
          </div>{/if}
      </div>
      {#if course.preview}
        <p class="banner info">Preview of your draft — progress isn't saved.</p>
      {:else if summary.error}
        <p class="form-error">Progress not saved yet: {summary.error}</p>
      {:else if guest && summary.saved}
        <p class="banner info">
          Progress saved on this device. <a href="/signup">Create a free account</a>
          to keep it on all your devices.
        </p>
      {/if}
      <div class="row">
        <a class="btn ghost" href={backHref}>Back to course</a>
        {#if nextLessonId}<a
            class="btn"
            href="/course/{course.id}/play/{nextLessonId}{course.preview ? '?preview=1' : ''}"
            data-sveltekit-reload
          >
            Next lesson
          </a>{/if}
      </div>
    </div>
  {:else if phase === "failed"}
    <div class="done-screen">
      <div class="trophy" aria-hidden="true">💔</div>
      <h1>Out of hearts</h1>
      <p class="muted">Mistakes are how learning works. Try the lesson again — it'll stick better the second time.</p>
      <div class="row">
        <a class="btn ghost" href={backHref}>Back to course</a>
        <button class="btn" onclick={retry}>Try again</button>
      </div>
    </div>
  {:else}
    <div class="player-top">
      <a class="icon-btn" href={backHref} aria-label="Quit lesson">{@html icon.x}</a>
      <div class="bar" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin="0" aria-valuemax="100">
        <div style="width:{progress}%"></div>
      </div>
      <button
        class="icon-btn"
        onclick={toggleSound}
        aria-label={sound ? "Mute sounds" : "Turn sounds on"}
        aria-pressed={!sound}
        title={sound ? "Mute" : "Unmute"}
      >
        {@html sound ? icon.speaker : icon.mute}
      </button>
      <div class="hearts" aria-label="{hearts} hearts left">
        {@html icon.heart}
        <span>{hearts}</span>
      </div>
    </div>

    <div class="step">
      {#if KIND_LABEL[step.type]}
        <div class="step-kind {step.type}">{firstTry[index] === false ? "Previous mistake · " : ""}{KIND_LABEL[step.type]}</div>
      {/if}
      {#key `${pos}-${index}`}
        {@const StepComponent = COMPONENTS[step.type]}
        <StepComponent bind:this={api} {step} {env} locked={phase !== "answer"} onready={(r: boolean) => (ready = r)} onresolve={resolve} />
      {/key}
    </div>

    <div class="footer-bar {phase === 'feedback' ? (verdict?.correct ? 'right' : 'wrong') : ''}" aria-live="polite">
      {#if phase === "feedback" && verdict}
        <div class="verdict">
          <b>{verdict.title}</b>
          {#if verdict.expected}<span>
              Correct answer: <b>{verdict.expected}</b>
            </span>
            <br />{/if}
          {#if verdict.note}<span>{@html md(verdict.note)}</span>{/if}
        </div>
        <span class="kbd-hint" aria-hidden="true">Enter ↵</span>
        <button class="btn {verdict.correct ? 'good' : 'bad'}" onclick={advance}>Continue</button>
      {:else}
        {#if step.type === "widget"}<button class="btn ghost" onclick={skip}>Skip</button>{/if}
        <span class="spacer"></span>
        {#if step.type === "choice" || step.type === "predict"}<span class="kbd-hint" aria-hidden="true">
            Keys 1–{step.options.length}
          </span>{/if}
        {#if !autoResolves}<span class="kbd-hint" aria-hidden="true">Enter ↵</span>{/if}
        {#if !autoResolves}
          <button class="btn" disabled={!ready && step.type !== "info"} onclick={check}>
            {step.type === "info" ? "Continue" : "Check"}
          </button>
        {/if}
      {/if}
    </div>
  {/if}
</div>
