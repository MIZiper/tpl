<script lang="ts">
  import { onMount } from "svelte";
  import { p } from "../../router";
  import { solutionStore } from "../../stores/solutions";
  import type { Solution } from "../../types";

  let solutions: Solution[] = $state([]);
  let loading = $state(true);
  let search = $state("");

  onMount(() => {
    solutionStore.load().then(() => {
      return solutionStore.subscribe((s) => {
        solutions = s.items;
        loading = s.loading;
      });
    });
  });

  function reload() {
    solutionStore.load(search || undefined);
  }

  async function remove(id: string) {
    await solutionStore.remove(id);
  }
</script>

<div>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h2>Solutions</h2>
    <a href={p("/blocks/solutions/new")} class="btn btn-primary">+ New Solution</a>
  </div>

  <div class="row mb-3">
    <div class="col-md-4">
      <input class="form-control" placeholder="Search..." bind:value={search} oninput={reload} />
    </div>
  </div>

  {#if loading}
    <p>Loading...</p>
  {:else if solutions.length === 0}
    <p class="text-muted">No solutions yet.</p>
  {:else}
    <div class="table-responsive">
      <table class="table table-hover table-sm align-middle">
        <thead>
          <tr>
            <th>Code</th>
            <th>Title</th>
            <th>Cost Impact</th>
            <th>Weight Impact</th>
            <th>Complexity</th>
            <th>Verified</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each solutions as sol}
            <tr>
              <td>{sol.code || "—"}</td>
              <td>
                <a href={p("/blocks/solutions/:id", { params: { id: sol.id } })}>{sol.title}</a>
              </td>
              <td>{sol.cost_impact || "—"}</td>
              <td>{sol.weight_impact || "—"}</td>
              <td>{sol.complexity_level ?? "—"}</td>
              <td>{sol.verified ? "Yes" : "No"}</td>
              <td>
                <a href={p("/blocks/solutions/:id", { params: { id: sol.id } })} class="btn btn-sm btn-outline-primary">Edit</a>
                <button class="btn btn-sm btn-outline-danger" onclick={() => remove(sol.id)}>Delete</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
