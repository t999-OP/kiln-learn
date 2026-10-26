<script lang="ts">
  import { icon } from "#lib/client/icons.ts";
  import { speak } from "#lib/client/speech.ts";
  let { text, lang, big = false, slow = false }: { text: string; lang: string; big?: boolean; slow?: boolean } = $props();
</script>

<button
  type="button"
  class="speak"
  class:big
  class:slow
  aria-label={slow ? "Play slowly" : "Play audio"}
  onclick={() => speak(text, lang, slow ? 0.6 : 1)}
>
  {@html slow ? icon.turtle : icon.speaker}
</button>
