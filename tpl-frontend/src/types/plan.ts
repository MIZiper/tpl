export interface PlanFieldDefMeta {
  number_kind?: "range" | "deviation" | "percentage";
  start?: number;
  stop?: number;
  step?: number;
  options?: string[];
  tolerance_plus?: number;
  tolerance_minus?: number;
  reference_value?: number;
}

export interface PlanFieldDef {
  id: string;
  name: string;
  data_type: "number" | "text" | "select" | "bool";
  unit: string | null;
  meta: PlanFieldDefMeta | null;
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
  value: unknown;
  dynamic_type?: string;
  dynamic_params?: Record<string, unknown>;
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
  system_config: Record<string, unknown> | null;
  required_executions: number;
  step_template_id: string | null;
  solution_step_id: string | null;
}

export interface PlanTemplate {
  id: string;
  name: string;
  step: PlanNode;
}

export interface TransformParamDef {
  key: string;
  label: string;
  type: "number" | "text" | "select" | "definition_ref";
  default?: unknown;
  options?: string[];
  required?: boolean;
}

export interface TransformMethodDef {
  id: string;
  name: string;
  description?: string;
  category?: string;
  params_schema: TransformParamDef[];
}

export interface TransformDef {
  id: string;
  name: string;
  method_id: string;
  source_definition_ids: string[];
  derived_definition_id: string;
  derived_name: string;
  derived_unit?: string;
  params: Record<string, unknown>;
}

export interface DynamicTypeDef {
  id: string;
  name: string;
  description?: string;
  params_schema: TransformParamDef[];
}

export interface PlanDocument {
  version: number;
  definitions: PlanDefinitions;
  root: PlanNode[];
  templates: PlanTemplate[];
  transforms: TransformDef[];
  dynamic_types: DynamicTypeDef[];
  transform_methods: TransformMethodDef[];
}
