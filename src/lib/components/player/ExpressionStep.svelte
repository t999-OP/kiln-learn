<script lang="ts">
  import { onMount } from "svelte";
  import { equivalent, pretty } from "#lib/core/mathexpr.ts";
  import { md } from "#lib/client/md.ts";
  import GraphBox from "./GraphBox.svelte";
  import type { StepProps, Verdict } from "./types.ts";

  let { step, locked, onready }: StepProps<"expression"> = $props();
  const variable = $derived(step.variable || "x");
  const keys = $derived([variable, "^", "(", ")", "/", "√", "π", "sin", "cos", "eˣ", "ln"]);
  const insert: Record<string, string> = { "√": "sqrt(", π: "pi", sin: "sin(", cos: "cos(", eˣ: "e^(", ln: "ln(" };
  let raw = $state("");
  let checked = $state(false);
  let input: HTMLInputElement;
  onMount(() => input.focus());

  const preview = $derived.by((): { ok: boolean; text: string } | null => {
    if (!raw.trim()) return null;
    try {
      return { ok: true, text: pretty(raw, [variable]) };
    } catch (e) {
      return { ok: false, text: (e as Error).message };
    }
  });
  $effect(() => onready(!!preview?.ok));

  function press(k: string) {
    const ins = insert[k] ?? k;
    const a = input.selectionStart ?? raw.length;
    const z = input.selectionEnd ?? raw.length;
    raw = raw.slice(0, a) + ins + raw.slice(z);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(a + ins.length, a + ins.length);
    });
  }

  export function check(): Verdict | null {
    if (!preview?.ok) return null;
    checked = true;
    let correct = false;
    try {
      correct = equivalent(raw, step.answer, { variable, range: step.range, upToConstant: step.upToConstant });
    } catch {}
    let shown = step.answer;
    try {
      shown = pretty(step.answer, [variable]) + (step.upToConstant ? " + C" : "");
    } catch {}
    return { correct, note: step.explain, expected: correct ? undefined : shown };
  }
</script>

<div class="prompt">{@html md(step.prompt)}</div>
{#if step.graph}<GraphBox graph={step.graph} />{/if}
<input
  bind:this={input}
  bind:value={raw}
  class="answer expr-input"
  autocomplete="off"
  spellcheck="false"
  autocapitalize="off"
  aria-label="Your expression"
  placeholder="e.g. 3{variable}^2 + 1"
  disabled={checked || locked}
/>
<div class="expr-preview" class:bad={preview && !preview.ok} aria-live="polite">
  {#if preview?.ok}= <b>{preview.text}</b>{:else if preview}{preview.text}{/if}
</div>
<div class="keypad">
  {#each keys as k (k)}<button type="button" class="tile" disabled={checked || locked} onclick={() => press(k)}>{k}</button>{/each}
</div>
