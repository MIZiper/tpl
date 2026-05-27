<script lang="ts">
  import { onMount } from "svelte";
  import { p, route } from "../../router";
  import { loggingStore } from "../../stores/logging";
  import type { StepExecution, PlanTree, PlanStep } from "../../types";
  import { planApi } from "../../lib/api";

  let id: string = $derived(route.params.id ?? "");
  let executions = $state<StepExecution[]>([]);
  let currentExecution = $state<StepExecution | null>(null);
  let planTree = $state<PlanTree | null>(null);
  let loading = $state(true);
  let error = $state("");
  let completionCheck = $state("");
  let completionNotes = $state("");
  let incidentNotes = $state("");
  let incidentReason = $state("");
  let incidentCategory = $state("");
  let showIncidentForm = $state(false);
  let showAdhocForm = $state(false);
  let adhocTitle = $state("");
  let adhocDescription = $state("");
  let adhocNotes = $state("");

  async function load() {
    loading = true;
    try {
      await loggingStore.loadProject(id);
      const unsub = loggingStore.subscribe((s) => {
        executions = s.executions;
        currentExecution = s.currentExecution;
        loading = s.loading;
        error = s.error || "";
      });
      planTree = await planApi.get(id);
      return unsub;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    const prom = load();
    return () => { prom.then((u) => u?.()); };
  });

  function findStep(stepId: string | null): PlanStep | null {
    if (!stepId || !planTree) return null;
    for (const g of planTree.groups) {
      const found = g.steps?.find((s) => s.id === stepId);
      if (found) return found;
    }
    return planTree.ungrouped_steps?.find((s) => s.id === stepId) || null;
  }

  async function handleComplete() {
    if (!currentExecution) return;
    await loggingStore.completeStep(id, currentExecution.id, completionCheck || undefined, completionNotes || undefined);
    completionCheck = "";
    completionNotes = "";
  }

  async function handleSkip() {
    if (!currentExecution) return;
    await loggingStore.skipStep(id, currentExecution.id, completionNotes || undefined);
    completionNotes = "";
  }

  async function handleStartIncident() {
    showIncidentForm = true;
    await loggingStore.createIncident(id, currentExecution?.plan_step_id || undefined, "");
  }

  async function handleResolveIncident() {
    if (!currentExecution || currentExecution.type !== "incident") return;
    await loggingStore.resolveIncident(id, currentExecution.id, incidentReason, incidentCategory || undefined, incidentNotes || undefined);
    incidentReason = "";
    incidentCategory = "";
    incidentNotes = "";
    showIncidentForm = false;
  }

  async function handleCreateAdhoc() {
    if (!adhocTitle) return;
    await loggingStore.createAdhoc(id, adhocTitle, adhocDescription || undefined, adhocNotes || undefined);
    adhocTitle = "";
    adhocDescription = "";
    adhocNotes = "";
    showAdhocForm = false;
  }

  async function handleStartStep(planStepId: string) {
    await loggingStore.startStep(id, planStepId);
  }

  let currentStepInfo = $derived(currentExecution ? findStep(currentExecution.plan_step_id) : null);
</script>

