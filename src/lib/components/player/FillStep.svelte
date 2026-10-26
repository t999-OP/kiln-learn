<script lang="ts">
  import { onMount } from "svelte";
  import { matchAnswer } from "#lib/core/answers.ts";
  import { verdictFromMatch } from "./verdict.ts";
  import type { StepProps, Verdict } from "./types.ts";

  let { step, locked, onready }: StepProps<"fill"> = $props();
  const [before, after = ""] = $derived(step.prompt.split("___"));
  let value = $state("");
  let checked = $state(false);
  let input: HTMLInputElement;
  onMount(() => input.focus());

  export function check(): Verdict | null {
    if (!value.trim()) return null;
    checked = true;
    return verdictFromMatch(matchAnswer(value, step.answers));
  }
</script>

<div class="fill-line">
  <span>{before}</span>
  <input
    bind:this={input}
    bind:value
    aria-label="Blank"
    autocomplete="off"
    spellcheck="false"
    disabled={checked || locked}
    oninput={() => onready(value.trim().length > 0)}
  />
  <span>{after}</span>
</div>
{#if step.hint}<div class="muted">Hint: {step.hint}</div>{/if}
