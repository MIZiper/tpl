CREATE INDEX idx_risks_category ON risks(category_id);
CREATE INDEX idx_risks_code ON risks(code);
CREATE INDEX idx_risk_causes_risk ON risk_causes(risk_id);

CREATE INDEX idx_solution_risks_solution ON solution_risks(solution_id);
CREATE INDEX idx_solution_risks_risk ON solution_risks(risk_id);
CREATE INDEX idx_solution_steps_solution ON solution_steps(solution_id, order_index);

CREATE INDEX idx_projects_code ON projects(code);
CREATE INDEX idx_product_models_project ON product_models(project_id);

CREATE INDEX idx_project_risks_project ON project_risks(project_id);
CREATE INDEX idx_project_risks_risk ON project_risks(risk_id);
CREATE INDEX idx_project_risks_model ON project_risks(model_id);
CREATE INDEX idx_project_risks_phase ON project_risks(phase_id);
CREATE INDEX idx_project_solutions_project ON project_solutions(project_id);

CREATE INDEX idx_applied_solutions_project_risk ON applied_solutions(project_risk_id);
CREATE INDEX idx_applied_solutions_solution ON applied_solutions(solution_id);
CREATE INDEX idx_effectiveness_applied ON solution_effectiveness(applied_id);
CREATE INDEX idx_lessons_project_risk ON lessons_learned(project_risk_id);

CREATE INDEX idx_risk_tag_mapping_risk ON risk_tag_mapping(risk_id);
CREATE INDEX idx_risk_tag_mapping_tag ON risk_tag_mapping(tag_id);
