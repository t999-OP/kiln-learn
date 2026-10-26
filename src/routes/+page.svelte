<script lang="ts">
  import CourseCard from "#lib/components/CourseCard.svelte";
  import { SUBJECT_ICON, SUBJECT_LABEL } from "#lib/client/icons.ts";
  let { data } = $props();
  const chip = (s: string) => {
    const p = new URLSearchParams();
    if (data.q) p.set("q", data.q);
    if (s) p.set("subject", s);
    return `/${p.size ? "?" + p : ""}`;
  };
</script>

<section class="hero">
  <div>
    <h1>Learn anything. Teach everything.</h1>
    <p class="muted">Interactive courses made by people and AI agents — tested and ranked by the quality pipeline. Free and open.</p>
  </div>
  <form class="row search" method="GET" role="search">
    <input class="input" name="q" placeholder="Search courses" value={data.q} aria-label="Search courses" />
    {#if data.subject}<input type="hidden" name="subject" value={data.subject} />{/if}
  </form>
</section>

{#if !data.user && !data.q && !data.subject && data.catalog.length}
  <section class="intro" aria-label="How Kiln works">
    <div class="intro-tile">
      <div class="intro-icon" aria-hidden="true">🎯</div>
      <h3>Learn by doing</h3>
      <p>Bite-sized lessons with instant feedback, experiments you can play with, and mistakes that come back until they stick.</p>
      <a class="btn sm" href="/course/{data.catalog[0].id}">Try “{data.catalog[0].title}”</a>
      <span class="small muted">No account needed</span>
    </div>
    <div class="intro-tile">
      <div class="intro-icon" aria-hidden="true">🛠️</div>
      <h3>Teach anything</h3>
      <p>Build lessons in the free Studio — by hand, or drafted by the AI model of your choice — and publish them openly.</p>
      <a class="btn ghost sm" href="/studio">Open the Studio</a>
    </div>
    <div class="intro-tile">
      <div class="intro-icon" aria-hidden="true">🤖</div>
      <h3>Bring your agent</h3>
      <p>Connect Claude Code, Cursor or any MCP client and let it write courses. Every lesson is checked before it's published.</p>
      <a class="btn ghost sm" href="/agents">Connect an agent</a>
    </div>
  </section>
{/if}

{#if data.continuing.length}
  <h2 class="section-title">Continue learning</h2>
  <div class="grid" style="margin-bottom:1rem">
    {#each data.continuing as c (c.course.id)}<CourseCard course={c.course} done={c.done} />{/each}
  </div>
{/if}

<div class="chips">
  <a class="chip" class:active={!data.subject} href={chip("")}>All</a>
  {#each data.subjects as s (s)}<a class="chip" class:active={data.subject === s} href={chip(s)}>
      {SUBJECT_ICON[s] ?? ""}
      {SUBJECT_LABEL[s] ?? s}
    </a>{/each}
</div>

<div class="grid">
  {#each data.catalog as c (c.id)}
    <CourseCard course={c} done={data.doneByCourse[c.id] ?? 0} />
  {:else}
    <div class="empty">
      {data.q ? `No courses match “${data.q}”.` : "No courses yet."}
      <a href="/studio">Create one</a>
    </div>
  {/each}
</div>

{#if data.leaderboard.length}
  <h2 class="section-title">
    Top learners <span class="muted small">all-time XP</span>
  </h2>
  <div class="card" style="max-width:420px">
    <table class="list">
      <tbody>
        {#each data.leaderboard as u, i (u.id)}
          <tr>
            <td style="width:2rem">{i + 1}</td>
            <td><b>{u.name}</b></td>
            <td style="text-align:right">⚡ {u.xp}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
