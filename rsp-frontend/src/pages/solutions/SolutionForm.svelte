<script lang="ts">
  import { onMount } from "svelte";
  import { p, route, navigate } from "../../router";
  import { solutionStore } from "../../stores/solutions";
  import { solutionsApi, risksApi } from "../../lib/api";
  import type { Risk, SolutionStep } from "../../types";

  let id: string | null = $derived(route.params.id ?? null);
  let loading = $state(false);

  let code = $state("");
  let title = $state("");
  let description = $state("");
  let testMethod = $state("");
  let costImpact = $state("");
  let weightImpact = $state("");
  let complexity = $state<number | null>(null);
  let verified = $state(false);

  let steps: SolutionStep[] = $state([]);
  let linkedRisks: Risk[] = $state([]);
  let allRisks: Risk[] = $state([]);
  let selectedRiskId = $state("");
  let newStepTitle = $state("");

  onMount(async () => {
    try {
      allRisks = await risksApi.list();
    } catch {}

    if (id) {
      loading = true;
      try {
        const sol = await solutionsApi.get(id);
        code = sol.code ?? "";
        title = sol.title;
        description = sol.description ?? "";
        testMethod = sol.test_method ?? "";
        costImpact = sol.cost_impact ?? "";
        weightImpact = sol.weight_impact ?? "";
        complexity = sol.complexity_level;
        verified = sol.verified;
        steps = sol.steps;
        linkedRisks = sol.risks;
      } catch {
        title = "";
      } finally {
        loading = false;
      }
    }
  });

  async function submit() {
    if (!title.trim()) return;
    const data = {
      code: code || null,
      title,
      description: description || null,
      test_method: testMethod || null,
      cost_impact: costImpact || null,
      weight_impact: weightImpact || null,
      complexity_level: complexity,
      verified,
    };
    if (id) {
      await solutionStore.update(id, data);
    } else {
      const created = await solutionStore.create(data);
      if (created) id = created.id;
    }
    navigate("/blocks/solutions");
  }

  async function addStep() {
    if (!id || !newStepTitle.trim()) return;
    const step = await solutionsApi.steps.create(id, {
      order_index: steps.length,
      title: newStepTitle.trim(),
      duration_estimate_minutes: 60,
    });
    steps = [...steps, step];
    newStepTitle = "";
  }

  async function removeStep(stepId: string) {
    if (!id) return;
    await solutionsApi.steps.delete(id, stepId);
    steps = steps.filter((s) => s.id !== stepId);
  }

  async function linkRisk() {
    if (!id || !selectedRiskId) return;
    await solutionsApi.risks.link(id, selectedRiskId, 5);
    const risk = allRisks.find((r) => r.id === selectedRiskId);
    if (risk) linkedRisks = [...linkedRisks, risk];
    selectedRiskId = "";
  }

  async function unlinkRisk(riskId: string) {
    if (!id) return;
    await solutionsApi.risks.unlink(id, riskId);
    linkedRisks = linkedRisks.filter((r) => r.id !== riskId);
  }
</script>

<div class="row">
  <div class="col-md-8">
    <h2>{id ? "Edit Solution" : "New Solution"}</h2>
    {#if loading}
      <p>Loading...</p>
    {:else}
      <div class="row mb-3">
        <div class="col-md-4">
          <label class="form-label">Code</label>
          <input class="form-control" bind:value={code} placeholder="e.g. SOL-001" />
        </div>
        <div class="col-md-8">
          <label class="form-label">Title *</label>
          <input class="form-control" bind:value={title} placeholder="Solution title" />
        </div>
      </div>
      <div class="mb-3">
        <label class="form-label">Description</label>
        <textarea class="form-control" bind:value={description} rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label class="form-label">Test Method</label>
        <textarea class="form-control" bind:value={testMethod} rows="2"></textarea>
      </div>

      <h5 class="mt-4">Impact Assessment</h5>
      <div class="row mb-3">
        <div class="col-md-3">
          <label class="form-label">Cost Impact</label>
          <input class="form-control" bind:value={costImpact} placeholder="e.g. Low / $500" />
        </div>
        <div class="col-md-3">
          <label class="form-label">Weight Impact</label>
          <input class="form-control" bind:value={weightImpact} placeholder="e.g. +50g" />
        </div>
        <div class="col-md-3">
          <label class="form-label">Complexity (1-5)</label>
          <input class="form-control" type="number" min="1" max="5" bind:value={complexity} />
        </div>
        <div class="col-md-3 d-flex align-items-end mb-2">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" bind:checked={verified} id="verified" />
            <label class="form-check-label" for="verified">Verified</label>
          </div>
        </div>
      </div>

      <button class="btn btn-primary" onclick={submit} disabled={!title.trim()}>Save</button>
      <a href={p("/blocks/solutions")} class="btn btn-secondary ms-2">Cancel</a>
    {/if}
  </div>

  {#if id}
    <div class="col-md-4">
      <div class="card mb-3">
        <div class="card-header"><strong>Steps</strong></div>
        <div class="card-body">
          <ol class="list-group list-group-numbered mb-2">
            {#each steps as step}
              <li class="list-group-item d-flex justify-content-between align-items-center">
                <div>
                  <div>{step.title}</div>
                  <small class="text-muted">~{step.duration_estimate_minutes} min</small>
                </div>
                <button class="btn btn-sm btn-outline-danger" onclick={() => removeStep(step.id)}>×</button>
              </li>
            {/each}
          </ol>
          <div class="input-group">
            <input class="form-control form-control-sm" placeholder="New step title" bind:value={newStepTitle} />
            <button class="btn btn-sm btn-outline-primary" onclick={addStep}>Add</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><strong>Covered Risks</strong></div>
        <div class="card-body">
          <ul class="list-group mb-2">
            {#each linkedRisks as risk}
              <li class="list-group-item d-flex justify-content-between align-items-center">
                {risk.title}
                <button class="btn btn-sm btn-outline-danger" onclick={() => unlinkRisk(risk.id)}>×</button>
              </li>
            {/each}
          </ul>
          <div class="input-group">
            <select class="form-select form-select-sm" bind:value={selectedRiskId}>
              <option value="">-- Select risk --</option>
              {#each allRisks.filter((r) => !linkedRisks.find((lr) => lr.id === r.id)) as risk}
                <option value={risk.id}>{risk.title}</option>
              {/each}
            </select>
            <button class="btn btn-sm btn-outline-primary" onclick={linkRisk}>Link</button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
