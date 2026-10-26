<script lang="ts">
  import type { Step } from "#lib/core/schema.ts";
  import type { Issue } from "#lib/core/quality.ts";
  import { STEP_TYPES, WIDGETS } from "#lib/core/catalog.ts";
  import { icon } from "#lib/client/icons.ts";
  import { esc } from "#lib/client/md.ts";
  import LinesField from "./LinesField.svelte";
  import JsonField from "./JsonField.svelte";

  interface Props {
    step: Step;
    index: number;
    total: number;
    issues: Issue[];
    stat?: { attempts: number; correct: number };
    onmove: (delta: number) => void;
    ondelete: () => void;
    onduplicate: () => void;
  }
  let { step = $bindable(), index, total, issues, stat, onmove, ondelete, onduplicate }: Props = $props();
  const hasError = $derived(issues.some((i) => i.level === "error"));
  const rate = $derived(stat && stat.attempts ? Math.round((stat.correct / stat.attempts) * 100) : null);
  const s = $derived(step as Record<string, unknown>);
  const set = (k: string, v: unknown) => {
    const o = step as Record<string, unknown>;
    if (v === undefined || v === "") delete o[k];
    else o[k] = v;
  };
  const widgetHint = (w: string) =>
    Object.entries(WIDGETS[w as keyof typeof WIDGETS]?.params ?? {})
      .map(([k, d]) => `<b>${esc(k)}</b>: ${esc(d)}`)
      .join(" · ");
</script>

