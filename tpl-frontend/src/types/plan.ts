// Persisted (JSON) shapes. Behavior lives in code classes; the document only
// stores instance data that references registered classes by id.

export interface PlanFieldDef {
  id: string;
  typeId: string;                 // field type id: number | text | select | bool | struct
  name: string;
  params: Record<string, unknown>; // number: {unit}; select: {options}; bool: {criteria}; struct: {structTypeId, ...fields}
  derived?: boolean;
}

export interface PlanDefinitions {
  input_conditions: PlanFieldDef[];
  collection_items: PlanFieldDef[];
  completion_criteria: PlanFieldDef[];
  custom: PlanFieldDef[];
}

export interface FieldBinding {
  definition_id: string;
  value?: unknown;                // plain scalar
  valueTypeId?: string;           // plain | ramp | tolerance | percentage | sinusoidal
  params?: Record<string, unknown>;
}

export interface PlanNode {
  id: string;
  type: "group" | "step";
  title: string;
  children: PlanNode[];
  description: string | null;
  duration_minutes: number;
  changeover_minutes: number;
  input_conditions: FieldBinding[];
  collection_items: FieldBinding[];
  completion_criteria: FieldBinding[];
  required_executions: number;
  step_template_id: string | null;
  solution_step_id: string | null;
}

export interface PlanTemplate {
  id: string;
  name: string;
  step: PlanNode;
}

export interface TransformInputBinding {
  role: string;
  definitionId: string;
}

export interface TransformDef {
  id: string;
  name: string;
  typeId: string;                 // transform class id, e.g. "linear" | "gearbox.trans"
  inputs: TransformInputBinding[];
  derivedDefId: string;           // definition id holding the output field; output name/unit are read from that def
  params: Record<string, unknown>;
}

export interface PlanDocument {
  version: number;
  definitions: PlanDefinitions;
  root: PlanNode[];
  templates: PlanTemplate[];
  transforms: TransformDef[];
}