<div>
  <h2>Execution Log</h2>

  {#if loading}
    <p>Loading...</p>
  {:else if error}
    <div class="alert alert-danger">{error}</div>
  {:else}
    {#if currentExecution && currentExecution.type === "incident" && !showIncidentForm}
      <div class="alert alert-warning">
        <strong>Active Incident!</strong> Click "Resolve" when ready.
        <button class="btn btn-sm btn-warning ms-2" onclick={() => { showIncidentForm = true; }}>Resolve</button>
      </div>
    {/if}

    {#if currentExecution && currentExecution.type !== "incident"}
      <div class="card mb-4 border-success">
        <div class="card-header bg-success text-white">
          <strong>Current Step</strong>
        </div>
        <div class="card-body">
          <h4>{currentExecution.step_title || currentStepInfo?.title || "Ad-hoc Record"}</h4>
          {#if currentStepInfo}
            <p>{currentStepInfo.description}</p>
            {#if currentStepInfo.completion_criteria}
              <p><strong>Completion Criteria:</strong> {currentStepInfo.completion_criteria}</p>
            {/if}
            <p><strong>Estimated Duration:</strong> {currentStepInfo.duration_estimate_minutes} min</p>
            {#if currentStepInfo.required_executions > 1}
              <p><strong>Execution:</strong> {currentExecution.execution_number} / {currentStepInfo.required_executions}</p>
            {/if}
          {/if}
          <p class="text-muted">Started: {new Date(currentExecution.started_at).toLocaleString()}</p>

          <div class="mb-2">
            <label class="form-label">Completion Check</label>
            <select class="form-select" bind:value={completionCheck}>
              <option value="">-- Select --</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="skip">Skip</option>
            </select>
          </div>
          <div class="mb-2">
            <label class="form-label">Notes</label>
            <textarea class="form-control" bind:value={completionNotes} rows={2}></textarea>
          </div>
          <div class="btn-group">
            <button class="btn btn-success" onclick={handleComplete}>Complete &amp; Next</button>
            <button class="btn btn-outline-secondary" onclick={handleSkip}>Skip</button>
            <button class="btn btn-danger" onclick={handleStartIncident}>Emergency!</button>
            <button class="btn btn-outline-info" onclick={() => (showAdhocForm = true)}>+ Ad-hoc Record</button>
          </div>
        </div>
      </div>
    {/if}

    {#if showIncidentForm}
      <div class="card mb-4 border-danger">
        <div class="card-header bg-danger text-white"><strong>Emergency Incident</strong></div>
        <div class="card-body">
          <div class="mb-2">
            <label class="form-label">Reason</label>
            <textarea class="form-control" bind:value={incidentReason} rows={2}></textarea>
          </div>
          <div class="mb-2">
            <label class="form-label">Category</label>
            <input type="text" class="form-control" bind:value={incidentCategory} />
          </div>
          <div class="mb-2">
            <label class="form-label">Notes</label>
            <textarea class="form-control" bind:value={incidentNotes} rows={2}></textarea>
          </div>
          <button class="btn btn-warning" onclick={handleResolveIncident}>Resolve Incident</button>
          <button class="btn btn-secondary ms-1" onclick={() => (showIncidentForm = false)}>Cancel</button>
        </div>
      </div>
    {/if}

    {#if showAdhocForm}
      <div class="card mb-4 border-info">
        <div class="card-header bg-info text-white"><strong>Ad-hoc Record</strong></div>
        <div class="card-body">
          <div class="mb-2">
            <label class="form-label">Title</label>
            <input type="text" class="form-control" bind:value={adhocTitle} />
          </div>
          <div class="mb-2">
            <label class="form-label">Description</label>
            <textarea class="form-control" bind:value={adhocDescription} rows={2}></textarea>
          </div>
          <div class="mb-2">
            <label class="form-label">Notes</label>
            <textarea class="form-control" bind:value={adhocNotes} rows={2}></textarea>
          </div>
          <button class="btn btn-info" onclick={handleCreateAdhoc}>Save</button>
          <button class="btn btn-secondary ms-1" onclick={() => (showAdhocForm = false)}>Cancel</button>
        </div>
      </div>
    {/if}

    <div class="card mb-4">
      <div class="card-header"><strong>Step Progress</strong></div>
      <div class="card-body">
        {#if planTree}
          {#each planTree.ungrouped_steps as step (step.id)}
            {#if step}
              {@const stepExec = executions.filter((e) => e.plan_step_id === step.id)}
              {@const isActive = executions.some((e) => e.plan_step_id === step.id && e.status === "in_progress")}
              {@const isComplete = stepExec.some((e) => e.status === "completed")}
              <div class="d-flex justify-content-between align-items-center mb-1 p-2 border rounded">
                <div>
                  {step.title}
                  {#if isActive}<span class="badge bg-success ms-1">Active</span>{/if}
                  {#if isComplete}<span class="badge bg-secondary ms-1">Done</span>{/if}
                  {#if step.required_executions > 1}
                    <span class="badge bg-info ms-1">{stepExec.length}/{step.required_executions}</span>
                  {/if}
                </div>
                <div>
                  <a href={p("/projects/:id/logging/step/:stepId", { params: { id, stepId: step.id } })} class="btn btn-sm btn-outline-secondary me-1">History</a>
                  {#if !isActive && !isComplete}
                    <button class="btn btn-sm btn-outline-success" onclick={() => handleStartStep(step.id)}>Start</button>
                  {/if}
                </div>
              </div>
            {/if}
          {/each}
          {#each planTree.groups as group}
            <strong class="d-block mt-2">{group.title}</strong>
            {#each group.steps || [] as step (step.id)}
              {@const stepExec = executions.filter((e) => e.plan_step_id === step.id)}
              {@const isActive = executions.some((e) => e.plan_step_id === step.id && e.status === "in_progress")}
              {@const isComplete = stepExec.some((e) => e.status === "completed")}
              <div class="d-flex justify-content-between align-items-center mb-1 p-2 border rounded ms-3">
                <div>
                  {step.title}
                  {#if isActive}<span class="badge bg-success ms-1">Active</span>{/if}
                  {#if isComplete}<span class="badge bg-secondary ms-1">Done</span>{/if}
                  {#if step.required_executions > 1}
                    <span class="badge bg-info ms-1">{stepExec.length}/{step.required_executions}</span>
                  {/if}
                </div>
                <div>
                  <a href={p("/projects/:id/logging/step/:stepId", { params: { id, stepId: step.id } })} class="btn btn-sm btn-outline-secondary me-1">History</a>
                  {#if !isActive && !isComplete}
                    <button class="btn btn-sm btn-outline-success" onclick={() => handleStartStep(step.id)}>Start</button>
                  {/if}
                </div>
              </div>
            {/each}
          {/each}
        {:else}
          <p class="text-muted">No plan defined. <a href={p("/projects/:id/plan", { params: { id } })}>Create a plan</a> first.</p>
        {/if}
      </div>
    </div>

    {#if executions.filter((e) => e.type === "adhoc" || e.type === "incident").length > 0}
      <div class="card mb-4">
        <div class="card-header"><strong>Ad-hoc &amp; Incident Records</strong></div>
        <ul class="list-group list-group-flush">
          {#each executions.filter((e) => e.type === "adhoc" || e.type === "incident") as rec (rec.id)}
            <li class="list-group-item">
              <span class="badge bg-{rec.type === "incident" ? "danger" : "info"} me-1">{rec.type}</span>
              {rec.step_title || rec.notes || "(no title)"}
              <small class="text-muted ms-2">{new Date(rec.started_at).toLocaleString()}</small>
              {#if rec.completed_at}<small class="text-muted"> → {new Date(rec.completed_at).toLocaleString()}</small>{/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}

  <div class="mt-3">
    <a href={p("/projects/:id", { params: { id } })} class="btn btn-secondary">Back to Project</a>
    <a href={p("/projects/:id/logging/stats", { params: { id } })} class="btn btn-outline-primary ms-2">Statistics</a>
  </div>
</div>
