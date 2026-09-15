// Signal plotting helpers: turn a PlanDocument into per-channel time series
// ("lanes") for numeric input conditions (raw) and transform-derived outputs
// (computed). The x axis is elapsed time from 0, extended in plan step order;
// each execution repeats the curve and changeover periods become gaps.
// Pure functions — no UI, no side effects.
import type { PlanDocument, PlanFieldDef, PlanNode } from "../types/plan";
import type { Value } from "./values";
import {
  nodeBindingValues,
  computeStepOutputs,
  findNode,
  flattenAllSteps,
  outputsOf,
  type StepOutputs,
} from "./plan-utils";
import { MINUTE } from "./gantt";

const SECOND = 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SIGNAL_COLORS = [
  "#0d6efd",
  "#dc3545",
  "#198754",
  "#fd7e14",
  "#6f42c1",
  "#20c997",
  "#d63384",
  "#0dcaf0",
  "#ffc107",
  "#6c757d",
];

// --- Timeline --------------------------------------------------------------

export interface StepExecutionWindow {
  index: number; // 1-based execution number
  runStartMs: number; // includes changeover start
  activeStartMs: number; // test window start
  activeEndMs: number; // test window end (= activeStart + duration)
  runEndMs: number; // activeEnd + changeover
}

export interface StepWindow {
  stepId: string;
  title: string;
  depth: number;
  startMs: number;
  endMs: number;
  executions: StepExecutionWindow[];
}

export interface StepWindows {
  steps: StepWindow[];
  totalMs: number;
}

// Serial schedule in tree order. Each step is repeated `required_executions`
// times as `[duration + changeover]`; only `duration` is an active test window.
export function buildStepWindows(root: PlanNode[], startMs = 0): StepWindows {
  const steps: StepWindow[] = [];
  let cursor = startMs;

  const walk = (nodes: PlanNode[], depth: number) => {
    for (const node of nodes) {
      if (node.type === "group") {
        walk(node.children, depth + 1);
        continue;
      }
      const dur = Math.max(0, Number(node.duration_minutes) || 0) * MINUTE;
      const chg = Math.max(0, Number(node.changeover_minutes) || 0) * MINUTE;
      const reps = Math.max(1, Number(node.required_executions) || 1);
      const per = dur + chg;
      const stepStart = cursor;
      const executions: StepExecutionWindow[] = [];
      for (let k = 0; k < reps; k++) {
        const runStart = stepStart + k * per;
        executions.push({
          index: k + 1,
          runStartMs: runStart,
          activeStartMs: runStart,
          activeEndMs: runStart + dur,
          runEndMs: runStart + per,
        });
      }
      cursor = stepStart + per * reps;
      steps.push({
        stepId: node.id,
        title: node.title,
        depth,
        startMs: stepStart,
        endMs: cursor,
        executions,
      });
    }
  };
  walk(root, 0);

  return { steps, totalMs: Math.max(cursor - startMs, 0) };
}

// --- Signal discovery ------------------------------------------------------

export interface SignalOption {
  defId: string;
  name: string;
  unit: string | null;
  derived: boolean;
  stepCount: number;
}

function unitOf(def: PlanFieldDef): string | null {
  const u = def?.params?.unit;
  return u != null && u !== "" ? String(u) : null;
}

// Numeric definitions that can be plotted: raw inputs bound on at least one
// step, plus transform-derived outputs declared as editable input definitions.
export function availableSignals(plan: PlanDocument): SignalOption[] {
  const derivedIds = new Set<string>();
  for (const t of plan.transforms ?? []) {
    for (const ob of outputsOf(t)) derivedIds.add(ob.definitionId);
  }

  const boundCount = new Map<string, number>();
  for (const step of flattenAllSteps(plan.root)) {
    for (const b of step.input_conditions) {
      boundCount.set(b.definition_id, (boundCount.get(b.definition_id) ?? 0) + 1);
    }
  }

  const out: SignalOption[] = [];
  for (const d of plan.definitions.input_conditions) {
    if (d.typeId !== "number") continue;
    const derived = d.derived === true || derivedIds.has(d.id);
    const stepCount = boundCount.get(d.id) ?? 0;
    if (derived) {
      if (!derivedIds.has(d.id)) continue;
    } else if (stepCount === 0) {
      continue;
    }
    out.push({ defId: d.id, name: d.name, unit: unitOf(d), derived, stepCount });
  }
  return out;
}

