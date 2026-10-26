<script lang="ts">
  // Edits a JSON value; invalid JSON is highlighted and not applied.
  let {
    label,
    value,
    onchange,
    hint = "",
    optional = false,
  }: { label: string; value: unknown; onchange: (v: unknown) => void; hint?: string; optional?: boolean } = $props();
  let text = $state("");
  let bad = $state(false);
  $effect(() => {
    const incoming = value === undefined ? "" : JSON.stringify(value);
    let current: unknown;
    try {
      current = text.trim() ? JSON.parse(text) : undefined;
    } catch {
      return;
    }
    if (JSON.stringify(current) !== JSON.stringify(value)) text = incoming;
  });
  function input() {
    if (!text.trim() && optional) {
      bad = false;
      return onchange(undefined);
    }
    try {
      const v = JSON.parse(text || "{}");
      bad = false;
      onchange(v);
    } catch {
      bad = true;
    }
  }
</script>

<label class="field full">
  {label}
  <textarea class="input code" rows="2" bind:value={text} oninput={input} style:border-color={bad ? "var(--bad)" : undefined}></textarea>
  {#if hint}<span class="hint">{@html hint}</span>{/if}
</label>
