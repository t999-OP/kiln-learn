<script lang="ts">
  import { enhance } from "$app/forms";
  import CourseCard from "#lib/components/CourseCard.svelte";
  import { icon, SUBJECT_ICON } from "#lib/client/icons.ts";
  let { data, form } = $props();
</script>

<svelte:head><title>Studio · {data.instanceName}</title></svelte:head>

<section class="hero">
  <div>
    <h1>Studio</h1>
    <p class="muted">Every tool is free. Build by hand, draft with AI, or let an agent write via MCP — then polish and publish.</p>
  </div>
  <div class="row">
    <a class="btn ghost" href="/agents">Connect an agent</a>
    <a class="btn ghost" href="/settings/ai">AI models</a>
  </div>
</section>

<div class="grid">
  <form class="card" method="POST" action="?/create" use:enhance>
    <h3>New course</h3>
    {#if form?.error}<div class="form-error">{form.error}</div>{/if}
    <label class="field">
      Title
      <input class="input" name="title" required maxlength="120" placeholder="e.g. Italian for Travelers" />
    </label>
    <label class="field">
      Subject
      <select class="input" name="subject">
        {#each data.subjects as s (s)}<option value={s}>{SUBJECT_ICON[s]} {s}</option>{/each}
      </select>
    </label>
    <label class="field">
      Description
      <input class="input" name="description" maxlength="500" placeholder="Who is it for, what will they learn?" />
    </label>
    <button class="btn">{@html icon.plus} Create</button>
  </form>
  {#each data.courses as c (c.id)}
    <CourseCard course={c} href="/studio/{c.id}" />
  {/each}
</div>
