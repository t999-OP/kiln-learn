<script lang="ts">
  import { page } from "$app/state";
  let { children } = $props();
  const tabs = [
    ["/settings", "Profile"],
    ["/settings/tokens", "Agent tokens"],
    ["/settings/ai", "AI models"],
  ];
</script>

<div style="max-width:760px;margin:0 auto">
  <h1>Settings</h1>
  <nav class="tabs-row" aria-label="Settings" class:hidden={page.data.user?.guest}>
    {#each tabs as [href, label] (href)}<a {href} class:active={page.url.pathname === href}>{label}</a>{/each}
  </nav>
  {@render children()}
</div>
