// Gantt scheduling helpers: turn a PlanDocument tree (estimated) and an
// ExecutionDoc (actual run records) into rows positioned on a real-time axis.
// Pure functions — no UI, no side effects.
import type { PlanNode } from "../types/plan";
import type { ExecutionEntry, ExecutionRun } from "../types/execution";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export type GanttKind = "group" | "step" | "adhoc";

export interface GanttBar {
  id: string;
  startMs: number;
  endMs: number;
  status?: ExecutionRun["status"];
  execIndex?: number; // 1-based execution number
}

export interface GanttRow {
  id: string;
  label: string;
  depth: number;
  kind: GanttKind;
  bars: GanttBar[];
  summary: boolean;
  startMs: number;
  endMs: number;
}

export interface GanttLayout {
  rows: GanttRow[];
  minMs: number;
  maxMs: number;
}

// Estimated span of a single step: (duration + changeover) × executions.
export function stepSpanMs(step: PlanNode): number {
  const perRun = (Number(step.duration_minutes) || 0) + (Number(step.changeover_minutes) || 0);
  const reps = Math.max(1, Number(step.required_executions) || 1);
  return perRun * reps * MINUTE;
}

// Serial schedule in tree order. Groups become summary rows spanning children.
export function buildPlanRows(root: PlanNode[], startMs: number): GanttLayout {
  const rows: GanttRow[] = [];
  let cursor = startMs;

  const walk = (nodes: PlanNode[], depth: number) => {
    for (const node of nodes) {
      if (node.type === "group") {
        const index = rows.length;
        rows.push({
          id: node.id, label: node.title, depth, kind: "group",
          bars: [], summary: true, startMs: cursor, endMs: cursor,
        });
        walk(node.children, depth + 1);
        rows[index].endMs = cursor;
      } else {
        const start = cursor;
        const end = cursor + stepSpanMs(node);
        cursor = end;
        rows.push({
          id: node.id, label: node.title, depth, kind: "step",
          bars: end > start ? [{ id: node.id, startMs: start, endMs: end }] : [],
          summary: false, startMs: start, endMs: end,
        });
      }
    }
  };
  walk(root, 0);

  return { rows, minMs: startMs, maxMs: Math.max(cursor, startMs + MINUTE) };
}

// Actual timeline: one bar per execution run (in-progress ends at `nowMs`).
export function buildActualRows(
  root: PlanNode[],
  entries: ExecutionEntry[],
  nowMs: number
): GanttLayout {
  const byStep = new Map<string, ExecutionEntry>();
  for (const e of entries) if (e.plan_step_id) byStep.set(e.plan_step_id, e);

  const rows: GanttRow[] = [];
  let min = Infinity;
  let max = -Infinity;

  const barsFor = (entry: ExecutionEntry | undefined): GanttBar[] => {
    if (!entry) return [];
    const bars: GanttBar[] = [];
    entry.executions.forEach((r, i) => {
      if (!r.started_at) return;
      const start = new Date(r.started_at).getTime();
      if (!Number.isFinite(start)) return;
      const rawEnd = r.completed_at ? new Date(r.completed_at).getTime() : nowMs;
      const end = Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : start + MINUTE;
      bars.push({ id: r.id, startMs: start, endMs: end, status: r.status, execIndex: i + 1 });
      min = Math.min(min, start);
      max = Math.max(max, end);
    });
    return bars;
  };

  const walk = (nodes: PlanNode[], depth: number) => {
    for (const node of nodes) {
      if (node.type === "group") {
        rows.push({
          id: node.id, label: node.title, depth, kind: "group",
          bars: [], summary: true, startMs: 0, endMs: 0,
        });
        walk(node.children, depth + 1);
      } else {
        const bars = barsFor(byStep.get(node.id));
        rows.push({
          id: node.id, label: node.title, depth, kind: "step",
          bars, summary: false,
          startMs: bars.length ? bars[0].startMs : 0,
          endMs: bars.length ? bars[bars.length - 1].endMs : 0,
        });
      }
    }
  };
  walk(root, 0);

  // Roll group summaries up from descendant bars (rows are in DFS order).
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.summary) continue;
    let s = Infinity;
    let e = -Infinity;
    for (let j = i + 1; j < rows.length && rows[j].depth > row.depth; j++) {
      for (const b of rows[j].bars) {
        s = Math.min(s, b.startMs);
        e = Math.max(e, b.endMs);
      }
    }
    row.startMs = Number.isFinite(s) ? s : 0;
    row.endMs = Number.isFinite(e) ? e : 0;
  }

  // Ad-hoc entries have no plan position; append them in an "Ad-hoc" section.
  const adhocRows: GanttRow[] = [];
  for (const e of entries) {
    if (e.type !== "adhoc") continue;
    const bars = barsFor(e);
    if (!bars.length) continue;
    adhocRows.push({
      id: e.id, label: e.step_title, depth: 1, kind: "adhoc",
      bars, summary: false, startMs: bars[0].startMs, endMs: bars[bars.length - 1].endMs,
    });
  }
  if (adhocRows.length) {
    const s = Math.min(...adhocRows.map((r) => r.startMs));
    const e = Math.max(...adhocRows.map((r) => r.endMs));
    rows.push({
      id: "__adhoc__", label: "Ad-hoc", depth: 0, kind: "group",
      bars: [], summary: true, startMs: s, endMs: e,
    });
    rows.push(...adhocRows);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { rows, minMs: nowMs, maxMs: nowMs + HOUR };
  }
  return { rows, minMs: min, maxMs: Math.max(max, min + MINUTE) };
}

// --- Time axis -------------------------------------------------------------

export function chooseTickInterval(spanMs: number): number {
  if (spanMs <= 2 * HOUR) return 15 * MINUTE;
  if (spanMs <= 6 * HOUR) return 30 * MINUTE;
  if (spanMs <= 12 * HOUR) return HOUR;
  if (spanMs <= 2 * DAY) return 3 * HOUR;
  if (spanMs <= 5 * DAY) return 6 * HOUR;
  if (spanMs <= 14 * DAY) return DAY;
  if (spanMs <= 60 * DAY) return 7 * DAY;
  return 30 * DAY;
}

export function formatAxisLabel(ms: number, intervalMs: number): string {
  const d = new Date(ms);
  if (intervalMs >= DAY) {
    return d.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" });
  }
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function timeTicks(minMs: number, maxMs: number): { ms: number; label: string }[] {
  const span = Math.max(maxMs - minMs, MINUTE);
  const interval = chooseTickInterval(span);
  const first = Math.ceil(minMs / interval) * interval;
  const ticks: { ms: number; label: string }[] = [];
  for (let t = first; t <= maxMs; t += interval) {
    ticks.push({ ms: t, label: formatAxisLabel(t, interval) });
    if (ticks.length > 400) break;
  }
  return ticks;
}

// Add a small margin so edge bars are not flush against the border.
export function padWindow(minMs: number, maxMs: number): { minMs: number; maxMs: number } {
  const span = Math.max(maxMs - minMs, MINUTE);
  const pad = Math.max(span * 0.02, 5 * MINUTE);
  return { minMs: minMs - pad, maxMs: maxMs + pad };
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalMin = Math.round(ms / MINUTE);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m && !d) parts.push(`${m}m`);
  return parts.join(" ") || "0m";
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

// Convenience for pages: does this execution doc have any real run bars?
export function hasActualBars(layout: GanttLayout | null): boolean {
  if (!layout) return false;
  return layout.rows.some((r) => !r.summary && r.bars.length > 0);
}
