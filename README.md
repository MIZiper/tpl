# Test Planner & Logger (TPL) + RSP

Monorepo containing two independent web applications, each with a FastAPI backend and a Svelte 5 frontend:

| App | Backend | Frontend | Database | Port | Purpose |
|-----|---------|----------|----------|------|---------|
| **TPL** | `tpl-backend/` | `tpl-frontend/` | `tpl` | 8000 / 5173 | Test planner & logger: `plan_document` + `execution_document` stored as JSON documents |
| **RSP** | `rsp-backend/` | `rsp-frontend/` | `rsp` | 8001 / 5174 | Risk / Solution / Project management with FMEA (RPN, effectiveness, lessons learned) |

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
cd tpl-backend && uv run uvicorn tpl.main:app --port 8000
cd tpl-frontend && pnpm dev          # http://localhost:5173

# 3. RSP risk app
cd rsp-backend && uv run uvicorn rsp_backend.main:app --port 8001
cd rsp-frontend && pnpm dev          # http://localhost:5174
```

> Local testing: unset the squid proxy first: `unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY`

## Integration test

```bash
# Start both backends, then:
python3 scripts/test-integration.py
```
