// Shared parameter schema used by field types, value classes, and transforms.
// `textlist` renders as a textarea and produces a string[] (split on lines/commas).
export interface ParamSpec {
  key: string;
  label: string;
  type: "number" | "text" | "textlist" | "select";
  default?: unknown;
  options?: string[];
  required?: boolean;
}
