<script lang="ts">
  import { onMount } from "svelte";
  import { p } from "../../router";
  import { riskStore } from "../../stores/risks";
  import { riskCategoriesApi } from "../../lib/api";
  import type { Risk, RiskCategory } from "../../types";

  let risks: Risk[] = $state([]);
  let categories: RiskCategory[] = $state([]);
  let loading = $state(true);
  let search = $state("");
  let categoryFilter = $state("");

  onMount(() => {
    riskCategoriesApi.list().then((c) => (categories = c)).catch(() => {});
    riskStore.load().then(() => {
      return riskStore.subscribe((s) => {
        risks = s.items;
        loading = s.loading;
      });
    });
  });

  function reload() {
    riskStore.load(search || undefined, categoryFilter || undefined);
  }

  async function remove(id: string) {
    await riskStore.remove(id);
  }

  function catName(id: string | null) {
    return categories.find((c) => c.id === id)?.name ?? "";
  }
</script>

<div>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h2>Risks</h2>
    <a href={p("/blocks/risks/new")} class="btn btn-primary">+ New Risk</a>
  </div>

  <div class="row mb-3">
    <div class="col-md-4">
      <input class="form-control" placeholder="Search..." bind:value={search} oninput={reload} />
    </div>
    <div class="col-md-3">
      <select class="form-select" bind:value={categoryFilter} onchange={reload}>
        <option value="">All Categories</option>
        {#each categories as cat}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if loading}
    <p>Loading...</p>
  {:else if risks.length === 0}
    <p class="text-muted">No risks yet.</p>
  {:else}
    <div class="table-responsive">
      <table class="table table-hover table-sm align-middle">
        <thead>
          <tr>
            <th>Code</th>
            <th>Title</th>
            <th>Category</th>
            <th>Severity</th>
            <th>Occurrence</th>
            <th>Detection</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each risks as risk}
            <tr>
              <td>{risk.code || "—"}</td>
              <td>
                <a href={p("/blocks/risks/:id", { params: { id: risk.id } })}>{risk.title}</a>
              </td>
              <td>{catName(risk.category_id) || "—"}</td>
              <td>{risk.default_severity ?? "—"}</td>
              <td>{risk.default_occurrence ?? "—"}</td>
              <td>{risk.default_detection ?? "—"}</td>
              <td>
                <a href={p("/blocks/risks/:id", { params: { id: risk.id } })} class="btn btn-sm btn-outline-primary">Edit</a>
                <button class="btn btn-sm btn-outline-danger" onclick={() => remove(risk.id)}>Delete</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
