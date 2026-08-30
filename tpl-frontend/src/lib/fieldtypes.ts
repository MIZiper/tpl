// FieldType classes: the definition "kind" (number/text/select/bool/struct).
// They carry no value behavior — that lives on the binding's Value class.
export class FieldType {
  static readonly typeId: string = "";
  static readonly displayName: string = "";
}

export class NumberType extends FieldType {
  static readonly typeId: string = "number";
  static readonly displayName: string = "Number";
}

export class TextType extends FieldType {
  static readonly typeId: string = "text";
  static readonly displayName: string = "Text";
}

export class SelectType extends FieldType {
  static readonly typeId: string = "select";
  static readonly displayName: string = "Select";
}

export class BoolType extends FieldType {
  static readonly typeId: string = "bool";
  static readonly displayName: string = "True/False";
}

export class StructFieldType extends FieldType {
  static readonly typeId: string = "struct";
  static readonly displayName: string = "Struct";
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
