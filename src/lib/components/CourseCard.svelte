<script lang="ts">
  import { icon, SUBJECT_ICON } from "#lib/client/icons.ts";
  import ProvenanceBadge from "./ProvenanceBadge.svelte";

  interface Props {
    course: {
      id: string;
      title: string;
      subject: string;
      description: string;
      qualityRank: string;
      qualityScore: number;
      provenance: { kind: "human" } | { kind: "agent"; agent: string; model?: string };
      ownerName: string;
      license: string;
      lessons: number;
      ratingAvg: number | null;
      ratingCount: number;
      status?: string;
      visibility?: string;
    };
    done?: number;
    href?: string;
  }
  let { course, done = 0, href = `/course/${course.id}` }: Props = $props();
</script>

<a class="card" {href}>
  <div class="top">
    <div class="subject-tile {course.subject}">{SUBJECT_ICON[course.subject] ?? "✨"}</div>
    <div>
      <h3 style="margin:0">{course.title}</h3>
      <div class="muted small">
        {course.lessons} lesson{course.lessons === 1 ? "" : "s"}{#if done}&nbsp;· {done} done{/if}
        {#if course.ratingCount}&nbsp;· <span class="stars">★</span>
          {course.ratingAvg?.toFixed(1)} ({course.ratingCount}){/if}
      </div>
    </div>
  </div>
  <p>{course.description}</p>
  <div class="meta">
    {#if course.status && course.status !== "published"}<span class="badge {course.status === 'removed' ? 'Draft' : ''}">
        {course.status}
      </span>{/if}
    {#if course.status !== "draft"}<span class="badge {course.qualityRank}" title="Quality score {course.qualityScore}/100">
        {@html icon.star.replace("<svg", '<svg width="12" height="12"')}
        {course.qualityRank} · {course.qualityScore}
      </span>{/if}
    <ProvenanceBadge provenance={course.provenance} owner={course.ownerName} />
    {#if course.visibility === "private"}<span class="badge">
        {@html icon.lock.replace("<svg", '<svg width="11" height="11"')} Private
      </span>{:else}<span class="badge">Free · {course.license === "CC-BY-SA-4.0" ? "CC BY-SA" : course.license}</span>{/if}
  </div>
</a>
