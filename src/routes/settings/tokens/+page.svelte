<script lang="ts">
  import { enhance } from "$app/forms";
  let { data, form } = $props();
  const created = $derived(form && "created" in form ? form.created : null);
  let copied = $state(false);
</script>

<svelte:head><title>Agent tokens · {data.instanceName}</title></svelte:head>

<p class="muted">
  Tokens let AI agents (Claude Code, Cursor, Kimi, local models…) create and edit courses as you over MCP. Treat them like passwords.
</p>

{#if created}
  <div class="card" style="margin-bottom:1rem;border-color:var(--good)">
    <h3>Token “{created.name}” created</h3>
    <p class="small">Copy it now — it won't be shown again.</p>
    <div class="token-reveal">{created.token}</div>
    <div class="row" style="margin-top:0.6rem">
      <button class="btn sm" onclick={() => navigator.clipboard.writeText(created.token).then(() => (copied = true))}>
        {copied ? "Copied" : "Copy token"}
      </button>
      <a class="btn ghost sm" href="/agents">How to connect an agent</a>
    </div>
  </div>
{/if}

<form
  class="card row"
  method="POST"
  action="?/create"
  use:enhance={() =>
    async ({ update }) => {
      copied = false;
      await update();
    }}
  style="margin-bottom:1rem"
>
  <label class="field" style="flex:1;margin:0">
    Name
    <input class="input" name="name" placeholder="e.g. Claude Code on my laptop" maxlength="60" required />
  </label>
  <button class="btn sm" style="align-self:flex-end">Create token</button>
</form>

<div class="card">
  <table class="list">
    <thead>
      <tr>
        <th>Name</th>
        <th>Token</th>
        <th>Created</th>
        <th>Last used</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each data.tokens as t (t.id)}
        <tr>
          <td><b>{t.name}</b></td>
          <td><code>{t.prefix}…</code></td>
          <td>{new Date(t.createdAt).toLocaleDateString()}</td>
          <td>{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "never"}</td>
          <td>
            <form
              method="POST"
              action="?/revoke"
              use:enhance={({ cancel }) => {
                if (!confirm(`Revoke "${t.name}"? Agents using it stop working immediately.`)) cancel();
              }}
            >
              <input type="hidden" name="id" value={t.id} />
              <button class="btn ghost sm">Revoke</button>
            </form>
          </td>
        </tr>
      {:else}
        <tr><td colspan="5" class="muted">No tokens yet.</td></tr>
      {/each}
    </tbody>
  </table>
</div>
