<script lang="ts">
  import { onMount } from "svelte";
  import { p, navigate, route } from "../../router";
  import { solutionStore } from "../../stores/solutions";
  import { solutionsApi } from "../../lib/api";
  import type { Solution, SolutionStep, SolutionWithDetails, Risk } from "../../types";

  let id: string = $derived(route.params.id ?? "");
  let isNew = $derived(!id);

  let form: Partial<Solution> = $state({ title: "", description: "", test_method: "", equipment: [] });
  let risks: Risk[] = $state([]);
  let allRisks: Risk[] = $state([]);

  let saving = $state(false);
  let error = $state("");
  let loadingDetails = $state(false);
  let showRiskPicker = $state(false);
  let selectedRiskId = $state("");

  onMount(async () => {
    if (!isNew) {
      loadingDetails = true;
      try {
        const detail = await solutionStore.get(id);
        if (detail) {
          form = {
            title: detail.title,
            description: detail.description,
            test_method: detail.test_method,
            equipment: detail.equipment,
          };
          risks = detail.risks;
        }
      } finally {
        loadingDetails = false;
      }
    }
    try {
      const resp = await fetch("/api/risks");
      if (resp.ok) allRisks = await resp.json();
    } catch {}
  });

  async function handleSave(e: Event) {
    e.preventDefault();
    saving = true;
    error = "";
    try {
      let result: Solution | null;
      if (isNew) {
        result = await solutionStore.create(form);
      } else {
        result = await solutionStore.update(id, form);
      }
      if (result) {
        navigate("/blocks/solutions");
      }
    } catch (e) {
      error = String(e);
    } finally {
      saving = false;
    }
  }

  async function linkRisk() {
    if (!selectedRiskId || !id) return;
    await solutionsApi.risks.link(id, selectedRiskId);
    showRiskPicker = false;
    selectedRiskId = "";
    const detail = await solutionStore.get(id);
    if (detail) risks = detail.risks;
  }

  async function unlinkRisk(riskId: string) {
    if (!id) return;
    await solutionsApi.risks.unlink(id, riskId);
    const detail = await solutionStore.get(id);
    if (detail) risks = detail.risks;
  }
</script>

<div>
  <h2>{isNew ? "New Solution" : "Edit Solution"}</h2>

  {#if error}
    <div class="alert alert-danger">{error}</div>
  {/if}

  <form onsubmit={handleSave}>
    <div class="mb-3">
      <label class="form-label" for="sol-title">Title</label>
      <input type="text" class="form-control" id="sol-title" bind:value={form.title} required />
    </div>
    <div class="mb-3">
      <label class="form-label" for="sol-desc">Description</label>
      <textarea class="form-control" id="sol-desc" bind:value={form.description} rows={3}></textarea>
    </div>
    <div class="mb-3">
      <label class="form-label" for="sol-method">Test Method</label>
      <textarea class="form-control" id="sol-method" bind:value={form.test_method} rows={2}></textarea>
    </div>
    <button type="submit" class="btn btn-primary" disabled={saving}>
      {saving ? "Saving..." : "Save"}
    </button>
    <a href={p("/blocks/solutions")} class="btn btn-secondary ms-2">Cancel</a>
  </form>

  {#if !isNew}
    <hr />
    <h4>Covered Risks</h4>
    {#if risks.length === 0}
      <p class="text-muted">No risks linked.</p>
    {:else}
      <ul class="list-group mb-2">
        {#each risks as risk}
          <li class="list-group-item d-flex justify-content-between align-items-center">
            {risk.title}
            <button class="btn btn-sm btn-outline-danger" onclick={() => unlinkRisk(risk.id)}>Unlink</button>
          </li>
        {/each}
      </ul>
    {/if}
    <button class="btn btn-sm btn-outline-primary" onclick={() => (showRiskPicker = !showRiskPicker)}>
      {showRiskPicker ? "Cancel" : "+ Link Risk"}
    </button>
    {#if showRiskPicker}
      <div class="input-group mt-2">
        <select class="form-select" bind:value={selectedRiskId}>
          <option value="">-- Select Risk --</option>
          {#each allRisks.filter((r) => !risks.find((lr) => lr.id === r.id)) as r}
            <option value={r.id}>{r.title}</option>
          {/each}
        </select>
        <button class="btn btn-primary" onclick={linkRisk} disabled={!selectedRiskId}>Link</button>
      </div>
    {/if}
  {/if}
</div>
