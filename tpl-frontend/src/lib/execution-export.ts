import type { ExecutionDoc, ExecutionEntry, ExecutionRun } from "../types/execution";
import type { PlanDocument } from "../types/plan";
import type { Document } from "../types/document";
import { findNode } from "./plan-utils";
import { nowLocalISOWithOffset, toLocalNaiveISO } from "./time";

export const EXECUTION_EXPORT_FORMAT = "tpl.execution-log";
export const EXECUTION_EXPORT_VERSION = 1;

export interface ExecutionExportEvent {
  event_id: string;
  entry_id: string;
  plan_step_id: string | null;
  step_title: string;
  entry_type: "planned" | "adhoc";
  run_index: number;
  required_executions: number;
  status: ExecutionRun["status"];
  start: string;
  end: string;
  duration_s: number | null;
  notes: string | null;
  input_readings: ExecutionRun["input_readings"];
  collection_results: ExecutionRun["collection_results"];
  criteria_results: ExecutionRun["criteria_results"];
}

export interface ExecutionExport {
  format: string;
  version: number;
  exported_at: string;
  document: { id: string; name: string; description: string | null };
  events: ExecutionExportEvent[];
}

function stepTitleFor(entry: ExecutionEntry, plan: PlanDocument | null): string {
  if (entry.plan_step_id && plan) {
    const node = findNode(plan.root, entry.plan_step_id);
    if (node) return node.title;
  }
  return entry.step_title;
}

function durationSeconds(start: string, end: string): number | null {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms >= 0 ? ms / 1000 : null;
}

// One event per completed/skipped run, preserving the full execution process.
// Runs without a start or completion (pending / in-progress) are omitted.
export function buildExecutionExport(
  doc: ExecutionDoc,
  plan: PlanDocument | null,
  document: Pick<Document, "id" | "name" | "description"> | null,
): ExecutionExport {
  const events: ExecutionExportEvent[] = [];

  for (const entry of doc.entries) {
    entry.executions.forEach((run, i) => {
      if (!run.started_at || !run.completed_at) return;
      events.push({
        event_id: run.id,
        entry_id: entry.id,
        plan_step_id: entry.plan_step_id,
        step_title: stepTitleFor(entry, plan),
        entry_type: entry.type,
        run_index: i + 1,
        required_executions: entry.required_executions,
        status: run.status,
        start: toLocalNaiveISO(run.started_at),
        end: toLocalNaiveISO(run.completed_at),
        duration_s: durationSeconds(run.started_at, run.completed_at),
        notes: run.notes ?? null,
        input_readings: run.input_readings ?? [],
        collection_results: run.collection_results ?? [],
        criteria_results: run.criteria_results ?? [],
      });
    });
  }

  return {
    format: EXECUTION_EXPORT_FORMAT,
    version: EXECUTION_EXPORT_VERSION,
    exported_at: nowLocalISOWithOffset(),
    document: {
      id: document?.id ?? "",
      name: document?.name ?? "",
      description: document?.description ?? null,
    },
    events,
  };
}

export function downloadExecutionJSON(data: ExecutionExport, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
