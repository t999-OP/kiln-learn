<script lang="ts">
  import Player from "#lib/components/player/Player.svelte";
  let { data } = $props();
</script>

<svelte:head><title>{data.lesson.title} · {data.course.title}</title></svelte:head>

{#key data.lesson.id}
  <Player
    course={data.course}
    lesson={data.lesson}
    nextLessonId={data.nextLessonId}
    guest={!data.user || data.user.guest}
    env={{
      lang: data.course.languages?.target ?? "en-US",
      sourceLang: data.course.languages?.source ?? "en-US",
      widgetOrigin: data.widgetOrigin,
    }}
  />
{/key}
