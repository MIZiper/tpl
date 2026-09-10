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
    const value = inputs["value"];
    if (!value) return new DerivedValue(null, () => []);
    const factor = Number(params.factor ?? 1);
    const offset = Number(params.offset ?? 0);
    return value.mapChannels((v) => v * factor + offset);
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
    if (!value || !(gbx instanceof StructValue)) {
      return new DerivedValue(null, () => []);
    }
    const ratio = gbx.struct<GearboxStruct>().ratio();
    const factor = String(params.mode ?? "divide") === "multiply" ? ratio : 1 / ratio;
    return value.mapChannels((v) => v * factor);
  }
}

// ProductTrans — convert through a ProductStruct with explicit controls:
//   * reference: which product nominal a percentage resolves against
//     (none → percentage passes through as percentage; speed → nominal_output_speed;
//      torque → nominal_input_torque).
//   * ratio_mode / efficiency: none | multiply | divide, combined as a factor.
//   Absolute (non-percentage) inputs are mapped type-preservingly.
export class ProductTrans extends Transform {
  static readonly typeId: string = "product.trans";
  static readonly displayName: string = "Product conversion";
  static readonly paramsSchema: ParamSpec[] = [
    { key: "ratio_mode", label: "Ratio", type: "select", options: ["none", "multiply", "divide"], default: "none" },
    { key: "reference", label: "Reference", type: "select", options: ["none", "speed", "torque"], default: "none" },
    { key: "efficiency", label: "Efficiency", type: "select", options: ["none", "multiply", "divide"], default: "none" },
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
    if (!value || !(product instanceof StructValue)) {
      return new DerivedValue(null, () => []);
    }
    const pstruct = product.struct<ProductStruct>();
    const ratio = pstruct.ratio();
    const eff = Number(pstruct.params.efficiency ?? 100) / 100;

    const ratioMode = String(params.ratio_mode ?? "none");
    const effMode = String(params.efficiency ?? "none");
    const reference = String(params.reference ?? "none");

    let factor = 1;
    if (ratioMode === "multiply") factor *= ratio;
    else if (ratioMode === "divide") factor /= ratio;
    if (effMode === "multiply") factor *= eff;
    else if (effMode === "divide") factor /= eff;

    if (value instanceof PercentageValue && reference !== "none") {
      const nominal = reference === "torque"
        ? Number(pstruct.params.nominal_input_torque ?? 0)
        : Number(pstruct.params.nominal_output_speed ?? 0);
      const pct = Number(value.params.value ?? 0);
      return new PlainValue(Number((((pct * nominal) / 100) * factor).toFixed(12)));
    }
    return value.mapChannels((v) => v * factor);
  }
}

// ProductBack2Back — back-to-back test between two products. The two units
// (Unit A / Unit B) are each bound once to a product struct definition. Which
// unit acts as the *primary* (the one whose reference quantity `value` is
// commanded on, and against whose nominal percentages resolve) and its run
// mode are chosen per-step through a single `run_on` select port whose options
// encode both, e.g. `A:motor` / `A:generator` / `B:motor` / `B:generator`
// (separator `:` or `-`, case-insensitive) — so one transform serves both
// orientations and can be switched at run time. Empty/unparsable `run_on`
// yields no output. LSS shafts are coupled (same speed). Output quantity +
// factor depend on reference × run mode:
//   speed  + motor     -> primary output speed   (= value)
//   speed  + generator -> companion output speed (= value * Rc/Rp)
//   torque + motor     -> companion output torque(= value / (Rc*Ec))
//   torque + generator -> primary output torque  (= value * Ep/Rp)
export class ProductBack2Back extends Transform {
  static readonly typeId: string = "product.back2back";
  static readonly displayName: string = "Back-to-back";
  static readonly paramsSchema: ParamSpec[] = [
    { key: "reference", label: "Reference", type: "select", options: ["speed", "torque"], default: "speed" },
  ];

  static inputs(): PortSpec[] {
    return [
      { role: "value", label: "Input value", kind: "fielddef", fieldType: "number" },
      { role: "unit_a", label: "Unit A", kind: "struct", structType: "product" },
      { role: "unit_b", label: "Unit B", kind: "struct", structType: "product" },
      { role: "run_on", label: "Run on (unit:mode)", kind: "fielddef", fieldType: "select" },
    ];
  }

  static apply(inputs: Record<string, Value>, params: Record<string, unknown>): Value {
    const value = inputs["value"];
    const unitA = inputs["unit_a"];
    const unitB = inputs["unit_b"];
    if (!value || !(unitA instanceof StructValue) || !(unitB instanceof StructValue)) {
      return new DerivedValue(null, () => []);
    }
    const raw = String(inputs["run_on"]?.scalar() ?? "").trim().toLowerCase();
    const mode = raw.includes("generator") ? "generator" : raw.includes("motor") ? "motor" : "";
    const isA = /(^|[^a-z])a([^a-z]|$)/.test(raw);
    const isB = /(^|[^a-z])b([^a-z]|$)/.test(raw);
    if (!mode || (!isA && !isB)) {
      return new DerivedValue(null, () => []);
    }
    const primary = isB && !isA ? unitB : unitA;
    const companion = isB && !isA ? unitA : unitB;
    const p = primary.struct<ProductStruct>();
    const c = companion.struct<ProductStruct>();
    const Rp = p.ratio();
    const Rc = c.ratio();
    const Ep = Number(p.params.efficiency ?? 100) / 100;
    const Ec = Number(c.params.efficiency ?? 100) / 100;
    const reference = String(params.reference ?? "speed");

    let factor: number;
    if (reference === "speed") {
      factor = mode === "generator" ? Rc / Rp : 1;
    } else {
      factor = mode === "generator" ? Ep / Rp : 1 / (Rc * Ec);
    }

    if (value instanceof PercentageValue) {
      const nominal = reference === "torque"
        ? Number(p.params.nominal_input_torque ?? 0)
        : Number(p.params.nominal_output_speed ?? 0);
      const pct = Number(value.params.value ?? 0);
      return new PlainValue(Number((((pct * nominal) / 100) * factor).toFixed(12)));
    }
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
registerTransform(ProductBack2Back);
