<script lang="ts">
  import { onMount } from "svelte";
  import { p, route } from "../../router";
  import { execState, load, init, saveDoc, startRun, completeRun, updateRun, computeEntryStatus, adhocEntry } from "../../stores/execution";
  import { executionApi, planApi } from "../../lib/api";
  import { findNode, generateId } from "../../lib/plan-utils";
  import type { ExecutionEntry, ExecutionRun } from "../../types/execution";
  import type { PlanNode, PlanFieldDef, FieldBinding } from "../../types/plan";
  import LogStepTree from "./LogStepTree.svelte";

  let id: string = $derived(route.params.id ?? "");

  let selectedStepId = $state<string | null>(null);
  let selectedEntryId = $state<string | null>(null);
  let contextMenu = $state<{ x: number; y: number; stepId: string; parentGroupId: string | null } | null>(null);
  let showAdhoc = $state(false);
  let adhocTitle = $state("");
  let adhocNotes = $state("");
  let conflictModal = $state<{ stepId: string; activeEntry: ExecutionEntry | null } | null>(null);

  onMount(() => { load(id, executionApi.getDoc, planApi.getDocument); });

  // --- Data helpers ---
  let doc = $derived($execState.document);
  let plan = $derived($execState.planDoc);

  function entryForStep(stepId: string): ExecutionEntry | undefined {
    return doc?.entries.find(e => e.plan_step_id === stepId && e.type === "planned");
  }

  function selectedEntry(): ExecutionEntry | undefined {
    if (!doc) return undefined;
    return doc.entries.find(e => e.id === selectedEntryId);
  }

  // Trigger Svelte reactivity after doc mutation
  function dirty() {
    if (!doc) return;
    execState.update(s => ({ ...s, document: { ...doc!, entries: [...doc!.entries] } }));
  }

  const selEntry = $derived(selectedEntry());
  const selStep = $derived(selEntry?.plan_step_id && plan ? findNode(plan.root, selEntry.plan_step_id) : null);

  // --- Context menu ---
  function ctxMenu(e: MouseEvent, stepId: string) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY, stepId, parentGroupId: null };
  }

  function closeCtx() { contextMenu = null; }

  // --- Run actions (all local JSON manipulation) ---
  function findActive(): ExecutionEntry | null {
    if (!doc) return null;
    return doc.entries.find(e => e.executions.some(r => r.status === "in_progress")) || null;
  }

  async function handleStart(stepId: string) {
    if (!doc) return;
    const active = findActive();
    if (active) {
      conflictModal = { stepId, activeEntry: active };
      return;
    }
    doStart(stepId);
  }

  async function doStart(stepId: string) {
    if (!doc) return;
    let entry = entryForStep(stepId);
    const step = plan ? findNode(plan.root, stepId) : null;
    if (!step) return;

    if (!entry) {
      entry = {
        id: generateId(),
        plan_step_id: stepId,
        step_title: step.title,
        type: "planned",
        required_executions: step.required_executions || 1,
        executions: [],
      };
      doc.entries = [...doc.entries, entry];
    }

    const updated = startRun(entry);
    doc.entries = doc.entries.map(e => e.id === entry!.id ? updated : e);
    dirty();

    selectedEntryId = entry.id;
    await executionApi.saveDoc(id, doc);
  }

  async function conflictStopPrevious() {
    if (!doc || !conflictModal) return;
    const prev = conflictModal.activeEntry;
    if (prev) {
      const activeRun = prev.executions.find(r => r.status === "in_progress");
      if (activeRun) {
        prev.executions = prev.executions.map(r => r.id === activeRun.id
          ? { ...r, status: "completed", completed_at: new Date().toISOString() }
          : r);
        doc.entries = doc.entries.map(e => e.id === prev.id ? { ...prev } : e);
        dirty();
        await executionApi.saveDoc(id, doc);
      }
    }
    const stepId = conflictModal.stepId;
    conflictModal = null;
    await doStart(stepId);
  }

  async function conflictSkipPrevious() {
    if (!doc || !conflictModal) return;
    const prev = conflictModal.activeEntry;
    if (prev) {
      const activeRun = prev.executions.find(r => r.status === "in_progress");
      if (activeRun) {
        prev.executions = prev.executions.map(r => r.id === activeRun.id
          ? { ...r, status: "skipped", completed_at: new Date().toISOString() }
          : r);
        doc.entries = doc.entries.map(e => e.id === prev.id ? { ...prev } : e);
        dirty();
        await executionApi.saveDoc(id, doc);
      }
    }
    const stepId = conflictModal.stepId;
    conflictModal = null;
    await doStart(stepId);
  }

  function conflictCancel() {
    conflictModal = null;
  }

  async function handleCompleteRun(runId: string) {
    if (!doc || !selEntry) return;
    const step = plan && selEntry.plan_step_id ? findNode(plan.root, selEntry.plan_step_id) : null;

    const input_readings = (step?.input_conditions || []).map(b => ({
      definition_id: b.definition_id,
      definition_name: defName(b.definition_id),
      value: b.value ?? null,
    }));
    const collection_results = (step?.collection_items || []).map(b => ({
      definition_id: b.definition_id,
      definition_name: defName(b.definition_id),
      result: b.value !== null && b.value !== undefined ? String(b.value) : null,
      notes: null as string | null,
    }));
    const criteria_results = (step?.completion_criteria || []).map(b => ({
      definition_id: b.definition_id,
      definition_name: defName(b.definition_id),
      passed: b.value === true ? true : (b.value === false ? false : null),
      notes: null as string | null,
    }));

    const updated = completeRun(selEntry, runId, { input_readings, collection_results, criteria_results });
    doc.entries = doc.entries.map(e => e.id === selEntry.id ? updated : e);
    dirty();
    await executionApi.saveDoc(id, doc);
  }

  async function handleSkipRun(runId: string) {
    if (!doc || !selEntry) return;
    const updated = updateRun(selEntry, runId, { status: "skipped", completed_at: new Date().toISOString() });
    doc.entries = doc.entries.map(e => e.id === selEntry.id ? updated : e);
    dirty();
    await executionApi.saveDoc(id, doc);
  }

  function activeRun(entry: ExecutionEntry): ExecutionRun | undefined {
    return entry.executions.find(r => r.status === "in_progress");
  }

  // --- Ad-hoc ---
  async function handleAdhoc() {
    if (!doc || !adhocTitle) return;
    const entry = adhocEntry(adhocTitle, adhocNotes || null);
    doc.entries = [...doc.entries, entry];
    dirty();
    await executionApi.saveDoc(id, doc);
    adhocTitle = ""; adhocNotes = ""; showAdhoc = false;
  }

  // --- Init ---
  async function handleInit() {
    await init(id, executionApi.initialize);
  }

  function defName(fieldId: string): string {
    const defs = plan?.definitions;
    if (!defs) return fieldId;
    for (const cat of ["input_conditions","collection_items","completion_criteria","custom"] as const) {
      const d = defs[cat].find(f => f.id === fieldId);
      if (d) return d.name;
    }
    return fieldId;
  }

  function defField(fieldId: string): PlanFieldDef | null {
    const defs = plan?.definitions;
    if (!defs) return null;
    for (const cat of ["input_conditions","collection_items","completion_criteria","custom"] as const) {
      const d = defs[cat].find(f => f.id === fieldId);
      if (d) return d;
    }
    return null;
  }

  function statusClass(entry: ExecutionEntry): string {
    const s = computeEntryStatus(entry);
    return { active: "bg-success", completed: "bg-primary", partial: "bg-info", pending: "" }[s] || "";
  }

  function statusLabel(entry: ExecutionEntry): string {
    const s = computeEntryStatus(entry);
    return { active: "Active", completed: "Done", partial: `${entry.executions.filter(r => r.status==="completed").length}/${entry.required_executions}`, pending: "" }[s] || "";
  }

  function formatTime(ts: string | null): string {
    if (!ts) return "";
    return new Date(ts).toLocaleString();
  }
