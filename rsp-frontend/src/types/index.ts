export interface RiskCategory {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Risk {
  id: string;
  category_id: string | null;
  code: string | null;
  title: string;
  description: string | null;
  scope: string | null;
  default_severity: number | null;
  default_occurrence: number | null;
  default_detection: number | null;
  created_at: string;
  updated_at: string;
}

export interface RiskCause {
  id: string;
  risk_id: string;
  description: string;
  created_at: string;
}

export interface RiskTag {
  id: string;
  name: string;
  created_at: string;
}

export interface RiskWithDetails extends Risk {
  category: RiskCategory | null;
  causes: RiskCause[];
  tags: RiskTag[];
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

export interface Solution {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  test_method: string | null;
  equipment: Record<string, string>[];
  cost_impact: string | null;
  weight_impact: string | null;
  complexity_level: number | null;
  verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface SolutionWithDetails extends Solution {
  steps: SolutionStep[];
  risks: Risk[];
}

export interface ProductModel {
  id: string;
  project_id: string;
  code: string | null;
  name: string | null;
  revision: string | null;
  product_family: string | null;
  created_at: string;
}

export interface DesignPhase {
  id: string;
  name: string;
  sequence_no: number | null;
  created_at: string;
}

export interface Project {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  customer_name: string | null;
  platform: string | null;
  start_date: string | null;
  end_date: string | null;
  project_manager: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export interface Effectiveness {
  id: string;
  applied_id: string;
  result_summary: string | null;
  risk_reduction_percent: number | null;
  actual_cost: number | null;
  comments: string | null;
  created_at: string;
}

export interface AppliedSolution {
  id: string;
  project_risk_id: string;
  solution_id: string;
  implementation_date: string | null;
  responsible_engineer: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppliedSolutionWithDetails extends AppliedSolution {
  solution: Solution | null;
  effectiveness: Effectiveness[];
}

export interface ProjectRisk {
  id: string;
  project_id: string;
  risk_id: string;
  model_id: string | null;
  phase_id: string | null;
  discovery_date: string | null;
  status: string | null;
  owner_name: string | null;
  severity: number | null;
  occurrence: number | null;
  detection: number | null;
  rpn: number | null;
  description: string | null;
  covered_by_previous: boolean;
  covering_solution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRiskWithDetails extends ProjectRisk {
  risk: Risk | null;
  model: ProductModel | null;
  phase: DesignPhase | null;
  covering_solution: Solution | null;
  applied_solutions: AppliedSolutionWithDetails[];
  lessons: LessonsLearned[];
}

export interface ProjectWithDetails extends Project {
  risks: ProjectRiskWithDetails[];
  solutions: Solution[];
  models: ProductModel[];
  coverage_rate: number;
}

export interface LessonsLearned {
  id: string;
  project_risk_id: string;
  what_happened: string | null;
  root_cause: string | null;
  what_worked: string | null;
  what_failed: string | null;
  recommendation: string | null;
  created_at: string;
}
