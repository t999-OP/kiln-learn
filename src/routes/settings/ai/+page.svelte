<script lang="ts">
  import { enhance } from "$app/forms";
  let { data, form } = $props();
  type P = keyof typeof data.providers;
  const status = $derived(data.status);
  let provider = $state<P>("anthropic");
  let model = $state("");
  let baseUrl = $state("");
  $effect.pre(() => {
    if (status.configured) {
      provider = status.provider as P;
      model = status.model;
      baseUrl = status.baseUrl ?? "";
    }
  });
  const info = $derived(data.providers[provider]);
  const providerChoices = $derived(Object.entries(data.providers).filter(([, p]) => data.allowCustomUrl || !p.needsUrl));
  let busy = $state(false);
  const submit = () => {
    busy = true;
    return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      busy = false;
    };
  };
</script>

<svelte:head><title>AI models · {data.instanceName}</title></svelte:head>

<p class="muted">
  Bring your own model to draft and improve lessons in the Studio. Use your own API key for a hosted provider{data.allowCustomUrl
    ? ", or a free local model through Ollama"
    : ""}. Your key is encrypted on this server and only used for your requests.
</p>

{#if form?.error}<div class="form-error" role="alert">{form.error}</div>{/if}
{#if form && "saved" in form}<div class="form-ok">Saved. Use “Test connection” to check it works.</div>{/if}
{#if form && "tested" in form}<div class="form-ok">{form.tested}</div>{/if}

<form class="card" method="POST" action="?/save" use:enhance={submit} style="margin-bottom:1rem">
  <label class="field">
    Provider
    <select class="input" name="provider" bind:value={provider} onchange={() => (model = data.providers[provider].defaultModel)}>
      {#each providerChoices as [id, p] (id)}<option value={id}>{p.label}</option>{/each}
    </select>
  </label>
  <label class="field">
    Model
    <input
      class="input"
      name="model"
      bind:value={model}
      list="models"
      required
      placeholder={provider === "openrouter" ? "e.g. provider/model-name" : provider === "ollama" ? "e.g. a model you've pulled" : ""}
    />
    <datalist id="models">
      {#each info.models as m (m)}<option value={m}></option>{/each}
    </datalist>
    {#if provider === "anthropic"}<span class="hint">claude-opus-5 gives the best lessons; claude-haiku-4-5 is the cheapest.</span>{/if}
  </label>
  {#if info.needsUrl || provider === "openai"}
    <label class="field">
      Server URL{info.needsUrl ? "" : " (optional)"}
      <input class="input" name="baseUrl" bind:value={baseUrl} placeholder={"defaultUrl" in info ? info.defaultUrl : "https://…/v1"} />
    </label>
  {/if}
  <label class="field">
    API key{info.needsKey ? "" : " (optional)"}
    <input
      class="input"
      name="apiKey"
      type="password"
      autocomplete="off"
      placeholder={status.configured && status.hasKey && status.provider === provider ? "•••••••• (saved — leave blank to keep)" : ""}
    />
  </label>
  <div class="row">
    <button class="btn sm" disabled={busy}>Save</button>
  </div>
</form>

{#if status.configured}
  <div class="row">
    <form method="POST" action="?/test" use:enhance={submit}>
      <button class="btn ghost sm" disabled={busy}>{busy ? "Testing…" : "Test connection"}</button>
    </form>
    <form method="POST" action="?/remove" use:enhance><button class="btn ghost sm">Remove</button></form>
  </div>
{/if}
