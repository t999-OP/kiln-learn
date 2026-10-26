<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  let { form, data } = $props();
  let busy = $state(false);
</script>

<svelte:head><title>Sign in · {data.instanceName}</title></svelte:head>

<section class="auth">
  <h1>Welcome back</h1>
  <form
    class="card"
    method="POST"
    use:enhance={() => {
      busy = true;
      return async ({ update }) => {
        await update();
        busy = false;
      };
    }}
  >
    {#if form?.error}<div class="form-error" role="alert">{form.error}</div>{/if}
    <label class="field">
      Email
      <input class="input" name="email" type="email" autocomplete="email" required value={form?.email ?? ""} />
    </label>
    <label class="field">
      Password
      <input class="input" name="password" type="password" autocomplete="current-password" required />
    </label>
    <button class="btn wide" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
  </form>
  {#if data.registration === "open"}
    <p class="muted" style="text-align:center">
      New here? <a href="/signup{page.url.search}">Create an account</a>
    </p>
  {/if}
</section>
