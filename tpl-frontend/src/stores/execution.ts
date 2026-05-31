import { writable, get } from "svelte/store";
import type { ExecutionDoc, ExecutionEntry, ExecutionRun } from "../types/execution";
import type { PlanDocument, PlanNode } from "../types/plan";
import { findNode, flattenAllSteps, generateId } from "../lib/plan-utils";

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

export function startRun(entry: ExecutionEntry): ExecutionEntry {
  const now = new Date().toISOString();
  return {
    ...entry,
    executions: [
      ...entry.executions,
      { id: generateId(), status: "in_progress", started_at: now, completed_at: null, input_readings: [], collection_results: [], criteria_results: [], notes: null },
    ],
  };
}

export function completeRun(entry: ExecutionEntry, runId: string, data: { input_readings?: any[], collection_results?: any[], criteria_results?: any[], notes?: string }): ExecutionEntry {
  const now = new Date().toISOString();
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
  if (inProgress) return "active";
  if (completed >= entry.required_executions) return "completed";
  if (completed > 0) return "partial";
  return "pending";
}

export function flatPlanSteps(planDoc: PlanDocument | null): PlanNode[] {
  if (!planDoc) return [];
  return flattenAllSteps(planDoc.root);
}

export function adhocEntry(title: string, notes: string | null): ExecutionEntry {
  return {
    id: generateId(),
    plan_step_id: null,
    step_title: title,
    type: "adhoc",
    required_executions: 1,
    executions: [],
  };
}
