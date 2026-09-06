// Transform classes: typed computation. apply() receives bound Value instances
// (keyed by role) and returns a new Value. Single-input channel-mapping
// transforms preserve the input's value type via Value.mapChannels (a ramp in
// yields a ramp out); non-transformable channels pass through. Transforms that
// change shape (formula, lookup) or branch on input type (ProductTrans) return
// a concrete value or a generic DerivedValue as appropriate.
import { Value, DerivedValue, PlainValue, StructValue, PercentageValue, type NamedValue } from "./values";
import { GearboxStruct, ProductStruct } from "./structs";
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
    return inputs["value"].mapChannels((v) => v * factor + offset);
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
    return value.mapChannels((v) => v * factor);
  }
}

// ProductTrans — convert through a ProductStruct, branching on the mode type:
//   * In unify/ast mode, input always follow the struct definition: output speed and input torque.
//     unify mode: simply convert to absolute values of input
//     ast mode: speed to input side, torque to output side (both ÷ ratio)
//       Speed has no loss in transform, while torque consider that.
//       If input is percentage, then convert to abs values first.
//   * Any other mode input → map through the product ratio (type-preserving).
export class ProductTrans extends Transform {
  static readonly typeId: string = "product.trans";
  static readonly displayName: string = "Product conversion";
  static readonly paramsSchema: ParamSpec[] = [
    { key: "mode", label: "Mode", type: "select", options: ["unify", "ast", "divide", "multiply"], default: "ast" },
  ];

  static inputs(): PortSpec[] {
    return [
      { role: "value", label: "Input value", kind: "fielddef", fieldType: "number" },
      { role: "product", label: "Product", kind: "struct", structType: "product" },
    ];
  }

  static apply(inputs: Record<string, Value>, params: Record<string, unknown>): Value {
    const value = inputs["value"];
    const product = inputs["product"];
    if (!(product instanceof StructValue)) {
      return new DerivedValue(null, () => []);
    }
    const pstruct = product.struct<ProductStruct>();
    const ratio = pstruct.ratio();
    const eff = Number(pstruct.params.efficiency ?? 100) / 100;
    const mode = String(params.mode ?? "ast");

    const unit = (value.unit ?? "").toLowerCase();
    const isSpeed = unit === "rpm";
    const isTorque = unit.includes("nm");

    const nominal = isSpeed ? Number(pstruct.params.nominal_output_speed ?? 0)
      : isTorque ? Number(pstruct.params.nominal_input_torque ?? 0)
      : null;

    const toAbsolute = (): Value => {
      if (value instanceof PercentageValue) {
        if (nominal == null) return value.mapChannels((v) => v);
        const pct = Number(value.params.value ?? 0);
        return new PlainValue(Number(((pct * nominal) / 100).toFixed(12)));
      }
      return value.mapChannels((v) => v);
    };

    if (mode === "unify") return toAbsolute();

    if (mode === "ast") {
      const factor = isTorque ? eff / ratio : 1 / ratio;
      return toAbsolute().mapChannels((v) => v * factor);
    }

    const factor = mode === "multiply" ? ratio : 1 / ratio;
    return value.mapChannels((v) => v * factor);
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
registerTransform(ProductTrans);
