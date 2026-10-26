<script lang="ts">
  import { onMount } from "svelte";
  let {
    value = $bindable(""),
    placeholder = "Type your answer",
    disabled = false,
    onchange,
  }: { value?: string; placeholder?: string; disabled?: boolean; onchange: (v: string) => void } = $props();
  let el: HTMLTextAreaElement;
  onMount(() => el.focus());
</script>

<textarea
  bind:this={el}
  class="answer"
  rows="3"
  spellcheck="false"
  autocapitalize="off"
  {placeholder}
  {disabled}
  aria-label="Your answer"
  bind:value
  oninput={() => onchange(value)}
  onkeydown={(e) => e.key === "Enter" && !e.shiftKey && e.preventDefault()}></textarea>
