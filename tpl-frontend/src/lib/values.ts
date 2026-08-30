// Value classes: the value-bearing object on a binding. Values expose named
// scalar channels (values()) and know how to render themselves (display()).
// Time-varying values read the reactive clock, so derived outputs update live.
import { clock } from "./clock.svelte";
import { getStructType, type StructType } from "./structs";
import type { PlanFieldDef, FieldBinding } from "../types/plan";

export interface NamedValue {
  name: string;
  value: number | string | null;
  unit?: string;
}

export interface ValueParamSpec {
  key: string;
  label: string;
  type: "number" | "text" | "select";
  default?: unknown;
  options?: string[];
}

export class Value {
  static readonly typeId: string = "value";
  static readonly displayName: string = "Value";
  static readonly paramsSchema: ValueParamSpec[] = [];

  constructor(public params: Record<string, unknown> = {}) {}

  get typeId(): string {
    return (this.constructor as typeof Value).typeId;
  }

  get name(): string {
    return (this.constructor as typeof Value).displayName;
  }

  get paramsSchema(): ValueParamSpec[] {
    return (this.constructor as typeof Value).paramsSchema;
  }

  values(): NamedValue[] {
    return [];
  }

  display(): string {
    return this.values()
      .map((v) => (v.value == null ? "—" : v.unit ? `${v.value} ${v.unit}` : `${v.value}`))
      .join(", ");
  }

  describe(): string {
    return this.name;
  }

  scalar(subKey = "value"): number | string | null {
    const v = this.values().find((x) => x.name === subKey);
    return v ? v.value : null;
  }
}

// Plain scalar — no value_type on the binding.
export class PlainValue extends Value {
  static readonly typeId: string = "plain";
  static readonly displayName: string = "Plain";

  constructor(
    public scalarValue: number | string | null = null,
    params: Record<string, unknown> = {}
  ) {
    super(params);
  }

  values(): NamedValue[] {
    return [{ name: "value", value: this.scalarValue }];
  }

  describe(): string {
    return this.scalarValue == null ? "Plain" : `Plain (${this.scalarValue})`;
  }
}

// Ramp — linear ramp from start to end over duration.
export class RampValue extends Value {
  static readonly typeId: string = "ramp";
  static readonly displayName: string = "Ramp";
  static readonly paramsSchema: ValueParamSpec[] = [
    { key: "start_value", label: "Start Value", type: "number", default: 0 },
    { key: "end_value", label: "End Value", type: "number", default: 100 },
    { key: "duration_seconds", label: "Duration (s)", type: "number", default: 10 },
  ];

  values(): NamedValue[] {
    const start = Number(this.params.start_value ?? 0);
    const end = Number(this.params.end_value ?? 0);
    const dur = Number(this.params.duration_seconds ?? 0);
    const t = clock.elapsedSeconds;
    const ratio = dur > 0 ? Math.min(1, Math.max(0, t / dur)) : 1;
    return [{ name: "value", value: start + (end - start) * ratio }];
  }

  describe(): string {
    const s = this.params.start_value;
    const e = this.params.end_value;
    const d = this.params.duration_seconds;
    return `${s} → ${e}${d != null && d !== "" ? ` over ${d}s` : ""}`;
  }
}

// Deviation — nominal value with separate + and - tolerances.
export class DeviationValue extends Value {
  static readonly typeId: string = "deviation";
  static readonly displayName: string = "Deviation";
  static readonly paramsSchema: ValueParamSpec[] = [
    { key: "value", label: "Nominal", type: "number", default: 0 },
    { key: "tolerance_plus", label: "Tolerance +", type: "number", default: null },
    { key: "tolerance_minus", label: "Tolerance -", type: "number", default: null },
  ];

  values(): NamedValue[] {
    const value = this.params.value ?? 0;
    const tp = this.params.tolerance_plus;
    const tm = this.params.tolerance_minus;
    return [
      { name: "value", value: Number(value) },
      { name: "tolerance_plus", value: tp == null || tp === "" ? null : Number(tp) },
      { name: "tolerance_minus", value: tm == null || tm === "" ? null : Number(tm) },
    ];
  }

  describe(): string {
    const value = this.params.value ?? 0;
    const tp = this.params.tolerance_plus;
    const tm = this.params.tolerance_minus;
    const parts = [String(value)];
    if (tp != null && tp !== "" && tm != null && tm !== "") parts.push(`+${tp}/-${tm}`);
    else if (tp != null && tp !== "") parts.push(`+${tp}`);
    else if (tm != null && tm !== "") parts.push(`-${tm}`);
    return parts.join(" ");
  }
}

// Percentage — value expressed as a percentage of a reference.
export class PercentageValue extends Value {
  static readonly typeId: string = "percentage";
  static readonly displayName: string = "Percentage";
  static readonly paramsSchema: ValueParamSpec[] = [
    { key: "value", label: "Percentage (%)", type: "number", default: 100 },
    { key: "reference", label: "Reference", type: "number", default: null },
  ];

  values(): NamedValue[] {
    const value = this.params.value ?? 0;
    const reference = this.params.reference;
    return [
      { name: "value", value: Number(value) },
      { name: "reference", value: reference == null || reference === "" ? null : Number(reference) },
    ];
  }

  describe(): string {
    const value = this.params.value ?? 0;
    const reference = this.params.reference;
    let s = `${value}%`;
    if (reference != null && reference !== "") s += ` of ${reference}`;
    return s;
  }
}

