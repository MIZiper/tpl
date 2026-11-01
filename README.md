# Test Planner & Logger (TPL) + RSP

Monorepo containing two independent web applications, each with a FastAPI backend and a Svelte 5 frontend:

| App | Backend | Frontend | Database | Port | Purpose |
|-----|---------|----------|----------|------|---------|
| **TPL** | `tpl-backend/` | `tpl-frontend/` | `tpl` | 8037 / 5137 | Test planner & logger: `plan_document` + `execution_document` stored as JSON documents |
| **RSP** | `rsp-backend/` | `rsp-frontend/` | `rsp` | 8039 / 5139 | Risk / Solution / Project management with FMEA (RPN, effectiveness, lessons learned) |

Both backends use **uv**, both frontends use **pnpm**, and both share one PostgreSQL instance with two separate databases.

```
tpl/
├── tpl-backend/   # FastAPI document app (plans + execution logs as JSONB docs)
├── tpl-frontend/  # Svelte 5 document UI (plan editor + logging UI)
├── rsp-backend/   # FastAPI risk management app (FMEA model)
├── rsp-frontend/  # Svelte 5 risk management UI
├── scripts/       # setup-db.sh + test-integration.py
├── backend/       # legacy Python GUI app (out of scope, untouched)
├── frontend/      # legacy node app (out of scope, untouched)
└── doc/           # design docs
```

## Quick start

```bash
# 1. Create databases + schemas (PostgreSQL must be running)
./scripts/setup-db.sh

# 2. TPL document app
cd tpl-backend && uv run uvicorn tpl.main:app --port 8037
cd tpl-frontend && VITE_API_PORT=8037 pnpm dev --port 5137   # http://localhost:5137

# 3. RSP risk app (deferred)
cd rsp-backend && uv run uvicorn rsp_backend.main:app --port 8039
cd rsp-frontend && VITE_API_PORT=8039 pnpm dev --port 5139   # http://localhost:5139
```

> Local testing: unset the squid proxy first: `unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY`

## TC links and frozen state

TPL can link a document's `plan` and `log` separately to existing TC nodes (`tpl.plan` / `tpl.log`). TC owns the published title, description, tags and status; TPL stores only the link identity (provider, external id, URL) and fetches status live on read. When the TC status is in `EXTERNAL_FROZEN_STATUSES` (`pending_review,published,archived` by default), the corresponding TPL save endpoints are locked; `draft` remains editable. Linked parts fail closed if the external status cannot be verified: they show `state unavailable`, become read-only, and cannot be unlinked. Keycloak (`KEYCLOAK_*`, realm `master`, client `miz`) is used for authorization. Permissions use TC role names: `nodes:create` to create documents, `nodes:edit_any` / `tap:admin` to edit or delete any document, and the creator for their own documents.

## Integration test

```bash
# Start both backends, then:
python3 scripts/test-integration.py
```
