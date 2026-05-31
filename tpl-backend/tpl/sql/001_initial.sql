CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE risks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    scope TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE solutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    test_method TEXT,
    equipment JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE solution_risks (
    solution_id UUID NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
    risk_id UUID NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    PRIMARY KEY (solution_id, risk_id)
);

CREATE TABLE solution_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id UUID NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 0,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    input_params_template JSONB DEFAULT '[]'::JSONB,
    duration_estimate_minutes INTEGER DEFAULT 60,
    data_to_collect JSONB DEFAULT '[]'::JSONB,
    completion_criteria TEXT,
    equipment_needed JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    plan_document JSONB,
    execution_document JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_risks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    risk_id UUID NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    covered_by_previous BOOLEAN DEFAULT FALSE,
    covering_solution_id UUID REFERENCES solutions(id) ON DELETE SET NULL,
    UNIQUE (project_id, risk_id)
);

CREATE TABLE project_solutions (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    solution_id UUID NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, solution_id)
);

CREATE TABLE plan_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_group_id UUID REFERENCES plan_groups(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE plan_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    group_id UUID REFERENCES plan_groups(id) ON DELETE SET NULL,
    solution_id UUID REFERENCES solutions(id),
    solution_step_id UUID REFERENCES solution_steps(id),
    order_index INTEGER NOT NULL DEFAULT 0,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    input_params JSONB DEFAULT '[]'::JSONB,
    duration_estimate_minutes INTEGER DEFAULT 60,
    data_to_collect JSONB DEFAULT '[]'::JSONB,
    completion_criteria TEXT,
    required_executions INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE step_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    plan_step_id UUID REFERENCES plan_steps(id) ON DELETE SET NULL,
    parent_execution_id UUID REFERENCES step_executions(id),
    type VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (type IN ('planned', 'adhoc', 'incident')),
    execution_number INTEGER DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'skipped', 'aborted')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    input_params JSONB,
    completion_check VARCHAR(10) CHECK (completion_check IN ('pass', 'fail', 'skip')),
    notes TEXT,
    incident_reason TEXT,
    incident_category TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
