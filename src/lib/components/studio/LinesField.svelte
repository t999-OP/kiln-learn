<script lang="ts">
  // Edits a string[] as one item per line, without fighting the cursor while typing.
  let {
    label,
    value,
    onchange,
    hint = "",
    rows = 3,
    full = false,
  }: {
    label: string;
    value: string[] | undefined;
    onchange: (v: string[]) => void;
    hint?: string;
    rows?: number;
    full?: boolean;
  } = $props();
  const parse = (t: string) =>
    t
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  let text = $state("");
  $effect(() => {
    const incoming = value ?? [];
    if (JSON.stringify(parse(text)) !== JSON.stringify(incoming)) text = incoming.join("\n");
  });
</script>

<label class="field" class:full>
  {label}
  <textarea class="input" {rows} bind:value={text} oninput={() => onchange(parse(text))}></textarea>
  {#if hint}<span class="hint">{hint}</span>{/if}
</label>
