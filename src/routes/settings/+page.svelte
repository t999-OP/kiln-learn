<script lang="ts">
  import { enhance } from "$app/forms";
  let { data, form } = $props();
  const msg = (f: string) => (form?.form === f ? form : null);
</script>

<svelte:head><title>Settings · {data.instanceName}</title></svelte:head>

{#if data.user?.guest}
  <div class="card" style="margin-bottom:1rem">
    <h2>You're learning as a guest</h2>
    <p class="muted">
      Your progress ({data.user.xp} XP, {data.user.streak}-day streak) is stored for this browser only. Create a free account to keep it on
      every device — nothing is lost.
    </p>
    <div class="row">
      <a class="btn sm" href="/signup">Create account</a>
      <a class="btn ghost sm" href="/login">Sign in to an existing account</a>
    </div>
  </div>
  <div class="card" style="margin-bottom:1rem">
    <h2>Your data</h2>
    <p class="small muted">Download the progress {data.instanceName} stores for this guest profile.</p>
    <a class="btn ghost sm" href="/settings/export" download>Download my data (JSON)</a>
  </div>
  <form
    class="card"
    method="POST"
    action="?/deleteGuest"
    use:enhance={({ cancel }) => {
      if (!confirm("Delete your guest progress? This can't be undone.")) cancel();
    }}
  >
    <h2>Delete guest progress</h2>
    <p class="small muted">Removes your XP, streak and lesson progress from this server.</p>
    <button class="btn bad sm">Delete my progress</button>
  </form>
{:else}
  <form class="card" method="POST" action="?/profile" use:enhance style="margin-bottom:1rem">
    <h2>Profile</h2>
    {#if msg("profile")?.error}<div class="form-error">{msg("profile")?.error}</div>{:else if msg("profile")?.ok}<div class="form-ok">
        {msg("profile")?.ok}
      </div>{/if}
    <label class="field">
      Name
      <input class="input" name="name" value={data.user?.name} maxlength="60" required />
    </label>
    <label class="field">
      Email
      <input class="input" value={data.user?.email} disabled />
    </label>
    <button class="btn sm">Save</button>
  </form>

  <form class="card" method="POST" action="?/password" use:enhance style="margin-bottom:1rem">
    <h2>Password</h2>
    <p class="small muted">Changing your password signs you out on every device.</p>
    {#if msg("password")?.error}<div class="form-error">{msg("password")?.error}</div>{/if}
    <label class="field">
      Current password
      <input class="input" type="password" name="current" autocomplete="current-password" required />
    </label>
    <label class="field">
      New password
      <input class="input" type="password" name="next" autocomplete="new-password" minlength="10" required />
    </label>
    <label class="field">
      Repeat new password
      <input class="input" type="password" name="confirm" autocomplete="new-password" minlength="10" required />
    </label>
    <button class="btn sm">Change password</button>
  </form>

  <div class="card" style="margin-bottom:1rem">
    <h2>Your data</h2>
    <p class="small muted">
      Download everything {data.instanceName} stores about you: profile, progress, ratings, your courses and activity.
    </p>
    <a class="btn ghost sm" href="/settings/export" download>Download my data (JSON)</a>
  </div>

  <form
    class="card"
    method="POST"
    action="?/delete"
    use:enhance={({ cancel }) => {
      if (!confirm("Delete your account and all your courses permanently? This can't be undone.")) cancel();
    }}
  >
    <h2>Delete account</h2>
    <p class="small muted">Permanently deletes your account, progress and every course you created.</p>
    {#if msg("delete")?.error}<div class="form-error">{msg("delete")?.error}</div>{/if}
    <label class="field">
      Password
      <input class="input" type="password" name="password" autocomplete="current-password" required />
    </label>
    <button class="btn bad sm">Delete my account</button>
  </form>
{/if}
