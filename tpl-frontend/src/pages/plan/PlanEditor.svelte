<script lang="ts">
  import { onMount } from "svelte";
  import { p, route } from "../../router";
  import { planStore } from "../../stores/plan";
  import { planApi } from "../../lib/api";
  import type { PlanTree, PlanGroupWithChildren, PlanStep } from "../../types";

  let id: string = $derived(route.params.id ?? "");
  let tree = $state<PlanTree | null>(null);
  let loading = $state(false);
  let error = $state("");
  let selectedStep = $state<PlanStep | null>(null);
  let showAddGroup = $state(false);
  let showAddStep = $state(false);
  let newGroupTitle = $state("");
  let newStepTitle = $state("");
  let parentGroupId = $state<string | null>(null);

  async function loadPlan() {
    loading = true;
    try {
      tree = await planApi.get(id);
    } catch {
      error = "Failed to load plan.";
    } finally {
      loading = false;
    }
  }

  async function handleInitialize() {
    loading = true;
    try {
      tree = await planApi.initialize(id);
    } catch {
      error = "Failed to initialize plan.";
    } finally {
      loading = false;
    }
  }

  async function addGroup() {
    if (!newGroupTitle) return;
    await planApi.groups.create(id, { title: newGroupTitle, parent_group_id: parentGroupId, order_index: 0 });
    newGroupTitle = "";
    parentGroupId = null;
    showAddGroup = false;
    await loadPlan();
  }

  async function addStep() {
    if (!newStepTitle) return;
    await planApi.steps.create(id, { title: newStepTitle, group_id: parentGroupId, order_index: 0 });
    newStepTitle = "";
    parentGroupId = null;
    showAddStep = false;
    await loadPlan();
  }

  async function deleteStep(stepId: string) {
    await planApi.steps.delete(id, stepId);
    await loadPlan();
  }

  async function deleteGroup(groupId: string) {
    await planApi.groups.delete(id, groupId);
    await loadPlan();
  }

  function selectStep(step: PlanStep) {
    selectedStep = step;
    planStore.selectStep(step);
  }

  function hasContent(): boolean {
    if (!tree) return false;
    return tree.groups.length > 0 || tree.ungrouped_steps.length > 0;
  }

  onMount(() => {
    loadPlan();
  });
</script>

<div>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h2>Test Plan</h2>
    <div>
      {#if !hasContent()}
        <button class="btn btn-success me-2" onclick={handleInitialize} disabled={loading}>
          Initialize from Solutions
        </button>
      {/if}
      <button class="btn btn-outline-primary me-1" onclick={() => { showAddGroup = true; showAddStep = false; }}>
        + Group
      </button>
      <button class="btn btn-outline-primary" onclick={() => { showAddStep = true; showAddGroup = false; }}>
        + Step
      </button>
    </div>
  </div>

  {#if loading}
    <p>Loading...</p>
  {:else if error}
    <div class="alert alert-danger">{error}</div>
  {:else}
    {#if showAddGroup}
      <div class="card mb-3 p-3">
        <div class="input-group">
          <input type="text" class="form-control" bind:value={newGroupTitle} placeholder="Group title" />
          <button class="btn btn-primary" onclick={addGroup}>Add</button>
          <button class="btn btn-secondary" onclick={() => (showAddGroup = false)}>Cancel</button>
        </div>
      </div>
    {/if}
    {#if showAddStep}
      <div class="card mb-3 p-3">
        <h5>Add Step</h5>
        <div class="mb-2">
          <label class="form-label">Title</label>
          <input type="text" class="form-control" bind:value={newStepTitle} />
        </div>
        <div class="mb-2">
          <label class="form-label">Group (optional)</label>
          <select class="form-select" bind:value={parentGroupId}>
            <option value={null}>-- No Group --</option>
            {#each tree?.groups || [] as g}
              <option value={g.id}>{g.title}</option>
            {/each}
          </select>
        </div>
        <div>
          <button class="btn btn-primary" onclick={addStep}>Add</button>
          <button class="btn btn-secondary ms-1" onclick={() => (showAddStep = false)}>Cancel</button>
        </div>
      </div>
    {/if}

    {#if !hasContent()}
      <p class="text-muted">Plan is empty. Click "Initialize from Solutions" to populate from project solutions.</p>
    {:else}
      <div class="row">
        <div class="col-md-8">
          {#if tree?.groups}
            {#each tree.groups as group}
              <div class="card mb-2">
                <div class="card-header d-flex justify-content-between align-items-center">
                  <strong>{group.title}</strong>
                  <button class="btn btn-sm btn-outline-danger" onclick={() => deleteGroup(group.id)}>Delete</button>
                </div>
                {#if group.steps?.length > 0}
                  <ul class="list-group list-group-flush">
                    {#each group.steps as step (step.id)}
                      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                      <li
                        class="list-group-item d-flex justify-content-between align-items-center"
                        class:active={selectedStep?.id === step.id}
                      >
                        <span
                          role="button"
                          tabindex="0"
                          onclick={() => selectStep(step)}
                          onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') selectStep(step); }}
                        >
                          {step.title}
                          {#if step.required_executions > 1}
                            <span class="badge bg-info ms-1">x{step.required_executions}</span>
                          {/if}
                        </span>
                        <button class="btn btn-sm btn-outline-danger" onclick={() => deleteStep(step.id)}>Delete</button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/each}
          {/if}

          {#if tree?.ungrouped_steps && tree.ungrouped_steps.length > 0}
            <div class="card mb-2">
              <div class="card-header"><strong>Ungrouped Steps</strong></div>
              <ul class="list-group list-group-flush">
                {#each tree.ungrouped_steps as step (step.id)}
                  <li
                    class="list-group-item d-flex justify-content-between align-items-center"
                    class:active={selectedStep?.id === step.id}
                  >
                    <span role="button" tabindex="0" onclick={() => selectStep(step)}>{step.title}</span>
                    <button class="btn btn-sm btn-outline-danger" onclick={() => deleteStep(step.id)}>Delete</button>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>

        <div class="col-md-4">
          {#if selectedStep}
            <div class="card">
              <div class="card-header"><strong>Step Details</strong></div>
              <div class="card-body">
                <h5>{selectedStep.title}</h5>
                <p>{selectedStep.description}</p>
                <p><strong>Duration:</strong> {selectedStep.duration_estimate_minutes} min</p>
                <p><strong>Required Executions:</strong> {selectedStep.required_executions}</p>
                {#if selectedStep.completion_criteria}
                  <p><strong>Completion Criteria:</strong> {selectedStep.completion_criteria}</p>
                {/if}
              </div>
            </div>
          {:else}
            <p class="text-muted">Select a step to view details.</p>
          {/if}
        </div>
      </div>
    {/if}
  {/if}

  <div class="mt-3">
    <a href={p("/projects/:id", { params: { id } })} class="btn btn-secondary">Back to Project</a>
    <a href={p("/projects/:id/logging", { params: { id } })} class="btn btn-success ms-2">Start Logging</a>
  </div>
</div>
