<script lang="ts">
  import { enhance } from "$app/forms";
  import { icon, SUBJECT_ICON } from "#lib/client/icons.ts";
  import ProvenanceBadge from "#lib/components/ProvenanceBadge.svelte";

  let { data, form } = $props();
  const c = $derived(data.course);
  const lessons = $derived(c.content.units.flatMap((u) => u.lessons));
  const next = $derived(lessons.find((l) => !data.progress[l.id]));
  const doneCount = $derived(lessons.filter((l) => data.progress[l.id]).length);
  const offsets = [0, 60, 90, 60, 0, -60, -90, -60];
  const q = $derived(c.preview ? "?preview=1" : "");
  let stars = $state(0);
  let showReport = $state(false);
  $effect(() => {
    stars = data.rating?.stars ?? 0;
  });
  // Zig-zag path: offset by the lesson's position in the whole course.
  const order = $derived(new Map(lessons.map((l, i) => [l.id, i])));
  const offsetFor = (id: string) => offsets[(order.get(id) ?? 0) % offsets.length];
  const exercises = $derived(lessons.reduce((n, l) => n + l.steps.length, 0));
  const minutes = $derived(Math.max(1, Math.round((exercises * 20) / 60)));
  const pct = $derived(lessons.length ? Math.round((doneCount / lessons.length) * 100) : 0);
  let shared = $state(false);
  async function share() {
    const url = `${location.origin}/course/${c.id}`;
    try {
      if (navigator.share) await navigator.share({ title: c.title, text: c.description, url });
      else await navigator.clipboard.writeText(url);
      shared = true;
    } catch {}
  }
</script>

<svelte:head>
  <title>{c.title} · {data.instanceName}</title>
  <meta name="description" content={c.description} />
  <meta property="og:title" content={c.title} />
  <meta property="og:description" content={c.description} />
  <meta property="og:type" content="website" />
</svelte:head>

