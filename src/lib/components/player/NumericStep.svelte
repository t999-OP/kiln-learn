<script lang="ts">
  import { onMount } from "svelte";
  import { value as evalConst } from "#lib/core/mathexpr.ts";
  import { md } from "#lib/client/md.ts";
  import GraphBox from "./GraphBox.svelte";
  import type { StepProps, Verdict } from "./types.ts";

  let { step, locked, onready }: StepProps<"numeric"> = $props();
  let raw = $state("");
  let checked = $state(false);
  let input: HTMLInputElement;
  onMount(() => input.focus());

  // Accepts 2.5, 2,5 and exact forms like 8/3 or pi/2.
  const read = (s: string) => (/^-?\d+,\d+$/.test(s.trim()) ? Number(s.trim().replace(",", ".")) : evalConst(s));
  const preview = $derived.by(() => {
    const v = read(raw);
    return raw.trim() && Number.isFinite(v) && !/^-?[\d.,]+$/.test(raw.trim()) ? `= ${Number(v.toPrecision(6))}` : "";
  });

  export function check(): Verdict | null {
    if (!raw.trim()) return null;
    checked = true;
    const v = read(raw);
    const tol = step.tolerance ?? Math.abs(step.answer) * 0.01;
    const correct = Number.isFinite(v) && Math.abs(v - step.answer) <= tol + 1e-9;
    return { correct, note: step.explain, expected: correct ? undefined : `${step.answer}${step.unit ? " " + step.unit : ""}` };
  }
</script>

<div class="prompt">{@html md(step.prompt)}</div>
{#if step.graph}<GraphBox graph={step.graph} />{/if}
<div class="numeric">
  <input
    bind:this={input}
    class="answer"
    bind:value={raw}
    autocomplete="off"
    spellcheck="false"
    aria-label="Your answer"
    disabled={checked || locked}
    oninput={() => onready(raw.trim().length > 0)}
  />
  {#if step.unit}<span class="unit">{step.unit}</span>{/if}
</div>
<div class="expr-preview">{preview}</div>
