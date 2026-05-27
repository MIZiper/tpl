<script lang="ts">
  import { onMount } from "svelte";
  import { p, route } from "../../router";
  import { projectStore } from "../../stores/projects";
  import { projectsApi } from "../../lib/api";
  import type { ProjectWithDetails, Solution, Risk } from "../../types";

  let id: string = $derived(route.params.id ?? "");
  let project = $state<ProjectWithDetails | null>(null);
  let loading = $state(true);
  let error = $state("");
  let showAddRisk = $state(false);
  let selectedRiskId = $state("");
  let allRisks: Risk[] = $state([]);
  let allSolutions: Solution[] = $state([]);
  let showRecommendations = $state(false);
  let recommendations: Solution[] = $state([]);

  async function loadProject() {
    loading = true;
    try {
      project = await projectsApi.get(id);
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    await loadProject();
    try {
      const [r, s] = await Promise.all([
        fetch("/api/risks").then((r) => r.json()),
        fetch("/api/solutions").then((r) => r.json()),
      ]);
      allRisks = r;
      allSolutions = s;
    } catch {}
  });

  async function addRisk() {
    if (!selectedRiskId) return;
    await projectsApi.risks.add(id, { risk_id: selectedRiskId });
    showAddRisk = false;
    selectedRiskId = "";
    try {
      const recs = await projectsApi.recommendations([selectedRiskId]);
      recommendations = recs;
      showRecommendations = true;
    } catch {}
    await loadProject();
  }

  async function removeRisk(riskId: string) {
    await projectsApi.risks.remove(id, riskId);
    await loadProject();
  }

  async function addSolution(solutionId: string) {
    await projectsApi.solutions.add(id, solutionId);
    showRecommendations = false;
    recommendations = [];
    await loadProject();
  }

  async function removeSolution(solutionId: string) {
    await projectsApi.solutions.remove(id, solutionId);
    await loadProject();
  }

  let coverageRate = $derived(project ? project.coverage_rate : 0);
  let coveredCount = $derived(project ? project.risks.filter((r) => r.covered_by_previous || r.covering_solution_id).length : 0);
  let totalRisks = $derived(project ? project.risks.length : 0);

  async function handleAddManualSolution() {
    if (!selectedRiskId) return;
    await addSolution(selectedRiskId);
    selectedRiskId = "";
  }
</script>

<div>
  {#if loading}
    <p>Loading...</p>
  {:else if error}
    <div class="alert alert-danger">{error}</div>
  {:else if project}
    <h2>{project.name}</h2>
    <p class="text-muted">{project.description}</p>

    {#if totalRisks > 0}
      <div class="mb-3">
        <label class="form-label">Risk Coverage: {coveredCount} / {totalRisks} ({Math.round(coverageRate * 100)}%)</label>
        <div class="progress">
          <div
            class="progress-bar"
            role="progressbar"
            style="width: {coverageRate * 100}%"
            aria-valuenow={coverageRate * 100}
            aria-valuemin="0"
            aria-valuemax="100"
          ></div>
        </div>
      </div>
    {/if}

    <div class="row">
      <div class="col-md-6">
        <div class="card mb-3">
          <div class="card-header d-flex justify-content-between align-items-center">
            <strong>Risks</strong>
            <button class="btn btn-sm btn-outline-primary" onclick={() => (showAddRisk = !showAddRisk)}>
              {showAddRisk ? "Cancel" : "+ Add Risk"}
            </button>
          </div>
          <div class="card-body">
            {#if showAddRisk}
              <div class="input-group mb-2">
                <select class="form-select" bind:value={selectedRiskId}>
                  <option value="">-- Select Risk --</option>
                  {#each allRisks.filter((r) => !project?.risks.find((pr) => pr.risk_id === r.id)) as r}
                    <option value={r.id}>{r.title}</option>
                  {/each}
                </select>
                <button class="btn btn-primary" onclick={addRisk} disabled={!selectedRiskId}>Add</button>
              </div>
            {/if}
            {#if project.risks.length === 0}
              <p class="text-muted">No risks added.</p>
            {:else}
              <ul class="list-group">
                {#each project.risks as pr (pr.id)}
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                      {pr.risk?.title || pr.risk_id}
                      {#if pr.covered_by_previous}
                        <span class="badge bg-secondary ms-1">Covered by previous</span>
                      {/if}
                      {#if pr.covering_solution_id}
                        <span class="badge bg-success ms-1">Covered</span>
                      {/if}
                    </div>
                    <button class="btn btn-sm btn-outline-danger" onclick={() => removeRisk(pr.risk_id)}>Remove</button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>

        {#if showRecommendations && recommendations.length > 0}
          <div class="card mb-3 border-info">
            <div class="card-header bg-info text-white">Recommended Solutions</div>
            <div class="card-body">
              <ul class="list-group">
                {#each recommendations as sol}
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    {sol.title}
                    {#if !project.solutions.find((s) => s.id === sol.id)}
                      <button class="btn btn-sm btn-success" onclick={() => addSolution(sol.id)}>Adopt</button>
                    {:else}
                      <span class="badge bg-secondary">Already adopted</span>
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        {/if}
      </div>

      <div class="col-md-6">
        <div class="card mb-3">
          <div class="card-header"><strong>Solutions</strong></div>
          <div class="card-body">
            {#if project.solutions.length === 0}
              <p class="text-muted">No solutions adopted.</p>
            {:else}
              <ul class="list-group">
                {#each project.solutions as sol (sol.id)}
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    {sol.title}
                    <button class="btn btn-sm btn-outline-danger" onclick={() => removeSolution(sol.id)}>Remove</button>
                  </li>
                {/each}
              </ul>
            {/if}
            <div class="mt-2">
              <label class="form-label">Add Solution:</label>
              <div class="input-group">
                <select class="form-select" bind:value={selectedRiskId}>
                  <option value="">-- Select --</option>
                  {#each allSolutions.filter((s) => !project?.solutions.find((ps) => ps.id === s.id)) as s}
                    <option value={s.id}>{s.title}</option>
                  {/each}
                </select>
                <button class="btn btn-outline-primary" onclick={handleAddManualSolution} disabled={!selectedRiskId}>Add</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-3">
      <a href={p("/projects/:id/plan", { params: { id: project.id } })} class="btn btn-primary">Open Plan</a>
      <a href={p("/projects/:id/logging", { params: { id: project.id } })} class="btn btn-success ms-2">Start Logging</a>
    </div>
  {/if}
</div>
