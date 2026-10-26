<script lang="ts">
  import { renderGraph } from "#lib/client/plot.ts";
  import type { Graph } from "#lib/core/schema.ts";
  let { graph }: { graph: Graph } = $props();
  let svg: SVGSVGElement;
  let failed = $state<string | null>(null);
  $effect(() => {
    svg.replaceChildren();
    try {
      renderGraph(svg, graph);
      failed = null;
    } catch (e) {
      failed = (e as Error).message;
    }
  });
</script>

<div class="graph-box">
  <svg bind:this={svg} viewBox="0 0 560 260" role="img" aria-label="Graph of {graph.fns.join(', ')}"></svg>
  {#if failed}<div class="small muted">Graph error: {failed}</div>{/if}
</div>
