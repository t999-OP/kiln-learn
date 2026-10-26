<script lang="ts">
  import { onMount } from "svelte";
  let { data } = $props();
  // Server-loaded history plus entries polled since then.
  let fresh = $state<typeof data.activity>([]);
  const feed = $derived([...fresh, ...data.activity].slice(0, 100));
  let tab = $state<"claude" | "json" | "http">("claude");
  let copied = $state("");

  const claudeCmd = $derived(`claude mcp add --transport http kiln ${data.mcpUrl} --header "Authorization: Bearer YOUR_TOKEN"`);
  const jsonCfg = $derived(
    JSON.stringify({ mcpServers: { kiln: { type: "http", url: data.mcpUrl, headers: { Authorization: "Bearer YOUR_TOKEN" } } } }, null, 2),
  );
  const prompt = `Use the kiln MCP server to create a beginner course "Italian at the Café" with 1 unit and 2 lessons (greetings, ordering). Use translate, listen, match and choice steps with plenty of accepted answers. Validate it and fix issues until it ranks Gold, but don't publish yet.`;

  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => (copied = what));
  const ago = (iso: string | Date) => {
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    return s < 60
      ? `${Math.max(s, 1)}s ago`
      : s < 3600
        ? `${Math.round(s / 60)}m ago`
        : s < 86400
          ? `${Math.round(s / 3600)}h ago`
          : `${Math.round(s / 86400)}d ago`;
  };

  onMount(() => {
    if (!data.user) return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      const res = await fetch(`/api/activity?after=${feed[0]?.id ?? 0}`);
      if (res.ok) {
        const rows = await res.json();
        if (rows.length) fresh = [...rows, ...fresh];
      }
    }, 4000);
    return () => clearInterval(t);
  });
</script>

<svelte:head><title>Agents · {data.instanceName}</title></svelte:head>

<section class="hero">
  <div>
    <h1>Bring any agent</h1>
    <p class="muted">
      {data.instanceName} speaks MCP. Connect Claude Code, Cursor, Kimi or a local model, ask it for a course, and review the result in the Studio.
      Every write goes through the quality pipeline.
    </p>
  </div>
</section>

<div class="two">
  <div>
    <div class="panel">
      <h2>1 · Create a token</h2>
      {#if data.user?.guest}
        <p class="small muted">Agents need an account to act as you.</p>
        <a class="btn sm" href="/signup?next=/settings/tokens">Create a free account</a>
      {:else if data.user}
        <p class="small muted">
          Agents act as you, with your permissions. {data.tokenCount
            ? `You have ${data.tokenCount} active token${data.tokenCount === 1 ? "" : "s"}.`
            : ""}
        </p>
        <a class="btn sm" href="/settings/tokens">Manage agent tokens</a>
      {:else}
        <p class="small muted">Sign in to create an agent token.</p>
        <a class="btn sm" href="/login?next=/agents">Sign in</a>
      {/if}
    </div>
    <div class="panel">
      <h2>2 · Connect</h2>
      <div class="tabs">
        <button class="chip" class:active={tab === "claude"} onclick={() => (tab = "claude")}>Claude Code</button>
        <button class="chip" class:active={tab === "json"} onclick={() => (tab = "json")}>Other MCP clients</button>
        <button class="chip" class:active={tab === "http"} onclick={() => (tab = "http")}>Endpoint</button>
      </div>
      {#if tab === "claude"}
        <pre class="code">{claudeCmd}</pre>
        <button class="btn ghost sm" onclick={() => copy(claudeCmd, "cmd")}>{copied === "cmd" ? "Copied" : "Copy command"}</button>
      {:else if tab === "json"}
        <p class="small muted">Cursor, Claude Desktop, OpenCode and most clients accept this in their MCP config:</p>
        <pre class="code">{jsonCfg}</pre>
      {:else}
        <p class="small muted">
          Streamable HTTP, authenticated with <code>Authorization: Bearer kiln_pat_…</code>
        </p>
        <pre class="code">{data.mcpUrl}</pre>
      {/if}
    </div>
    <div class="panel">
      <h2>3 · Ask for a course</h2>
      <pre class="code">{prompt}</pre>
      <button class="btn ghost sm" onclick={() => copy(prompt, "prompt")}>{copied === "prompt" ? "Copied" : "Copy prompt"}</button>
    </div>
  </div>

  <div class="panel sticky">
    <div class="row">
      <h2 style="margin:0">Your agent activity</h2>
      <span class="spacer"></span>
      {#if data.user}<span class="badge live">live</span>{/if}
    </div>
    <p class="small muted">Every change agents and the AI assistant make on your behalf.</p>
    <ul class="feed">
      {#each feed as a (a.id)}
        <li class:err={!a.ok}>
          <div class="row">
            <b>🤖 {a.agent}</b>
            <span class="spacer"></span>
            <span class="muted small">{ago(a.at)}</span>
          </div>
          <div>
            <code>{a.tool}</code>
            {a.summary}{#if a.courseId}&nbsp;· <a href="/studio/{a.courseId}">open</a>{/if}
          </div>
        </li>
      {:else}
        <li class="muted">
          {data.user ? "Nothing yet — connect an agent and ask it for a course." : "Sign in to see your agents' activity."}
        </li>
      {/each}
    </ul>
  </div>
</div>
