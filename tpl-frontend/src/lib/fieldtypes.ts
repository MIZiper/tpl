// FieldType classes: the definition "kind" (number/text/select/bool/struct).
// Each kind declares which params a definition collects (paramsSchema) and how
// to summarize a definition (describe). Value behavior lives on the binding's
// Value class.
import { getStructType } from "./structs";
import type { ParamSpec } from "./params";
import type { PlanFieldDef } from "../types/plan";

export class FieldType {
  static readonly typeId: string = "";
  static readonly displayName: string = "";
  static readonly paramsSchema: ParamSpec[] = [];

  static describe(_params: Record<string, unknown>): string {
    return (this as typeof FieldType).displayName;
  }
}

export class NumberType extends FieldType {
  static readonly typeId: string = "number";
  static readonly displayName: string = "Number";
  static readonly paramsSchema: ParamSpec[] = [
    { key: "unit", label: "Unit", type: "text" },
  ];

  static describe(params: Record<string, unknown>): string {
    const unit = params.unit;
    return unit ? `Number [${unit}]` : "Number";
  }
}

export class TextType extends FieldType {
  static readonly typeId: string = "text";
  static readonly displayName: string = "Text";
}

export class SelectType extends FieldType {
  static readonly typeId: string = "select";
  static readonly displayName: string = "Select";
  static readonly paramsSchema: ParamSpec[] = [
    { key: "options", label: "Options", type: "textlist" },
  ];

  static describe(params: Record<string, unknown>): string {
    const options = (params.options as string[] | undefined) ?? [];
    return options.length ? `Options: ${options.join(", ")}` : "Select";
  }
}

export class BoolType extends FieldType {
  static readonly typeId: string = "bool";
  static readonly displayName: string = "True/False";
  static readonly paramsSchema: ParamSpec[] = [
    { key: "criteria", label: "Criteria", type: "text" },
  ];

  static describe(params: Record<string, unknown>): string {
    const criteria = params.criteria;
    return criteria ? `Pass/Fail: ${criteria}` : "Yes/No";
  }
}

export class StructFieldType extends FieldType {
  static readonly typeId: string = "struct";
  static readonly displayName: string = "Struct";

  static describe(params: Record<string, unknown>): string {
    const st = getStructType(String(params.structTypeId ?? ""));
    if (!st) return "Struct";
    return st.displayName;
  }
}

export function defUnit(def: PlanFieldDef | null | undefined): string | null {
  if (!def) return null;
  const unit = def.params.unit;
  return unit != null && unit !== "" ? String(unit) : null;
}

const registry = new Map<string, typeof FieldType>();

export function registerFieldType(cls: typeof FieldType) {
  registry.set(cls.typeId, cls);
}

export function getFieldTypes(): typeof FieldType[] {
  return Array.from(registry.values());
}

export function getFieldType(id: string): typeof FieldType | undefined {
  return registry.get(id);
}

registerFieldType(NumberType);
registerFieldType(TextType);
registerFieldType(SelectType);
registerFieldType(BoolType);
registerFieldType(StructFieldType);
