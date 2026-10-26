<script lang="ts">
  import { untrack } from "svelte";
  import { matchAnswer } from "#lib/core/answers.ts";
  import { shuffle } from "#lib/client/md.ts";
  import SpeakButton from "./SpeakButton.svelte";
  import TypedAnswer from "./TypedAnswer.svelte";
  import { verdictFromMatch } from "./verdict.ts";
  import type { StepProps, Verdict } from "./types.ts";

  let { step, env, locked, onready }: StepProps<"translate"> = $props();
  const tiles = untrack(() => shuffle((step.words ?? []).map((w, i) => ({ w, i })))); // shuffle once per mount
  let chosen = $state<number[]>([]);
  let typed = $state("");
  let checked = $state(false);
  const language = $derived.by(() => {
    try {
      return new Intl.DisplayNames(["en"], { type: "language" }).of(env.lang.split("-")[0]);
    } catch {
      return null;
    }
  });

  function toggle(i: number) {
    if (checked || locked) return;
    chosen = chosen.includes(i) ? chosen.filter((x) => x !== i) : [...chosen, i];
    onready(chosen.length > 0);
  }

  export function check(): Verdict | null {
    const answer = step.words ? chosen.map((i) => step.words![i]).join(" ") : typed;
    if (!answer.trim()) return null;
    checked = true;
    return verdictFromMatch(matchAnswer(answer, step.answers));
  }
</script>

<p class="step-kind" style="margin:0">{language ? `Write this in ${language}` : "Translate"}</p>
<div class="row" style="flex-wrap:nowrap">
  {#if step.say}<SpeakButton text={step.say} lang={step.lang || env.sourceLang} />{/if}
  <div class="prompt">{step.prompt}</div>
</div>
{#if step.words}
  <div class="answer-line" aria-label="Your answer">
    {#each chosen as i (i)}<button type="button" class="tile" disabled={checked} onclick={() => toggle(i)}>{step.words[i]}</button>{/each}
  </div>
  <div class="answer-line"></div>
  <div class="bank" aria-label="Word bank">
    {#each tiles as t (t.i)}
      <button
        type="button"
        class="tile"
        class:used={chosen.includes(t.i)}
        disabled={checked || chosen.includes(t.i)}
        onclick={() => toggle(t.i)}
      >
        {t.w}
      </button>
    {/each}
  </div>
{:else}
  <TypedAnswer bind:value={typed} disabled={checked} onchange={(v) => onready(v.trim().length > 0)} />
{/if}
