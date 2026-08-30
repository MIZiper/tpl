// Transform classes: typed computation. apply() receives bound Value instances
// (keyed by role) and returns a new Value (typically a DerivedValue), so outputs
// are composable and time-variation propagates for free.
import { Value, DerivedValue, PlainValue, StructValue } from "./values";
import { GearboxStruct } from "./structs";

export interface PortSpec {
  role: string;
  label: string;
  kind: "fielddef" | "struct";
  fieldType?: string;
  structType?: string;
  variadic?: boolean;
}

export interface ParamSpec {
  key: string;
  label: string;
  type: "number" | "text" | "select";
  default?: unknown;
  options?: string[];
  required?: boolean;
}

export class Transform {
  static readonly typeId: string = "";
  static readonly displayName: string = "Transform";
  static readonly paramsSchema: ParamSpec[] = [];

  static inputs(): PortSpec[] {
    return [];
  }

  static apply(inputs: Record<string, Value>, params: Record<string, unknown>): Value {
    return new PlainValue(null);
  }
}

// Formula — variadic numeric ports; role names become expression variables.
export class FormulaTransform extends Transform {
  static readonly typeId: string = "formula";
  static readonly displayName: string = "Formula";
  static readonly paramsSchema: ParamSpec[] = [
    { key: "expression", label: "Expression", type: "text", required: true },
  ];

  static inputs(): PortSpec[] {
    return [{ role: "v1", label: "Variable", kind: "fielddef", fieldType: "number", variadic: true }];
  }

  static apply(inputs: Record<string, Value>, params: Record<string, unknown>): Value {
    const expr = String(params.expression ?? "");
    const unit = params.derived_unit ? String(params.derived_unit) : null;
    return new DerivedValue(unit, () => {
      if (!expr) return [{ name: "value", value: null }];
      try {
        const roles = Object.keys(inputs);
        const vals = roles.map((r) => Number(inputs[r].scalar("value") ?? 0));
        const out = new Function(...roles, `return (${expr})`)(...vals);
        return [{ name: "value", value: typeof out === "number" && !Number.isNaN(out) ? out : (out ?? null) }];
      } catch {
        return [{ name: "value", value: null }];
      }
    });
  }
}

// Linear — result = source * factor + offset.
export class LinearTransform extends Transform {
  static readonly typeId: string = "linear";
  static readonly displayName: string = "Linear Conversion";
  static readonly paramsSchema: ParamSpec[] = [
    { key: "factor", label: "Factor", type: "number", default: 1, required: true },
    { key: "offset", label: "Offset", type: "number", default: 0 },
  ];

  static inputs(): PortSpec[] {
    return [{ role: "value", label: "Source value", kind: "fielddef", fieldType: "number" }];
  }

  static apply(inputs: Record<string, Value>, params: Record<string, unknown>): Value {
    const factor = Number(params.factor ?? 1);
    const offset = Number(params.offset ?? 0);
    const unit = params.derived_unit ? String(params.derived_unit) : null;
    return new DerivedValue(unit, () => {
      const v = inputs["value"].scalar("value");
      const out = v == null ? null : Number(v) * factor + offset;
      return [{ name: "value", value: out }];
    });
  }
}

// Lookup — map source value to result using a key-value table.
export class LookupTransform extends Transform {
  static readonly typeId: string = "lookup";
  static readonly displayName: string = "Lookup Table";
  static readonly paramsSchema: ParamSpec[] = [
    { key: "table", label: "Table (JSON)", type: "text", required: true },
  ];

  static inputs(): PortSpec[] {
    return [{ role: "key", label: "Lookup key", kind: "fielddef", fieldType: "number" }];
  }

  static apply(inputs: Record<string, Value>, params: Record<string, unknown>): Value {
    const table = params.table as [unknown, unknown][] | undefined;
    const unit = params.derived_unit ? String(params.derived_unit) : null;
    return new DerivedValue(unit, () => {
      if (!table || !Array.isArray(table)) return [{ name: "value", value: null }];
      const k = String(inputs["key"].scalar("value") ?? "");
      const hit = table.find(([a]) => String(a) === k);
      return [{ name: "value", value: hit ? ((hit[1] as number | string) ?? null) : null }];
    });
  }
}

// GearboxOutputSpeed — output_speed = f(input_speed, gearbox, stage).
export class GearboxOutputSpeed extends Transform {
  static readonly typeId: string = "gearbox.output_speed";
  static readonly displayName: string = "Gearbox output speed";
  static readonly paramsSchema: ParamSpec[] = [
    { key: "stage", label: "Stage", type: "select", options: ["ls", "is", "hs"], default: "hs" },
    { key: "mode", label: "Mode", type: "select", options: ["divide", "multiply"], default: "divide" },
  ];

  static inputs(): PortSpec[] {
    return [
      { role: "speed", label: "Input speed", kind: "fielddef", fieldType: "number" },
      { role: "gearbox", label: "Gearbox", kind: "struct", structType: "gearbox" },
    ];
  }

  static apply(inputs: Record<string, Value>, params: Record<string, unknown>): Value {
    const speed = inputs["speed"];
    const gearbox = inputs["gearbox"];
    const unit = params.derived_unit ? String(params.derived_unit) : null;
    return new DerivedValue(unit, () => {
      const s = speed.scalar("value");
      if (s == null) return [{ name: "value", value: null }];
      const gbx = (gearbox as StructValue).struct<GearboxStruct>();
      const ratio = gbx.ratioFor(String(params.stage ?? "hs"));
      const out = String(params.mode ?? "divide") === "multiply" ? Number(s) * ratio : Number(s) / ratio;
      return [{ name: "value", value: out }];
    });
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, typeof Transform>();

export function registerTransform(cls: typeof Transform) {
  registry.set(cls.typeId, cls);
}

export function getTransforms(): typeof Transform[] {
  return Array.from(registry.values());
}

export function getTransform(id: string): typeof Transform | undefined {
  return registry.get(id);
}

registerTransform(FormulaTransform);
registerTransform(LinearTransform);
registerTransform(LookupTransform);
registerTransform(GearboxOutputSpeed);
