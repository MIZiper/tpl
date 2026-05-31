export interface PlanFieldDef {
  id: string;
  name: string;
  field_type: string;
  unit: string | null;
  default_value: unknown;
  options: string[] | null;
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
  operator: string | null;
  target_value: unknown;
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

export interface PlanDocument {
  version: number;
  definitions: PlanDefinitions;
  root: PlanNode[];
  templates: PlanTemplate[];
}
