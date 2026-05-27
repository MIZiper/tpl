<script lang="ts">
  import { p } from "../../router";
  import { onMount } from "svelte";
  import { riskStore } from "../../stores/risks";
  import type { Risk } from "../../types";

  let items: Risk[] = $state([]);
  let loading = $state(false);

  onMount(async () => {
    await riskStore.load();
    riskStore.subscribe((s) => {
      items = s.items;
      loading = s.loading;
    });
  });
</script>

<div>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h2>Risk Blocks</h2>
    <a href={p("/blocks/risks/new")} class="btn btn-primary">New Risk</a>
  </div>

  {#if loading}
    <p>Loading...</p>
  {:else if items.length === 0}
    <p class="text-muted">No risk blocks defined yet.</p>
  {:else}
    <table class="table table-striped">
      <thead>
        <tr>
          <th>Title</th>
          <th>Scope</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each items as risk}
          <tr>
            <td>{risk.title}</td>
            <td>{risk.scope || "-"}</td>
            <td>
              <a href={p("/blocks/risks/:id", { params: { id: risk.id } })} class="btn btn-sm btn-outline-secondary">Edit</a>
              <button class="btn btn-sm btn-outline-danger ms-1" onclick={() => riskStore.remove(risk.id)}>Delete</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
