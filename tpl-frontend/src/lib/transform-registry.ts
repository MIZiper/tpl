import type { TransformMethodDef, TransformParamDef, PlanDocument } from "../types/plan";

export type TransformEvaluator = (
  inputs: Record<string, unknown>,
  params: Record<string, unknown>
) => unknown;

interface TransformEntry {
  method: TransformMethodDef;
  evaluator: TransformEvaluator;
}

const registry = new Map<string, TransformEntry>();

export function registerTransform(
  method: TransformMethodDef,
  evaluator: TransformEvaluator
) {
  registry.set(method.id, { method, evaluator });
}

export function getTransformMethods(): TransformMethodDef[] {
  return Array.from(registry.values()).map((e) => e.method);
}

export function getTransformMethod(id: string): TransformMethodDef | undefined {
  return registry.get(id)?.method;
}

export function evaluateTransform(
  methodId: string,
  inputs: Record<string, unknown>,
  params: Record<string, unknown>
): unknown {
  const entry = registry.get(methodId);
  if (!entry) return null;
  return entry.evaluator(inputs, params);
}

export function loadTransformMethodsFromDoc(doc: PlanDocument) {
  for (const tm of doc.transform_methods || []) {
    if (!registry.has(tm.id)) {
      registry.set(tm.id, {
        method: {
          ...tm,
          inputs: tm.inputs ?? [],
          output: tm.output ?? { data_type: "number" },
        },
        evaluator: () => null,
      });
    }
  }
}

// Formula — evaluate an arithmetic expression. Port keys become variable names.
registerTransform(
  {
    id: "formula",
    name: "Formula",
    description: "Evaluate an arithmetic expression. Each input port becomes a named variable usable in the expression.",
    category: "arithmetic",
    inputs: [],
    output: { data_type: "number" },
    variadic: true,
    params_schema: [
      {
        key: "expression",
        label: "Expression",
        type: "text",
        required: true,
      },
    ],
  },
  (inputs, params) => {
    const expr = String(params.expression ?? "");
    if (!expr) return null;
    try {
      const keys = Object.keys(inputs);
      const values = keys.map((k) => {
        const val = inputs[k];
        return val != null ? Number(val) : 0;
      });
      return new Function(...keys, `return (${expr})`)(...values);
    } catch {
      return null;
    }
  }
);

// Linear — result = source * factor + offset.
registerTransform(
  {
    id: "linear",
    name: "Linear Conversion",
    description: "Convert a source value using factor and offset: result = source * factor + offset",
    category: "conversion",
    inputs: [
      { key: "value", label: "Source value", kind: "fielddef", data_type: "number" },
    ],
    output: { data_type: "number" },
    params_schema: [
      {
        key: "factor",
        label: "Factor",
        type: "number",
        default: 1,
        required: true,
      },
      {
        key: "offset",
        label: "Offset",
        type: "number",
        default: 0,
      },
    ],
  },
  (inputs, params) => {
    const factor = Number(params.factor ?? 1);
    const offset = Number(params.offset ?? 0);
    const primaryValue = inputs["value"];
    if (primaryValue == null) return null;
    return Number(primaryValue) * factor + offset;
  }
);

// Lookup — map source value to result using a key-value table.
registerTransform(
  {
    id: "lookup",
    name: "Lookup Table",
    description: "Map a source value to a result using a key-value table",
    category: "mapping",
    inputs: [
      { key: "key", label: "Lookup key", kind: "fielddef", data_type: "number" },
    ],
    output: { data_type: "number" },
    params_schema: [
      {
        key: "table",
        label: "Table (JSON)",
        type: "text",
        required: true,
      },
    ],
  },
  (inputs, params) => {
    const table = params.table as [unknown, unknown][] | undefined;
    if (!table || !Array.isArray(table)) return null;
    const key = String(inputs["key"] ?? "");
    for (const [k, v] of table) {
      if (String(k) === key) return v;
    }
    return null;
  }
);
