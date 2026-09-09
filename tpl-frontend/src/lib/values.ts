// Value classes: the value-bearing object on a binding. A value exposes its
// characteristic set (values()): named scalar features (e.g. a ramp's
// start/end/duration). Transforms map these feature values element-wise.
// Non-transformable features (duration, frequency, struct fields) are
// passed through unchanged.
import { getStructType, type StructType } from "./structs";
import type { ParamSpec } from "./params";
import type { PlanFieldDef, FieldBinding } from "../types/plan";

export interface NamedValue {
  name: string;
  value: number | string | null;
  unit?: string;
  transformable?: boolean;
}

// Format a value for display: numbers are capped at 3 decimal places (also
// cleans up floating-point artifacts), strings pass through, null/"" -> "—".
function fmtNum(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return String(Math.round(n * 1000) / 1000);
}

export class Value {
  static readonly typeId: string = "value";
  static readonly displayName: string = "Value";
  static readonly paramsSchema: ParamSpec[] = [];

  constructor(public params: Record<string, unknown> = {}) {}

  get typeId(): string {
    return (this.constructor as typeof Value).typeId;
  }

  get name(): string {
    return (this.constructor as typeof Value).displayName;
  }

  get paramsSchema(): ParamSpec[] {
    return (this.constructor as typeof Value).paramsSchema;
  }

  values(): NamedValue[] {
    return [];
  }

  // describe(): customizable summary of the configured value (editor hints).
  describe(): string {
    return this.display();
  }

  // display(): renders the current characteristic values (readouts).
  display(): string {
    const vs = this.values().filter((v) => v.value != null && v.value !== "");
    if (vs.length === 0) return "—";
    if (vs.length === 1) return vs[0].unit ? `${fmtNum(vs[0].value)} ${vs[0].unit}` : `${fmtNum(vs[0].value)}`;
    return vs.map((v) => `${v.name}=${fmtNum(v.value)}${v.unit ? ` ${v.unit}` : ""}`).join(", ");
  }

  scalar(subKey = "value"): number | string | null {
    const v = this.values().find((x) => x.name === subKey);
    return v ? v.value : null;
  }

  // Map each transformable characteristic through fn. Concrete value types
  // override this to return a new instance of the SAME type; the base fallback
  // returns a generic DerivedValue (used for derived/chained or unknown types).
  mapChannels(fn: (v: number) => number): Value {
    return new DerivedValue(null, () =>
      this.values().map((c) => {
        if (c.transformable === false) return c;
        return { name: c.name, value: c.value == null ? null : fn(Number(c.value)) };
      })
    );
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

  display(): string {
    return this.scalarValue == null ? "—" : fmtNum(this.scalarValue);
  }

  mapChannels(fn: (v: number) => number): Value {
    return new PlainValue(this.scalarValue == null ? null : fn(Number(this.scalarValue)));
  }
}

// Ramp — a range of characteristic values (start → end) with a duration that is
// descriptive only (not transformed).
export class RampValue extends Value {
  static readonly typeId: string = "ramp";
  static readonly displayName: string = "Ramp";
  static readonly paramsSchema: ParamSpec[] = [
    { key: "start_value", label: "Start Value", type: "number", default: 0 },
    { key: "end_value", label: "End Value", type: "number", default: 100 },
    { key: "duration_seconds", label: "Duration (s)", type: "number", default: null },
  ];

  values(): NamedValue[] {
    const start = this.params.start_value;
    const end = this.params.end_value;
    const dur = this.params.duration_seconds;
    return [
      { name: "start_value", value: start == null || start === "" ? null : Number(start) },
      { name: "end_value", value: end == null || end === "" ? null : Number(end) },
      { name: "duration_seconds", value: dur == null || dur === "" ? null : Number(dur), transformable: false },
    ];
  }

  display(): string {
    const s = this.params.start_value;
    const e = this.params.end_value;
    const d = this.params.duration_seconds;
    const base = `${fmtNum(s)} → ${fmtNum(e)}`;
    return d != null && d !== "" ? `${base} over ${fmtNum(d)}s` : base;
  }

  mapChannels(fn: (v: number) => number): Value {
    const map = (k: string) => {
      const v = this.params[k];
      return v == null || v === "" ? v : fn(Number(v));
    };
    return new RampValue({
      ...this.params,
      start_value: map("start_value"),
      end_value: map("end_value"),
    });
  }
}

// Tolerance — nominal value with separate + and - tolerances.
export class ToleranceValue extends Value {
  static readonly typeId: string = "tolerance";
  static readonly displayName: string = "Tolerance";
  static readonly paramsSchema: ParamSpec[] = [
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

  display(): string {
    const value = this.params.value ?? 0;
    const tp = this.params.tolerance_plus;
    const tm = this.params.tolerance_minus;
    const parts = [fmtNum(value)];
    if (tp != null && tp !== "" && tm != null && tm !== "") parts.push(`+${fmtNum(tp)}/-${fmtNum(tm)}`);
    else if (tp != null && tp !== "") parts.push(`+${fmtNum(tp)}`);
    else if (tm != null && tm !== "") parts.push(`-${fmtNum(tm)}`);
    return parts.join(" ");
  }

  mapChannels(fn: (v: number) => number): Value {
    const map = (k: string) => {
      const v = this.params[k];
      return v == null || v === "" ? v : fn(Number(v));
    };
    return new ToleranceValue({
      ...this.params,
      value: map("value"),
      tolerance_plus: map("tolerance_plus"),
      tolerance_minus: map("tolerance_minus"),
    });
  }
}

// Percentage — value expressed as a percentage of a reference.
export class PercentageValue extends Value {
  static readonly typeId: string = "percentage";
  static readonly displayName: string = "Percentage";
  static readonly paramsSchema: ParamSpec[] = [
    { key: "value", label: "Percentage (%)", type: "number", default: 100 },
    { key: "reference", label: "Reference", type: "number", default: null },
  ];

