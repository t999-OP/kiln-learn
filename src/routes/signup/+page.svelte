<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  let { form, data } = $props();
  let busy = $state(false);
</script>

<svelte:head><title>Create account · {data.instanceName}</title></svelte:head>

<section class="auth">
  {#if page.url.searchParams.get("next")?.startsWith("/studio")}
    <h1>Create courses for free</h1>
    <p class="muted">An account lets you build, publish and earn ratings for your own courses.</p>
  {:else}
    <h1>Keep your progress everywhere</h1>
    <p class="muted">Free forever. Sync your XP and streak across devices, rate courses, and publish your own.</p>
  {/if}
  {#if data.user?.guest}<p class="banner info">Your guest progress ({data.user.xp} XP, {data.user.streak}-day streak) will be kept.</p>{/if}
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
      Name
      <input class="input" name="name" autocomplete="name" required maxlength="60" value={form?.name ?? ""} />
    </label>
    <label class="field">
      Email
      <input class="input" name="email" type="email" autocomplete="email" required value={form?.email ?? ""} />
    </label>
    <label class="field">
      Password
      <input class="input" name="password" type="password" autocomplete="new-password" required minlength="10" />
      <span class="hint">At least 10 characters.</span>
    </label>
    <button class="btn wide" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
  </form>
  <p class="muted" style="text-align:center">
    Already have an account? <a href="/login{page.url.search}">Sign in</a>
    {#if data.user?.guest}
      — your guest progress will be added to it{/if}
  </p>
</section>