{#if c.preview}
  <div class="banner info">
    Previewing your {c.status === "published" ? "latest draft" : "unpublished draft"}. Learners see the published version.
  </div>
{/if}
{#if c.status === "removed"}<div class="banner warn">This course was removed by a moderator and is hidden from learners.</div>{/if}

<div class="course-head">
  <div class="subject-tile {c.subject}">{SUBJECT_ICON[c.subject] ?? "✨"}</div>
  <div style="flex:1;min-width:240px">
    <h1 style="margin:0">{c.title}</h1>
    <p class="muted" style="margin:0.2rem 0 0.4rem">{c.description}</p>
    <div class="row">
      <span class="badge {c.quality.rank}">{c.quality.rank} · {c.quality.score}/100</span>
      <a class="badge-link" href="/u/{c.ownerId}"><ProvenanceBadge provenance={c.provenance} owner={c.ownerName} /></a>
      <span class="badge">{c.license === "CC-BY-SA-4.0" ? "CC BY-SA 4.0" : c.license}</span>
      {#if c.ratingCount}<span class="badge">
          <span class="stars">★</span>
          {c.ratingAvg?.toFixed(1)} · {c.ratingCount} rating{c.ratingCount === 1 ? "" : "s"}
        </span>{/if}
      {#if !c.preview}<span class="badge">v{c.version}</span>{/if}
      {#if c.visibility === "private"}<span class="badge">
          {@html icon.lock.replace("<svg", '<svg width="11" height="11"')} Private
        </span>{/if}
    </div>
  </div>
  <div class="row">
    {#if next}
      <a class="btn" href="/course/{c.id}/play/{next.id}{q}">{doneCount ? "Continue" : "Start"}</a>
    {:else if lessons.length}
      <a class="btn ghost" href="/course/{c.id}/play/{lessons[0].id}{q}">Practice again</a>
    {/if}
    {#if data.editable}<a class="btn ghost sm" href="/studio/{c.id}">Edit in Studio</a>{/if}
  </div>
</div>

{#if lessons.length}
  <div class="course-progress">
    <div class="bar" role="progressbar" aria-label="Course progress" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
      <div style="width:{pct}%"></div>
    </div>
    <span class="small muted">
      {#if doneCount === lessons.length}🎉 Course complete ·{:else}{doneCount}/{lessons.length} lessons ·{/if}
      {exercises} exercises · about {minutes} min
      {#if !data.user && !c.preview}· no account needed{/if}
    </span>
    {#if !c.preview && c.visibility !== "private"}
      <button class="btn ghost sm" onclick={share}>{shared ? "Link copied" : "Share"}</button>
    {/if}
  </div>
{/if}

{#each c.content.units as unit, ui (unit.id)}
  <section class="unit">
    <div class="unit-banner">
      <div class="small">UNIT {ui + 1}</div>
      <h2 style="margin:0">{unit.title}</h2>
    </div>
    <div class="path">
      {#each unit.lessons as l (l.id)}
        {@const done = !!data.progress[l.id]}
        <a
          class="node"
          class:done
          class:next={l === next}
          style="transform:translateX({offsetFor(l.id)}px)"
          href="/course/{c.id}/play/{l.id}{q}"
        >
          <div class="disc">{@html done ? icon.check : icon.star}</div>
          <span>
            {l.title}{#if done}<br />
              <span class="muted small">{data.progress[l.id].bestAccuracy}% best</span>{/if}
          </span>
        </a>
      {:else}
        <div class="muted">No lessons yet</div>
      {/each}
    </div>
  </section>
{/each}

{#if !c.preview}
  <div class="unit">
    {#if data.user?.guest && doneCount > 0}
      <p class="small muted">
        <a href="/signup?next=/course/{c.id}">Create a free account</a>
        to rate this course or report a problem — your progress comes with you.
      </p>
    {/if}
    {#if data.user && !data.user.guest && !data.editable && doneCount > 0}
      <div class="card" style="margin-bottom:1rem">
        <h3>Rate this course</h3>
        <form method="POST" action="?/rate" use:enhance>
          <div class="star-input" role="radiogroup" aria-label="Stars">
            {#each [1, 2, 3, 4, 5] as s (s)}
              <button type="button" class:on={s <= stars} aria-label="{s} star{s > 1 ? 's' : ''}" onclick={() => (stars = s)}>★</button>
            {/each}
          </div>
          <input type="hidden" name="stars" value={stars} />
          <label class="field">
            Review (optional)
            <textarea class="input" name="review" rows="2" maxlength="1000">{data.rating?.review ?? ""}</textarea>
          </label>
          {#if form?.error && !showReport}<div class="form-error">{form.error}</div>{/if}
          {#if form && "rated" in form}<div class="form-ok">Thanks for rating!</div>{/if}
          <button class="btn sm" disabled={!stars}>{data.rating ? "Update rating" : "Submit rating"}</button>
        </form>
      </div>
    {/if}
    {#if data.user && !data.user.guest && !data.editable}
      {#if form && "reported" in form}
        <p class="form-ok">
          {form.duplicate
            ? "You already reported this course — moderators will look at it."
            : "Thanks — moderators will review your report."}
        </p>
      {:else if showReport}
        <form class="card" method="POST" action="?/report" use:enhance>
          <h3>Report a problem</h3>
          <label class="field">
            Reason
            <select class="input" name="reason" required>
              <option value="">Choose…</option>
              {#each Object.entries(data.reasons) as [k, label] (k)}<option value={k}>{label}</option>{/each}
            </select>
          </label>
          <label class="field">
            Details
            <textarea class="input" name="details" rows="3" maxlength="2000" placeholder="Which lesson or step? What's wrong?"></textarea>
          </label>
          {#if form?.error}<div class="form-error">{form.error}</div>{/if}
          <div class="row">
            <button class="btn sm">Send report</button>
            <button type="button" class="btn ghost sm" onclick={() => (showReport = false)}>Cancel</button>
          </div>
        </form>
      {:else}
        <button class="btn ghost sm" onclick={() => (showReport = true)}>Report a problem</button>
      {/if}
    {/if}
  </div>
{/if}
