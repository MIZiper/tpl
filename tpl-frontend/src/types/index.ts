export interface Risk {
  id: string;
  title: string;
  description: string | null;
  scope: string | null;
  created_at: string;
  updated_at: string;
}

export interface Solution {
  id: string;
  title: string;
  description: string | null;
  test_method: string | null;
  equipment: Record<string, string>[];
  created_at: string;
  updated_at: string;
}

export interface SolutionStep {
  id: string;
  solution_id: string;
  order_index: number;
  title: string;
  description: string | null;
  input_params_template: Record<string, unknown>[];
  duration_estimate_minutes: number;
  data_to_collect: Record<string, unknown>[];
  completion_criteria: string | null;
  equipment_needed: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
}

export interface SolutionWithDetails extends Solution {
  steps: SolutionStep[];
  risks: Risk[];
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRisk {
  id: string;
  project_id: string;
  risk_id: string;
  covered_by_previous: boolean;
  covering_solution_id: string | null;
}

export interface ProjectRiskWithRisk extends ProjectRisk {
  risk: Risk;
}

export interface ProjectWithDetails extends Project {
  risks: ProjectRiskWithRisk[];
  solutions: Solution[];
  coverage_rate: number;
}

export interface PlanGroup {
  id: string;
  project_id: string;
  parent_group_id: string | null;
  title: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface PlanGroupWithChildren extends PlanGroup {
  children: PlanGroupWithChildren[];
  steps: PlanStep[];
}

export interface PlanStep {
  id: string;
  project_id: string;
  group_id: string | null;
  solution_id: string | null;
  solution_step_id: string | null;
  order_index: number;
  title: string;
  description: string | null;
  input_params: Record<string, unknown>[];
  duration_estimate_minutes: number;
  data_to_collect: Record<string, unknown>[];
  completion_criteria: string | null;
  required_executions: number;
  created_at: string;
  updated_at: string;
}

export interface PlanTree {
  groups: PlanGroupWithChildren[];
  ungrouped_steps: PlanStep[];
}

export interface StepExecution {
  id: string;
  project_id: string;
  plan_step_id: string | null;
  parent_execution_id: string | null;
  type: "planned" | "adhoc" | "incident";
  execution_number: number;
  status: "in_progress" | "completed" | "skipped" | "aborted";
  started_at: string;
  completed_at: string | null;
  input_params: Record<string, unknown>[] | null;
  completion_check: string | null;
  notes: string | null;
  incident_reason: string | null;
  incident_category: string | null;
  created_at: string;
  updated_at: string;
  step_title: string | null;
}

export interface ExecutionStats {
  total_duration_minutes: number;
  step_breakdown: Record<string, unknown>[];
}

export interface SyncPayload {
  risks: Record<string, unknown>[];
  solutions: Record<string, unknown>[];
  solution_steps: Record<string, unknown>[];
  solution_risks: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  project_risks: Record<string, unknown>[];
  project_solutions: Record<string, unknown>[];
  plan_groups: Record<string, unknown>[];
  plan_steps: Record<string, unknown>[];
  step_executions: Record<string, unknown>[];
}
