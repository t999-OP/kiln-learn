<script lang="ts">
  import { onMount } from "svelte";
  import { md } from "#lib/client/md.ts";
  import { speak } from "#lib/client/speech.ts";
  import SpeakButton from "./SpeakButton.svelte";
  import GraphBox from "./GraphBox.svelte";
  import type { StepProps } from "./types.ts";

  let { step, env, onready }: StepProps<"info"> = $props();
  const lang = $derived(step.lang || env.lang);
  onMount(() => {
    onready(true);
    if (step.say) speak(step.say, lang);
  });
  export function check() {
    return null;
  }
</script>

<div class="teach">
  {#if step.title}<h2>{step.title}</h2>{/if}
  <div class="row" style="align-items:flex-start;gap:1rem;flex-wrap:nowrap">
    {#if step.say}<SpeakButton text={step.say} {lang} />{/if}
    <div>{@html md(step.text)}</div>
  </div>
</div>
{#if step.graph}<GraphBox graph={step.graph} />{/if}
