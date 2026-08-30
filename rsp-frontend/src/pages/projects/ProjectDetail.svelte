<script lang="ts">
  import { onMount } from "svelte";
  import { p, route } from "../../router";
  import { projectsApi, risksApi, solutionsApi, designPhasesApi, fmeaApi } from "../../lib/api";
  import type {
    ProjectWithDetails,
    ProjectRiskWithDetails,
    Risk,
    Solution,
    ProductModel,
    DesignPhase,
    LessonsLearned,
  } from "../../types";

  let id: string = $derived(route.params.id ?? "");
  let project = $state<ProjectWithDetails | null>(null);
  let loading = $state(true);
  let error = $state("");

  let allRisks: Risk[] = $state([]);
  let allSolutions: Solution[] = $state([]);
  let phases: DesignPhase[] = $state([]);
  let recommendations: Solution[] = $state([]);

  let showAddRisk = $state(false);
  let selectedRiskId = $state("");
  let newSeverity = $state<number | null>(null);
  let newOccurrence = $state<number | null>(null);
  let newDetection = $state<number | null>(null);
  let newPhaseId = $state("");
  let newStatus = $state("");
  let newOwner = $state("");

  let showAddModel = $state(false);
  let newModelCode = $state("");
  let newModelName = $state("");
  let newModelRevision = $state("");

  let expandedRiskId = $state<string | null>(null);

  let selectedSolutionId = $state("");
  let showRecommendations = $state(false);

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
      const [r, s, ph] = await Promise.all([
        risksApi.list(),
        solutionsApi.list(),
        designPhasesApi.list(),
      ]);
      allRisks = r;
      allSolutions = s;
      phases = ph;
    } catch {}
  });

  async function addRisk() {
    if (!selectedRiskId) return;
    const riskId = selectedRiskId;
    await projectsApi.risks.add(id, {
      risk_id: riskId,
      severity: newSeverity,
      occurrence: newOccurrence,
      detection: newDetection,
      phase_id: newPhaseId || null,
      model_id: null,
      status: newStatus || null,
      owner_name: newOwner || null,
    });
    showAddRisk = false;
    selectedRiskId = "";
    newSeverity = null;
    newOccurrence = null;
    newDetection = null;
    newPhaseId = "";
    newStatus = "";
    newOwner = "";
    try {
      const recs = await projectsApi.recommendations([riskId]);
      recommendations = recs;
      showRecommendations = recommendations.length > 0;
    } catch {}
    await loadProject();
  }

  async function removeRisk(riskId: string) {
    await projectsApi.risks.remove(id, riskId);
    await loadProject();
  }

  async function updateRpn(pr: ProjectRiskWithDetails) {
    await projectsApi.risks.update(id, pr.id, {
      severity: pr.severity,
      occurrence: pr.occurrence,
      detection: pr.detection,
      status: pr.status,
      owner_name: pr.owner_name,
      phase_id: pr.phase_id,
      model_id: pr.model_id,
      covered_by_previous: pr.covered_by_previous,
      covering_solution_id: pr.covering_solution_id,
      description: pr.description,
    });
    await loadProject();
  }

  async function addModel() {
    if (!newModelName && !newModelCode) return;
    await projectsApi.models.create(id, {
      code: newModelCode || null,
      name: newModelName || null,
      revision: newModelRevision || null,
    });
    showAddModel = false;
    newModelCode = "";
    newModelName = "";
    newModelRevision = "";
    await loadProject();
  }

  async function removeModel(modelId: string) {
    await projectsApi.models.delete(id, modelId);
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

  async function adoptSelected() {
    if (!selectedSolutionId) return;
    await addSolution(selectedSolutionId);
    selectedSolutionId = "";
  }

  // Applied solution form state (per expanded risk)
  let appliedSolutionId = $state("");
  let appliedEngineer = $state("");
  let appliedDate = $state("");
  let appliedStatus = $state("");

  async function addApplied(pr: ProjectRiskWithDetails) {
    if (!appliedSolutionId) return;
    await fmeaApi.applied.create(id, pr.id, {
      project_risk_id: pr.id,
      solution_id: appliedSolutionId,
      responsible_engineer: appliedEngineer || null,
      implementation_date: appliedDate || null,
      status: appliedStatus || null,
    });
    appliedSolutionId = "";
    appliedEngineer = "";
    appliedDate = "";
    appliedStatus = "";
    await loadProject();
  }

  async function removeApplied(appliedId: string) {
    await fmeaApi.applied.delete(appliedId);
    await loadProject();
  }

  // Effectiveness form (per applied solution)
  let effAppliedId = $state("");
  let effSummary = $state("");
  let effReduction = $state<number | null>(null);
  let effCost = $state<number | null>(null);
  let effComments = $state("");

  async function addEffectiveness(appliedId: string) {
    await fmeaApi.effectiveness.create(appliedId, {
      result_summary: effSummary || null,
      risk_reduction_percent: effReduction,
      actual_cost: effCost,
      comments: effComments || null,
    });
    effAppliedId = "";
    effSummary = "";
    effReduction = null;
    effCost = null;
    effComments = "";
    await loadProject();
  }

  // Lessons form
  let lessonHappened = $state("");
  let lessonRootCause = $state("");
  let lessonWorked = $state("");
  let lessonFailed = $state("");
  let lessonRecommendation = $state("");

  async function addLesson(pr: ProjectRiskWithDetails) {
    await fmeaApi.lessons.create(id, pr.id, {
      what_happened: lessonHappened || null,
      root_cause: lessonRootCause || null,
      what_worked: lessonWorked || null,
      what_failed: lessonFailed || null,
      recommendation: lessonRecommendation || null,
    });
    lessonHappened = "";
    lessonRootCause = "";
    lessonWorked = "";
    lessonFailed = "";
    lessonRecommendation = "";
    await loadProject();
  }

  async function removeLesson(lessonId: string) {
    await fmeaApi.lessons.delete(lessonId);
    await loadProject();
  }

  let coverageRate = $derived(project ? project.coverage_rate : 0);
  let coveredCount = $derived(
    project ? project.risks.filter((r) => r.covered_by_previous || r.covering_solution_id).length : 0,
  );
  let totalRisks = $derived(project ? project.risks.length : 0);

  function rpnColor(rpn: number | null) {
    if (rpn == null) return "";
    if (rpn >= 200) return "bg-danger text-white";
    if (rpn >= 100) return "bg-warning";
    return "bg-success text-white";
  }

  function phaseName(phaseId: string | null) {
    return phases.find((p) => p.id === phaseId)?.name ?? "";
  }

  function riskName(riskId: string) {
    return allRisks.find((r) => r.id === riskId)?.title ?? riskId;
  }
</script>

<div>
  {#if loading}
    <p>Loading...</p>
  {:else if error}
    <div class="alert alert-danger">{error}</div>
  {:else if project}
    <div class="d-flex justify-content-between align-items-center">
      <h2>{project.name}</h2>
      <a href={p("/projects/:id/edit", { params: { id: project.id } })} class="btn btn-sm btn-outline-secondary">Edit</a>
    </div>
    <p class="text-muted">
      {project.code || ""} · {project.customer_name || ""} · {project.platform || ""} ·
      PM: {project.project_manager || "—"} · {project.status || ""}
    </p>

    {#if totalRisks > 0}
      <div class="mb-3">
        <label class="form-label">
          Risk Coverage: {coveredCount} / {totalRisks} ({Math.round(coverageRate * 100)}%)
        </label>
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

    <!-- Product models -->
    <div class="card mb-3">
      <div class="card-header d-flex justify-content-between align-items-center">
        <strong>Product Models</strong>
        <button class="btn btn-sm btn-outline-primary" onclick={() => (showAddModel = !showAddModel)}>
          {showAddModel ? "Cancel" : "+ Add Model"}
        </button>
      </div>
      <div class="card-body">
        {#if showAddModel}
          <div class="row g-2 mb-2">
            <div class="col-md-3"><input class="form-control form-control-sm" placeholder="Code" bind:value={newModelCode} /></div>
            <div class="col-md-3"><input class="form-control form-control-sm" placeholder="Name" bind:value={newModelName} /></div>
            <div class="col-md-3"><input class="form-control form-control-sm" placeholder="Revision" bind:value={newModelRevision} /></div>
            <div class="col-md-3"><button class="btn btn-sm btn-primary" onclick={addModel}>Add</button></div>
          </div>
        {/if}
        {#if project.models.length === 0}
          <p class="text-muted mb-0">No product models.</p>
        {:else}
          <ul class="list-group">
            {#each project.models as model}
              <li class="list-group-item d-flex justify-content-between align-items-center">
                <span>{model.code || model.name || model.id}</span>
                <span>
                  {model.revision || ""} {model.product_family || ""}
                  <button class="btn btn-sm btn-outline-danger ms-2" onclick={() => removeModel(model.id)}>×</button>
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>

    <div class="row">
      <div class="col-md-7">
        <div class="card mb-3">
          <div class="card-header d-flex justify-content-between align-items-center">
            <strong>Risks (FMEA)</strong>
            <button class="btn btn-sm btn-outline-primary" onclick={() => (showAddRisk = !showAddRisk)}>
              {showAddRisk ? "Cancel" : "+ Add Risk"}
            </button>
          </div>
          <div class="card-body">
            {#if showAddRisk}
              <div class="mb-2">
                <select class="form-select form-select-sm" bind:value={selectedRiskId}>
                  <option value="">-- Select Risk --</option>
                  {#each allRisks.filter((r) => !project?.risks.find((pr) => pr.risk_id === r.id)) as r}
                    <option value={r.id}>{r.title}</option>
                  {/each}
                </select>
              </div>
              <div class="row g-2 mb-2">
                <div class="col"><input class="form-control form-control-sm" type="number" min="1" max="10" placeholder="Severity" bind:value={newSeverity} /></div>
                <div class="col"><input class="form-control form-control-sm" type="number" min="1" max="10" placeholder="Occurrence" bind:value={newOccurrence} /></div>
                <div class="col"><input class="form-control form-control-sm" type="number" min="1" max="10" placeholder="Detection" bind:value={newDetection} /></div>
                <div class="col">
                  <select class="form-select form-select-sm" bind:value={newPhaseId}>
                    <option value="">Phase</option>
                    {#each phases as ph}
                      <option value={ph.id}>{ph.name}</option>
                    {/each}
                  </select>
                </div>
              </div>
              <div class="row g-2 mb-2">
                <div class="col"><input class="form-control form-control-sm" placeholder="Owner" bind:value={newOwner} /></div>
                <div class="col"><input class="form-control form-control-sm" placeholder="Status" bind:value={newStatus} /></div>
                <div class="col-auto"><button class="btn btn-sm btn-primary" onclick={addRisk} disabled={!selectedRiskId}>Add</button></div>
              </div>
            {/if}

            {#if project.risks.length === 0}
              <p class="text-muted">No risks added.</p>
            {:else}
              <div class="table-responsive">
                <table class="table table-sm table-hover align-middle">
                  <thead>
                    <tr>
                      <th>Risk</th>
                      <th>Phase</th>
                      <th style="width:60px">S</th>
                      <th style="width:60px">O</th>
                      <th style="width:60px">D</th>
                      <th style="width:70px">RPN</th>
                      <th>Covered</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each project.risks as pr (pr.id)}
                      <tr>
                        <td>
                          <a role="button" onclick={() => (expandedRiskId = expandedRiskId === pr.id ? null : pr.id)}>
                            {pr.risk?.title || riskName(pr.risk_id)}
                          </a>
                        </td>
                        <td>{phaseName(pr.phase_id) || "—"}</td>
                        <td><input class="form-control form-control-sm" type="number" min="1" max="10" bind:value={pr.severity} /></td>
                        <td><input class="form-control form-control-sm" type="number" min="1" max="10" bind:value={pr.occurrence} /></td>
                        <td><input class="form-control form-control-sm" type="number" min="1" max="10" bind:value={pr.detection} /></td>
                        <td><span class="badge {rpnColor(pr.rpn)}">{pr.rpn ?? "—"}</span></td>
                        <td>
                          {#if pr.covered_by_previous}
                            <span class="badge bg-secondary">Previous</span>
                          {:else if pr.covering_solution_id}
                            <span class="badge bg-success">Covered</span>
                          {:else}
                            <span class="badge bg-light text-muted">—</span>
                          {/if}
                        </td>
                        <td>
                          <button class="btn btn-sm btn-outline-primary" onclick={() => updateRpn(pr)}>Save</button>
                          <button class="btn btn-sm btn-outline-danger" onclick={() => removeRisk(pr.risk_id)}>×</button>
                        </td>
                      </tr>
                      {#if expandedRiskId === pr.id}
                        <tr>
                          <td colspan="8" class="p-2 bg-light">
                            <div class="row">
                              <div class="col-md-6">
                                <div class="card mb-2">
                                  <div class="card-header py-1"><small><strong>Applied Solutions</strong></small></div>
                                  <div class="card-body py-1">
                                    <ul class="list-group mb-2">
                                      {#each pr.applied_solutions as app}
                                        <li class="list-group-item py-1">
                                          <div class="d-flex justify-content-between align-items-center">
                                            <span>{app.solution?.title || app.solution_id}</span>
                                            <button class="btn btn-sm btn-outline-danger" onclick={() => removeApplied(app.id)}>×</button>
                                          </div>
                                          <small class="text-muted">
                                            {app.status || ""} {app.responsible_engineer ? `· ${app.responsible_engineer}` : ""}
                                            {app.implementation_date ? `· ${app.implementation_date}` : ""}
                                          </small>
                                          {#each app.effectiveness as eff}
                                            <div class="border-top pt-1 mt-1">
                                              <small>
                                                <span class="badge bg-info text-dark">↓{eff.risk_reduction_percent ?? "?"}%</span>
                                                {eff.result_summary || ""}
                                                {eff.actual_cost != null ? ` · cost ${eff.actual_cost}` : ""}
                                              </small>
                                            </div>
                                          {/each}
                                        </li>
                                      {/each}
                                    </ul>
                                    <div class="row g-1">
                                      <div class="col-6">
                                        <select class="form-select form-select-sm" bind:value={appliedSolutionId}>
                                          <option value="">-- Solution --</option>
                                          {#each allSolutions as sol}
                                            <option value={sol.id}>{sol.title}</option>
                                          {/each}
                                        </select>
                                      </div>
                                      <div class="col-3"><input class="form-control form-control-sm" placeholder="Engineer" bind:value={appliedEngineer} /></div>
                                      <div class="col-3"><input class="form-control form-control-sm" placeholder="Status" bind:value={appliedStatus} /></div>
                                    </div>
                                    <button class="btn btn-sm btn-outline-primary mt-1" onclick={() => addApplied(pr)}>Apply Solution</button>
                                  </div>
                                </div>
                                <div class="card mb-2">
                                  <div class="card-header py-1"><small><strong>Add Effectiveness</strong></small></div>
                                  <div class="card-body py-1">
                                    <div class="row g-1">
                                      <div class="col-4">
                                        <select class="form-select form-select-sm" bind:value={effAppliedId}>
                                          <option value="">-- Applied --</option>
                                          {#each pr.applied_solutions as app}
                                            <option value={app.id}>{app.solution?.title || app.solution_id}</option>
                                          {/each}
                                        </select>
                                      </div>
                                      <div class="col-3"><input class="form-control form-control-sm" type="number" placeholder="Reduction %" bind:value={effReduction} /></div>
                                      <div class="col-3"><input class="form-control form-control-sm" type="number" placeholder="Cost" bind:value={effCost} /></div>
                                      <div class="col-2"><button class="btn btn-sm btn-outline-success" onclick={() => addEffectiveness(effAppliedId)} disabled={!effAppliedId}>Add</button></div>
                                    </div>
                                    <input class="form-control form-control-sm mt-1" placeholder="Result summary" bind:value={effSummary} />
                                  </div>
                                </div>
                              </div>
                              <div class="col-md-6">
                                <div class="card">
                                  <div class="card-header py-1"><small><strong>Lessons Learned</strong></small></div>
                                  <div class="card-body py-1">
                                    <ul class="list-group mb-2">
                                      {#each pr.lessons || [] as lesson}
                                        <li class="list-group-item py-1">
                                          <div class="d-flex justify-content-between align-items-center">
                                            <small><strong>{lesson.what_happened || "Lesson"}</strong></small>
                                            <button class="btn btn-sm btn-outline-danger" onclick={() => removeLesson(lesson.id)}>×</button>
                                          </div>
                                          {#if lesson.root_cause}<small class="d-block text-muted">Root cause: {lesson.root_cause}</small>{/if}
                                          {#if lesson.recommendation}<small class="d-block text-muted">Recommendation: {lesson.recommendation}</small>{/if}
                                        </li>
                                      {/each}
                                    </ul>
                                    <input class="form-control form-control-sm mb-1" placeholder="What happened" bind:value={lessonHappened} />
                                    <input class="form-control form-control-sm mb-1" placeholder="Root cause" bind:value={lessonRootCause} />
                                    <input class="form-control form-control-sm mb-1" placeholder="Recommendation" bind:value={lessonRecommendation} />
                                    <button class="btn btn-sm btn-outline-primary" onclick={() => addLesson(pr)} disabled={!lessonHappened}>Add Lesson</button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      {/if}
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <div class="col-md-5">
        <div class="card mb-3">
          <div class="card-header"><strong>Solutions</strong></div>
          <div class="card-body">
            {#if project.solutions.length === 0}
              <p class="text-muted">No solutions adopted.</p>
            {:else}
              <ul class="list-group">
                {#each project.solutions as sol}
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    {sol.title}
                    <button class="btn btn-sm btn-outline-danger" onclick={() => removeSolution(sol.id)}>×</button>
                  </li>
                {/each}
              </ul>
            {/if}
            <div class="mt-2">
              <div class="input-group">
                <select class="form-select" bind:value={selectedSolutionId}>
                  <option value="">-- Adopt solution --</option>
                  {#each allSolutions.filter((s) => !project?.solutions.find((ps) => ps.id === s.id)) as s}
                    <option value={s.id}>{s.title}</option>
                  {/each}
                </select>
                <button class="btn btn-outline-primary" onclick={adoptSelected} disabled={!selectedSolutionId}>Add</button>
              </div>
            </div>
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
                      <span class="badge bg-secondary">Adopted</span>
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
