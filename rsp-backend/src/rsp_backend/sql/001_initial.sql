CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Risk categories (FMEA)
CREATE TABLE risk_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Risks (unified: TPL risks + FMEA risk_type)
CREATE TABLE risks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES risk_categories(id) ON DELETE SET NULL,
    code VARCHAR(50) UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    scope TEXT,
    default_severity INTEGER,
    default_occurrence INTEGER,
    default_detection INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Risk causes (FMEA)
CREATE TABLE risk_causes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    risk_id UUID NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Solutions (unified: TPL solutions + FMEA solution)
CREATE TABLE solutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    test_method TEXT,
    equipment JSONB DEFAULT '[]'::JSONB,
    cost_impact VARCHAR(50),
    weight_impact VARCHAR(50),
    complexity_level INTEGER,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Solutions <-> Risks (unified: TPL solution_risks + FMEA risk_solution)
CREATE TABLE solution_risks (
    solution_id UUID NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
    risk_id UUID NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    recommendation_level INTEGER,
    PRIMARY KEY (solution_id, risk_id)
);

-- Solution steps (TPL, unchanged)
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

-- Projects (unified: TPL projects + FMEA project)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    customer_name VARCHAR(255),
    platform VARCHAR(100),
    start_date DATE,
    end_date DATE,
    project_manager VARCHAR(255),
    status VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Product models (FMEA)
CREATE TABLE product_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    code VARCHAR(100),
    name VARCHAR(255),
    revision VARCHAR(50),
    product_family VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Design phases (FMEA)
CREATE TABLE design_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    sequence_no INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Project risks (unified: TPL project_risks + FMEA project_risk)
CREATE TABLE project_risks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    model_id UUID REFERENCES product_models(id) ON DELETE SET NULL,
    risk_id UUID NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    phase_id UUID REFERENCES design_phases(id) ON DELETE SET NULL,
    discovery_date DATE,
    status VARCHAR(50),
    owner_name VARCHAR(255),
    severity INTEGER,
    occurrence INTEGER,
    detection INTEGER,
    rpn INTEGER GENERATED ALWAYS AS (severity * occurrence * detection) STORED,
    description TEXT,
    covered_by_previous BOOLEAN DEFAULT FALSE,
    covering_solution_id UUID REFERENCES solutions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, risk_id)
);

-- Projects <-> Solutions (TPL)
CREATE TABLE project_solutions (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    solution_id UUID NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, solution_id)
);

-- Applied solutions (FMEA): which solution was applied to a specific project risk
CREATE TABLE applied_solutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_risk_id UUID NOT NULL REFERENCES project_risks(id) ON DELETE CASCADE,
    solution_id UUID NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
    implementation_date DATE,
    responsible_engineer VARCHAR(255),
    status VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Solution effectiveness (FMEA)
CREATE TABLE solution_effectiveness (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applied_id UUID NOT NULL REFERENCES applied_solutions(id) ON DELETE CASCADE,
    result_summary TEXT,
    risk_reduction_percent NUMERIC(5, 2),
    actual_cost NUMERIC(18, 2),
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lessons learned (FMEA)
CREATE TABLE lessons_learned (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_risk_id UUID NOT NULL REFERENCES project_risks(id) ON DELETE CASCADE,
    what_happened TEXT,
    root_cause TEXT,
    what_worked TEXT,
    what_failed TEXT,
    recommendation TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Risk tags (FMEA)
CREATE TABLE risk_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE risk_tag_mapping (
    risk_id UUID NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES risk_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (risk_id, tag_id)
);
