<script lang="ts">
  import { onDestroy } from "svelte";
  import type { StepProps } from "./types.ts";

  let { step, env, onresolve }: StepProps<"widget"> = $props();
  let frame: HTMLIFrameElement;
  let done = false;

  // The widget runs on a separate origin; we only trust messages from that frame + origin.
  function onMessage(e: MessageEvent) {
    if (e.source !== frame?.contentWindow || e.origin !== env.widgetOrigin || !e.data?.kiln) return;
    const { kind, payload = {} } = e.data as { kind: string; payload?: { correct?: boolean; feedback?: string } };
    if (kind === "ready")
      frame.contentWindow!.postMessage({ kiln: true, kind: "init", payload: { params: step.params ?? {} } }, env.widgetOrigin);
    if (kind === "attempt" && payload.correct && !done) {
      done = true;
      onresolve({ correct: true, note: [payload.feedback, step.explain].filter(Boolean).join(" ") });
    }
  }
  if (typeof window !== "undefined") window.addEventListener("message", onMessage);
  onDestroy(() => typeof window !== "undefined" && window.removeEventListener("message", onMessage));

  export function check() {
    return null;
  }
</script>

<div class="prompt">{step.goal}</div>
<iframe
  bind:this={frame}
  class="widget-frame"
  sandbox="allow-scripts allow-same-origin"
  src="{env.widgetOrigin}/{encodeURIComponent(step.widget)}.html"
  title="{step.widget} interactive"
></iframe>
