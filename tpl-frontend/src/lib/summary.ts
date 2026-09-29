// Execution summary helpers: turn a PlanDocument + ExecutionDoc into a
// step/run matrix of recorded readings, grouped into Inputs, Criteria and
// Measurements. Pure functions — no UI, no side effects. Read-only: the
// stored execution document is never modified.
import type { PlanDocument, PlanFieldDef, PlanNode } from "../types/plan";
import type { ExecutionDoc, ExecutionEntry, ExecutionRun } from "../types/execution";
import { findDefinition, findNode, orderedInputDefs } from "./plan-utils";
import { defUnit } from "./fieldtypes";

export interface SummaryColumn {
  definitionId: string;
  name: string;
  unit: string | null;
  derived: boolean;
}

export interface SummaryCell {
  value: string | null;
  tone?: "pass" | "fail";
}

export interface SummaryRunRow {
  runId: string;
  runIndex: number;
  status: ExecutionRun["status"];
  startedAt: string | null;
  completedAt: string | null;
  inputs: Record<string, SummaryCell>;
  criteria: Record<string, SummaryCell>;
  measurements: Record<string, SummaryCell>;
}

export interface SummaryStepGroup {
  entryId: string;
  title: string;
  type: "planned" | "adhoc";
  runs: SummaryRunRow[];
}

export interface ExecutionSummary {
  inputs: SummaryColumn[];
  criteria: SummaryColumn[];
  measurements: SummaryColumn[];
  groups: SummaryStepGroup[];
  hasAny: boolean;
}

// DFS order of step ids, matching the plan tree (groups flattened).
function collectStepIds(root: PlanNode[]): string[] {
  const ids: string[] = [];
  const walk = (nodes: PlanNode[]) => {
    for (const node of nodes) {
      if (node.type === "step") ids.push(node.id);
      else walk(node.children);
    }
  };
  walk(root);
  return ids;
}

function resolveColumn(plan: PlanDocument | null, definitionId: string, fallbackName: string): SummaryColumn {
  const def = plan ? findDefinition(plan.definitions, definitionId) : undefined;
  return {
    definitionId,
    name: def?.name || fallbackName || definitionId,
    unit: defUnit(def),
    derived: def?.derived === true,
  };
}

// Keep plan order for known definitions, then append unknown (e.g. deleted)
// columns in first-seen order.
function orderColumns(defs: PlanFieldDef[], seen: Map<string, SummaryColumn>): SummaryColumn[] {
  const result: SummaryColumn[] = [];
  const placed = new Set<string>();
  for (const d of defs) {
    const col = seen.get(d.id);
    if (col && !placed.has(d.id)) { result.push(col); placed.add(d.id); }
  }
  for (const [id, col] of seen) if (!placed.has(id)) result.push(col);
  return result;
}

function formatValue(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value);
  return s === "" ? null : s;
}

function criteriaCell(passed: boolean | null | undefined): SummaryCell {
  if (passed === true) return { value: "Pass", tone: "pass" };
  if (passed === false) return { value: "Fail", tone: "fail" };
  return { value: null };
}

function resultCell(result: string | null | undefined): SummaryCell {
  const value = result == null || result === "" ? null : String(result);
  const tone = result === "pass" ? "pass" : result === "fail" ? "fail" : undefined;
  return tone ? { value, tone } : { value };
}

function planTitleFor(plan: PlanDocument | null, entry: ExecutionEntry): string {
  if (plan && entry.plan_step_id) {
    const node = findNode(plan.root, entry.plan_step_id);
    if (node) return node.title;
  }
  return entry.step_title || "(untitled)";
}

export function buildExecutionSummary(
  plan: PlanDocument | null,
  exec: ExecutionDoc | null
): ExecutionSummary {
  const inputs = new Map<string, SummaryColumn>();
  const criteria = new Map<string, SummaryColumn>();
  const measurements = new Map<string, SummaryColumn>();
  const groups: SummaryStepGroup[] = [];

  if (!exec) {
    return { inputs: [], criteria: [], measurements: [], groups: [], hasAny: false };
  }

  // Order entries: planned steps in plan tree order first (orphans appended in
  // encounter order), then ad-hoc entries in encounter order.
  const ordered: ExecutionEntry[] = [];
  const used = new Set<string>();
  if (plan) {
    for (const stepId of collectStepIds(plan.root)) {
      const e = exec.entries.find((x) => x.type === "planned" && x.plan_step_id === stepId);
      if (e && !used.has(e.id)) { ordered.push(e); used.add(e.id); }
    }
  }
  for (const e of exec.entries) if (!used.has(e.id)) { ordered.push(e); used.add(e.id); }

  for (const entry of ordered) {
    if (!entry.executions.length) continue;
    const runs: SummaryRunRow[] = entry.executions.map((run, i) => {
      const row: SummaryRunRow = {
        runId: run.id,
        runIndex: i + 1,
        status: run.status,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        inputs: {}, criteria: {}, measurements: {},
      };

      for (const r of run.input_readings ?? []) {
        if (!inputs.has(r.definition_id)) {
          inputs.set(r.definition_id, resolveColumn(plan, r.definition_id, r.definition_name));
        }
        row.inputs[r.definition_id] = { value: formatValue(r.value) };
      }
      for (const c of run.criteria_results ?? []) {
        if (!criteria.has(c.definition_id)) {
          criteria.set(c.definition_id, resolveColumn(plan, c.definition_id, c.definition_name));
        }
        row.criteria[c.definition_id] = criteriaCell(c.passed);
      }
      for (const m of run.collection_results ?? []) {
        if (!measurements.has(m.definition_id)) {
          measurements.set(m.definition_id, resolveColumn(plan, m.definition_id, m.definition_name));
        }
        row.measurements[m.definition_id] = resultCell(m.result);
      }
      return row;
    });

    groups.push({
      entryId: entry.id,
      title: planTitleFor(plan, entry),
      type: entry.type,
      runs,
    });
  }

  const inputDefs = plan
    ? [...orderedInputDefs(plan.definitions.input_conditions, plan.input_layout), ...plan.definitions.custom]
    : [];
  const inputCols = orderColumns(inputDefs, inputs);
  const criteriaCols = orderColumns(plan?.definitions.completion_criteria ?? [], criteria);
  const measurementCols = orderColumns(plan?.definitions.collection_items ?? [], measurements);

  return {
    inputs: inputCols,
    criteria: criteriaCols,
    measurements: measurementCols,
    groups,
    hasAny: inputCols.length > 0 || criteriaCols.length > 0 || measurementCols.length > 0,
  };
}
