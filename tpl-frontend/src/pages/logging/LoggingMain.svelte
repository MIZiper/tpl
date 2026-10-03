<script lang="ts">
  import { onMount } from "svelte";
  import { p, route } from "../../router";
  import { execState, load, init, saveDoc, startRun, startRunAt, pauseRun, resumeRun, pausedRun, flatPlanSteps, completeRun, updateRun, computeEntryStatus } from "../../stores/execution";
  import { executionApi, planApi, documentsApi } from "../../lib/api";
  import { findNode, generateId, computeStepOutputs, outputsOf, parseNum, orderedInputDefs, visibleInputDefs, isInputHidden, inputSizeFor, inputSizeClass, type StepOutputs } from "../../lib/plan-utils";
  import { buildExecutionExport, downloadExecutionJSON } from "../../lib/execution-export";
  import { positionMenu } from "../../lib/flip-menu";
  import { createValue, createBindingValue, PlainValue, getValueType, type Value } from "../../lib/values";
  import { defUnit } from "../../lib/fieldtypes";
  import { formatDuration } from "../../lib/gantt";
  import { formatElapsed as formatSpan } from "../../lib/signals";
  import { nowLocalISOWithOffset } from "../../lib/time";
  import type { ExecutionDraft, ExecutionEntry, ExecutionRun } from "../../types/execution";
  import type { PlanNode, PlanFieldDef, FieldBinding } from "../../types/plan";
  import LogStepTree from "./LogStepTree.svelte";
  import SummaryModal from "./SummaryModal.svelte";
  import DocumentNav from "../../components/DocumentNav.svelte";

  let id: string = $derived(route.params.id ?? "");

  let selectedStepId = $state<string | null>(null);
  let selectedEntryId = $state<string | null>(null);
  let contextMenu = $state<{ x: number; y: number; stepId: string; parentGroupId: string | null } | null>(null);
  let showAdhoc = $state(false);
  let showSummary = $state(false);
  let adhocTitle = $state("");
  let adhocDescription = $state("");
  let adhocInputs = $state<string[]>([]);
  let adhocMeasurements = $state<string[]>([]);
  let adhocCriteria = $state<string[]>([]);
  let adhocInputValues = $state<Record<string, string>>({});
  let conflictModal = $state<{ stepId?: string; entryId?: string; activeEntry: ExecutionEntry | null } | null>(null);
  let tick = $state(0);

  // Pause / emergency-transfer resolution
  let resolveModal = $state(false);
  let resolveTarget = $state("");
  let resolveOutcome = $state<"skipped" | "completed">("skipped");
  let resolveNewAdhocTitle = $state("");
  let resolveNotes = $state("");
  let restoredPauseRunId: string | null = null;

  // Skip-with-comment
  let skipModal = $state<{ runId: string } | null>(null);
  let skipNote = $state("");

  // Interactive state for active run
  let measValues = $state<Record<string, string>>({});
  let measFlags = $state<Record<string, "pass" | "fail" | null>>({});
  let critFlags = $state<Record<string, boolean | null>>({});
  let inputValues = $state<Record<string, string>>({});
  let liveInputParams = $state<Record<string, Record<string, string>>>({});

  function resetRunState() {
    measValues = {}; measFlags = {}; critFlags = {}; inputValues = {}; liveInputParams = {};
  }

  $effect(() => {
    const started = timerStart();
    if (started == null) return;
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

  function pausedEntryForAny(): ExecutionEntry | null {
    if (!doc) return null;
    return doc.entries.find(e => e.executions.some(r => r.status === "paused")) || null;
  }

  // Elapsed clock source: the active run's start, else the pause point of a
  // paused run (emergency timing continues from there).
  function timerStart(): number | null {
    const run = activeRunForAny();
    if (run?.started_at) {
      const t = new Date(run.started_at).getTime();
      if (Number.isFinite(t)) return t;
    }
    const pe = pausedEntryForAny();
    const pr = pe ? pausedRun(pe) : undefined;
    if (pr?.paused_at) {
      const t = new Date(pr.paused_at).getTime();
      if (Number.isFinite(t)) return t;
    }
    return null;
  }

  function formatElapsed(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function runDurationMs(r: ExecutionRun): number | null {
    if (!r.started_at || !r.completed_at) return null;
    const ms = new Date(r.completed_at).getTime() - new Date(r.started_at).getTime();
    return ms >= 0 ? ms : null;
  }

  function resetAdhoc() {
    adhocTitle = "";
    adhocDescription = "";
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
  const pausedEntry = $derived(doc?.entries.find(e => e.executions.some(r => r.status === "paused")) ?? null);
  const hasRunning = $derived((doc?.entries ?? []).some(e => e.executions.some(r => r.status === "in_progress")));

  // Restore the stashed live edits of a paused run (e.g. after a page reload).
  $effect(() => {
    const pe = pausedEntry;
    const pr = pe ? pausedRun(pe) : undefined;
    if (!pe || !pr) { restoredPauseRunId = null; return; }
    if (restoredPauseRunId === pr.id) return;
    restoreDraft(pr.draft ?? null);
    restoredPauseRunId = pr.id;
  });

  function restoreDraft(d: ExecutionDraft | null) {
    inputValues = { ...(d?.inputValues ?? {}) };
    measValues = { ...(d?.measValues ?? {}) };
    measFlags = { ...(d?.measFlags ?? {}) };
    critFlags = { ...(d?.critFlags ?? {}) };
    liveInputParams = { ...(d?.liveInputParams ?? {}) };
  }

  function snapshotDraft(): ExecutionDraft {
    return {
      inputValues: { ...inputValues },
      measValues: { ...measValues },
      measFlags: { ...measFlags },
      critFlags: { ...critFlags },
      liveInputParams: { ...liveInputParams },
    };
  }

  // Emergency transfer targets: every plan step (entry optional), existing
  // ad-hoc entries, and a brand-new ad-hoc entry.
  const resolveTargets = $derived.by(() => {
    const out: { id: string; label: string }[] = [];
    if (plan) for (const s of flatPlanSteps(plan)) out.push({ id: `step:${s.id}`, label: s.title });
    for (const e of doc?.entries ?? []) {
      if (e.type === "adhoc") out.push({ id: `entry:${e.id}`, label: `(ad-hoc) ${e.step_title}` });
    }
    out.push({ id: "__new_adhoc__", label: "New ad-hoc emergency" });
    return out;
  });

  function entryForStep(stepId: string): ExecutionEntry | undefined {
    return doc?.entries.find(e => e.plan_step_id === stepId && e.type === "planned");
  }

  function selectedEntry(): ExecutionEntry | undefined {
    if (!doc) return undefined;
    return doc.entries.find(e => e.id === selectedEntryId);
  }

  function dirty() {
    if (!doc) return;
    execState.update(s => ({ ...s, document: { ...doc!, entries: [...doc!.entries] } }));
  }

  const selEntry = $derived(selectedEntry());
  const selStep = $derived(selEntry?.plan_step_id && plan ? findNode(plan.root, selEntry.plan_step_id) : null);
  const pureStep = $derived(selectedStepId && plan ? findNode(plan.root, selectedStepId) : null);

  // Only the entry owning the active (or paused) run is allowed to read the
  // live edit buffers; every other step falls back to its bound plan values.
  const liveEntryId = $derived(
    doc?.entries.find(e => e.executions.some(r => r.status === "in_progress" || r.status === "paused"))?.id ?? null
  );
  const isLiveView = $derived(!!selEntry && selEntry.id === liveEntryId);

  function adhocBindingsFor(entry: ExecutionEntry | undefined) {
    if (!(entry?.type === "adhoc" && plan && entry.selected_bindings)) return null;
    return {
      input_conditions: (entry.selected_bindings.input_conditions || []).map(id =>
        plan.definitions.input_conditions.find(d => d.id === id) || { id, typeId: "text", name: "", params: {} }
      ).map(d => ({ definition_id: d.id, value: null })),
      collection_items: (entry.selected_bindings.collection_items || []).map(id =>
        plan.definitions.collection_items.find(d => d.id === id) || { id, typeId: "text", name: "", params: {} }
      ).map(d => ({ definition_id: d.id, value: null })),
      completion_criteria: (entry.selected_bindings.completion_criteria || []).map(id =>
        plan.definitions.completion_criteria.find(d => d.id === id) || { id, typeId: "text", name: "", params: {} }
      ).map(d => ({ definition_id: d.id, value: null })),
    };
  }

  const adhocBindings = $derived(adhocBindingsFor(selEntry));

  const displayStep = $derived(selStep || pureStep || (adhocBindings ? {
    type: "step" as const,
    title: selEntry?.step_title || "",
    description: (selEntry?.description ?? null) as string | null,
    duration_minutes: 0,
    changeover_minutes: 0,
    ...adhocBindings,
    required_executions: 1,
  } as PlanNode : null));

  // Build the step node for any entry (planned → plan tree, ad-hoc → bindings).
  function stepForEntry(entry: ExecutionEntry): PlanNode | null {
    if (entry.plan_step_id && plan) return findNode(plan.root, entry.plan_step_id);
    const ab = adhocBindingsFor(entry);
    if (!ab) return null;
    return {
      type: "step" as const,
      title: entry.step_title || "",
      description: (entry.description ?? null) as string | null,
      duration_minutes: 0,
      changeover_minutes: 0,
      ...ab,
      required_executions: entry.required_executions || 1,
    } as PlanNode;
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

  // Effective bound Values for a step (live edits merged in). Live buffers are
  // only applied when this step is the one currently being edited.
  function buildStepValues(step: PlanNode, entry: ExecutionEntry | undefined): Record<string, Value> {
    const map: Record<string, Value> = {};
    if (!plan) return map;
    const live = entry?.id === liveEntryId;
    for (const b of step.input_conditions) {
      const def = defField(b.definition_id);
      if (def?.derived === true) continue;
      if (def?.typeId === "struct") {
        map[b.definition_id] = createBindingValue(b, def);
      } else if (b.valueTypeId) {
        const lp = live ? (liveInputParams[b.definition_id] ?? {}) : {};
        const params: Record<string, unknown> = { ...(b.params ?? {}) };
        for (const [k, v] of Object.entries(lp)) {
          if (v === "" || v == null) delete params[k];
          else params[k] = parseNum(v) ?? v;
        }
        map[b.definition_id] = createValue(b.valueTypeId, params, null);
      } else {
        const raw = (live ? inputValues[b.definition_id] : undefined) ?? b.value ?? (entry?.selected_bindings?.input_values as any)?.[b.definition_id];
        let val: unknown = raw ?? null;
        if (def?.typeId === "number") val = val === "" || val == null ? null : parseNum(String(val));
        map[b.definition_id] = new PlainValue(val as number | string | null);
      }
    }
    for (const b of step.collection_items) {
      const def = defField(b.definition_id);
      const v = live ? measValues[b.definition_id] : undefined;
      if (v !== undefined && v !== "") {
        map[b.definition_id] = new PlainValue(def?.typeId === "number" ? parseNum(v) : v);
      } else if (b.value != null) {
        map[b.definition_id] = new PlainValue(b.value as number | string | null);
      }
    }
    return map;
  }

  const stepValues = $derived(displayStep ? buildStepValues(displayStep, selEntry) : ({} as Record<string, Value>));

  const outputs = $derived.by(() => {
    if (!plan) return { byTransform: {} as Record<string, Record<string, Value>>, byDef: {} as Record<string, Value> };
    return computeStepOutputs(plan.transforms ?? [], plan.definitions, stepValues);
  });

  // Input definitions for a step, in global layout order: bound non-derived
  // inputs plus derived inputs that computed for this step. Hidden inputs omitted.
  function inputDefsFor(step: PlanNode, outs: StepOutputs): PlanFieldDef[] {
    if (!plan) return [];
    const bound = new Set(step.input_conditions.map((b) => b.definition_id));
    return orderedInputDefs(plan.definitions.input_conditions, plan.input_layout)
      .filter((d) => !isInputHidden(d.id, plan.input_layout))
      .filter((d) => (d.derived === true ? outs.byDef[d.id] !== undefined : bound.has(d.id)));
  }

  const displayInputDefs = $derived(displayStep ? inputDefsFor(displayStep, outputs) : ([] as PlanFieldDef[]));

  // Readable persisted reading: plain scalars keep their raw value, richer value
  // types (ramp/tolerance/percentage/sinusoidal/struct/derived) persist display().
  function readingValue(v: Value | undefined): unknown {
    if (!v) return null;
    if (v.typeId === "plain") return v.scalar("value");
    const d = v.display();
    return d === "—" ? null : d;
  }

  // Collect the entered readings/results for a step's active run. Works for any
  // entry (not just the selected one) so switching steps can still save it.
  function collectRunData(step: PlanNode, entry: ExecutionEntry) {
    const values = buildStepValues(step, entry);
    const outs: StepOutputs = plan
      ? computeStepOutputs(plan.transforms ?? [], plan.definitions, values)
      : { byTransform: {}, byDef: {} };
    const inputDefs = inputDefsFor(step, outs);

    const input_readings: Array<{ definition_id: string; definition_name: string; value: unknown }> = inputDefs
      .filter((d) => d.derived !== true)
      .map((d) => ({
        definition_id: d.id,
        definition_name: defName(d.id),
        value: readingValue(values[d.id]),
      }));

    if (plan?.transforms?.length) {
      for (const t of plan.transforms) {
        const row = outs.byTransform[t.id];
        if (!row) continue;
        for (const ob of outputsOf(t)) {
          const out = row[ob.role];
          if (!out) continue;
          input_readings.push({
            definition_id: ob.definitionId,
            definition_name: defField(ob.definitionId)?.name || t.name,
            value: readingValue(out),
          });
        }
      }
    }

    const collection_results = (step.collection_items || []).map((b: FieldBinding) => ({
      definition_id: b.definition_id,
      definition_name: defName(b.definition_id),
      result: (measFlags[b.definition_id] ?? measValues[b.definition_id] ?? String(b.value ?? null)) as string | null,
      notes: null as string | null,
    }));
    const criteria_results = (step.completion_criteria || []).map((b: FieldBinding) => ({
      definition_id: b.definition_id,
      definition_name: defName(b.definition_id),
      passed: critFlags[b.definition_id] ?? (b.value === true ? true : (b.value === false ? false : null)),
      notes: null as string | null,
    }));

    return { input_readings, collection_results, criteria_results };
  }

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

  // Start a planned step or an existing entry (e.g. ad-hoc), guarding against
  // clobbering another step's active run.
  function beginStart(target: { stepId?: string; entryId?: string }) {
    if (!doc) return;
    if (pausedEntry) {
      alert("Resolve the paused run first.");
      return;
    }
    const active = findActive();
    if (active) {
      conflictModal = { ...target, activeEntry: active };
      return;
    }
    resolveStart(target);
  }

  async function resolveStart(target: { stepId?: string; entryId?: string }) {
    if (target.entryId) await doStart(target.entryId);
    else if (target.stepId) await doStartByStepId(target.stepId);
  }

  function handleStart(stepId: string) {
    beginStart({ stepId });
  }

  function handleStartEntry(entry: ExecutionEntry) {
    if (entry.plan_step_id) beginStart({ stepId: entry.plan_step_id });
    else beginStart({ entryId: entry.id });
  }

  async function doStart(entryId: string) {
    if (!doc) return;
    const entry = doc.entries.find(e => e.id === entryId);
    if (!entry) return;

    resetRunState();
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

    resetRunState();
    const updated = startRun(entry);
    doc.entries = doc.entries.map(e => e.id === entry!.id ? updated : e);
    dirty();

    selectedEntryId = entry.id;
    await executionApi.saveDoc(id, doc);
  }

  // Terminate a previous step's active run, preserving whatever was entered.
  async function finishPrevious(prev: ExecutionEntry, status: "completed" | "skipped") {
    if (!doc) return;
    const activeRun = prev.executions.find(r => r.status === "in_progress");
    if (!activeRun) return;
    const step = stepForEntry(prev);
    const data = step ? collectRunData(step, prev) : {};
    const updated = updateRun(prev, activeRun.id, {
      status,
      completed_at: nowLocalISOWithOffset(),
      ...data,
    });
    doc.entries = doc.entries.map(e => e.id === prev.id ? updated : e);
    dirty();
    await executionApi.saveDoc(id, doc);
  }

  async function conflictStopPrevious() {
    if (!doc || !conflictModal) return;
    const prev = conflictModal.activeEntry;
    if (prev) await finishPrevious(prev, "completed");
    const target = { stepId: conflictModal.stepId, entryId: conflictModal.entryId };
    conflictModal = null;
    resetRunState();
    await resolveStart(target);
  }

  async function conflictSkipPrevious() {
    if (!doc || !conflictModal) return;
    const prev = conflictModal.activeEntry;
    if (prev) await finishPrevious(prev, "skipped");
    const target = { stepId: conflictModal.stepId, entryId: conflictModal.entryId };
    conflictModal = null;
    resetRunState();
    await resolveStart(target);
  }

  function conflictCancel() {
    conflictModal = null;
  }

  async function handleCompleteRun(runId: string) {
    if (!doc || !selEntry || !displayStep) return;
    const data = collectRunData(displayStep, selEntry);
    const updated = completeRun(selEntry, runId, data);
    doc.entries = doc.entries.map(e => e.id === selEntry.id ? updated : e);
    resetRunState();
    dirty();
    await executionApi.saveDoc(id, doc);
  }

  async function handleSkipRun(runId: string, note = "") {
    if (!doc || !selEntry || !displayStep) return;
    const data = collectRunData(displayStep, selEntry);
    const updated = updateRun(selEntry, runId, { status: "skipped", completed_at: nowLocalISOWithOffset(), notes: note.trim() || null, ...data });
    doc.entries = doc.entries.map(e => e.id === selEntry.id ? updated : e);
    resetRunState();
    dirty();
    await executionApi.saveDoc(id, doc);
  }

  function openSkip(runId: string) {
    skipNote = "";
    skipModal = { runId };
  }

  function closeSkip() {
    skipModal = null;
  }

  async function confirmSkip() {
    if (!skipModal) return;
    const { runId } = skipModal;
    skipModal = null;
    await handleSkipRun(runId, skipNote);
  }

  function activeRun(entry: ExecutionEntry): ExecutionRun | undefined {
    return entry.executions.find(r => r.status === "in_progress");
  }

  // --- Pause / emergency transfer ---
  // Works regardless of which step is selected: pauses whichever run is active.
  async function handlePauseRun() {
    if (!doc) return;
    const entry = findActive();
    if (!entry) return;
    const run = activeRun(entry);
    if (!run) return;
    const updated = pauseRun(entry, run.id, snapshotDraft());
    doc.entries = doc.entries.map(e => e.id === entry.id ? updated : e);
    selectedEntryId = entry.id;
    selectedStepId = entry.plan_step_id ?? entry.id;
    dirty();
    await executionApi.saveDoc(id, doc);
  }

  function openResolve() {
    resolveTarget = "";
    resolveOutcome = "skipped";
    resolveNewAdhocTitle = "";
    resolveNotes = "";
    resolveModal = true;
  }

  function closeResolve() {
    resolveModal = false;
  }

  // Scenario 1: status resolved — resume the interrupted run; the pause time
  // counts continuously because started_at is unchanged.
  async function resolveResume() {
    if (!doc || !pausedEntry) return;
    const pr = pausedRun(pausedEntry);
    if (!pr) return;
    restoreDraft(pr.draft ?? null);
    const updated = resumeRun(pausedEntry, pr.id);
    doc.entries = doc.entries.map(e => e.id === pausedEntry.id ? updated : e);
    selectedEntryId = pausedEntry.id;
    if (pausedEntry.plan_step_id) selectedStepId = pausedEntry.plan_step_id;
    closeResolve();
    dirty();
    await executionApi.saveDoc(id, doc);
  }

  // Scenario 2/3: emergency confirmed — close the interrupted run and transfer
  // the emergency timing to a step as an in-progress run that started at the
  // pause point (so timing continues seamlessly). "Emergency already over" is
  // achieved by completing that run afterwards.
  async function resolveTransfer() {
    if (!doc || !pausedEntry || !resolveTarget) return;
    const pr = pausedRun(pausedEntry);
    if (!pr) return;
    const pausedAt = pr.paused_at ?? nowLocalISOWithOffset();

    const originStep = stepForEntry(pausedEntry);
    const originData = originStep ? collectRunData(originStep, pausedEntry) : {};
    let entries = doc.entries.map(e => e.id !== pausedEntry.id ? e : {
      ...e,
      executions: e.executions.map(r => r.id === pr.id
        ? { ...r, status: resolveOutcome, completed_at: pausedAt, paused_at: null, draft: null, ...originData }
        : r),
    });

    let targetEntry: ExecutionEntry | undefined;
    if (resolveTarget === "__new_adhoc__") {
      targetEntry = {
        id: generateId(),
        plan_step_id: null,
        step_title: resolveNewAdhocTitle.trim() || "Emergency",
        description: null,
        type: "adhoc",
        required_executions: 1,
        executions: [],
        selected_bindings: { input_conditions: [], collection_items: [], completion_criteria: [] },
      };
      entries = [...entries, targetEntry];
    } else if (resolveTarget.startsWith("step:")) {
      const stepId = resolveTarget.slice(5);
      const step = plan ? findNode(plan.root, stepId) : null;
      targetEntry = entries.find(e => e.type === "planned" && e.plan_step_id === stepId);
      if (!targetEntry) {
        targetEntry = {
          id: generateId(),
          plan_step_id: stepId,
          step_title: step?.title || "",
          type: "planned",
          required_executions: step?.required_executions || 1,
          executions: [],
        };
        entries = [...entries, targetEntry];
      }
    } else if (resolveTarget.startsWith("entry:")) {
      const eid = resolveTarget.slice(6);
      targetEntry = entries.find(e => e.id === eid);
    }
    if (!targetEntry) return;

    const withRun = startRunAt(targetEntry, pausedAt, resolveNotes.trim() || null);
    entries = entries.map(e => e.id === targetEntry!.id ? withRun : e);

    doc.entries = entries;
    resetRunState();
    selectedEntryId = withRun.id;
    selectedStepId = withRun.plan_step_id ?? withRun.id;
    closeResolve();
    dirty();
    await executionApi.saveDoc(id, doc);
  }

  async function deleteInputReading(entry: ExecutionEntry, runId: string, index: number) {
    if (!doc) return;
    const run = entry.executions.find(r => r.id === runId);
    const reading = run?.input_readings[index];
    if (!run || !reading) return;
    if (!confirm(`Delete input "${reading.definition_name}" from this run?`)) return;
    const updated = updateRun(entry, runId, {
      input_readings: run.input_readings.filter((_, i) => i !== index),
    });
    doc.entries = doc.entries.map(e => e.id === entry.id ? updated : e);
    dirty();
    await executionApi.saveDoc(id, doc);
  }

  async function deleteAdhoc(entry: ExecutionEntry) {
    if (!doc) return;
    if (entry.executions.some(r => r.status === "in_progress" || r.status === "paused")) return;
    if (!confirm(`Delete ad-hoc entry "${entry.step_title}"?`)) return;
    doc.entries = doc.entries.filter(e => e.id !== entry.id);
    if (selectedEntryId === entry.id) { selectedEntryId = null; selectedStepId = null; }
    dirty();
    await executionApi.saveDoc(id, doc);
  }

  async function deleteRun(entry: ExecutionEntry, runId: string) {
    if (!doc) return;
    const run = entry.executions.find(r => r.id === runId);
    if (!run || run.status !== "skipped") return;
    if (!confirm("Delete this skipped run?")) return;
    const updated = { ...entry, executions: entry.executions.filter(r => r.id !== runId) };
    doc.entries = doc.entries.map(e => e.id === entry.id ? updated : e);
    dirty();
    await executionApi.saveDoc(id, doc);
  }

  function adhocNode(ae: ExecutionEntry): PlanNode {
    return {
      id: ae.id, type: "step", title: ae.step_title, children: [],
      description: ae.description ?? null, duration_minutes: 0, changeover_minutes: 0,
      input_conditions: [], collection_items: [], completion_criteria: [],
      required_executions: 1,
      step_template_id: null, solution_step_id: null,
    };
  }

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
      description: adhocDescription.trim() || null,
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

  async function handleInit() {
    await init(id, executionApi.initialize);
  }

  async function handleExport() {
    if (!doc) return;
    let document: { id: string; name: string; description: string | null } = { id, name: id, description: null };
    try {
      const d = await documentsApi.get(id);
      document = { id: d.id, name: d.name || id, description: d.description ?? null };
    } catch { /* fall back to the id */ }
    const data = buildExecutionExport(doc, plan, document);
    downloadExecutionJSON(data, `execution-log-${id.slice(0, 8)}.json`);
  }

  function defName(fieldId: string): string {
    return defField(fieldId)?.name ?? fieldId;
  }

  function statusClass(entry: ExecutionEntry): string {
    const s = computeEntryStatus(entry);
    return { active: "bg-success", paused: "bg-warning text-dark", completed: "bg-primary", partial: "bg-info", pending: "" }[s] || "";
  }

  function statusLabel(entry: ExecutionEntry): string {
    const s = computeEntryStatus(entry);
    return { active: "Active", paused: "Paused", completed: "Done", partial: `${entry.executions.filter(r => r.status==="completed").length}/${entry.required_executions}`, pending: "" }[s] || "";
  }

  // Show the recorded wall clock for offset-stamped times (stable across
  // timezones); fall back to the reader's local time for legacy UTC values.
  function formatTime(ts: string | null): string {
    if (!ts) return "";
    const m = ts.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?[+-]\d{2}:?\d{2}$/);
    if (m) return `${m[1]} ${m[2]}`;
    return new Date(ts).toLocaleString();
  }
</script>

<div class="log-editor">
  <div class="log-toolbar">
    <a href={p("/documents/:id", { params: { id } })} class="btn btn-sm btn-outline-secondary">Back</a>
    <DocumentNav {id} current="logging" />
    <span class="flex-grow-1"></span>
    {#if !doc?.entries?.length}
      <button class="btn btn-sm btn-primary" onclick={handleInit}>Initialize</button>
    {:else}
      {#if hasRunning}
        <button class="btn btn-sm btn-warning me-1" onclick={handlePauseRun} title="Pause the active run (emergency timing)">Pause</button>
      {/if}
      <button class="btn btn-sm btn-outline-info" onclick={() => (showAdhoc = true)}>+ Ad-hoc</button>
      <button class="btn btn-sm btn-outline-primary ms-1" onclick={() => (showSummary = true)}>Summary</button>
      <button class="btn btn-sm btn-outline-success ms-1" onclick={handleExport}>Export</button>
    {/if}
  </div>

  {#if pausedEntry}
    {@const pPaused = pausedRun(pausedEntry)}
    <div class="pause-banner">
      <span class="badge bg-warning text-dark">PAUSED</span>
      <span>Emergency timing <strong class="elapsed-timer text-warning-emphasis">{formatElapsed(tick)}</strong></span>
      {#if pPaused}<small class="text-muted">· paused {formatTime(pPaused.paused_at ?? null)}</small>{/if}
      <span class="flex-grow-1"></span>
      <button class="btn btn-sm btn-warning" onclick={openResolve}>Resolve</button>
    </div>
  {/if}

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
                  {#if (Number(displayStep.duration_minutes) || 0) > 0}
                    <small class="text-muted">Duration ~{formatDuration(Number(displayStep.duration_minutes) * 60000)}</small>
                  {/if}
                  {#if selEntry}
                    {#if run}
                      <span class="badge bg-success">Running</span>
                    {:else if computeEntryStatus(selEntry) === "completed"}
                      <span class="badge bg-primary">Completed</span>
                      {#if selEntry.required_executions > 1}
                        <span class="badge bg-info">{selEntry.executions.filter(r => r.status === "completed").length}/{selEntry.required_executions}</span>
                      {/if}
                      <button class="btn btn-sm btn-outline-success" onclick={() => handleStartEntry(selEntry)}>Run Again</button>
                    {:else if computeEntryStatus(selEntry) === "partial"}
                      <span class="badge bg-info">{selEntry.executions.filter(r => r.status==="completed").length}/{selEntry.required_executions}</span>
                      <button class="btn btn-sm btn-outline-success" onclick={() => handleStartEntry(selEntry)}>Run Again</button>
                    {:else}
                      {#if selEntry.required_executions > 1}
                        <span class="badge bg-info">{selEntry.executions.filter(r => r.status === "completed").length}/{selEntry.required_executions}</span>
                      {/if}
                      <button class="btn btn-sm btn-success" onclick={() => handleStartEntry(selEntry)}>Start</button>
                    {/if}
                    {#if selEntry.type === "adhoc" && !run}
                      <button class="btn btn-sm btn-outline-danger" onclick={() => deleteAdhoc(selEntry)}>Delete</button>
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
                      <button class="btn btn-outline-secondary btn-sm" onclick={() => openSkip(run.id)}>Skip</button>
                    </div>
                  </div>
                </div>
              {/if}

              {#if selEntry && !run && pausedRun(selEntry)}
                {@const pr = pausedRun(selEntry)}
                <div class="log-run-paused mb-3">
                  <div class="d-flex justify-content-between align-items-start">
                    <div>
                      <div class="d-flex align-items-center gap-2">
                        <span class="badge bg-warning text-dark">Paused</span>
                        <strong class="elapsed-timer text-warning-emphasis">{formatElapsed(tick)}</strong>
                      </div>
                      <small class="text-muted">Paused {formatTime(pr?.paused_at ?? null)}</small>
                    </div>
                    <button class="btn btn-warning btn-sm mt-1" onclick={openResolve}>Resolve</button>
                  </div>
                </div>
              {/if}

              <!-- Inputs -->
              {#if displayInputDefs.length > 0}
                <div class="mb-3">
                  <div class="binding-category">Input Conditions</div>
                  <div class="field-blocks input-fields">
                    {#each displayInputDefs as d (d.id)}
                      {@const b = displayStep.input_conditions.find((x) => x.definition_id === d.id)}
                      {@const vt = b?.valueTypeId ? getValueType(b.valueTypeId) : undefined}
                      {@const isDerived = d.derived === true}
                      {@const value = stepValues[d.id]}
                      {@const out = isDerived ? outputs.byDef[d.id] : undefined}
                      {@const lp = isLiveView ? (liveInputParams[d.id] ?? {}) : {}}
                      <div class="field-block {inputSizeClass(inputSizeFor(d.id, plan?.input_layout))}" class:derived={isDerived}>
                        <div class="field-block-label">
                          {d.name}
                          {#if vt}<span class="badge bg-info ms-1">{vt.displayName}</span>{/if}
                          {#if d.typeId === "struct"}<span class="badge bg-info ms-1">Struct</span>{/if}
                          {#if isDerived}<span class="badge bg-secondary ms-1">Computed</span>{/if}
                        </div>
                        {#if defUnit(d)}<small class="text-muted">{defUnit(d)}</small>{/if}
                        {#if run && vt && value}<small class="text-muted d-block">{value.display()}</small>{/if}

                        {#if isDerived}
                          <div class="field-block-value">{out?.display() ?? "—"}</div>
                        {:else if run && b?.valueTypeId && vt}
                          {#if vt.paramsSchema.length > 0}
                            <div class="value-params-grid mt-1">
                              {#each vt.paramsSchema as p (p.key)}
                                <div class="mb-1">
                                  <label class="small text-muted d-block" style="font-size:0.68rem">{p.label}</label>
                                  {#if p.type === "select" && p.options}
                                    <select class="form-select form-select-sm" value={String(lp[p.key] ?? b?.params?.[p.key] ?? p.default ?? "")} onchange={(e) => { const v = (e.target as HTMLSelectElement).value; liveInputParams = { ...liveInputParams, [d.id]: { ...lp, [p.key]: v } }; }}>
                                      {#each p.options as opt}<option value={opt}>{opt}</option>{/each}
                                    </select>
                                  {:else}
                                    <input type="number" class="form-control form-control-sm" step="any" value={lp[p.key] ?? b?.params?.[p.key] ?? p.default ?? ""} oninput={(e) => { const v = (e.target as HTMLInputElement).value; liveInputParams = { ...liveInputParams, [d.id]: { ...lp, [p.key]: v } }; }} />
                                  {/if}
                                </div>
                              {/each}
                            </div>
                          {:else}
                            <input type="text" class="form-control form-control-sm mt-1" placeholder="Value" value={String(b?.value ?? "")} oninput={(e) => inputValues = { ...inputValues, [d.id]: (e.target as HTMLInputElement).value }} />
                          {/if}
                        {:else if run && d.typeId === "select" && (d.params.options as string[] | undefined)?.length}
                          <select class="form-select form-select-sm mt-1" value={String(inputValues[d.id] ?? b?.value ?? "")} onchange={(e) => { const v = (e.target as HTMLSelectElement).value; inputValues = { ...inputValues, [d.id]: v }; }}>
                            <option value="">--</option>
                            {#each (d.params.options as string[]) as opt}<option value={opt}>{opt}</option>{/each}
                          </select>
                        {:else if run && d.typeId === "struct"}
                          <div class="field-block-value struct-fields">
                            {#each value?.values() ?? [] as fv}
                              <span class="run-mini-chip">{fv.name}: {fv.value ?? "—"}{fv.unit ? ` ${fv.unit}` : ""}</span>
                            {/each}
                          </div>
                        {:else if run}
                          <input
                            type={d.typeId === "number" ? "number" : "text"}
                            class="form-control form-control-sm mt-1"
                            placeholder="Value"
                            value={String(value?.scalar("value") ?? "")}
                            oninput={(e) => inputValues = { ...inputValues, [d.id]: (e.target as HTMLInputElement).value }}
                          />
                        {:else}
                          <div class="field-block-value">{value?.display() ?? "—"}</div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Measurements -->
              {#if displayStep.collection_items.length > 0}
                <div class="mb-3">
                  <div class="binding-category">Measurements</div>
                  <div class="field-blocks">
                    {#each displayStep.collection_items as b (b.definition_id)}
                      {@const d = defField(b.definition_id)}
                      {@const saved = run?.collection_results.find(r => r.definition_id === b.definition_id)}
                      {@const chosen = isLiveView ? measFlags[b.definition_id] : undefined}
                      {@const val = isLiveView ? measValues[b.definition_id] : undefined}
                      <div class="field-block measurement">
                        <div class="field-block-label">{d?.name || b.definition_id.slice(0,8)}</div>
                        {#if defUnit(d)}<small class="text-muted">{defUnit(d)}</small>{/if}
                          {#if run && !saved}
                            <div class="mt-1">
                              {#if d?.typeId === "bool"}
                                <div class="d-flex gap-1">
                                  <button class="btn btn-sm {chosen === 'pass' ? 'btn-success' : 'btn-outline-success'}" onclick={() => measFlags = { ...measFlags, [b.definition_id]: 'pass' }}>Pass</button>
                                  <button class="btn btn-sm {chosen === 'fail' ? 'btn-danger' : 'btn-outline-danger'}" onclick={() => measFlags = { ...measFlags, [b.definition_id]: 'fail' }}>Fail</button>
                                </div>
                              {:else if d?.typeId === "number"}
                                <div class="input-group input-group-sm">
                                  <input type="number" class="form-control form-control-sm" placeholder="Value" value={val ?? ""} oninput={(e) => measValues = { ...measValues, [b.definition_id]: (e.target as HTMLInputElement).value }} />
                                  {#if defUnit(d)}<span class="input-group-text">{defUnit(d)}</span>{/if}
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

              <!-- Criteria -->
              {#if displayStep.completion_criteria.length > 0}
                <div class="mb-3">
                  <div class="binding-category">Completion Criteria</div>
                  <div class="field-blocks">
                    {#each displayStep.completion_criteria as b (b.definition_id)}
                      {@const d = defField(b.definition_id)}
                      {@const saved = run?.criteria_results.find(r => r.definition_id === b.definition_id)}
                      {@const chosen = isLiveView ? critFlags[b.definition_id] : undefined}
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
                    {@const durMs = runDurationMs(r)}
                    <div class="run-record">
                      <div class="d-flex align-items-center gap-2">
                        <span class="badge bg-{r.status === 'completed' ? 'success' : r.status === 'skipped' ? 'warning' : r.status === 'paused' ? 'warning text-dark' : 'secondary'}">{r.status}</span>
                        <small>{formatTime(r.started_at)}{#if r.completed_at} → {formatTime(r.completed_at)}{/if}</small>
                        {#if durMs != null}
                          <small class="text-muted">· {formatSpan(durMs)}</small>
                        {/if}
                        <span class="flex-grow-1"></span>
                        {#if r.status === "skipped"}
                          <button class="btn btn-sm btn-outline-danger py-0 px-1" title="Delete skipped run" onclick={() => deleteRun(selEntry, r.id)}>&times;</button>
                        {/if}
                      </div>
                      {#if r.input_readings.length > 0 || r.collection_results.length > 0 || r.criteria_results.length > 0}
                        <div class="run-mini-row">
                          {#if r.input_readings.length > 0}
                            <div class="run-mini-col">
                              <div class="run-mini-label">Inputs</div>
                              {#each r.input_readings as ir, i (ir.definition_id)}
                                <span class="run-mini-chip">
                                  {ir.definition_name}: {ir.value ?? "—"}
                                  <button class="chip-del" title="Remove input from this run" onclick={() => deleteInputReading(selEntry, r.id, i)}>&times;</button>
                                </span>
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
    <div class="context-menu" style="position:fixed;left:0;top:0" use:positionMenu={{ x: contextMenu.x, y: contextMenu.y }} onclick={(e) => e.stopPropagation()}>
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
          {#if plan.definitions.input_conditions.length > 0}
            <div class="mb-3">
              <div class="binding-category mb-1">Input Conditions</div>
              {#each visibleInputDefs(plan.definitions.input_conditions, plan.input_layout) as f (f.id)}
                <div class="adhoc-field">
                  <label class="adhoc-check">
                    <input type="checkbox" checked={adhocInputs.includes(f.id)} onchange={(e) => {
                      const checked = (e.target as HTMLInputElement).checked;
                      adhocInputs = checked ? [...adhocInputs, f.id] : adhocInputs.filter(x => x !== f.id);
                      if (!checked) { delete adhocInputValues[f.id]; adhocInputValues = Object.fromEntries(Object.entries(adhocInputValues)); }
                    }} />
                    <span>{f.name}{#if defUnit(f)} <small class="text-muted">({defUnit(f)})</small>{/if}</span>
                  </label>
                  {#if adhocInputs.includes(f.id)}
                    {#if f.typeId === "select" && (f.params.options as string[] | undefined)?.length}
                      <select class="form-select form-select-sm mt-1" value={adhocInputValues[f.id] ?? ""} onchange={(e) => {
                        adhocInputValues[f.id] = (e.target as HTMLSelectElement).value;
                        adhocInputValues = { ...adhocInputValues };
                      }}>
                        <option value="">--</option>
                        {#each (f.params.options as string[]) as opt}<option value={opt}>{opt}</option>{/each}
                      </select>
                    {:else}
                      <input
                        type={f.typeId === "number" ? "number" : "text"}
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
                    <span>{f.name}{#if defUnit(f)} <small class="text-muted">({defUnit(f)})</small>{/if}</span>
                  </label>
                </div>
              {/each}
            </div>
          {/if}

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
                    <span>{f.name}{#if defUnit(f)} <small class="text-muted">({defUnit(f)})</small>{/if}</span>
                  </label>
                </div>
              {/each}
            </div>
          {/if}

          {#if plan.definitions.input_conditions.length === 0 && plan.definitions.collection_items.length === 0 && plan.definitions.completion_criteria.length === 0}
            <p class="text-muted small">No definitions in plan. Add definitions in the Plan Editor first.</p>
          {/if}
        {/if}

        <div class="mb-2"><label class="form-label small fw-bold">Description</label><textarea class="form-control form-control-sm" rows="2" placeholder="Description" bind:value={adhocDescription}></textarea></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick={resetAdhoc}>Cancel</button><button class="btn btn-primary" onclick={handleAdhoc} disabled={!adhocTitle}>Save</button></div>
    </div></div></div>
  {/if}

  {#if skipModal}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={closeSkip}></div>
    <div class="modal d-block" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
      <div class="modal-header bg-secondary text-white"><h5 class="modal-title">Skip Run</h5><button class="btn-close btn-close-white" onclick={closeSkip}></button></div>
      <div class="modal-body">
        {#if displayStep}<p class="mb-2">Skipping <strong>{displayStep.title}</strong></p>{/if}
        <label class="form-label small fw-bold">Comment (optional)</label>
        <textarea class="form-control form-control-sm" rows="3" placeholder="Why is this run skipped?" bind:value={skipNote}></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick={closeSkip}>Cancel</button>
        <button class="btn btn-warning" onclick={confirmSkip}>Skip</button>
      </div>
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

  {#if resolveModal}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={closeResolve}></div>
    <div class="modal d-block" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
      <div class="modal-header bg-warning"><h5 class="modal-title">Resolve Pause</h5><button class="btn-close" onclick={closeResolve}></button></div>
      <div class="modal-body">
        {#if pausedEntry}
          {@const pr = pausedRun(pausedEntry)}
          <p class="mb-2">Paused run: <strong>{stepForEntry(pausedEntry)?.title ?? pausedEntry.step_title}</strong>{#if pr}<small class="text-muted"> · since {formatTime(pr.paused_at ?? null)}</small>{/if}</p>

          <div class="p-2 mb-3 border rounded bg-light">
            <p class="small fw-bold mb-1">Situation resolved — resume</p>
            <p class="text-muted small mb-2">Return to the same run. The pause time counts continuously.</p>
            <button class="btn btn-success btn-sm" onclick={resolveResume}>Resume</button>
          </div>

          <div class="p-2 border rounded">
            <p class="small fw-bold mb-2">Emergency confirmed — transfer &amp; continue timing</p>
            <div class="mb-2">
              <label class="form-label small mb-1">Emergency target step</label>
              <select class="form-select form-select-sm" bind:value={resolveTarget}>
                <option value="">-- select --</option>
                {#each resolveTargets as t (t.id)}
                  <option value={t.id}>{t.label}</option>
                {/each}
              </select>
            </div>
            {#if resolveTarget === "__new_adhoc__"}
              <div class="mb-2">
                <label class="form-label small mb-1">New ad-hoc title</label>
                <input class="form-control form-control-sm" bind:value={resolveNewAdhocTitle} placeholder="Emergency" />
              </div>
            {/if}
            <div class="mb-2">
              <label class="form-label small mb-1">Original run outcome</label>
              <select class="form-select form-select-sm" value={resolveOutcome} onchange={(e) => resolveOutcome = (e.target as HTMLSelectElement).value as "skipped" | "completed"}>
                <option value="skipped">skipped</option>
                <option value="completed">completed</option>
              </select>
            </div>
            <div class="mb-2">
              <label class="form-label small mb-1">Note (optional)</label>
              <input class="form-control form-control-sm" bind:value={resolveNotes} placeholder="Note for the emergency run" />
            </div>
            <button class="btn btn-warning btn-sm" onclick={resolveTransfer} disabled={!resolveTarget}>Confirm &amp; Transfer</button>
          </div>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick={closeResolve}>Cancel</button>
      </div>
    </div></div></div>
  {/if}

  {#if showSummary && doc}
    <SummaryModal {plan} {doc} onClose={() => (showSummary = false)} />
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
  .log-detail-header { padding: 12px; border-bottom: 1px solid #dee2e6; background: #fff; }
  .log-detail-body { padding: 12px; }
  .log-run-active { padding: 8px; background: #d1e7dd; border-radius: 6px; }
  .log-run-paused { padding: 8px; background: #fff3cd; border-radius: 6px; }
  .pause-banner {
    display: flex; align-items: center; gap: 8px; padding: 6px 12px;
    background: #fff3cd; border-bottom: 1px solid #ffc107; flex-shrink: 0;
  }
  .elapsed-timer { font-size: 1.3rem; font-variant-numeric: tabular-nums; color: #0f5132; }
  .binding-category { font-size: 0.72rem; font-weight: 600; color: #666; text-transform: uppercase; margin-bottom: 6px; padding-bottom: 2px; border-bottom: 1px solid #eee; }
  .field-blocks { display: flex; flex-wrap: wrap; gap: 6px; }
  .field-blocks.input-fields { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: start; }
  .field-blocks.input-fields .field-block { min-width: 0; }
  .field-block.size-sm { grid-column: span 1; }
  .field-block.size-md { grid-column: span 2; }
  .field-block.size-lg { grid-column: span 4; }
  .value-params-grid { display: flex; flex-wrap: wrap; gap: 4px 10px; }
  .field-block { padding: 8px 10px; background: #fff; border: 1px solid #dee2e6; border-radius: 6px; min-width: 100px; flex: 1; }
  .field-block.measurement { border-left: 3px solid #0d6efd; }
  .field-block.derived { border-left: 3px solid #6f42c1; background: #f8f6ff; }
  .field-block.criteria { border-left: 3px solid #198754; }
  .field-block.criteria.passed { background: #d1e7dd; border-color: #198754; }
  .field-block.criteria.failed { background: #f8d7da; border-color: #dc3545; }
  .field-block-label { font-size: 0.75rem; font-weight: 600; }
  .field-block-value { font-size: 0.85rem; margin-top: 4px; }
  .struct-fields { display: flex; flex-wrap: wrap; gap: 2px; }
  .run-record { padding: 6px 8px; background: #fff; border: 1px solid #eee; border-radius: 4px; margin-bottom: 3px; font-size: 0.8rem; }
  .run-mini-row { display: flex; gap: 12px; margin-top: 4px; }
  .run-mini-col { flex: 1; min-width: 0; }
  .run-mini-label { font-size: 0.68rem; font-weight: 600; color: #888; text-transform: uppercase; margin-bottom: 2px; }
  .run-mini-chip {
    display: inline-block; padding: 1px 5px; margin: 1px 2px;
    background: #f0f0f0; border-radius: 3px; font-size: 0.72rem;
  }
  .run-mini-chip.pass { background: #d1e7dd; color: #0f5132; }
  .run-mini-chip.fail { background: #f8d7da; color: #842029; }
  .chip-del { border: none; background: none; color: #dc3545; font-size: 0.9rem; line-height: 1; padding: 0 0 0 3px; cursor: pointer; vertical-align: middle; }
  .chip-del:hover { color: #842029; }
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
