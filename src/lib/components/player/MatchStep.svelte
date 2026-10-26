<script lang="ts">
  import { untrack } from "svelte";
  import { shuffle } from "#lib/client/md.ts";
  import type { StepProps } from "./types.ts";

  let { step, onresolve }: StepProps<"match"> = $props();
  const left = untrack(() => shuffle(step.pairs.map((p, i) => ({ t: p[0], i }))));
  const right = untrack(() => shuffle(step.pairs.map((p, i) => ({ t: p[1], i }))));
  let sel = $state<{ side: "L" | "R"; i: number } | null>(null);
  let matched = $state<number[]>([]);
  let wrong = $state<string[]>([]);
  let mistakes = 0;

  function tap(side: "L" | "R", i: number) {
    if (matched.includes(i)) return;
    if (!sel || sel.side === side) {
      sel = { side, i };
      return;
    }
    if (sel.i === i) {
      matched = [...matched, i];
      sel = null;
      if (matched.length === step.pairs.length)
        onresolve({
          correct: true,
          record: mistakes === 0,
          note: mistakes ? `${mistakes} mismatch${mistakes > 1 ? "es" : ""} along the way.` : undefined,
        });
    } else {
      mistakes++;
      wrong = [`${sel.side}${sel.i}`, `${side}${i}`];
      sel = null;
      setTimeout(() => (wrong = []), 400);
    }
  }
  export function check() {
    return null;
  }
</script>

{#if step.prompt}<div class="prompt">{step.prompt}</div>{/if}
<div class="match">
  {#each [["L", left], ["R", right]] as const as [side, items] (side)}
    <div class="col">
      {#each items as x (x.i)}
        <button
          type="button"
          class="option"
          class:selected={sel?.side === side && sel.i === x.i}
          class:matched={matched.includes(x.i)}
          class:wrong={wrong.includes(`${side}${x.i}`)}
          class:shake={wrong.includes(`${side}${x.i}`)}
          onclick={() => tap(side, x.i)}
        >
          {x.t}
        </button>
      {/each}
    </div>
  {/each}
</div>
