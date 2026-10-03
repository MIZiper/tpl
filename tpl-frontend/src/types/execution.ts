export interface ExecutionReading {
  definition_id: string;
  definition_name: string;
  value: unknown;
}

export interface ExecutionResult {
  definition_id: string;
  definition_name: string;
  result: string | null;
  notes: string | null;
}

export interface ExecutionCriteriaResult {
  definition_id: string;
  definition_name: string;
  passed: boolean | null;
  notes: string | null;
}

export interface ExecutionDraft {
  inputValues: Record<string, string>;
  measValues: Record<string, string>;
  measFlags: Record<string, "pass" | "fail" | null>;
  critFlags: Record<string, boolean | null>;
  liveInputParams: Record<string, Record<string, string>>;
}

export interface ExecutionRun {
  id: string;
  status: "pending" | "in_progress" | "paused" | "completed" | "skipped";
  started_at: string | null;
  completed_at: string | null;
  input_readings: ExecutionReading[];
  collection_results: ExecutionResult[];
  criteria_results: ExecutionCriteriaResult[];
  notes: string | null;
  paused_at?: string | null;
  draft?: ExecutionDraft | null;
}

export interface ExecutionEntry {
  id: string;
  plan_step_id: string | null;
  step_title: string;
  description?: string | null;
  type: "planned" | "adhoc";
  required_executions: number;
  executions: ExecutionRun[];
  selected_bindings?: {
    input_conditions: string[];
    collection_items: string[];
    completion_criteria: string[];
    input_values?: Record<string, unknown>;
  };
}

export interface ExecutionDoc {
  version: number;
  entries: ExecutionEntry[];
}
