<script lang="ts">
  import { p } from "../../router";
  import { onMount } from "svelte";
  import { solutionStore } from "../../stores/solutions";
  import type { Solution } from "../../types";

  let items: Solution[] = $state([]);
  let loading = $state(false);

  onMount(async () => {
    await solutionStore.load();
    solutionStore.subscribe((s) => {
      items = s.items;
      loading = s.loading;
    });
  });
</script>

<div>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h2>Solution Blocks</h2>
    <a href={p("/blocks/solutions/new")} class="btn btn-primary">New Solution</a>
  </div>

  {#if loading}
    <p>Loading...</p>
  {:else if items.length === 0}
    <p class="text-muted">No solution blocks defined yet.</p>
  {:else}
    <table class="table table-striped">
      <thead>
        <tr>
          <th>Title</th>
          <th>Test Method</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each items as sol}
          <tr>
            <td>{sol.title}</td>
            <td>{sol.test_method || "-"}</td>
            <td>
              <a href={p("/blocks/solutions/:id", { params: { id: sol.id } })} class="btn btn-sm btn-outline-secondary">Edit</a>
              <button class="btn btn-sm btn-outline-danger ms-1" onclick={() => solutionStore.remove(sol.id)}>Delete</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