<div class="step-card" class:has-error={hasError}>
  <header>
    <span class="n">{index + 1}</span>
    <b>{STEP_TYPES[step.type].label}</b>
    {#if rate !== null}<span class="rate {rate < 60 ? 'low' : 'ok'}" title="{stat!.attempts} learner first tries">
        {rate}% correct
      </span>{/if}
    <span class="spacer"></span>
    <button class="icon-btn" title="Move up" aria-label="Move step up" disabled={index === 0} onclick={() => onmove(-1)}>
      {@html icon.up}
    </button>
    <button class="icon-btn" title="Move down" aria-label="Move step down" disabled={index === total - 1} onclick={() => onmove(1)}>
      {@html icon.down}
    </button>
    <button class="icon-btn" title="Duplicate step" aria-label="Duplicate step" onclick={onduplicate}>{@html icon.copy}</button>
    <button class="icon-btn" title="Delete step" aria-label="Delete step" onclick={ondelete}>{@html icon.trash}</button>
  </header>
  <div class="body">
    {#if step.type === "info"}
      <label class="field">
        Title
        <input class="input" value={step.title ?? ""} oninput={(e) => set("title", e.currentTarget.value)} />
      </label>
      <label class="field">
        Read aloud (optional)
        <input class="input" value={step.say ?? ""} oninput={(e) => set("say", e.currentTarget.value)} />
      </label>
      <label class="field full">
        Text
        <textarea class="input" rows="3" bind:value={step.text}></textarea>
        <span class="hint">**bold**, *italic*</span>
      </label>
    {:else if step.type === "choice" || step.type === "predict"}
      <label class="field full">
        Prompt
        <input class="input" bind:value={step.prompt} />
      </label>
      <LinesField label="Options (one per line)" value={step.options} rows={4} onchange={(v) => (step.options = v)} />
      <label class="field">
        Correct option
        <select class="input" bind:value={step.answer}>
          {#each step.options as o, k (k)}<option value={k}>{k + 1}. {o || "(empty)"}</option>{/each}
        </select>
      </label>
      <label class="field full">
        Explanation
        <input class="input" value={step.explain ?? ""} oninput={(e) => set("explain", e.currentTarget.value)} />
      </label>
      <LinesField
        label="Misconception feedback (index: text)"
        full
        value={Object.entries(step.misconceptions ?? {}).map(([k, v]) => `${k}: ${v}`)}
        hint="Per wrong option, e.g. 0: Heavier isn't slower…"
        onchange={(lines) => {
          const m = Object.fromEntries(
            lines
              .map((l) => l.match(/^\s*(\d+)\s*:\s*(.+)$/))
              .filter((x) => !!x)
              .map((x) => [x[1], x[2].trim()]),
          );
          set("misconceptions", Object.keys(m).length ? m : undefined);
        }}
      />
    {:else if step.type === "translate"}
      <label class="field full">
        Sentence to translate
        <input class="input" bind:value={step.prompt} />
      </label>
      <LinesField
        label="Accepted answers (one per line)"
        value={step.answers}
        hint="List every reasonable variant"
        onchange={(v) => (step.answers = v)}
      />
      <LinesField
        label="Word-bank tiles (one per line)"
        value={step.words}
        hint="Leave empty for typing. Add 2-4 distractors."
        onchange={(v) => set("words", v.length ? v : undefined)}
      />
    {:else if step.type === "fill"}
      <label class="field full">
        Sentence (use ___ for the blank)
        <input class="input" bind:value={step.prompt} />
      </label>
      <LinesField label="Accepted answers" value={step.answers} onchange={(v) => (step.answers = v)} />
      <label class="field">
        Hint
        <input class="input" value={step.hint ?? ""} oninput={(e) => set("hint", e.currentTarget.value)} />
      </label>
    {:else if step.type === "listen"}
      <label class="field">
        Spoken text
        <input class="input" bind:value={step.say} />
      </label>
      <label class="field">
        Voice language
        <input class="input" value={step.lang ?? ""} placeholder="e.g. es-ES" oninput={(e) => set("lang", e.currentTarget.value)} />
      </label>
      <LinesField label="Accepted transcriptions" full value={step.answers} onchange={(v) => (step.answers = v)} />
    {:else if step.type === "match"}
      <label class="field full">
        Prompt (optional)
        <input class="input" value={step.prompt ?? ""} oninput={(e) => set("prompt", e.currentTarget.value)} />
      </label>
      <LinesField
        label="Pairs (left = right, one per line)"
        full
        rows={5}
        value={step.pairs.map((p) => p.join(" = "))}
        onchange={(lines) =>
          (step.pairs = lines
            .filter((l) => l.includes("="))
            .map((l) => {
              const [a, ...b] = l.split("=");
              return [a.trim(), b.join("=").trim()] as [string, string];
            }))}
      />
    {:else if step.type === "numeric"}
      <label class="field full">
        Question
        <input class="input" bind:value={step.prompt} />
      </label>
      <label class="field">
        Answer
        <input class="input" type="number" step="any" bind:value={step.answer} />
      </label>
      <label class="field">
        Tolerance (±)
        <input
          class="input"
          type="number"
          step="any"
          value={step.tolerance ?? ""}
          placeholder="1% of answer"
          oninput={(e) => set("tolerance", e.currentTarget.value === "" ? undefined : Number(e.currentTarget.value))}
        />
      </label>
      <label class="field">
        Unit
        <input class="input" value={step.unit ?? ""} oninput={(e) => set("unit", e.currentTarget.value)} />
      </label>
      <label class="field full">
        Explanation
        <input class="input" value={step.explain ?? ""} oninput={(e) => set("explain", e.currentTarget.value)} />
      </label>
    {:else if step.type === "expression"}
      <label class="field full">
        Question
        <input class="input" bind:value={step.prompt} />
      </label>
      <label class="field">
        Answer expression
        <input class="input" bind:value={step.answer} />
        <span class="hint">e.g. 20x^3 - 2 — any equivalent form counts</span>
      </label>
      <label class="field">
        Variable
        <input class="input" value={step.variable ?? ""} placeholder="x" oninput={(e) => set("variable", e.currentTarget.value)} />
      </label>
      <label class="field">
        Accept + C
        <select
          class="input"
          value={step.upToConstant ? "1" : ""}
          onchange={(e) => set("upToConstant", e.currentTarget.value ? true : undefined)}
        >
          <option value="">No</option>
          <option value="1">Yes (antiderivatives)</option>
        </select>
      </label>
      <label class="field full">
        Explanation
        <input class="input" value={step.explain ?? ""} oninput={(e) => set("explain", e.currentTarget.value)} />
      </label>
    {:else if step.type === "widget"}
      <label class="field">
        Widget
        <select class="input" bind:value={step.widget}>
          {#each Object.entries(WIDGETS) as [id, w] (id)}<option value={id}>{w.title}</option>{/each}
        </select>
      </label>
      <label class="field">
        Goal for the learner
        <input class="input" bind:value={step.goal} />
      </label>
      <JsonField label="Params (JSON)" value={step.params ?? {}} hint={widgetHint(step.widget)} onchange={(v) => set("params", v)} />
      <label class="field full">
        Explanation after success
        <input class="input" value={step.explain ?? ""} oninput={(e) => set("explain", e.currentTarget.value)} />
      </label>
    {/if}
    {#if "graph" in s || ["info", "choice", "predict", "numeric", "expression"].includes(step.type)}
      <JsonField
        label="Graph (optional JSON)"
        optional
        value={s.graph}
        hint={'e.g. {"fns":["x^2"],"x":[-3,3],"holes":[[1,2]]}'}
        onchange={(v) => set("graph", v)}
      />
    {/if}
  </div>
  {#if issues.length}
    <ul class="issues" style="padding:0 0.9rem 0.8rem;margin:0">
      {#each issues as i, k (k)}<li class={i.level}>{i.msg}</li>{/each}
    </ul>
  {/if}
</div>
