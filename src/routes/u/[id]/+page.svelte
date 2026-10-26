<script lang="ts">
  import CourseCard from "#lib/components/CourseCard.svelte";
  let { data } = $props();
  const p = $derived(data.profile);
  const since = $derived(new Date(p.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }));
</script>

<svelte:head>
  <title>{p.name} · {data.instanceName}</title>
  <meta property="og:title" content="{p.name} on {data.instanceName}" />
</svelte:head>

<section class="hero">
  <div class="row" style="gap:1rem;flex-wrap:nowrap">
    <div class="avatar" style="width:64px;height:64px;font-size:1.6rem;cursor:default" aria-hidden="true">
      {p.name.slice(0, 1).toUpperCase()}
    </div>
    <div>
      <h1 style="margin:0">{p.name}</h1>
      <p class="muted" style="margin:0">Creating and learning since {since}</p>
    </div>
  </div>
</section>

<div class="tiles3" style="justify-content:flex-start;margin-bottom:1.5rem">
  <div>
    <span class="muted small">Courses</span>
    <b>{p.courses.length}</b>
  </div>
  <div>
    <span class="muted small">Learners reached</span>
    <b>{p.learners}</b>
  </div>
  <div>
    <span class="muted small">XP</span>
    <b>⚡ {p.xp}</b>
  </div>
</div>

<h2 class="section-title">Published courses</h2>
<div class="grid">
  {#each p.courses as c (c.id)}
    <CourseCard course={c} />
  {:else}
    <div class="empty">No public courses yet.</div>
  {/each}
</div>
