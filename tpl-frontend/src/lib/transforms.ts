// Transform classes: typed computation. apply() receives bound Value instances
// (keyed by role) and returns a new Value (typically a DerivedValue) whose
// characteristic values are a per-channel mapping of the inputs. Non-
// transformable channels (duration, frequency, struct fields) pass through.
import { Value, DerivedValue, PlainValue, StructValue, type NamedValue } from "./values";
import { GearboxStruct } from "./structs";
import type { ParamSpec } from "./params";

export interface PortSpec {
  role: string;
  label: string;
  kind: "fielddef" | "struct";
  fieldType?: string;
  structType?: string;
  variadic?: boolean;
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

// Map each transformable channel of a value through fn; copy the rest.
function mapChannels(src: Value, fn: (v: number) => number): NamedValue[] {
  return src.values().map((c) => {
    if (c.transformable === false) return c;
    return { name: c.name, value: c.value == null ? null : fn(Number(c.value)) };
  });
}

// Formula — variadic numeric ports; role names become expression variables.
// Output channels = union of input channel names; non-transformable channels
// are copied through unchanged.
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
      if (!expr) return [];
      const roles = Object.keys(inputs);
      const keySet = new Set<string>();
      const sourceByKey: Record<string, NamedValue> = {};
      for (const r of roles) {
        for (const c of inputs[r].values()) {
          keySet.add(c.name);
          if (!sourceByKey[c.name]) sourceByKey[c.name] = c;
        }
      }
      const keys = [...keySet];
      try {
        return keys.map((k) => {
          const src = sourceByKey[k];
          if (src.transformable === false) return src;
          const vals = roles.map((r) => Number(inputs[r].scalar(k) ?? 0));
          const out = new Function(...roles, `return (${expr})`)(...vals);
          return { name: k, value: typeof out === "number" && !Number.isNaN(out) ? out : (out ?? null) };
        });
      } catch {
        return [];
      }
    });
  }
}

// Linear — result = source * factor + offset, per channel.
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
    return new DerivedValue(unit, () => mapChannels(inputs["value"], (v) => v * factor + offset));
  }
}

// Lookup — map each channel value through a key-value table.
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
      if (!table || !Array.isArray(table)) return [];
      return inputs["key"].values().map((c) => {
        if (c.transformable === false) return c;
        const hit = table.find(([a]) => String(a) === String(c.value));
        return { name: c.name, value: hit ? ((hit[1] as number | string) ?? null) : null };
      });
    });
  }
}

// GearboxTrans — output = input features mapped by gearbox ratio (user defines
// the output meaning via the derived name/unit; direction via mode).
export class GearboxTrans extends Transform {
  static readonly typeId: string = "gearbox.trans";
  static readonly displayName: string = "Gearbox conversion";
  static readonly paramsSchema: ParamSpec[] = [
    { key: "mode", label: "Mode", type: "select", options: ["divide", "multiply"], default: "divide" },
  ];

  static inputs(): PortSpec[] {
    return [
      { role: "value", label: "Input value", kind: "fielddef", fieldType: "number" },
      { role: "gearbox", label: "Gearbox", kind: "struct", structType: "gearbox" },
    ];
  }

  static apply(inputs: Record<string, Value>, params: Record<string, unknown>): Value {
    const value = inputs["value"];
    const gbx = inputs["gearbox"];
    if (!(gbx instanceof StructValue)) {
      return new DerivedValue(null, () => []);
    }
    const ratio = gbx.struct<GearboxStruct>().ratio();
    const factor = String(params.mode ?? "divide") === "multiply" ? ratio : 1 / ratio;
    const unit = params.derived_unit ? String(params.derived_unit) : null;
    return new DerivedValue(unit, () => mapChannels(value, (v) => v * factor));
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
registerTransform(GearboxTrans);
