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
    { key: "ratio", label: "Total ratio", dataType: "number" },
  ];

  ratio(): number {
    return Number(this.params.ratio ?? 1);
  }
}

export class ProductStruct extends StructType {
  static readonly typeId: string = "product";
  static readonly displayName: string = "Product";
  static readonly fieldsSchema: StructField[] = [
    { key: "ratio", label: "Ratio", dataType: "number" },
    { key: "model", label: "Model", dataType: "text" },
    { key: "nominal_output_speed", label: "Nominal output speed [rpm]", dataType: "number", unit: "rpm" },
    { key: "nominal_input_torque", label: "Nominal input torque [kNm]", dataType: "number", unit: "kNm" },
    { key: "efficiency", label: "Efficiency [%]", dataType: "number", unit: "%"},
  ];

  ratio(): number {
    return Number(this.params.ratio ?? 1);
  }
}

// Bench — physical back-to-back test bench wiring. `unit_a_side` says which
// motor system (left/right) Unit A's output is connected to; Unit B uses the
// other side.
export class BenchStruct extends StructType {
  static readonly typeId: string = "bench";
  static readonly displayName: string = "Bench";
  static readonly fieldsSchema: StructField[] = [
    { key: "unit_a_side", label: "Unit A side", dataType: "select", options: ["left", "right"] },
  ];
}

registerStructType(GearboxStruct);
registerStructType(ProductStruct);
registerStructType(BenchStruct);
