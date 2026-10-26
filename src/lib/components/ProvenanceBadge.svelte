<script lang="ts">
  let { provenance, owner }: { provenance: { kind: "human" } | { kind: "agent"; agent: string; model?: string }; owner: string } = $props();
</script>

{#if provenance.kind === "agent"}
  <span class="badge agent" title="Created by an AI agent{provenance.model ? ` (${provenance.model})` : ''} for {owner}">
    🤖 {provenance.agent}
  </span>
{:else}
  <span class="badge">by {owner}</span>
{/if}