// --- Evaluation ------------------------------------------------------------

export type SignalShape = "sinusoidal" | "ramp" | "percentage" | "constant";

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function channelsOf(value: Value): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const c of value.values()) map[c.name] = c.value;
  return map;
}

// Shape is detected from characteristic channel names so transform-derived
// values (formula/gearbox/product) are handled too, not just the raw types.
export function shapeOf(ch: Record<string, unknown>): SignalShape {
  if ("amplitude" in ch) return "sinusoidal";
  if ("start_value" in ch || "end_value" in ch) return "ramp";
  if ("reference" in ch && !("tolerance_plus" in ch)) return "percentage";
  return "constant";
}

// Value of a signal at `localMs` within an active window of `durationMs`.
export function evaluateValue(value: Value, localMs: number, durationMs: number): number | null {
  const ch = channelsOf(value);
  switch (shapeOf(ch)) {
    case "sinusoidal": {
      const amp = toNum(ch.amplitude) ?? 0;
      const freq = toNum(ch.frequency) ?? 0;
      const off = toNum(ch.offset) ?? 0;
      return off + amp * Math.sin(2 * Math.PI * freq * (localMs / 1000));
    }
    case "ramp": {
      const s = toNum(ch.start_value);
      const e = toNum(ch.end_value);
      if (s == null && e == null) return null;
      const start = s ?? e ?? 0;
      const end = e ?? s ?? 0;
      if (durationMs <= 0) return end;
      const rate = toNum(ch.ramp_rate);
      if (rate != null && rate !== 0) {
        const tEnd = Math.abs((end - start) / rate) * 1000;
        if (tEnd <= 0) return end;
        const t = Math.min(localMs, tEnd);
        const raw = start + rate * (t / 1000);
        return Math.min(Math.max(raw, Math.min(start, end)), Math.max(start, end));
      }
      const frac = Math.min(Math.max(localMs / durationMs, 0), 1);
      return start + (end - start) * frac;
    }
    case "percentage": {
      const pct = toNum(ch.value);
      if (pct == null) return null;
      const ref = toNum(ch.reference);
      return ref != null ? (pct * ref) / 100 : pct;
    }
    default:
      return toNum(ch.value);
  }
}

// Tolerance envelopes are drawn as a shaded band.
export function bandOf(value: Value): { lower: number; upper: number } | null {
  const ch = channelsOf(value);
  if (!("tolerance_plus" in ch) && !("tolerance_minus" in ch)) return null;
  const base = toNum(ch.value);
  if (base == null) return null;
  const plus = toNum(ch.tolerance_plus) ?? 0;
  const minus = toNum(ch.tolerance_minus) ?? 0;
  return { lower: base - minus, upper: base + plus };
}

// --- Lane building ---------------------------------------------------------

export interface SignalPoint {
  x: number;
  y: number;
}

export interface SignalBand {
  lower: SignalPoint[];
  upper: SignalPoint[];
}

export interface SignalLane {
  defId: string;
  name: string;
  unit: string | null;
  color: string;
  segments: SignalPoint[][];
  bands: SignalBand[];
  min: number;
  max: number;
  hasData: boolean;
}

interface StepContext {
  window: StepWindow;
  values: Record<string, Value>;
  outputs: StepOutputs;
}

function contextCache(plan: PlanDocument, windows: StepWindows): Map<string, StepContext> {
  const map = new Map<string, StepContext>();
  for (const w of windows.steps) {
    const step = findNode(plan.root, w.stepId);
    if (!step) continue;
    const values = nodeBindingValues(plan.definitions, step);
    const outputs = computeStepOutputs(plan.transforms ?? [], plan.definitions, values);
    map.set(w.stepId, { window: w, values, outputs });
  }
  return map;
}

function valueForDef(ctx: StepContext, defId: string, derived: boolean): Value | undefined {
  return derived ? ctx.outputs.byDef[defId] : ctx.values[defId];
}

