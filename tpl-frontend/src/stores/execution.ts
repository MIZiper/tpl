import { writable, get } from "svelte/store";
import type { ExecutionDoc, ExecutionDraft, ExecutionEntry, ExecutionRun } from "../types/execution";
import type { PlanDocument, PlanNode } from "../types/plan";
import { findNode, flattenAllSteps, generateId } from "../lib/plan-utils";
import { nowLocalISOWithOffset } from "../lib/time";

interface ExecState {
  document: ExecutionDoc | null;
  planDoc: PlanDocument | null;
  loading: boolean;
  error: string | null;
}

export const execState = writable<ExecState>({
  document: null, planDoc: null, loading: false, error: null,
});

export async function load(projectId: string, getDocFn: (pid: string) => Promise<ExecutionDoc>, getPlanFn: (pid: string) => Promise<PlanDocument>) {
  execState.update(s => ({ ...s, loading: true }));
  try {
    const [doc, plan] = await Promise.all([getDocFn(projectId), getPlanFn(projectId).catch(() => null)]);
    execState.update(s => ({ ...s, document: doc, planDoc: plan, loading: false }));
  } catch (e: any) {
    execState.update(s => ({ ...s, error: String(e), loading: false }));
  }
}

export async function init(projectId: string, initFn: (pid: string) => Promise<ExecutionDoc>) {
  execState.update(s => ({ ...s, loading: true }));
  try {
    const doc = await initFn(projectId);
    execState.update(s => ({ ...s, document: doc, loading: false }));
  } catch (e: any) {
    execState.update(s => ({ ...s, error: String(e), loading: false }));
  }
}

export async function saveDoc(projectId: string, saveFn: (pid: string, doc: ExecutionDoc) => Promise<void>) {
  const doc = get(execState).document;
  if (!doc) return;
  await saveFn(projectId, doc);
}

export function entryForStep(stepId: string): ExecutionEntry | undefined {
  return get(execState).document?.entries.find(e => e.plan_step_id === stepId);
}

export function pausedRun(entry: ExecutionEntry): ExecutionRun | undefined {
  return entry.executions.find(r => r.status === "paused");
}

export function findPaused(): ExecutionEntry | null {
  const doc = get(execState).document;
  if (!doc) return null;
  return doc.entries.find(e => e.executions.some(r => r.status === "paused")) || null;
}

export function startRun(entry: ExecutionEntry): ExecutionEntry {
  return startRunAt(entry, nowLocalISOWithOffset());
}

// Start a new run that begins at an explicit instant (used when a paused run
// is transferred to a step: timing continues seamlessly from the pause point).
export function startRunAt(entry: ExecutionEntry, startedAt: string, notes: string | null = null): ExecutionEntry {
  return {
    ...entry,
    executions: [
      ...entry.executions,
      { id: generateId(), status: "in_progress", started_at: startedAt, completed_at: null, input_readings: [], collection_results: [], criteria_results: [], notes },
    ],
  };
}

// Stash the live edits of the currently running run and mark it paused.
export function pauseRun(entry: ExecutionEntry, runId: string, draft: ExecutionDraft): ExecutionEntry {
  return updateRun(entry, runId, { status: "paused", paused_at: nowLocalISOWithOffset(), draft });
}

// Lift a pause: the run resumes; timing is continuous (started_at unchanged).
export function resumeRun(entry: ExecutionEntry, runId: string): ExecutionEntry {
  return updateRun(entry, runId, { status: "in_progress", paused_at: null, draft: null });
}

export function completeRun(entry: ExecutionEntry, runId: string, data: { input_readings?: any[], collection_results?: any[], criteria_results?: any[], notes?: string }): ExecutionEntry {
  const now = nowLocalISOWithOffset();
  return {
    ...entry,
    executions: entry.executions.map(r => r.id === runId
      ? { ...r, status: "completed", completed_at: now, ...data }
      : r
    ),
  };
}

export function updateRun(entry: ExecutionEntry, runId: string, patch: Partial<ExecutionRun>): ExecutionEntry {
  return {
    ...entry,
    executions: entry.executions.map(r => r.id === runId ? { ...r, ...patch } : r),
  };
}

export function computeEntryStatus(entry: ExecutionEntry): string {
  const execs = entry.executions;
  const completed = execs.filter(r => r.status === "completed").length;
  const inProgress = execs.some(r => r.status === "in_progress");
  const paused = execs.some(r => r.status === "paused");
  if (inProgress) return "active";
  if (paused) return "paused";
  if (completed >= entry.required_executions) return "completed";
  if (completed > 0) return "partial";
  return "pending";
}

export function flatPlanSteps(planDoc: PlanDocument | null): PlanNode[] {
  if (!planDoc) return [];
  return flattenAllSteps(planDoc.root);
}

export function adhocEntry(title: string, description: string | null): ExecutionEntry {
  return {
    id: generateId(),
    plan_step_id: null,
    step_title: title,
    description,
    type: "adhoc",
    required_executions: 1,
    executions: [],
  };
}