// Sinusoidal — offset + amplitude * sin(2π * frequency * t).
export class SinusoidalValue extends Value {
  static readonly typeId: string = "sinusoidal";
  static readonly displayName: string = "Sinusoidal";
  static readonly paramsSchema: ValueParamSpec[] = [
    { key: "amplitude", label: "Amplitude", type: "number", default: 0 },
    { key: "frequency", label: "Frequency (Hz)", type: "number", default: 60 },
    { key: "offset", label: "Offset (DC)", type: "number", default: 0 },
  ];

  values(): NamedValue[] {
    const amp = Number(this.params.amplitude ?? 0);
    const freq = Number(this.params.frequency ?? 0);
    const offset = Number(this.params.offset ?? 0);
    const t = clock.elapsedSeconds;
    return [{ name: "value", value: offset + amp * Math.sin(2 * Math.PI * freq * t) }];
  }

  describe(): string {
    const amp = this.params.amplitude ?? 0;
    const freq = this.params.frequency ?? 0;
    const offset = this.params.offset ?? 0;
    const parts: string[] = [];
    if (Number(offset) !== 0) parts.push(String(offset));
    parts.push(`±${amp}`);
    if (Number(freq) > 0) parts.push(`${freq}Hz`);
    return parts.join(" ");
  }
}

// Struct — a bound struct instance; data lives on the definition.
export class StructValue extends Value {
  static readonly typeId: string = "struct";
  static readonly displayName: string = "Struct";

  constructor(
    public structTypeId: string,
    public structParams: Record<string, unknown>,
    params: Record<string, unknown> = {}
  ) {
    super(params);
  }

  struct<T extends StructType>(): T {
    const cls = getStructType(this.structTypeId);
    if (!cls) throw new Error(`Unknown struct type: ${this.structTypeId}`);
    const inst = new cls();
    inst.params = this.structParams;
    return inst as T;
  }

  values(): NamedValue[] {
    const cls = getStructType(this.structTypeId);
    if (!cls) return [];
    return cls.fieldsSchema.map((f) => ({
      name: f.key,
      value: (this.structParams[f.key] ?? "") as number | string,
      unit: f.unit,
    }));
  }

  display(): string {
    const s = this.values().filter((v) => v.value !== "" && v.value != null);
    if (!s.length) return this.structTypeId;
    return `${this.structTypeId} (${s.map((v) => `${v.name}:${v.value}`).join(", ")})`;
  }
}

// SubValue — exposes a single named channel of another Value.
export class SubValue extends Value {
  static readonly typeId: string = "sub";

  constructor(
    public src: Value,
    public subKey: string,
    params: Record<string, unknown> = {}
  ) {
    super(params);
  }

  values(): NamedValue[] {
    return this.src.values().filter((v) => v.name === this.subKey);
  }

  display(): string {
    const v = this.values()[0];
    return v && v.value != null ? (v.unit ? `${v.value} ${v.unit}` : `${v.value}`) : "—";
  }
}

// DerivedValue — lazily recomputes from inputs; makes transform outputs composable.
export class DerivedValue extends Value {
  static readonly typeId: string = "derived";
  static readonly displayName: string = "Derived";

  constructor(
    public unit: string | null,
    public compute: () => NamedValue[],
    params: Record<string, unknown> = {}
  ) {
    super(params);
  }

  values(): NamedValue[] {
    return this.compute();
  }

  display(): string {
    const v = this.values()[0];
    if (!v) return "—";
    return v.value == null ? "—" : v.unit ? `${v.value} ${v.unit}` : `${v.value}`;
  }
}

// ---------------------------------------------------------------------------
// Registry + factories
// ---------------------------------------------------------------------------

export interface ValueCtor {
  readonly typeId: string;
  readonly displayName: string;
  readonly paramsSchema: ValueParamSpec[];
  new (...args: any[]): Value;
}

const registry = new Map<string, ValueCtor>();

export function registerValueType(cls: ValueCtor) {
  registry.set(cls.typeId, cls);
}

export function getValueTypes(): ValueCtor[] {
  return Array.from(registry.values());
}

export function getValueType(id: string): ValueCtor | undefined {
  return registry.get(id);
}

export function createValue(
  valueTypeId: string | undefined,
  params: Record<string, unknown> | undefined,
  scalarValue: unknown
): Value {
  switch (valueTypeId) {
    case "plain":
    case undefined:
      return new PlainValue((scalarValue ?? null) as number | string | null, params ?? {});
    case "ramp":
      return new RampValue(params ?? {});
    case "deviation":
      return new DeviationValue(params ?? {});
    case "percentage":
      return new PercentageValue(params ?? {});
    case "sinusoidal":
      return new SinusoidalValue(params ?? {});
    default: {
      const cls = registry.get(valueTypeId);
      return cls ? new cls() : new PlainValue((scalarValue ?? null) as number | string | null);
    }
  }
}

// Build the Value instance for a binding, considering its definition.
export function createBindingValue(
  binding: FieldBinding,
  def: PlanFieldDef | undefined
): Value {
  if (def?.typeId === "struct") {
    const structTypeId = String(def.params.structTypeId ?? "");
    const structParams: Record<string, unknown> = { ...def.params };
    delete structParams.structTypeId;
    return new StructValue(structTypeId, structParams);
  }
  return createValue(binding.valueTypeId, binding.params, binding.value);
}

registerValueType(PlainValue);
registerValueType(RampValue);
registerValueType(DeviationValue);
registerValueType(PercentageValue);
registerValueType(SinusoidalValue);
registerValueType(StructValue);
