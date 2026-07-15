import type { TransformMethodDef, TransformParamDef, PlanDocument } from "../types/plan";

export type TransformEvaluator = (
  sourceValues: Record<string, unknown>,
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
  sourceValues: Record<string, unknown>,
  params: Record<string, unknown>
): unknown {
  const entry = registry.get(methodId);
  if (!entry) return null;
  return entry.evaluator(sourceValues, params);
}

export function loadTransformMethodsFromDoc(doc: PlanDocument) {
  for (const tm of doc.transform_methods || []) {
    if (!registry.has(tm.id)) {
      registry.set(tm.id, { method: tm, evaluator: () => null });
    }
  }
}

registerTransform(
  {
    id: "formula",
    name: "Formula",
    description: "Evaluate an arithmetic expression with named variables mapped to source definitions",
    category: "arithmetic",
    params_schema: [
      {
        key: "expression",
        label: "Expression",
        type: "text",
        required: true,
      },
      {
        key: "variables",
        label: "Variable Mappings",
        type: "text",
        required: true,
      },
    ],
  },
  (sourceValues, params) => {
    const expr = String(params.expression ?? "");
    if (!expr) return null;
    try {
      const vars: Record<string, string> =
        (params.variables as Record<string, string>) ?? {};
      const keys = Object.keys(vars);
      const values = keys.map((k) => {
        const defId = vars[k];
        const val = sourceValues[defId];
        return val != null ? Number(val) : 0;
      });
      return new Function(...keys, `return (${expr})`)(...values);
    } catch {
      return null;
    }
  }
);

registerTransform(
  {
    id: "linear",
    name: "Linear Conversion",
    description: "Convert a source value using factor and offset: result = source * factor + offset",
    category: "conversion",
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
  (sourceValues, params) => {
    const factor = Number(params.factor ?? 1);
    const offset = Number(params.offset ?? 0);
    const primaryValue = Object.values(sourceValues)[0];
    if (primaryValue == null) return null;
    return Number(primaryValue) * factor + offset;
  }
);

registerTransform(
  {
    id: "lookup",
    name: "Lookup Table",
    description: "Map source value to result using a key-value table",
    category: "mapping",
    params_schema: [
      {
        key: "table",
        label: "Table (JSON)",
        type: "text",
        required: true,
      },
    ],
  },
  (sourceValues, params) => {
    const table = params.table as [unknown, unknown][] | undefined;
    if (!table || !Array.isArray(table)) return null;
    const primaryValue = String(Object.values(sourceValues)[0] ?? "");
    for (const [k, v] of table) {
      if (String(k) === primaryValue) return v;
    }
    return null;
  }
);
