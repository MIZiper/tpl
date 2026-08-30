# TPL Backend (document app)

Test planner & logger backend. Stores a test **plan_document** and an **execution_document** as JSONB on a lightweight `documents` table.

## Stack

- Python 3.12+ / FastAPI / asyncpg / Pydantic v2 / Uvicorn
- Manual SQL, no ORM; UUID primary keys; JSONB for documents
- Managed with **uv**

## Run

```bash
uv run uvicorn tpl.main:app --host 127.0.0.1 --port 8000
```

Config via env: `DATABASE_URL` (default `postgresql://postgres:password@localhost:5432/tpl`).

## Structure

```
tpl-backend/
├── pyproject.toml
├── uv.lock
└── tpl/
    ├── main.py               # FastAPI app
    ├── config.py             # env config
    ├── db.py                 # asyncpg pool + UUID/JSONB codecs
    ├── models.py             # Document + PlanDocument + ExecutionDoc schemas
    ├── routers/documents.py  # document + plan/execution-document endpoints
    ├── services/
    │   ├── documents_service.py  # documents CRUD
    │   ├── plan_service.py       # plan_document get/save
    │   └── execution_service.py  # execution_document get/save/init/adhoc
    └── sql/001_initial.sql   # documents table
```

## Schema

`documents` table:

| column | type | note |
|--------|------|------|
| id | UUID PK | gen_random_uuid() |
| name | VARCHAR(255) | |
| description | TEXT | |
| plan_document | JSONB | PlanDocument |
| execution_document | JSONB | ExecutionDoc |
| created_at / updated_at | TIMESTAMPTZ | |

## Endpoints

```
GET/POST           /api/documents
GET/PUT/DELETE     /api/documents/{id}
GET/PUT            /api/documents/{id}/plan-document
GET/PUT            /api/documents/{id}/execution-document
POST               /api/documents/{id}/execution-document/initialize
POST               /api/documents/{id}/execution-document/adhoc
GET                /api/health
```

The `initialize` endpoint builds `ExecutionEntry[]` by walking the plan document's step nodes. Offline is handled by the frontend's JSON export/import (no IndexedDB table sync).
