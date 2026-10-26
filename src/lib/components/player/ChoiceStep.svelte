<script lang="ts">
  import { md } from "#lib/client/md.ts";
  import SpeakButton from "./SpeakButton.svelte";
  import GraphBox from "./GraphBox.svelte";
  import type { StepProps, Verdict } from "./types.ts";

  let { step, env, locked, onready }: StepProps<"choice" | "predict"> = $props();
  let selected = $state<number | null>(null);
  let checked = $state(false);

  function pick(i: number) {
    if (locked || checked) return;
    selected = i;
    onready(true);
  }

  export function key(e: KeyboardEvent) {
    const n = Number(e.key);
    if (n >= 1 && n <= step.options.length) pick(n - 1);
  }

  export function check(): Verdict | null {
    if (selected === null) return null;
    checked = true;
    const correct = selected === step.answer;
    const mis = step.misconceptions?.[String(selected)];
    return {
      correct,
      note: correct ? step.explain : [mis, step.explain].filter(Boolean).join(" "),
      expected: correct ? undefined : step.options[step.answer],
    };
  }
</script>

<div class="row" style="flex-wrap:nowrap">
  {#if step.say}<SpeakButton text={step.say} lang={step.lang || env.lang} />{/if}
  <div class="prompt">{@html md(step.prompt)}</div>
</div>
{#if step.graph}<GraphBox graph={step.graph} />{/if}
<div class="options" role="radiogroup" aria-label="Answer options">
  {#each step.options as option, i (i)}
    <button
      type="button"
      role="radio"
      aria-checked={selected === i}
      class="option"
      class:selected={!checked && selected === i}
      class:right={checked && i === step.answer}
      class:wrong={checked && i === selected && i !== step.answer}
      disabled={checked || locked}
      onclick={() => pick(i)}
    >
      <span class="key">{i + 1}</span>
      {option}
    </button>
  {/each}
</div>
