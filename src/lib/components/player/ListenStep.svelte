<script lang="ts">
  import { onMount } from "svelte";
  import { matchAnswer } from "#lib/core/answers.ts";
  import { speak } from "#lib/client/speech.ts";
  import SpeakButton from "./SpeakButton.svelte";
  import TypedAnswer from "./TypedAnswer.svelte";
  import { verdictFromMatch } from "./verdict.ts";
  import type { StepProps, Verdict } from "./types.ts";

  let { step, env, onready }: StepProps<"listen"> = $props();
  const lang = $derived(step.lang || env.lang);
  let typed = $state("");
  let checked = $state(false);
  onMount(() => setTimeout(() => speak(step.say, lang), 250));

  export function check(): Verdict | null {
    if (!typed.trim()) return null;
    checked = true;
    return verdictFromMatch(matchAnswer(typed, step.answers));
  }
</script>

<div class="row" style="justify-content:center;gap:1rem;padding:1rem 0">
  <SpeakButton text={step.say} {lang} big />
  <SpeakButton text={step.say} {lang} slow />
</div>
<TypedAnswer bind:value={typed} disabled={checked} placeholder="Type what you hear" onchange={(v) => onready(v.trim().length > 0)} />