function buildLane(
  contexts: Map<string, StepContext>,
  option: SignalOption,
  windows: StepWindows,
  color: string
): SignalLane {
  const entries: { win: StepExecutionWindow; value: Value | undefined }[] = [];
  let minInterval = Infinity;
  let totalActive = 0;

  for (const ctx of contexts.values()) {
    for (const ex of ctx.window.executions) {
      const value = valueForDef(ctx, option.defId, option.derived);
      entries.push({ win: ex, value });
      const dur = ex.activeEndMs - ex.activeStartMs;
      if (!value || dur <= 0) continue;
      totalActive += dur;
      const ch = channelsOf(value);
      if (shapeOf(ch) === "sinusoidal") {
        const freq = toNum(ch.frequency) ?? 0;
        if (freq > 0) minInterval = Math.min(minInterval, 1000 / freq / 24);
      }
      minInterval = Math.min(minInterval, dur / 8);
    }
  }

  let interval = Number.isFinite(minInterval) ? minInterval : 1000;
  interval = Math.max(interval, 5);
  if (totalActive > 0 && totalActive / interval > 4000) interval = totalActive / 4000;

  const segments: SignalPoint[][] = [];
  const bands: SignalBand[] = [];
  let min = Infinity;
  let max = -Infinity;

  for (const { win, value } of entries) {
    const dur = win.activeEndMs - win.activeStartMs;
    if (!value || dur <= 0) continue;

    const band = bandOf(value);
    const pts: SignalPoint[] = [];
    const lower: SignalPoint[] = [];
    const upper: SignalPoint[] = [];

    for (let t = 0; ; t += interval) {
      const local = Math.min(t, dur);
      const x = win.activeStartMs + local;
      const y = evaluateValue(value, local, dur);
      if (y != null) {
        pts.push({ x, y });
        min = Math.min(min, y);
        max = Math.max(max, y);
      }
      if (band) {
        lower.push({ x, y: band.lower });
        upper.push({ x, y: band.upper });
        min = Math.min(min, band.lower);
        max = Math.max(max, band.upper);
      }
      if (local >= dur) break;
    }

    if (pts.length) segments.push(pts);
    if (band && lower.length) bands.push({ lower, upper });
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  } else if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }

  return {
    defId: option.defId,
    name: option.name,
    unit: option.unit,
    color,
    segments,
    bands,
    min,
    max,
    hasData: segments.length > 0 || bands.length > 0,
  };
}

export function buildSignalLanes(
  plan: PlanDocument,
  options: SignalOption[],
  windows: StepWindows
): SignalLane[] {
  if (windows.totalMs <= 0) {
    return options.map((opt, i) => ({
      defId: opt.defId,
      name: opt.name,
      unit: opt.unit,
      color: SIGNAL_COLORS[i % SIGNAL_COLORS.length],
      segments: [],
      bands: [],
      min: 0,
      max: 1,
      hasData: false,
    }));
  }
  const contexts = contextCache(plan, windows);
  return options.map((opt, i) =>
    buildLane(contexts, opt, windows, SIGNAL_COLORS[i % SIGNAL_COLORS.length])
  );
}

// --- Elapsed-time axis -----------------------------------------------------

export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0";
  if (ms < SECOND) return `${Math.round(ms)}ms`;
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h) return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
  if (m) return s ? `${m}m${String(s).padStart(2, "0")}s` : `${m}m`;
  return `${s}s`;
}

// Fine-grained intervals (sub-second → months) so zooming in reveals detail.
const ELAPSED_STEPS = [
  50, 100, 200, 500, SECOND, 2 * SECOND, 5 * SECOND, 10 * SECOND, 15 * SECOND, 30 * SECOND,
  MINUTE, 2 * MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE,
  HOUR, 3 * HOUR, 6 * HOUR, DAY, 7 * DAY, 30 * DAY,
];

export function chooseElapsedInterval(spanMs: number): number {
  for (const step of ELAPSED_STEPS) {
    if (spanMs / step <= 12) return step;
  }
  return 30 * DAY;
}

export function elapsedTicks(totalMs: number, zoom = 1): { ms: number; label: string }[] {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return [{ ms: 0, label: "0" }];
  const effectiveSpan = totalMs / (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
  const interval = chooseElapsedInterval(effectiveSpan);
  const ticks: { ms: number; label: string }[] = [];
  for (let t = 0; t <= totalMs; t += interval) {
    ticks.push({ ms: t, label: formatElapsed(t) });
    if (ticks.length > 400) break;
  }
  const last = ticks[ticks.length - 1];
  if (!last || last.ms < totalMs) ticks.push({ ms: totalMs, label: formatElapsed(totalMs) });
  return ticks;
}

export function formatSignalValue(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return String(Math.round(v * 1000) / 1000);
}
