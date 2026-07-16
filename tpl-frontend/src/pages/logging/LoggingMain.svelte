<script lang="ts">
  import { onMount } from "svelte";
  import { p, route } from "../../router";
  import { execState, load, init, saveDoc, startRun, completeRun, updateRun, computeEntryStatus } from "../../stores/execution";
  import { executionApi, planApi } from "../../lib/api";
  import { findNode, generateId, computeDerivedValues } from "../../lib/plan-utils";
  import { formatDynamic } from "../../lib/dynamic-registry";
  import type { ExecutionEntry, ExecutionRun, ExecutionReading } from "../../types/execution";
  import type { PlanNode, PlanFieldDef, FieldBinding } from "../../types/plan";
  import LogStepTree from "./LogStepTree.svelte";

  let id: string = $derived(route.params.id ?? "");

  let selectedStepId = $state<string | null>(null);
  let selectedEntryId = $state<string | null>(null);
  let contextMenu = $state<{ x: number; y: number; stepId: string; parentGroupId: string | null } | null>(null);
  let showAdhoc = $state(false);
  let adhocTitle = $state("");
  let adhocNotes = $state("");
  let adhocInputs = $state<string[]>([]);
  let adhocMeasurements = $state<string[]>([]);
  let adhocCriteria = $state<string[]>([]);
  let adhocInputValues = $state<Record<string, string>>({});
  let conflictModal = $state<{ stepId: string; activeEntry: ExecutionEntry | null } | null>(null);
  let tick = $state(0);

  // Interactive state for active run
  let measValues = $state<Record<string, string>>({});
  let measFlags = $state<Record<string, "pass" | "fail" | null>>({});
  let critFlags = $state<Record<string, boolean | null>>({});
  let inputValues = $state<Record<string, string>>({});

  function resetRunState() {
    measValues = {}; measFlags = {}; critFlags = {}; inputValues = {};
  }

  $effect(() => {
    const run = activeRunForAny();
    if (!run?.started_at) return;
    const started = new Date(run.started_at).getTime();
    const update = () => { tick = Math.floor((Date.now() - started) / 1000); };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  });

  function activeRunForAny(): ExecutionRun | undefined {
    if (!doc) return undefined;
    for (const e of doc.entries) {
      const r = e.executions.find(r => r.status === "in_progress");
      if (r) return r;
    }
    return undefined;
  }

  function formatElapsed(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function resetAdhoc() {
    adhocTitle = "";
    adhocNotes = "";
    adhocInputs = [];
    adhocMeasurements = [];
    adhocCriteria = [];
    adhocInputValues = {};
    showAdhoc = false;
  }

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
  const pureStep = $derived(selectedStepId && plan ? findNode(plan.root, selectedStepId) : null);

  // For ad-hoc entries: build synthetic field bindings from selected definitions
  const adhocBindings = $derived((selEntry?.type === "adhoc" && plan && selEntry.selected_bindings) ? {
    input_conditions: (selEntry.selected_bindings.input_conditions || []).map(id => 
      plan.definitions.input_conditions.find(d => d.id === id) || { id, name: "", data_type: "text", unit: null, meta: null }
    ).map(d => ({ definition_id: d.id, value: null })),
    collection_items: (selEntry.selected_bindings.collection_items || []).map(id =>
      plan.definitions.collection_items.find(d => d.id === id) || { id, name: "", data_type: "text", unit: null, meta: null }
    ).map(d => ({ definition_id: d.id, value: null })),
    completion_criteria: (selEntry.selected_bindings.completion_criteria || []).map(id =>
      plan.definitions.completion_criteria.find(d => d.id === id) || { id, name: "", data_type: "text", unit: null, meta: null }
    ).map(d => ({ definition_id: d.id, value: null })),
  } : null);

  // Effective step data for the detail panel
  const displayStep = $derived(selStep || pureStep || (adhocBindings ? {
    type: "step" as const,
    title: selEntry?.step_title || "",
    description: null as string | null,
    duration_minutes: 0,
    changeover_minutes: 0,
    ...adhocBindings,
    system_config: null,
    required_executions: 1,
  } as PlanNode : null));

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
    doStartByStepId(stepId);
  }

  async function doStart(entryId: string) {
    if (!doc) return;
    const entry = doc.entries.find(e => e.id === entryId);
    if (!entry) return;

    const updated = startRun(entry);
    doc.entries = doc.entries.map(e => e.id === entry.id ? updated : e);
    dirty();

    selectedEntryId = entry.id;
    await executionApi.saveDoc(id, doc);
  }

  async function doStartByStepId(stepId: string) {
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
    await doStartByStepId(stepId);
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
    await doStartByStepId(stepId);
  }

  function conflictCancel() {
    conflictModal = null;
  }

  async function handleCompleteRun(runId: string) {
    if (!doc || !selEntry) return;

    const input_readings: Array<{ definition_id: string; definition_name: string; value: unknown }> = (displayStep?.input_conditions || []).map((b: FieldBinding) => ({
      definition_id: b.definition_id,
      definition_name: defName(b.definition_id),
      value: inputValues[b.definition_id] ?? b.value ?? null,
    }));

    if (plan && plan.transforms?.length) {
      const derived = computeDerivedValues(plan.transforms, input_readings as any, plan.definitions);
      input_readings.push(...derived);
    }
    const collection_results = (displayStep?.collection_items || []).map((b: FieldBinding) => ({
      definition_id: b.definition_id,
      definition_name: defName(b.definition_id),
      result: measFlags[b.definition_id] ?? measValues[b.definition_id] ?? String(b.value ?? null),
      notes: null as string | null,
    }));
    const criteria_results = (displayStep?.completion_criteria || []).map((b: FieldBinding) => ({
      definition_id: b.definition_id,
      definition_name: defName(b.definition_id),
      passed: critFlags[b.definition_id] ?? (b.value === true ? true : (b.value === false ? false : null)),
      notes: null as string | null,
    }));

    const updated = completeRun(selEntry, runId, { input_readings, collection_results, criteria_results });
    doc.entries = doc.entries.map(e => e.id === selEntry.id ? updated : e);
    resetRunState();
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

  function adhocNode(ae: ExecutionEntry): PlanNode {
    return {
      id: ae.id, type: "step", title: ae.step_title, children: [],
      description: null, duration_minutes: 0, changeover_minutes: 0,
      input_conditions: [], collection_items: [], completion_criteria: [],
      system_config: null, required_executions: 1,
      step_template_id: null, solution_step_id: null,
    };
  }

  // --- Ad-hoc ---
  async function handleAdhoc() {
    if (!doc || !adhocTitle) return;

    const inputValuesRecord: Record<string, unknown> = {};
    for (const defId of adhocInputs) {
      if (adhocInputValues[defId] != null) inputValuesRecord[defId] = adhocInputValues[defId];
    }

    const entry: ExecutionEntry = {
      id: generateId(),
      plan_step_id: null,
      step_title: adhocTitle,
      type: "adhoc",
      required_executions: 1,
      executions: [],
      selected_bindings: {
        input_conditions: adhocInputs,
        collection_items: adhocMeasurements,
        completion_criteria: adhocCriteria,
        input_values: inputValuesRecord,
      },
    };

    doc.entries = [...doc.entries, entry];
    dirty();
    await executionApi.saveDoc(id, doc);
    resetAdhoc();
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
            onStepClick={(sid, eid) => { selectedStepId = sid; selectedEntryId = eid; }}
            activeRun={activeRun}
            {statusClass}
            {statusLabel}
          />
        {/each}

        {#if (doc?.entries || []).some(e => e.type === "adhoc")}
          <div class="log-group-header" style="padding-left: 8px">
            <span class="group-title" style="color:#6f42c1">AD-HOC</span>
          </div>
          {#each (doc?.entries || []).filter(e => e.type === "adhoc") as ae (ae.id)}
            <LogStepTree
              node={adhocNode(ae)}
              plan={plan}
              doc={doc}
              {selectedEntryId}
              ctxMenu={() => {}}
              entryForStep={(sid: string) => doc?.entries.find(e => e.id === sid && e.type === "adhoc")}
              onStepClick={(sid, eid) => { selectedStepId = sid; selectedEntryId = eid; }}
              activeRun={activeRun}
              {statusClass}
              {statusLabel}
            />
          {/each}
        {/if}
      </div>

      <!-- Right: Detail Panel -->
      <div class="log-right">
        {#if displayStep}
          {@const run = selEntry ? activeRun(selEntry) : undefined}
          <div class="log-detail">
            <div class="log-detail-header">
              <div class="d-flex justify-content-between align-items-center">
                <h5 class="mb-0">{displayStep.title}{#if selEntry?.type === "adhoc"} <small class="text-muted">(ad-hoc)</small>{/if}</h5>
                <div class="d-flex align-items-center gap-2">
                  {#if selEntry}
                    {#if run}
                      <span class="badge bg-success">Running</span>
                    {:else if computeEntryStatus(selEntry) === "completed"}
                      <span class="badge bg-primary">Completed</span>
                      {#if selEntry.required_executions > 1}
                        <span class="badge bg-info">{selEntry.executions.filter(r => r.status === "completed").length}/{selEntry.required_executions}</span>
                      {/if}
                      <button class="btn btn-sm btn-outline-success" onclick={() => selEntry.plan_step_id ? handleStart(selEntry.plan_step_id!) : doStart(selEntry.id)}>Run Again</button>
                    {:else if computeEntryStatus(selEntry) === "partial"}
                      <span class="badge bg-info">{selEntry.executions.filter(r => r.status==="completed").length}/{selEntry.required_executions}</span>
                      <button class="btn btn-sm btn-outline-success" onclick={() => selEntry.plan_step_id ? handleStart(selEntry.plan_step_id!) : doStart(selEntry.id)}>Run Again</button>
                    {:else}
                      {#if selEntry.required_executions > 1}
                        <span class="badge bg-info">{selEntry.executions.filter(r => r.status === "completed").length}/{selEntry.required_executions}</span>
                      {/if}
                      <button class="btn btn-sm btn-success" onclick={() => selEntry.plan_step_id ? handleStart(selEntry.plan_step_id!) : doStart(selEntry.id)}>Start</button>
                    {/if}
                    {:else}
                      {#if displayStep.required_executions > 1}
                        <span class="badge bg-info">0/{displayStep.required_executions}</span>
                      {/if}
                      <button class="btn btn-sm btn-success" onclick={() => handleStart(displayStep.id)}>Start</button>
                  {/if}
                </div>
              </div>
              {#if displayStep.description}
                <small class="text-muted d-block mt-1">{displayStep.description}</small>
              {/if}
            </div>

            <div class="log-detail-body">
              <!-- Active run info -->
              {#if selEntry && run}
                <div class="log-run-active mb-3">
                  <div class="d-flex justify-content-between align-items-start">
                    <div>
                      <div class="d-flex align-items-center gap-2">
                        <span class="badge bg-success">Running</span>
                        {#if selEntry.required_executions > 1}
                          <span class="badge bg-info">{selEntry.executions.filter(r => r.status === "completed").length + 1}/{selEntry.required_executions}</span>
                        {/if}
                        <strong class="elapsed-timer">{formatElapsed(tick)}</strong>
                      </div>
                      <small class="text-muted">Started {formatTime(run.started_at)}</small>
                    </div>
                    <div class="d-flex gap-2 mt-1">
                      <button class="btn btn-success btn-sm" onclick={() => handleCompleteRun(run.id)}>Complete</button>
                      <button class="btn btn-outline-secondary btn-sm" onclick={() => handleSkipRun(run.id)}>Skip</button>
                    </div>
                  </div>
                </div>
              {/if}

              <!-- Inputs: read-only blocks (editable during run for dynamic types) -->
              {#if displayStep.input_conditions.length > 0}
                <div class="mb-3">
                  <div class="binding-category">Input Conditions</div>
                  <div class="field-blocks">
                    {#each displayStep.input_conditions as b (b.definition_id)}
                      {@const d = defField(b.definition_id)}
                      {@const isDynamic = !!(b.dynamic_type && b.dynamic_type !== "constant")}
                      {@const isDerived = d?.derived === true}
                      {@const inputVal = inputValues[b.definition_id] ?? b.value ?? (selEntry?.selected_bindings?.input_values as any)?.[b.definition_id]}
                      <div class="field-block" class:derived={isDerived}>
                        <div class="field-block-label">
                          {d?.name || b.definition_id.slice(0,8)}
                          {#if isDynamic}<span class="badge bg-info ms-1">Dynamic</span>{/if}
                          {#if isDerived}<span class="badge bg-secondary ms-1">Computed</span>{/if}
                        </div>
                        {#if d?.unit}<small class="text-muted">{d.unit}</small>{/if}
                        {#if d?.meta?.tolerance_plus != null}
                          <small class="text-muted d-block">±{d.meta.tolerance_plus}{d.meta.tolerance_minus != null ? `/+${d.meta.tolerance_minus}` : ""}{d.unit ? ` ${d.unit}` : ""}</small>
                        {/if}
                        {#if d?.meta?.reference_value != null}
                          <small class="text-muted d-block">ref: {d.meta.reference_value}{d.unit ? ` ${d.unit}` : ""}</small>
                        {/if}
                        {#if d?.meta?.start != null}
                          <small class="text-muted d-block">{d.meta.start}→{d.meta.stop} step {d.meta.step}{d.unit ? ` ${d.unit}` : ""}</small>
                        {/if}
                        {#if b.dynamic_type && b.dynamic_type !== "constant"}
                          <small class="text-muted d-block">{formatDynamic(b.dynamic_type, b.dynamic_params ?? {})}</small>
                        {/if}

                        {#if run && isDynamic}
                          <input type="text"
                            class="form-control form-control-sm mt-1"
                            placeholder="Value"
                            value={inputVal ?? ""}
                            oninput={(e) => inputValues = { ...inputValues, [b.definition_id]: (e.target as HTMLInputElement).value }}
                          />
                        {:else if isDerived && run}
                          {@const dr = run.input_readings.find(r => r.definition_id === b.definition_id)}
                          <div class="field-block-value">{dr?.value ?? inputVal ?? "—"}</div>
                        {:else}
                          <div class="field-block-value">{inputVal ?? "—"}</div>
                        {/if}

                        {#if plan?.transforms}
                          {@const myXforms = plan.transforms.filter(t => t.derived_definition_id === b.definition_id)}
                          {#if myXforms.length > 0 && selEntry}
                            {@const lastRun = selEntry.executions.filter((e: ExecutionRun) => e.status === "completed").reverse()[0]}
                            <div class="derived-outputs mt-1">
                              {#each myXforms as xf (xf.id)}
                                {@const xfVal = lastRun?.input_readings?.find((r: ExecutionReading) => r.definition_id === xf.id)?.value}
                                <div class="derived-output-item">
                                  <span class="derived-output-name">{xf.derived_name || defName(xf.derived_definition_id)}</span>
                                  {#if xfVal != null}
                                    <span class="derived-output-value">{String(xfVal)}{xf.derived_unit ? ` ${xf.derived_unit}` : ""}</span>
                                  {:else}
                                    <span class="derived-output-value text-muted">—</span>
                                  {/if}
                                </div>
                              {/each}
                            </div>
                          {/if}
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Measurements: interactive blocks -->
              {#if displayStep.collection_items.length > 0}
                <div class="mb-3">
                  <div class="binding-category">Measurements</div>
                  <div class="field-blocks">
                    {#each displayStep.collection_items as b (b.definition_id)}
                      {@const d = defField(b.definition_id)}
                      {@const saved = run?.collection_results.find(r => r.definition_id === b.definition_id)}
                      {@const chosen = measFlags[b.definition_id]}
                      {@const val = measValues[b.definition_id]}
                      <div class="field-block measurement">
                        <div class="field-block-label">{d?.name || b.definition_id.slice(0,8)}</div>
                        {#if d?.unit}<small class="text-muted">{d.unit}</small>{/if}
                          {#if run && !saved}
                            <div class="mt-1">
                              {#if d?.data_type === "bool"}
                                <div class="d-flex gap-1">
                                  <button class="btn btn-sm {chosen === 'pass' ? 'btn-success' : 'btn-outline-success'}" onclick={() => measFlags = { ...measFlags, [b.definition_id]: 'pass' }}>Pass</button>
                                  <button class="btn btn-sm {chosen === 'fail' ? 'btn-danger' : 'btn-outline-danger'}" onclick={() => measFlags = { ...measFlags, [b.definition_id]: 'fail' }}>Fail</button>
                                </div>
                              {:else if d?.data_type === "number"}
                                <div class="input-group input-group-sm">
                                  <input type="number" class="form-control form-control-sm" placeholder="Value" value={val ?? ""} oninput={(e) => measValues = { ...measValues, [b.definition_id]: (e.target as HTMLInputElement).value }} />
                                  {#if d?.unit}<span class="input-group-text">{d.unit}</span>{/if}
                                </div>
                              {:else}
                                <input type="text" class="form-control form-control-sm" placeholder="Value" value={val ?? ""} oninput={(e) => measValues = { ...measValues, [b.definition_id]: (e.target as HTMLInputElement).value }} />
                              {/if}
                            </div>
                          {:else}
                          <div class="field-block-value">{saved?.result ?? val ?? b.value ?? "—"}</div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Criteria: interactive blocks -->
              {#if displayStep.completion_criteria.length > 0}
                <div class="mb-3">
                  <div class="binding-category">Completion Criteria</div>
                  <div class="field-blocks">
                    {#each displayStep.completion_criteria as b (b.definition_id)}
                      {@const d = defField(b.definition_id)}
                      {@const saved = run?.criteria_results.find(r => r.definition_id === b.definition_id)}
                      {@const chosen = critFlags[b.definition_id]}
                      <div class="field-block criteria" class:passed={chosen === true} class:failed={chosen === false}>
                        <div class="field-block-label">{d?.name || b.definition_id.slice(0,8)}</div>
                        {#if run && !saved}
                          <div class="mt-1 d-flex gap-1">
                            <button class="btn btn-sm {chosen === true ? 'btn-success' : 'btn-outline-success'}" onclick={() => critFlags = { ...critFlags, [b.definition_id]: true }}>Pass</button>
                            <button class="btn btn-sm {chosen === false ? 'btn-danger' : 'btn-outline-danger'}" onclick={() => critFlags = { ...critFlags, [b.definition_id]: false }}>Fail</button>
                          </div>
                        {:else}
                          <div class="field-block-value">
                            {#if saved}
                              <span class="{saved.passed ? 'text-success' : 'text-danger'}">{saved.passed ? 'Pass' : 'Fail'}</span>
                            {:else if chosen === true}
                              <span class="text-success">Pass</span>
                            {:else if chosen === false}
                              <span class="text-danger">Fail</span>
                            {:else}
                              —
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Run History -->
              {#if selEntry && selEntry.executions.length > 0}
                <div class="mb-3">
                  <div class="binding-category">Run History ({selEntry.executions.length})</div>
                  {#each selEntry.executions as r (r.id)}
                    <div class="run-record">
                      <div class="d-flex align-items-center gap-2">
                        <span class="badge bg-{r.status === 'completed' ? 'success' : r.status === 'skipped' ? 'warning' : 'secondary'}">{r.status}</span>
                        <small>{formatTime(r.started_at)}{#if r.completed_at} → {formatTime(r.completed_at)}{/if}</small>
                      </div>
                      {#if r.input_readings.length > 0 || r.collection_results.length > 0 || r.criteria_results.length > 0}
                        <div class="run-mini-row">
                          {#if r.input_readings.length > 0}
                            <div class="run-mini-col">
                              <div class="run-mini-label">Inputs</div>
                              {#each r.input_readings as ir}
                                <span class="run-mini-chip">{ir.definition_name}: {ir.value ?? "—"}</span>
                              {/each}
                            </div>
                          {/if}
                          {#if r.collection_results.length > 0}
                            <div class="run-mini-col">
                              <div class="run-mini-label">Measurements</div>
                              {#each r.collection_results as cr}
                                <span class="run-mini-chip" class:pass={cr.result === "pass"} class:fail={cr.result === "fail"}>
                                  {cr.definition_name}: {cr.result ?? "—"}
                                </span>
                              {/each}
                            </div>
                          {/if}
                          {#if r.criteria_results.length > 0}
                            <div class="run-mini-col">
                              <div class="run-mini-label">Criteria</div>
                              {#each r.criteria_results as cr}
                                <span class="run-mini-chip" class:pass={cr.passed === true} class:fail={cr.passed === false}>
                                  {cr.definition_name}: {cr.passed === true ? "Pass" : cr.passed === false ? "Fail" : "—"}
                                </span>
                              {/each}
                            </div>
                          {/if}
                        </div>
                      {/if}
                      {#if r.notes}<small class="text-muted d-block mt-1">{r.notes}</small>{/if}
                    </div>
                  {/each}
                </div>
              {/if}
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
    <div class="modal-backdrop" onclick={resetAdhoc}></div>
    <div class="modal d-block" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Ad-hoc Entry</h5><button class="btn-close" onclick={resetAdhoc}></button></div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        <div class="mb-3"><label class="form-label small fw-bold">Title</label><input class="form-control form-control-sm" placeholder="Title" bind:value={adhocTitle} /></div>

        {#if plan}
          <!-- Input Conditions -->
          {#if plan.definitions.input_conditions.length > 0}
            <div class="mb-3">
              <div class="binding-category mb-1">Input Conditions</div>
              {#each plan.definitions.input_conditions as f (f.id)}
                <div class="adhoc-field">
                  <label class="adhoc-check">
                    <input type="checkbox" checked={adhocInputs.includes(f.id)} onchange={(e) => {
                      const checked = (e.target as HTMLInputElement).checked;
                      adhocInputs = checked ? [...adhocInputs, f.id] : adhocInputs.filter(x => x !== f.id);
                      if (!checked) { delete adhocInputValues[f.id]; adhocInputValues = Object.fromEntries(Object.entries(adhocInputValues)); }
                    }} />
                    <span>{f.name}{#if f.unit} <small class="text-muted">({f.unit})</small>{/if}</span>
                  </label>
                  {#if adhocInputs.includes(f.id)}
                    {#if f.data_type === "select" && f.meta?.options?.length}
                      <select class="form-select form-select-sm mt-1" value={adhocInputValues[f.id] ?? ""} onchange={(e) => {
                        adhocInputValues[f.id] = (e.target as HTMLSelectElement).value;
                        adhocInputValues = { ...adhocInputValues };
                      }}>
                        <option value="">--</option>
                        {#each f.meta.options as opt}<option value={opt}>{opt}</option>{/each}
                      </select>
                    {:else}
                      <input
                        type={f.data_type === "number" ? "number" : "text"}
                        class="form-control form-control-sm mt-1"
                        placeholder="Value"
                        value={adhocInputValues[f.id] ?? ""}
                        oninput={(e) => {
                          adhocInputValues[f.id] = (e.target as HTMLInputElement).value;
                          adhocInputValues = { ...adhocInputValues };
                        }}
                      />
                    {/if}
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          <!-- Measurement Items -->
          {#if plan.definitions.collection_items.length > 0}
            <div class="mb-3">
              <div class="binding-category mb-1">Measurement Items</div>
              {#each plan.definitions.collection_items as f (f.id)}
                <div class="adhoc-field">
                  <label class="adhoc-check">
                    <input type="checkbox" checked={adhocMeasurements.includes(f.id)} onchange={(e) => {
                      const checked = (e.target as HTMLInputElement).checked;
                      adhocMeasurements = checked ? [...adhocMeasurements, f.id] : adhocMeasurements.filter(x => x !== f.id);
                    }} />
                    <span>{f.name}{#if f.unit} <small class="text-muted">({f.unit})</small>{/if}</span>
                  </label>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Completion Criteria -->
          {#if plan.definitions.completion_criteria.length > 0}
            <div class="mb-3">
              <div class="binding-category mb-1">Completion Criteria</div>
              {#each plan.definitions.completion_criteria as f (f.id)}
                <div class="adhoc-field">
                  <label class="adhoc-check">
                    <input type="checkbox" checked={adhocCriteria.includes(f.id)} onchange={(e) => {
                      const checked = (e.target as HTMLInputElement).checked;
                      adhocCriteria = checked ? [...adhocCriteria, f.id] : adhocCriteria.filter(x => x !== f.id);
                    }} />
                    <span>{f.name}{#if f.unit} <small class="text-muted">({f.unit})</small>{/if}</span>
                  </label>
                </div>
              {/each}
            </div>
          {/if}

          {#if plan.definitions.input_conditions.length === 0 && plan.definitions.collection_items.length === 0 && plan.definitions.completion_criteria.length === 0}
            <p class="text-muted small">No definitions in plan. Add definitions in the Plan Editor first.</p>
          {/if}
        {/if}

        <div class="mb-2"><label class="form-label small fw-bold">Notes</label><textarea class="form-control form-control-sm" rows="2" placeholder="Notes" bind:value={adhocNotes}></textarea></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick={resetAdhoc}>Cancel</button><button class="btn btn-primary" onclick={handleAdhoc} disabled={!adhocTitle}>Save</button></div>
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
  .log-group-header {
    display: flex; align-items: center; padding: 5px 10px;
    font-size: 0.8rem; font-weight: 600; color: #495057; background: #f0f1f2;
    border-bottom: 1px solid #dee2e6; border-top: 1px solid #dee2e6; margin-top: 1px;
  }
  .group-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; letter-spacing: 0.5px; }
  .log-step-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .log-detail {}
  .log-detail-header { padding: 12px; border-bottom: 1px solid #dee2e6; background: #fff; }
  .log-detail-body { padding: 12px; }
  .log-run-active { padding: 8px; background: #d1e7dd; border-radius: 6px; }
  .elapsed-timer { font-size: 1.3rem; font-variant-numeric: tabular-nums; color: #0f5132; }
  .binding-category { font-size: 0.72rem; font-weight: 600; color: #666; text-transform: uppercase; margin-bottom: 6px; padding-bottom: 2px; border-bottom: 1px solid #eee; }
  .field-blocks { display: flex; flex-wrap: wrap; gap: 6px; }
  .field-block { padding: 8px 10px; background: #fff; border: 1px solid #dee2e6; border-radius: 6px; min-width: 100px; flex: 1; }
  .field-block.measurement { border-left: 3px solid #0d6efd; }
  .field-block.derived { border-left: 3px solid #6f42c1; background: #f8f6ff; }
  .derived-outputs { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
  .derived-output-item { padding: 2px 6px; background: #f0f0ff; border: 1px solid #c8c8e4; border-radius: 3px; font-size: 0.7rem; display: flex; gap: 4px; align-items: center; }
  .derived-output-name { color: #6f42c1; font-weight: 500; }
  .derived-output-value { color: #333; }
  .field-block.criteria { border-left: 3px solid #198754; }
  .field-block.criteria.passed { background: #d1e7dd; border-color: #198754; }
  .field-block.criteria.failed { background: #f8d7da; border-color: #dc3545; }
  .field-block-label { font-size: 0.75rem; font-weight: 600; }
  .field-block-value { font-size: 0.85rem; margin-top: 4px; }
  .run-record { padding: 6px 8px; background: #fff; border: 1px solid #eee; border-radius: 4px; margin-bottom: 3px; font-size: 0.8rem; }
  .run-mini-section { margin-top: 4px; }
  .run-mini-row { display: flex; gap: 12px; margin-top: 4px; }
  .run-mini-col { flex: 1; min-width: 0; }
  .run-mini-label { font-size: 0.68rem; font-weight: 600; color: #888; text-transform: uppercase; margin-bottom: 2px; }
  .run-mini-chip {
    display: inline-block; padding: 1px 5px; margin: 1px 2px;
    background: #f0f0f0; border-radius: 3px; font-size: 0.72rem;
  }
  .run-mini-chip.pass { background: #d1e7dd; color: #0f5132; }
  .run-mini-chip.fail { background: #f8d7da; color: #842029; }
  .context-menu { background: #fff; border: 1px solid #dee2e6; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,.15); padding: 4px 0; min-width: 160px; z-index: 1000; }
  .context-item { display: block; width: 100%; text-align: left; padding: 6px 14px; border: none; background: none; font-size: 0.85rem; cursor: pointer; }
  .context-item:hover { background: #e9ecef; }
  .flex-grow-1 { flex: 1; }
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.3); z-index: 1040; }
  .modal { z-index: 1050; }
  .adhoc-field { padding: 4px 0; }
  .adhoc-check { display: flex; align-items: center; gap: 6px; font-size: 0.82rem; cursor: pointer; margin: 0; }
  .adhoc-check input[type="checkbox"] { margin: 0; }
</style>
