// StructType classes: describe a structure whose fields transforms can introspect.
export interface StructField {
  key: string;
  label: string;
  dataType: "number" | "text" | "select" | "bool";
  unit?: string;
  options?: string[];
}

export interface NamedStructValue {
  name: string;
  value: number | string | null;
  unit?: string;
}

export class StructType {
  static readonly typeId: string = "";
  static readonly displayName: string = "Struct";
  static readonly fieldsSchema: StructField[] = [];

  params: Record<string, unknown> = {};

  fields(): StructField[] {
    return (this.constructor as typeof StructType).fieldsSchema;
  }

  namedValues(): NamedStructValue[] {
    return this.fields().map((f) => ({
      name: f.key,
      value: (this.params[f.key] ?? "") as number | string,
      unit: f.unit,
    }));
  }
}

const registry = new Map<string, typeof StructType>();

export function registerStructType(cls: typeof StructType) {
  registry.set(cls.typeId, cls);
}

export function getStructTypes(): typeof StructType[] {
  return Array.from(registry.values());
}

export function getStructType(id: string): typeof StructType | undefined {
  return registry.get(id);
}

export class GearboxStruct extends StructType {
  static readonly typeId: string = "gearbox";
  static readonly displayName: string = "Gearbox";
  static readonly fieldsSchema: StructField[] = [
    { key: "stages", label: "Number of stages", dataType: "number" },
    { key: "ratio_ls", label: "Low speed stage ratio", dataType: "number" },
    { key: "ratio_is", label: "Intermediate speed stage ratio", dataType: "number" },
    { key: "ratio_hs", label: "High speed stage ratio", dataType: "number" },
    { key: "model", label: "Model / type name", dataType: "text" },
  ];

  ratioFor(stage: string): number {
    return Number(this.params[`ratio_${stage}`] ?? 1);
  }
}

registerStructType(GearboxStruct);
