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

Keycloak: `KEYCLOAK_URL` / `KEYCLOAK_URL_PUBLIC` / `KEYCLOAK_REALM` / `KEYCLOAK_CLIENT_ID`
(local default: realm `master`, client `miz`). Permissions use TC role names:
`nodes:create` / `nodes:edit_any` / `tap:admin`. The creator can edit/delete their own
document; `nodes:edit_any` and `tap:admin` can edit/delete any. Documents without a
creator are editable by any logged-in user and deletable only by `tap:admin`.
With Keycloak disabled, anonymous local use is unchanged.

External TC links: `EXTERNAL_SYSTEM`, `EXTERNAL_SYSTEM_URL`, `EXTERNAL_SYSTEM_UI_URL`,
`EXTERNAL_FROZEN_STATUSES`, `PUBLIC_BASE_URL`. `plan` and `log` links are stored in
`plan_external_link` / `log_external_link`; linked status is TC-owned and a status in
the frozen set makes the corresponding save endpoint return 423.

## Structure

```
tpl-backend/
├── pyproject.toml
├── uv.lock
└── tpl/
    ├── main.py               # FastAPI app
    ├── config.py             # env config
    ├── db.py                 # asyncpg pool + UUID/JSONB codecs
    ├── models.py             # Document + generic PlanDocument + ExecutionDoc schemas
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
| plan_external_link / log_external_link | JSONB | TC link + status cache |
| creator_sub / creator_name | VARCHAR | link ownership |
| plan_document | JSONB | PlanDocument |
| execution_document | JSONB | ExecutionDoc |
| created_at / updated_at | TIMESTAMPTZ | |

## Endpoints

```
GET/POST           /api/documents
GET/PUT/DELETE     /api/documents/{id}
GET/PUT/DELETE     /api/documents/{id}/parts/{plan|log}/external-link
GET                /api/documents/{id}/parts/{plan|log}/external-link/candidates
GET/PUT            /api/documents/{id}/plan-document
GET/PUT            /api/documents/{id}/execution-document
POST               /api/documents/{id}/execution-document/initialize
POST               /api/documents/{id}/execution-document/adhoc
GET                /api/health
```

The `initialize` endpoint builds `ExecutionEntry[]` by walking the plan document's step nodes. Offline is handled by the frontend's JSON export/import (no IndexedDB table sync).
