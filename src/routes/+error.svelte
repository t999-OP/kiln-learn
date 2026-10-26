<script lang="ts">
  import { page } from "$app/state";
</script>

<svelte:head><title>{page.status} · Kiln</title></svelte:head>

<div class="empty" style="padding-top:4rem">
  <div style="font-size:3rem" aria-hidden="true">{page.status === 404 ? "🔍" : page.status === 403 ? "🔒" : "🔥"}</div>
  <h1>{page.status === 404 ? "Not found" : page.status === 403 ? "No access" : "Something went wrong"}</h1>
  <p>{page.error?.message}</p>
  <div class="row" style="justify-content:center">
    <a class="btn" href="/">Back to courses</a>
    {#if page.status === 401 || page.status === 403}<a class="btn ghost" href="/login?next={encodeURIComponent(page.url.pathname)}">
        Sign in
      </a>{/if}
  </div>
</div>
