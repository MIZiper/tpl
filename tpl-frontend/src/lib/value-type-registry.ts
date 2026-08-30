import type { ValueTypeDef, TransformParamDef, PlanDocument } from "../types/plan";

export interface ValueContext {
  elapsed_seconds?: number;
  unit?: string | null;
}

export interface ValueResolved {
  values: Record<string, unknown>;
  display: string;
}

export type ValueResolver = (
  params: Record<string, unknown>,
  ctx: ValueContext
) => ValueResolved;

interface ValueTypeEntry {
  def: ValueTypeDef;
  resolver: ValueResolver;
}

const registry = new Map<string, ValueTypeEntry>();

export function registerValueType(def: ValueTypeDef, resolver: ValueResolver) {
  registry.set(def.id, { def, resolver });
}

export function getValueTypes(): ValueTypeDef[] {
  return Array.from(registry.values()).map((e) => e.def);
}

export function getValueType(id: string): ValueTypeDef | undefined {
  return registry.get(id)?.def;
}

export function hasValueType(id: string): boolean {
  return registry.has(id);
}

export function formatValue(
  typeId: string,
  params: Record<string, unknown>,
  ctx: ValueContext = {}
): string {
  const entry = registry.get(typeId);
  if (!entry) return typeId;
  return entry.resolver(params, ctx).display;
}

export function resolveSubValues(
  typeId: string,
  params: Record<string, unknown>,
  ctx: ValueContext = {}
): Record<string, unknown> {
  const entry = registry.get(typeId);
  if (!entry) return { value: params.value };
  return entry.resolver(params, ctx).values;
}

export function getAllOutputKeys(): string[] {
  const keys = new Set<string>();
  for (const e of registry.values()) {
    for (const o of e.def.outputs) keys.add(o.key);
  }
  return Array.from(keys);
}

export function loadValueTypesFromDoc(doc: PlanDocument) {
  for (const vt of doc.value_types || []) {
    if (!registry.has(vt.id)) {
      registry.set(vt.id, {
        def: vt,
        resolver: (params) => ({ values: { value: params.value }, display: vt.name }),
      });
    }
  }
}

// Plain scalar — no value_type set on the binding.
registerValueType(
  {
    id: "plain",
    name: "Plain value",
    description: "A single scalar value",
    params_schema: [{ key: "value", label: "Value", type: "number", default: null }],
    outputs: [{ key: "value", label: "Value", data_type: "number" }],
  },
  (params) => {
    const v = params.value ?? "";
    return { values: { value: v }, display: v === "" ? "—" : String(v) };
  }
);

// Deviation — nominal value with separate + and - tolerances.
registerValueType(
  {
    id: "deviation",
    name: "Deviation",
    description: "A nominal value with separate + and - tolerances",
    params_schema: [
      { key: "value", label: "Nominal", type: "number", default: 0 },
      { key: "tolerance_plus", label: "Tolerance +", type: "number", default: null },
      { key: "tolerance_minus", label: "Tolerance -", type: "number", default: null },
    ],
    outputs: [
      { key: "value", label: "Nominal", data_type: "number" },
      { key: "tolerance_plus", label: "Tolerance +", data_type: "number" },
      { key: "tolerance_minus", label: "Tolerance -", data_type: "number" },
    ],
  },
  (params) => {
    const value = params.value ?? 0;
    const tp = params.tolerance_plus;
    const tm = params.tolerance_minus;
    const parts: string[] = [String(value)];
    if (tp != null && tp !== "" && tm != null && tm !== "") {
      parts.push(`+${tp}/-${tm}`);
    } else if (tp != null && tp !== "") {
      parts.push(`+${tp}`);
    } else if (tm != null && tm !== "") {
      parts.push(`-${tm}`);
    }
    return {
      values: { value, tolerance_plus: tp ?? null, tolerance_minus: tm ?? null },
      display: parts.join(" "),
    };
  }
);

// Percentage — value expressed as a percentage of a reference.
registerValueType(
  {
    id: "percentage",
    name: "Percentage",
    description: "A percentage of a reference value",
    params_schema: [
      { key: "value", label: "Percentage (%)", type: "number", default: 100 },
      { key: "reference", label: "Reference", type: "number", default: null },
    ],
    outputs: [
      { key: "value", label: "Percentage (%)", data_type: "number" },
      { key: "reference", label: "Reference", data_type: "number" },
    ],
  },
  (params) => {
    const value = params.value ?? 0;
    const reference = params.reference;
    let display = `${value}%`;
    if (reference != null && reference !== "") display += ` of ${reference}`;
    return { values: { value, reference: reference ?? null }, display };
  }
);

// Sinusoidal — offset + amplitude * sin(2π * frequency * t).
registerValueType(
  {
    id: "sinusoidal",
    name: "Sinusoidal",
    description: "A sinusoidal waveform: offset + amplitude * sin(2π * frequency * t)",
    params_schema: [
      { key: "amplitude", label: "Amplitude", type: "number", default: 0 },
      { key: "frequency", label: "Frequency (Hz)", type: "number", default: 60 },
      { key: "offset", label: "Offset (DC)", type: "number", default: 0 },
    ],
    outputs: [{ key: "value", label: "Value @ t", data_type: "number" }],
  },
  (params, ctx) => {
    const amp = Number(params.amplitude ?? 0);
    const freq = Number(params.frequency ?? 0);
    const offset = Number(params.offset ?? 0);
    const t = ctx.elapsed_seconds ?? 0;
    const value = offset + amp * Math.sin(2 * Math.PI * freq * t);
    const parts: string[] = [];
    if (offset !== 0) parts.push(`${offset}`);
    parts.push(`±${amp}`);
    if (freq > 0) parts.push(`${freq}Hz`);
    return { values: { value }, display: parts.join(" ") };
  }
);

// Ramp — linear ramp from start to end over duration.
registerValueType(
  {
    id: "ramp",
    name: "Ramp",
    description: "A linear ramp from start to end over duration",
    params_schema: [
      { key: "start_value", label: "Start Value", type: "number", default: 0 },
      { key: "end_value", label: "End Value", type: "number", default: 100 },
      { key: "duration_seconds", label: "Duration (s)", type: "number", default: 10 },
    ],
    outputs: [{ key: "value", label: "Value @ t", data_type: "number" }],
  },
  (params, ctx) => {
    const start = Number(params.start_value ?? 0);
    const end = Number(params.end_value ?? 0);
    const dur = Number(params.duration_seconds ?? 0);
    const t = ctx.elapsed_seconds ?? 0;
    const ratio = dur > 0 ? Math.min(1, Math.max(0, t / dur)) : 1;
    const value = start + (end - start) * ratio;
    const display = `${start} → ${end}${dur > 0 ? ` over ${dur}s` : ""}`;
    return { values: { value }, display };
  }
);