  values(): NamedValue[] {
    const value = this.params.value ?? 0;
    const reference = this.params.reference;
    return [
      { name: "value", value: Number(value), transformable: false },
      { name: "reference", value: reference == null || reference === "" ? null : Number(reference) },
    ];
  }

  display(): string {
    const value = this.params.value ?? 0;
    const reference = this.params.reference;
    let s = `${fmtNum(value)}%`;
    if (reference != null && reference !== "") s += ` of ${fmtNum(reference)}`;
    return s;
  }

  mapChannels(fn: (v: number) => number): Value {
    const map = (k: string) => {
      const v = this.params[k];
      return v == null || v === "" ? v : fn(Number(v));
    };
    return new PercentageValue({ ...this.params, reference: map("reference") });
  }
}

// Sinusoidal — static characteristic set (amplitude/offset transformable,
// frequency descriptive). No time evaluation.
export class SinusoidalValue extends Value {
  static readonly typeId: string = "sinusoidal";
  static readonly displayName: string = "Sinusoidal";
  static readonly paramsSchema: ParamSpec[] = [
    { key: "amplitude", label: "Amplitude", type: "number", default: 0 },
    { key: "frequency", label: "Frequency (Hz)", type: "number", default: 60 },
    { key: "offset", label: "Offset (DC)", type: "number", default: 0 },
  ];

  values(): NamedValue[] {
    const amp = this.params.amplitude ?? 0;
    const freq = this.params.frequency ?? 0;
    const offset = this.params.offset ?? 0;
    return [
      { name: "amplitude", value: Number(amp) },
      { name: "frequency", value: Number(freq), transformable: false },
      { name: "offset", value: Number(offset) },
    ];
  }

  display(): string {
    const amp = this.params.amplitude ?? 0;
    const freq = this.params.frequency ?? 0;
    const offset = this.params.offset ?? 0;
    const parts: string[] = [];
    if (Number(offset) !== 0) parts.push(fmtNum(offset));
    parts.push(`±${fmtNum(amp)}`);
    if (Number(freq) > 0) parts.push(`${fmtNum(freq)}Hz`);
    return parts.join(" ");
  }

  mapChannels(fn: (v: number) => number): Value {
    const map = (k: string) => {
      const v = this.params[k];
      return v == null || v === "" ? v : fn(Number(v));
    };
    return new SinusoidalValue({
      ...this.params,
      amplitude: map("amplitude"),
      offset: map("offset"),
    });
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
      transformable: false,
    }));
  }

  display(): string {
    const s = this.values().filter((v) => v.value !== "" && v.value != null);
    if (!s.length) return this.structTypeId;
    return `${this.structTypeId} (${s.map((v) => `${v.name}:${fmtNum(v.value)}`).join(", ")})`;
  }

  mapChannels(_fn: (v: number) => number): Value {
    return this;
  }
}

// DerivedValue — maps characteristic values from its inputs; composable.
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
    const vs = this.values().filter((v) => v.value != null && v.value !== "");
    if (vs.length === 0) return "—";
    if (vs.length === 1) return vs[0].unit ? `${fmtNum(vs[0].value)} ${vs[0].unit}` : `${fmtNum(vs[0].value)}`;
    return vs.map((v) => `${fmtNum(v.value)}${v.unit ? ` ${v.unit}` : ""}`).join(", ");
  }
}

// ---------------------------------------------------------------------------
// Registry + factories
// ---------------------------------------------------------------------------

export interface ValueCtor {
  readonly typeId: string;
  readonly displayName: string;
  readonly paramsSchema: ParamSpec[];
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
    case "tolerance":
      return new ToleranceValue(params ?? {});
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

// Build a StructValue directly from a struct definition (data lives on the
// definition, not on a per-step binding).
export function createStructValue(def: PlanFieldDef): StructValue {
  const structTypeId = String(def.params.structTypeId ?? "");
  const structParams: Record<string, unknown> = { ...def.params };
  delete structParams.structTypeId;
  return new StructValue(structTypeId, structParams);
}

// Build the Value instance for a binding, considering its definition.
export function createBindingValue(
  binding: FieldBinding,
  def: PlanFieldDef | undefined
): Value {
  if (def?.typeId === "struct") return createStructValue(def);
  return createValue(binding.valueTypeId, binding.params, binding.value);
}

registerValueType(PlainValue);
registerValueType(RampValue);
registerValueType(ToleranceValue);
registerValueType(PercentageValue);
registerValueType(SinusoidalValue);
registerValueType(StructValue);
