<script lang="ts">
  import CourseEditor from "#lib/components/studio/CourseEditor.svelte";
  let { data, form } = $props();
</script>

<svelte:head><title>{data.course.meta.title} · Studio</title></svelte:head>

{#key data.course.id}<CourseEditor {data} {form} />{/key}