</script>

<div class="log-editor">
  <div class="log-toolbar">
    <a href={p("/projects/:id", { params: { id } })} class="btn btn-sm btn-outline-secondary">Back</a>
    <span class="flex-grow-1"></span>
    {#if !doc?.entries?.length}
      <button class="btn btn-sm btn-primary" onclick={handleInit}>Initialize</button>
    {:else}
      <button class="btn btn-sm btn-outline-info" onclick={() => (showAdhoc = true)}>+ Ad-hoc</button>
    {/if}
  </div>

  {#if $execState.loading}
    <div class="p-3">Loading...</div>
  {:else if $execState.error}
    <div class="alert alert-danger m-2">{$execState.error}</div>
  {:else if !doc?.entries?.length}
    <div class="p-5 text-center"><p class="text-muted">Init execution log from a plan.</p></div>
  {:else if plan}
      <div class="log-body" onclick={closeCtx} role="presentation">
      <!-- Left Sidebar: Tree -->
      <div class="log-left">
        <div class="p-2 border-bottom"><small class="fw-bold text-muted">EXECUTION LOG</small></div>
        {#each plan.root as node (node.id)}
          <LogStepTree
            {node}
            plan={plan}
            doc={doc}
            {selectedEntryId}
            {ctxMenu}
            entryForStep={entryForStep}
            selectEntry={(eid: string | null) => selectedEntryId = eid}
            activeRun={activeRun}
            {statusClass}
            {statusLabel}
          />
        {/each}

        {#each (doc?.entries || []).filter(e => e.type === "adhoc") as ae (ae.id)}
          <div class="log-step adhoc" class:selected={ae.id === selectedEntryId} onclick={() => selectedEntryId = ae.id}>
            <span class="log-step-title">{ae.step_title}</span>
            <span class="flex-grow-1"></span>
            <span class="badge bg-info me-1">Ad-hoc</span>
          </div>
        {/each}
      </div>

      <!-- Right: Detail Panel -->
      <div class="log-right">
        {#if selEntry && selStep}
          {@const run = activeRun(selEntry)}
          <div class="log-detail">
            <!-- Header -->
            <div class="log-detail-header">
              <div class="d-flex justify-content-between align-items-center">
                <h5 class="mb-0">{selStep.title}</h5>
                <div class="d-flex align-items-center gap-2">
                  {#if run}
                    <span class="badge bg-success">Running</span>
                  {:else if computeEntryStatus(selEntry) === "completed"}
                    <span class="badge bg-primary">Completed</span>
                    <button class="btn btn-sm btn-outline-success" onclick={() => handleStart(selEntry.plan_step_id!)}>Run Again</button>
                  {:else if computeEntryStatus(selEntry) === "partial"}
                    <span class="badge bg-info">{selEntry.executions.filter(r => r.status==="completed").length}/{selEntry.required_executions}</span>
                    <button class="btn btn-sm btn-outline-success" onclick={() => handleStart(selEntry.plan_step_id!)}>Run Again</button>
                  {:else}
                    <button class="btn btn-sm btn-success" onclick={() => handleStart(selEntry.plan_step_id!)}>Start</button>
                  {/if}
                </div>
              </div>
              {#if selStep.description}
                <small class="text-muted d-block mt-1">{selStep.description}</small>
              {/if}
            </div>

            <div class="log-detail-body">
              <!-- Active run info -->
              {#if run}
                <div class="log-run-active mb-3">
                  <span class="badge bg-success">Run started {formatTime(run.started_at)}</span>
                  <div class="d-flex gap-2 mt-2">
                    <button class="btn btn-success btn-sm" onclick={() => handleCompleteRun(run.id)}>Complete</button>
                    <button class="btn btn-outline-secondary btn-sm" onclick={() => handleSkipRun(run.id)}>Skip</button>
                  </div>
                </div>
              {/if}

              <!-- Inputs: read-only blocks -->
              {#if selStep.input_conditions.length > 0}
                <div class="mb-3">
                  <div class="binding-category">Input Conditions</div>
                  <div class="field-blocks">
                    {#each selStep.input_conditions as b (b.definition_id)}
                      {@const d = defField(b.definition_id)}
                      <div class="field-block">
                        <div class="field-block-label">{d?.name || b.definition_id.slice(0,8)}</div>
                        {#if d?.unit}<small class="text-muted">{d.unit}</small>{/if}
                        <div class="field-block-value">{b.value ?? "—"}</div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Measurements: interactive blocks -->
              {#if selStep.collection_items.length > 0}
                <div class="mb-3">
                  <div class="binding-category">Measurements</div>
                  <div class="field-blocks">
                    {#each selStep.collection_items as b (b.definition_id)}
                      {@const d = defField(b.definition_id)}
                      <div class="field-block measurement">
                        <div class="field-block-label">{d?.name || b.definition_id.slice(0,8)}</div>
                        {#if d?.unit}<small class="text-muted">{d.unit}</small>{/if}
                        {#if run && !run.collection_results.find(r => r.definition_id === b.definition_id)}
                          <div class="mt-1">
                            {#if d?.field_type === "boolean" || d?.field_type === "pass_fail"}
                              <div class="d-flex gap-1"><button class="btn btn-sm btn-outline-success" onclick={() => { b.value = "pass"; }}>Pass</button><button class="btn btn-sm btn-outline-danger" onclick={() => { b.value = "fail"; }}>Fail</button></div>
                            {:else}
                              <input type={d?.field_type === "number" || d?.field_type === "measurement" ? "number" : "text"} class="form-control form-control-sm" placeholder="Value" oninput={(e) => { const raw = (e.target as HTMLInputElement).value; b.value = d?.field_type === "number" || d?.field_type === "measurement" ? (parseFloat(raw) || null) : raw; }} />
                            {/if}
                          </div>
                        {:else}
                          <div class="field-block-value">{b.value ?? "—"}</div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Criteria: interactive blocks -->
              {#if selStep.completion_criteria.length > 0}
                <div class="mb-3">
                  <div class="binding-category">Completion Criteria</div>
                  <div class="field-blocks">
                    {#each selStep.completion_criteria as b (b.definition_id)}
                      {@const d = defField(b.definition_id)}
                      <div class="field-block criteria" class:passed={b.value === true} class:failed={b.value === false}>
                        <div class="field-block-label">{d?.name || b.definition_id.slice(0,8)}</div>
                        {#if d?.field_type === "threshold"}
                          <small class="text-muted">{b.operator} {b.target_value}{d?.unit ? ` ${d.unit}` : ""}</small>
                        {/if}
                        {#if run && !run.criteria_results.find(r => r.definition_id === b.definition_id)}
                          <div class="mt-1 d-flex gap-1">
                            <button class="btn btn-sm btn-outline-success" onclick={() => { b.value = true; }}>Pass</button>
                            <button class="btn btn-sm btn-outline-danger" onclick={() => { b.value = false; }}>Fail</button>
                          </div>
                        {:else}
                          <div class="field-block-value">
                            {#if b.value === true}<span class="text-success">Pass</span>{:else if b.value === false}<span class="text-danger">Fail</span>{:else}—{/if}
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Run History -->
              {#if selEntry.executions.length > 0}
                <div class="mb-3">
                  <div class="binding-category">Run History ({selEntry.executions.length})</div>
                  {#each selEntry.executions as r (r.id)}
                    <div class="run-record">
                      <div class="d-flex align-items-center gap-2">
                        <span class="badge bg-{r.status === 'completed' ? 'success' : r.status === 'skipped' ? 'warning' : 'secondary'}">{r.status}</span>
                        <small>{formatTime(r.started_at)}{#if r.completed_at} → {formatTime(r.completed_at)}{/if}</small>
                      </div>
                      {#if r.notes}<small class="text-muted d-block mt-1">{r.notes}</small>{/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {:else if selEntry && selEntry.type === "adhoc"}
          <div class="log-detail">
            <div class="log-detail-header">
              <h5 class="mb-0">{selEntry.step_title}</h5>
              <span class="badge bg-info">Ad-hoc</span>
            </div>
            <div class="log-detail-body">
              {#each selEntry.executions as r (r.id)}
                <div class="run-record">
                  <small>{formatTime(r.started_at)}</small>
                  {#if r.notes}<p class="mt-1">{r.notes}</p>{/if}
                </div>
              {/each}
            </div>
          </div>
        {:else if plan}
          <div class="p-4 text-center text-muted">
            <div style="font-size:2rem;opacity:0.3">&#x2699;</div>
            Select a step to view details
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if contextMenu}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="context-menu" style="position:fixed;left:{contextMenu.x}px;top:{contextMenu.y}px" onclick={(e) => e.stopPropagation()}>
      <button class="context-item" onclick={() => { handleStart(contextMenu!.stepId); closeCtx(); }}>Start {plan && findNode(plan.root, contextMenu!.stepId)?.title}</button>
    </div>
  {/if}

  {#if showAdhoc}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={() => (showAdhoc = false)}></div>
    <div class="modal d-block" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Ad-hoc Entry</h5><button class="btn-close" onclick={() => (showAdhoc = false)}></button></div>
      <div class="modal-body">
        <div class="mb-2"><input class="form-control form-control-sm" placeholder="Title" bind:value={adhocTitle} /></div>
        <div class="mb-2"><textarea class="form-control form-control-sm" rows="3" placeholder="Notes" bind:value={adhocNotes}></textarea></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick={() => (showAdhoc = false)}>Cancel</button><button class="btn btn-primary" onclick={handleAdhoc} disabled={!adhocTitle}>Save</button></div>
    </div></div></div>
  {/if}

  {#if conflictModal}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={conflictCancel}></div>
    <div class="modal d-block" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
      <div class="modal-header bg-warning"><h5 class="modal-title">Active Run Conflict</h5><button class="btn-close" onclick={conflictCancel}></button></div>
      <div class="modal-body">
        <p>A step is already running: <strong>{conflictModal.activeEntry?.step_title}</strong></p>
        <p class="text-muted small">What should we do before starting the new step?</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick={conflictCancel}>Cancel</button>
        <button class="btn btn-outline-warning" onclick={conflictSkipPrevious}>Skip Previous</button>
        <button class="btn btn-success" onclick={conflictStopPrevious}>Stop Previous &amp; Start</button>
      </div>
    </div></div></div>
  {/if}
</div>

<style>
  .log-editor { display: flex; flex-direction: column; height: calc(100vh - 70px); overflow: hidden; }
  .log-toolbar { display: flex; align-items: center; padding: 6px 12px; border-bottom: 1px solid #dee2e6; background: #f8f9fa; flex-shrink: 0; gap: 4px; }
  .log-body { display: flex; flex: 1; overflow: hidden; }
  .log-left { width: 280px; min-width: 200px; border-right: 1px solid #dee2e6; overflow-y: auto; }
  .log-right { flex: 1; overflow-y: auto; background: #fafafa; }
  .log-step.adhoc { border-left: 3px solid #0dcaf0; padding: 5px 10px; display: flex; align-items: center; cursor: pointer; font-size: 0.82rem; border-bottom: 1px solid #f4f4f4; }
  .log-step.adhoc.selected { background: #cfe2ff; }
  .log-step-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .log-detail {}
  .log-detail-header { padding: 12px; border-bottom: 1px solid #dee2e6; background: #fff; }
  .log-detail-body { padding: 12px; }
  .log-run-active { padding: 8px; background: #d1e7dd; border-radius: 6px; }
  .binding-category { font-size: 0.72rem; font-weight: 600; color: #666; text-transform: uppercase; margin-bottom: 6px; padding-bottom: 2px; border-bottom: 1px solid #eee; }
  .field-blocks { display: flex; flex-wrap: wrap; gap: 6px; }
  .field-block { padding: 8px 10px; background: #fff; border: 1px solid #dee2e6; border-radius: 6px; min-width: 100px; flex: 1; }
  .field-block.measurement { border-left: 3px solid #0d6efd; }
  .field-block.criteria { border-left: 3px solid #198754; }
  .field-block.criteria.passed { background: #d1e7dd; border-color: #198754; }
  .field-block.criteria.failed { background: #f8d7da; border-color: #dc3545; }
  .field-block-label { font-size: 0.75rem; font-weight: 600; }
  .field-block-value { font-size: 0.85rem; margin-top: 4px; }
  .run-record { padding: 6px 8px; background: #fff; border: 1px solid #eee; border-radius: 4px; margin-bottom: 3px; font-size: 0.8rem; }
  .context-menu { background: #fff; border: 1px solid #dee2e6; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,.15); padding: 4px 0; min-width: 160px; z-index: 1000; }
  .context-item { display: block; width: 100%; text-align: left; padding: 6px 14px; border: none; background: none; font-size: 0.85rem; cursor: pointer; }
  .context-item:hover { background: #e9ecef; }
  .flex-grow-1 { flex: 1; }
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.3); z-index: 1040; }
  .modal { z-index: 1050; }
</style>
