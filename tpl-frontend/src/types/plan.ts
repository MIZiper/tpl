export interface PlanFieldDefMeta {
  options?: string[];
  struct_type_id?: string;
  struct_params?: Record<string, unknown>;
}

export interface PlanFieldDef {
  id: string;
  name: string;
  data_type: "number" | "text" | "select" | "bool" | "struct";
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
  value_type?: string;
  value_params?: Record<string, unknown>;
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

export interface TransformInputPortDef {
  key: string;
  label: string;
  kind: "fielddef" | "struct";
  data_type?: "number" | "text" | "select" | "bool";
  struct_type_id?: string;
}

export interface TransformOutputDef {
  data_type: "number" | "text";
}

export interface TransformMethodDef {
  id: string;
  name: string;
  description?: string;
  category?: string;
  inputs: TransformInputPortDef[];
  output: TransformOutputDef;
  params_schema: TransformParamDef[];
  variadic?: boolean;
}

export interface TransformPortBinding {
  port_key: string;
  definition_id: string;
  sub_key?: string;
}

export interface TransformDef {
  id: string;
  name: string;
  method_id: string;
  source_ports: TransformPortBinding[];
  derived_definition_id: string;
  derived_name: string;
  derived_unit?: string;
  params: Record<string, unknown>;
}

export interface ValueTypeOutputDef {
  key: string;
  label: string;
  data_type?: "number" | "text";
}

export interface ValueTypeDef {
  id: string;
  name: string;
  description?: string;
  params_schema: TransformParamDef[];
  outputs: ValueTypeOutputDef[];
}

export interface StructParamDef {
  key: string;
  label: string;
  type: "number" | "text" | "select" | "bool";
  default?: unknown;
  options?: string[];
  required?: boolean;
}

export interface StructTypeDef {
  id: string;
  name: string;
  description?: string;
  category?: string;
  params_schema: StructParamDef[];
}

export interface PlanDocument {
  version: number;
  definitions: PlanDefinitions;
  root: PlanNode[];
  templates: PlanTemplate[];
  transforms: TransformDef[];
  value_types: ValueTypeDef[];
  transform_methods: TransformMethodDef[];
  struct_types: StructTypeDef[];
}
