<script lang="ts">
  import "../app.css";
  import { navigating, page } from "$app/state";
  import { onMount } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { icon } from "#lib/client/icons.ts";
  import { flushPending } from "#lib/client/progress-queue.ts";

  let { data, children } = $props();
  let menuOpen = $state(false);
  const section = $derived(page.url.pathname.split("/")[1] || "learn");
  const playing = $derived(/^\/course\/[^/]+\/play\//.test(page.url.pathname));
  const initials = $derived((data.user?.name ?? "?").trim().slice(0, 1).toUpperCase());
  const moderator = $derived(data.user?.role === "moderator" || data.user?.role === "admin");

  // Sync lesson results that were finished offline.
  onMount(() => {
    const sync = async () => (await flushPending()) > 0 && invalidateAll();
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  });
</script>

<svelte:head>
  <title>{data.instanceName} — interactive lessons for everything</title>
  <meta name="description" content="Free, open interactive lessons — languages, science, math and more — made by people and AI agents." />
  <meta property="og:site_name" content={data.instanceName} />
  <meta name="theme-color" content="#e8590c" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
</svelte:head>

{#if navigating.to}<div class="nav-progress" role="progressbar" aria-label="Loading"></div>{/if}
<a class="skip-link" href="#main">Skip to content</a>

{#if !playing}
  <header class="topbar">
    <a class="logo" href="/">{@html icon.logo}{data.instanceName}</a>
    <nav class="nav" aria-label="Main">
      <a href="/" class:active={section === "learn" || section === "course"}>Learn</a>
      <a href="/studio" class:active={section === "studio"}>Studio</a>
      <a href="/agents" class:active={section === "agents"}>Agents</a>
      {#if moderator}<a href="/admin" class:active={section === "admin"}>Admin</a>{/if}
    </nav>
    <div class="stats">
      {#if data.user}
        <span class="stat" title="Day streak">{@html icon.flame}{data.user.streak}</span>
        <span class="stat" title="Total XP">{@html icon.bolt}{data.user.xp}</span>
      {/if}
      {#if data.user?.guest}
        <a class="btn ghost sm" href="/login?next={encodeURIComponent(page.url.pathname)}">Sign in</a>
        {#if data.registration === "open"}<a class="btn sm" href="/signup" title="Keep your progress on every device">Save progress</a>{/if}
      {:else if data.user}
        <div class="menu">
          <button class="avatar" aria-label="Account menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
            {initials}
          </button>
          {#if menuOpen}
            <div class="menu-pop" role="menu">
              <div class="small muted" style="padding:0.4rem 0.7rem">{data.user.email}</div>
              <a href="/u/{data.user.id}" onclick={() => (menuOpen = false)}>My profile</a>
              <a href="/studio" onclick={() => (menuOpen = false)}>My courses</a>
              <a href="/settings" onclick={() => (menuOpen = false)}>Settings</a>
              <a href="/settings/tokens" onclick={() => (menuOpen = false)}>Agent tokens</a>
              <a href="/settings/ai" onclick={() => (menuOpen = false)}>AI models</a>
              <form method="POST" action="/logout"><button type="submit">Sign out</button></form>
            </div>
          {/if}
        </div>
      {:else}
        <a class="btn ghost sm" href="/login?next={encodeURIComponent(page.url.pathname)}">Sign in</a>
        {#if data.registration === "open"}<a class="btn sm" href="/signup">Sign up</a>{/if}
      {/if}
    </div>
  </header>
{/if}

<svelte:window
  onclick={(e) => menuOpen && !(e.target as HTMLElement).closest(".menu") && (menuOpen = false)}
  onkeydown={(e) => e.key === "Escape" && (menuOpen = false)}
/>

<main id="main">{@render children()}</main>

{#if !playing}
  <footer class="site-footer">
    <span>
      Courses are free and openly licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="license noopener">
        CC BY-SA 4.0
      </a>
      unless marked private.
    </span>
    <span class="spacer"></span>
    {#if data.legal.imprint}<a href={data.legal.imprint}>Imprint</a>{/if}
    {#if data.legal.privacy}<a href={data.legal.privacy}>Privacy</a>{/if}
    <a href={data.sourceUrl} rel="noopener">Source code (AGPL-3.0)</a>
  </footer>
{/if}
