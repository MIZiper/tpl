CREATE INDEX idx_solution_steps_solution ON solution_steps(solution_id, order_index);
CREATE INDEX idx_solution_risks_solution ON solution_risks(solution_id);
CREATE INDEX idx_solution_risks_risk ON solution_risks(risk_id);

CREATE INDEX idx_project_risks_project ON project_risks(project_id);
CREATE INDEX idx_project_solutions_project ON project_solutions(project_id);

CREATE INDEX idx_plan_groups_project ON plan_groups(project_id);
CREATE INDEX idx_plan_groups_parent ON plan_groups(parent_group_id);
CREATE INDEX idx_plan_steps_project ON plan_steps(project_id);
CREATE INDEX idx_plan_steps_group ON plan_steps(group_id);

CREATE INDEX idx_step_executions_project ON step_executions(project_id);
CREATE INDEX idx_step_executions_plan_step ON step_executions(plan_step_id);
CREATE INDEX idx_step_executions_status ON step_executions(project_id, status);
