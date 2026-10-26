<script lang="ts">
  import { enhance } from "$app/forms";
  let { data, form } = $props();
</script>

<svelte:head><title>Admin · {data.instanceName}</title></svelte:head>

<h1>Moderation</h1>
{#if form?.error}<div class="form-error">{form.error}</div>{/if}

<nav class="tabs-row" aria-label="Report status">
  {#each ["open", "resolved", "dismissed"] as s (s)}<a href="?status={s}" class:active={data.status === s}>
      {s[0].toUpperCase() + s.slice(1)} reports
    </a>{/each}
</nav>

<div class="card" style="margin-bottom:2rem">
  <table class="list">
    <thead>
      <tr>
        <th>Course</th>
        <th>Reason</th>
        <th>Details</th>
        <th>Reported</th>
        <th>{data.status === "open" ? "Action" : "Resolution"}</th>
      </tr>
    </thead>
    <tbody>
      {#each data.reports as r (r.id)}
        <tr>
          <td>
            <a href="/course/{r.courseId}"><b>{r.courseTitle}</b></a>
            <br />
            <span class="small muted">by {r.ownerName} · {r.courseStatus}</span>
          </td>
          <td>{data.reasons[r.reason as keyof typeof data.reasons] ?? r.reason}</td>
          <td class="small">{r.details || "—"}</td>
          <td class="small">{new Date(r.createdAt).toLocaleString()}</td>
          <td>
            {#if data.status === "open"}
              <form method="POST" action="?/resolve" use:enhance class="row">
                <input type="hidden" name="id" value={r.id} />
                <select class="input" name="action" style="width:auto">
                  <option value="dismiss">Dismiss</option>
                  <option value="remove_course">Remove course</option>
                  {#if r.courseStatus === "removed"}<option value="restore_course">Restore course</option>{/if}
                  <option value="ban_owner">Remove + ban creator</option>
                </select>
                <input class="input" name="note" placeholder="Note (optional)" style="width:140px" />
                <button class="btn sm">Apply</button>
              </form>
            {:else}
              <span class="small">{r.resolution}</span>
            {/if}
          </td>
        </tr>
      {:else}
        <tr><td colspan="5" class="muted">No {data.status} reports.</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<h2>Users</h2>
<form class="row" method="GET" style="margin-bottom:0.8rem">
  <input class="input search" name="q" value={data.q} placeholder="Search name or email" />
  <button class="btn ghost sm">Search</button>
</form>
<div class="card">
  <table class="list">
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Role</th>
        <th>XP</th>
        <th>Joined</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each data.users as u (u.id)}
        <tr>
          <td>
            <b>{u.name}</b>
            {#if u.banned}&nbsp;
              <span class="badge Draft">banned</span>{/if}
          </td>
          <td class="small">{u.email}</td>
          <td>
            {#if data.isAdmin && u.id !== data.user?.id}
              <form method="POST" action="?/role" use:enhance>
                <input type="hidden" name="id" value={u.id} />
                <select class="input" name="role" value={u.role} style="width:auto" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
                  <option value="user">user</option>
                  <option value="moderator">moderator</option>
                  <option value="admin">admin</option>
                </select>
              </form>
            {:else}{u.role}{/if}
          </td>
          <td>{u.xp}</td>
          <td class="small">{new Date(u.createdAt).toLocaleDateString()}</td>
          <td>
            {#if u.id !== data.user?.id && u.role !== "admin"}
              <form method="POST" action="?/ban" use:enhance>
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="banned" value={u.banned ? "0" : "1"} />
                <button class="btn ghost sm">{u.banned ? "Unban" : "Ban"}</button>
              </form>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
