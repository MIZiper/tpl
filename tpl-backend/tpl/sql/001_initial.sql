CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Documents: lightweight entity that holds a plan_document + execution_document
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    plan_document JSONB,
    execution_document JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
