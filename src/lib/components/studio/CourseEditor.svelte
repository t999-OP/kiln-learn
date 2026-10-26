<script lang="ts">
  import { enhance } from "$app/forms";
  import { onMount, untrack } from "svelte";
  import { assessCourse } from "#lib/core/quality.ts";
  import type { CourseContent, CourseDoc, CourseMeta, Step } from "#lib/core/schema.ts";
  import { icon, SUBJECT_ICON } from "#lib/client/icons.ts";
  import StepEditor from "./StepEditor.svelte";
  import type { PageData, ActionData } from "../../../routes/studio/[id]/$types";

  // The page re-mounts this component per course (see the {#key} in +page.svelte),
  // so reading the initial data once is intentional.
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const initial = untrack(() => data.course);

  // Local working copy; autosaved to the server.
  let meta = $state(structuredClone(initial.meta) as CourseMeta);
  let content = $state(structuredClone(initial.content) as CourseContent);
  let revision = $state(initial.revision);
  let selectedId = $state<string | null>(initial.content.units.flatMap((u) => u.lessons)[0]?.id ?? null);
  let saveState = $state<"saved" | "dirty" | "saving" | "conflict" | "error">("saved");
  let saveError = $state("");
  let notice = $state("");
  let lastSaved = JSON.stringify({ meta: initial.meta, content: initial.content });
  let timer: ReturnType<typeof setTimeout> | undefined;

  const quality = $derived(assessCourse({ ...meta, units: content.units } as CourseDoc));
  const lessons = $derived(content.units.flatMap((u) => u.lessons.map((l) => ({ unit: u, lesson: l }))));
  const selected = $derived(lessons.find((x) => x.lesson.id === selectedId) ?? null);
  const rankColor: Record<string, string> = { Gold: "var(--gold)", Silver: "var(--silver)", Bronze: "var(--bronze)", Draft: "var(--bad)" };
  const snapshot = () => JSON.stringify({ meta, content });

  $effect(() => {
    const snap = snapshot();
    if (snap === lastSaved || saveState === "conflict") return;
    saveState = "dirty";
    clearTimeout(timer);
    timer = setTimeout(save, 700);
  });

  async function save() {
    const snap = snapshot();
    if (snap === lastSaved) return void (saveState = "saved");
    saveState = "saving";
    const body = JSON.parse(snap);
    try {
      const res = await fetch(`/api/courses/${data.course.id}/draft`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, baseRevision: revision }),
      });
      const r = await res.json();
      if (res.status === 409) {
        saveState = "conflict";
        return;
      }
      if (!res.ok) throw new Error(r.error ?? res.statusText);
      revision = r.revision;
      lastSaved = snap;
      saveState = snapshot() === lastSaved ? "saved" : "dirty";
      if (saveState === "dirty") timer = setTimeout(save, 300);
    } catch (e) {
      saveState = "error";
      saveError = (e as Error).message;
    }
  }

  function apply(r: { meta: CourseMeta; content: CourseContent; revision: number }) {
    meta = r.meta;
    content = r.content;
    revision = r.revision;
    lastSaved = snapshot();
    saveState = "saved";
    if (!lessons.some((x) => x.lesson.id === selectedId)) selectedId = lessons[0]?.lesson.id ?? null;
  }

  async function reload(message = "") {
    const res = await fetch(`/api/courses/${data.course.id}/draft`);
    if (res.ok) apply(await res.json());
    notice = message;
  }

  // Pick up edits made elsewhere (MCP agents, another tab) while nothing local is pending.
  async function poll() {
    if (saveState !== "saved") return;
    const res = await fetch(`/api/courses/${data.course.id}/draft?since=${revision}`);
    if (!res.ok) return;
    const r = await res.json();
    if (r.changed && saveState === "saved") {
      apply(r);
      notice = "Updated with changes made elsewhere (e.g. by an agent).";
    }
  }
  onMount(() => {
    const t = setInterval(() => !document.hidden && poll(), 8000);
    const onVisible = () => !document.hidden && poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => (clearInterval(t), document.removeEventListener("visibilitychange", onVisible));
  });

  const newId = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;
  const TEMPLATES: Record<Step["type"], () => Step> = {
    info: () => ({ type: "info", text: "" }),
    choice: () => ({ type: "choice", prompt: "", options: ["", "", ""], answer: 0 }),
    predict: () => ({ type: "predict", prompt: "", options: ["", "", ""], answer: 0 }),
    translate: () => ({ type: "translate", prompt: "", answers: [] }),
    fill: () => ({ type: "fill", prompt: "___", answers: [] }),
    listen: () => ({ type: "listen", say: "", lang: meta.languages?.target ?? "en-US", answers: [] }),
    match: () => ({
      type: "match",
      pairs: [
        ["", ""],
        ["", ""],
        ["", ""],
      ],
    }),
    numeric: () => ({ type: "numeric", prompt: "", answer: 0 }),
    expression: () => ({ type: "expression", prompt: "", answer: "" }),
    widget: () => ({ type: "widget", widget: "pendulum", params: {}, goal: "" }),
  };

  function addUnit() {
    content.units.push({ id: newId("u"), title: `Unit ${content.units.length + 1}`, lessons: [] });
  }
  function addLesson(unitIndex: number) {
    const l = { id: newId("l"), title: "New lesson", concepts: [], steps: [TEMPLATES.info()] };
    content.units[unitIndex].lessons.push(l);
    selectedId = l.id;
  }
  function deleteLesson() {
    if (!selected || !confirm(`Delete lesson "${selected.lesson.title}"?`)) return;
    const u = content.units.find((x) => x.id === selected.unit.id)!;
    u.lessons = u.lessons.filter((l) => l.id !== selected.lesson.id);
    selectedId = lessons[0]?.lesson.id ?? null;
  }
  /** Move the selected lesson up/down, crossing into the neighbouring unit at the edges. */
  function moveLesson(d: -1 | 1) {
    if (!selected) return;
    const ui = content.units.findIndex((u) => u.id === selected.unit.id);
    const unit = content.units[ui];
    const li = unit.lessons.findIndex((l) => l.id === selected.lesson.id);
    const [lesson] = unit.lessons.splice(li, 1);
    const target = li + d;
    if (target >= 0 && target <= unit.lessons.length) unit.lessons.splice(target, 0, lesson);
    else if (content.units[ui + d]) {
      const other = content.units[ui + d];
      if (d < 0) other.lessons.push(lesson);
      else other.lessons.unshift(lesson);
    } else unit.lessons.splice(li, 0, lesson);
  }
  const canMoveLesson = (d: -1 | 1) => {
    if (!selected) return false;
    const ui = content.units.findIndex((u) => u.id === selected.unit.id);
    const li = selected.unit.lessons.findIndex((l) => l.id === selected.lesson.id);
    return d < 0 ? li > 0 || ui > 0 : li < selected.unit.lessons.length - 1 || ui < content.units.length - 1;
  };
  function moveStep(i: number, d: number) {
    const steps = selected!.lesson.steps;
    [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
  }

  // ---- AI assistant ----
  let aiBusy = $state(false);
  let aiError = $state("");
  let aiUnit = $state(initial.content.units[0]?.id ?? "");
  let aiInstructions = $state("");
  let aiSource = $state("");
  let showSource = $state(false);
  let reviseInstructions = $state("");

  async function flush() {
    clearTimeout(timer);
    if (snapshot() !== lastSaved) await save();
    return saveState === "saved";
  }

  async function ai(kind: "draft" | "revise") {
    aiError = "";
    if (!(await flush())) return void (aiError = "Save your changes first.");
    aiBusy = true;
    try {
      const body =
        kind === "draft"
          ? { unitId: aiUnit, instructions: aiInstructions, source: aiSource || undefined }
          : { lessonId: selectedId, instructions: reviseInstructions };
      const res = await fetch(`/api/courses/${data.course.id}/ai/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error ?? res.statusText);
      await reload(
        `${kind === "draft" ? "Drafted" : "Revised"} "${r.title}" — ${r.steps} steps.` +
          (r.issues.length ? ` ${r.issues.length} thing${r.issues.length === 1 ? "" : "s"} left to review.` : " No quality issues."),
      );
      selectedId = r.lessonId;
      aiInstructions = reviseInstructions = aiSource = "";
    } catch (e) {
      aiError = (e as Error).message;
    } finally {
      aiBusy = false;
    }
  }
</script>

{#if saveState === "conflict"}
  <div class="banner warn row">
    This course was changed somewhere else (maybe by an agent) while you were editing.
    <span class="spacer"></span>
    <button class="btn sm" onclick={() => reload("Loaded the latest version. Your unsaved edits were discarded.")}>Load latest</button>
  </div>
{/if}
{#if notice}<div class="banner info row">
    {notice}
    <span class="spacer"></span>
    <button class="icon-btn" aria-label="Dismiss" onclick={() => (notice = "")}>{@html icon.x}</button>
  </div>{/if}

<div class="studio">
  <aside class="sticky">
    <div class="panel">
      <div class="row">
        <h3 style="margin:0">Course</h3>
        <span class="spacer"></span>
        <span class="save-state" aria-live="polite">
          {{ saved: "Saved", dirty: "Editing…", saving: "Saving…", conflict: "Conflict", error: "Not saved" }[saveState]}
        </span>
      </div>
      {#if saveState === "error"}<div class="form-error">{saveError}</div>{/if}
      <label class="field">
        Title
        <input class="input" bind:value={meta.title} maxlength="120" />
      </label>
      <label class="field">
        Description
        <textarea class="input" rows="2" maxlength="500" bind:value={meta.description}></textarea>
      </label>
      <label class="field">
        Subject
        <select class="input" bind:value={meta.subject}>
          {#each data.catalog.subjects as s (s)}<option value={s}>{SUBJECT_ICON[s]} {s}</option>{/each}
        </select>
      </label>
      {#if meta.subject === "language"}
        <div class="row" style="flex-wrap:nowrap">
          <label class="field" style="flex:1">
            Teaches
            <input
              class="input"
              placeholder="es-ES"
              value={meta.languages?.target ?? ""}
              oninput={(e) => (meta.languages = { source: meta.languages?.source ?? "en-US", target: e.currentTarget.value })}
            />
          </label>
          <label class="field" style="flex:1">
            To speakers of
            <input
              class="input"
              placeholder="en-US"
              value={meta.languages?.source ?? ""}
              oninput={(e) => (meta.languages = { target: meta.languages?.target ?? "", source: e.currentTarget.value })}
            />
          </label>
        </div>
      {/if}

      <div class="small muted" style="margin:0.4rem 0 0.6rem">
        Status: <b>{data.course.status}</b>
        {#if data.course.publishedVersion}&nbsp;· live version v{data.course.publishedVersion}{/if}
        <br />
        License:
        <b>{data.course.license === "CC-BY-SA-4.0" ? "CC BY-SA 4.0 (open)" : data.course.license}</b>
      </div>

      {#if form?.error}<div class="form-error">{form.error}</div>{/if}
      {#if form && "published" in form}<div class="form-ok">Published version {form.published}.</div>{/if}
      <div class="row">
        <form
          method="POST"
          action="?/publish"
          use:enhance={() =>
            async ({ update }) =>
              update({ reset: false })}
        >
          <button
            class="btn sm"
            disabled={!quality.publishable || saveState !== "saved"}
            title={quality.publishable ? "Publish the current draft as a new version" : "Fix errors first"}
          >
            {data.course.publishedVersion ? "Publish update" : "Publish"}
          </button>
        </form>
        <a class="btn ghost sm" href="/course/{data.course.id}?preview=1">Preview</a>
      </div>

      <form method="POST" action="?/visibility" use:enhance class="field" style="margin-top:0.8rem">
        <label class="field">
          Who can see it
          <select class="input" name="visibility" value={data.course.visibility} onchange={(e) => e.currentTarget.form?.requestSubmit()}>
            <option value="public">Public — in the catalog (CC BY-SA)</option>
            <option value="unlisted">Unlisted — anyone with the link</option>
            <option value="private">Private — only you</option>
          </select>
        </label>
      </form>

      <details>
        <summary class="small muted">More</summary>
        <div class="row" style="margin-top:0.5rem">
          {#if data.course.status === "published"}
            <form method="POST" action="?/unpublish" use:enhance><button class="btn ghost sm">Unpublish</button></form>
          {/if}
          <form
            method="POST"
            action="?/delete"
            use:enhance={({ cancel }) => {
              if (!confirm(`Delete "${meta.title}" permanently? Learners lose access.`)) cancel();
            }}
          >
            <button class="btn ghost sm">{@html icon.trash} Delete course</button>
          </form>
        </div>
        {#if data.versions.length}
          <p class="small muted" style="margin-bottom:0.2rem">Versions</p>
          <ul class="small" style="margin:0;padding-left:1.1rem">
            {#each data.versions as v (v.version)}<li>
                v{v.version} · {new Date(v.publishedAt).toLocaleDateString()} · {v.quality.rank}
                {v.quality.score}
              </li>{/each}
          </ul>
        {/if}
      </details>
    </div>

    <div class="panel">
      <div class="row">
        <h3 style="margin:0">Lessons</h3>
        <span class="spacer"></span>
        <button class="btn sm ghost" onclick={addUnit}>+ Unit</button>
      </div>
      <div class="tree">
        {#each content.units as unit, ui (unit.id)}
          <div class="unit-name">
            <input class="input" style="font-size:0.8rem;padding:0.2rem 0.4rem" aria-label="Unit title" bind:value={unit.title} />
            <button class="icon-btn" title="Add lesson" aria-label="Add lesson to {unit.title}" onclick={() => addLesson(ui)}>
              {@html icon.plus}
            </button>
            {#if !unit.lessons.length}<button
                class="icon-btn"
                title="Delete unit"
                aria-label="Delete unit"
                onclick={() => content.units.splice(ui, 1)}
              >
                {@html icon.trash}
              </button>{/if}
          </div>
          {#each unit.lessons as l (l.id)}
            <button class="lesson" class:active={l.id === selectedId} onclick={() => (selectedId = l.id)}>
              {l.title}
              <span class="muted small">· {l.steps.length}</span>
            </button>
          {/each}
        {:else}
          <div class="muted small">Add a unit to start.</div>
        {/each}
      </div>
    </div>
  </aside>

  <section>
    {#if selected}
      {@const lesson = selected.lesson}
      <div class="panel" style="margin-bottom:1rem">
        <div class="row">
          <input
            class="input"
            style="font-size:1.2rem;font-weight:900;flex:1;min-width:200px"
            aria-label="Lesson title"
            bind:value={lesson.title}
          />
          <a class="btn sm" href="/course/{data.course.id}/play/{lesson.id}?preview=1" target="_blank" rel="noopener">▶ Preview</a>
          <button
            class="icon-btn"
            title="Move lesson up"
            aria-label="Move lesson up"
            disabled={!canMoveLesson(-1)}
            onclick={() => moveLesson(-1)}
          >
            {@html icon.up}
          </button>
          <button
            class="icon-btn"
            title="Move lesson down"
            aria-label="Move lesson down"
            disabled={!canMoveLesson(1)}
            onclick={() => moveLesson(1)}
          >
            {@html icon.down}
          </button>
          <button class="icon-btn" title="Delete lesson" aria-label="Delete lesson" onclick={deleteLesson}>{@html icon.trash}</button>
        </div>
        {#if data.stats[lesson.id]}<div class="small muted" style="margin-top:0.4rem">
            Per-step first-try success from learners on the live version is shown on each step.
          </div>{/if}
      </div>
      {#each lesson.steps as _, i (i)}
        <StepEditor
          bind:step={lesson.steps[i]}
          index={i}
          total={lesson.steps.length}
          issues={quality.issues.filter((x) => x.lessonId === lesson.id && x.step === i)}
          stat={data.stats[lesson.id]?.[i]}
          onmove={(d) => moveStep(i, d)}
          ondelete={() => lesson.steps.splice(i, 1)}
          onduplicate={() => lesson.steps.splice(i + 1, 0, structuredClone($state.snapshot(lesson.steps[i])))}
        />
      {/each}
      <div class="panel row">
        <b>Add step</b>
        {#each Object.entries(data.catalog.stepTypes) as [type, info] (type)}
          <button class="btn sm ghost" onclick={() => lesson.steps.push(TEMPLATES[type as Step["type"]]())}>{info.label}</button>
        {/each}
      </div>
    {:else}
      <div class="panel empty">Select a lesson, add one with +, or draft one with AI →</div>
    {/if}
  </section>

  <aside class="sticky">
    <div class="panel">
      <h3>Quality</h3>
      <div class="row" style="gap:1rem">
        <div class="score-ring" style="--p:{quality.score};--c:{rankColor[quality.rank]}"><div>{quality.score}</div></div>
        <div>
          <span class="badge {quality.rank}">{quality.rank}</span>
          <div class="small muted" style="margin-top:0.3rem">
            {quality.errors} errors · {quality.warnings} warnings
            <br />
            {quality.lessons} lessons · {quality.steps} steps
          </div>
          <div class="small" style="margin-top:0.3rem;font-weight:800;color:{quality.publishable ? 'var(--good)' : 'var(--bad)'}">
            {quality.publishable ? "✓ Ready to publish" : "✗ Fix errors to publish"}
          </div>
        </div>
      </div>
      <ul class="issues">
        {#each quality.issues as i, k (k)}
          <li class={i.level}>
            {#if i.lessonId}<button class="icon-btn small" style="padding:0;font-weight:800" onclick={() => (selectedId = i.lessonId!)}>
                {i.where}
              </button>{:else}<span class="where">{i.where}</span>{/if}
            <div>{i.msg}</div>
          </li>
        {:else}
          <li>No issues — nice work.</li>
        {/each}
      </ul>
    </div>

    <div class="panel">
      <h3>
        {@html icon.sparkle.replace("<svg", '<svg width="16" height="16" style="vertical-align:-2px;color:var(--agent)"')} AI assistant
      </h3>
      {#if !data.ai.configured}
        <p class="small muted">Connect a model — your own API key, OpenRouter, or a local Ollama — to draft and improve lessons.</p>
        <a class="btn sm" href="/settings/ai">Connect a model</a>
      {:else}
        <p class="small muted" style="margin-top:0">
          Using <b>{data.ai.model}</b>
          .
          <a href="/settings/ai">Change</a>
        </p>
        {#if aiError}<div class="form-error" role="alert">{aiError}</div>{/if}
        <label class="field">
          New lesson in
          <select class="input" bind:value={aiUnit}>
            {#each content.units as u (u.id)}<option value={u.id}>{u.title}</option>{/each}
          </select>
        </label>
        <label class="field">
          What should it teach?
          <textarea
            class="input"
            rows="3"
            bind:value={aiInstructions}
            placeholder="e.g. Ordering food at a restaurant; include listening and word-bank exercises."></textarea>
        </label>
        {#if showSource}
          <label class="field">
            Source material (optional)
            <textarea class="input" rows="5" bind:value={aiSource} placeholder="Paste notes, a transcript, an article…"></textarea>
            <span class="hint">{aiSource.length.toLocaleString()} / 50,000 characters</span>
          </label>
        {:else}
          <button class="btn ghost sm" style="margin-bottom:0.6rem" onclick={() => (showSource = true)}>+ Add source material</button>
        {/if}
        <button class="btn sm wide" disabled={aiBusy || !aiUnit} onclick={() => ai("draft")}>
          {aiBusy ? "Writing… (up to a minute)" : "Draft lesson"}
        </button>
        {#if selected}
          <hr style="border:0;border-top:1px solid var(--line);margin:1rem 0" />
          <label class="field">
            Improve “{selected.lesson.title}”
            <textarea
              class="input"
              rows="2"
              bind:value={reviseInstructions}
              placeholder="Optional: e.g. add more accepted answers, make step 3 easier"></textarea>
          </label>
          <button class="btn ghost sm wide" disabled={aiBusy} onclick={() => ai("revise")}>
            {aiBusy ? "Working…" : "Fix issues & improve"}
          </button>
        {/if}
        <p class="small muted">AI output goes through the same quality checks. Review it before publishing.</p>
      {/if}
    </div>
  </aside>
</div>
