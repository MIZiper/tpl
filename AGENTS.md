# AGENTS.md

## Project

**Test Planner & Logger (TPL)** — A web-based tool for managing test plans, execution logging, risk tracking, and solution management.

- **Backend**: `tpl-backend/` — Python 3.12 + FastAPI + asyncpg + PostgreSQL
- **Frontend**: `tpl-frontend/` — TypeScript + Svelte 5 + Vite + sv-router + Sveltestrap (Bootstrap 5)

---

## Architecture

```
tpl/
├── tpl-backend/              # FastAPI backend
│   ├── tpl/
│   │   ├── main.py           # App entry, CORS, lifespan
│   │   ├── config.py         # Config from env vars
│   │   ├── db.py             # asyncpg pool + UUID/JSONB codecs
│   │   ├── models.py         # Pydantic request/response schemas
│   │   ├── services/         # Business logic (6 modules)
│   │   ├── routers/          # API routers (6 modules)
│   │   └── sql/              # DDL scripts (001_initial, 002_indexes)
│   ├── pyproject.toml
│   └── README.md
├── tpl-frontend/             # Svelte 5 frontend
│   ├── src/
│   │   ├── router.ts         # 17 sv-router routes
│   │   ├── components/       # Layout.svelte (Bootstrap 5 navbar)
│   │   ├── pages/            # 12 page components
│   │   ├── stores/           # 6 Svelte stores (runes + writable)
│   │   ├── lib/
│   │   │   ├── api/          # Fetch client + endpoint functions
│   │   │   └── db/           # IndexedDB offline layer
│   │   └── types/            # TypeScript interfaces
│   ├── vite.config.ts        # Proxy /api → localhost:8000
│   └── README.md
└── README.md
```

---

## Database

### Tables (10)

1. `risks` — Risk items (title, description, scope)
2. `solutions` — Solution items (title, description, test_method, equipment)
3. `solution_steps` — Steps within a solution (order_index, duration_estimate, criteria, params template)
4. `solution_risks` — Many-to-many: solutions ↔ risks
5. `projects` — Project entity (name, description)
6. `project_risks` — Many-to-many: projects ↔ risks (CASCADE delete)
7. `project_solutions` — Many-to-many: projects ↔ solutions
8. `plan_groups` — Optional step grouping within a plan
9. `plan_steps` — Independent copy of solution_steps within a plan context
10. `step_executions` — Execution log (per step, per project, with status tracking)

### Key Design Decisions

- **UUIDv7** as primary keys everywhere
- **Plan initialization**: Copy `solution_steps` → `plan_steps` (independent data, no FK back to solutions)
- **Risk↔Solution**: Many-to-many (a solution solves multiple risks, a risk has multiple solutions)
- **Coverage tracking**: Auto-detect from execution history + manual override
- **Single user**: No login/auth, but `user_id` fields reserved on all tables

### Plan Document JSON Model (NEW)

Plans are stored as a single `plan_document JSONB` on the `projects` table. The schema:

```
PlanDocument
  ├── version: int (1)
  ├── definitions: PlanDefinitions
  │     ├── input_conditions: PlanFieldDef[]
  │     ├── collection_items: PlanFieldDef[]
  │     ├── completion_criteria: PlanFieldDef[]
  │     └── custom: PlanFieldDef[]
  ├── root: PlanNode[]           (tree — groups contain child steps/groups)
  └── templates: PlanTemplate[]  (per-plan, reusable step presets)

PlanFieldDef: { id, name, field_type (text|number|boolean|pass_fail|threshold|measurement), unit?, default_value? }
PlanNode: { id, type (group|step), title, children[], description?, duration_minutes, changeover_minutes, input_conditions[], collection_items[], completion_criteria[], system_config?, required_executions }
FieldBinding: { definition_id, value?, operator?, target_value? }
PlanTemplate: { id, name, step: PlanNode }
```

**Endpoints**:
- `GET /projects/{id}/plan-document` — load plan JSON
- `PUT /projects/{id}/plan-document` — save plan JSON (full replace)
- `POST /projects/{id}/plan/initialize` — convert solutions → PlanDocument JSON

**Plan Editor** (three-panel layout):
- Left (250px): tabs — Tree / Definitions / Templates
- Center: canvas with recursive tree rendering + right-click context menu
- Right (350px): Step detail editor with dynamic field bindings

**Key files**:
- `tpl-frontend/src/types/plan.ts` — TypeScript types
- `tpl-frontend/src/stores/plan.ts` — writable store
- `tpl-frontend/src/lib/plan-utils.ts` — tree manipulation (insert, remove, find, move, duplicate, export/import)
- `tpl-frontend/src/pages/plan/PlanEditor.svelte` — main page
- `tpl-frontend/src/pages/plan/PlanCanvas.svelte` — recursive tree
- `tpl-frontend/src/pages/plan/PlanStepEditor.svelte` — detail editor
- `tpl-backend/tpl/models.py` — PlanDocument Pydantic models
- `tpl-backend/tpl/services/plan_service.py` — get/save/initialize
- `tpl-backend/tpl/routers/projects.py` — plan-document endpoints

**Old plan tables** (`plan_groups`, `plan_steps`) are deprecated but kept for backward compatibility.

---

## API Endpoints (40+)

| Router | Endpoints |
|--------|-----------|
| `risks` | GET/POST /risks, GET/PUT/DELETE /risks/{id} |
| `solutions` | GET/POST /solutions, GET/PUT/DELETE /solutions/{id}, POST /solutions/{id}/steps, POST /solutions/{id}/risks, DELETE /solutions/{id}/risks/{risk_id} |
| `projects` | GET/POST /projects, GET/PUT/DELETE /projects/{id}, POST /projects/{id}/risks, POST /projects/{id}/solutions, POST /projects/{id}/plan/initialize, GET /projects/{id}/plan, GET /projects/{id}/coverage |
| `plan` | PUT /plan/steps/{id}, POST /plan/groups, PUT/DELETE /plan/groups/{id}, POST /plan/groups/{id}/steps |
| `logging` | POST /projects/{id}/executions/start, POST /projects/{id}/executions/{eid}/complete, POST /projects/{id}/executions/{eid}/skip, GET /projects/{id}/executions/current, GET /projects/{id}/executions/history, POST /projects/{id}/executions/incident, POST /projects/{id}/executions/incident/{iid}/resolve, POST /projects/{id}/executions/adhoc, GET /projects/{id}/executions/stats |
| `sync` | POST /sync, GET /recommendations |
| `export` | GET /export/projects/{id} |

---

## Step Progression Logic

When a step execution completes:
1. If the same step has remaining executions → create next execution for it
2. Otherwise → find next step by `order_index` within same group or ungrouped
3. Auto-create execution for next step (`_auto_start_next` in `logging_service.py`)

---

## Known Fixes Applied

1. **UUID codec**: Must use `create_pool(init=_init_connection)` to register codecs for every pool connection, not just the initial one (`db.py:11-27`)
2. **JSONB codec**: Registered `decoder=json.loads` so JSONB auto-deserializes; services pre-serialize with `json.dumps()`
3. **FK cascade**: `project_risks.risk_id` has `ON DELETE CASCADE` to allow clean project deletion
4. **Auto-step SQL bug**: Fixed parameter index `$3` → `$2` in fallback query for ungrouped steps
5. **Stats decimal**: Explicit `float()` and `str()` conversion for asyncpg types in stats aggregation

---

## Testing

```bash
# Start backend
cd tpl-backend && uv run uvicorn tpl.main:app --host 127.0.0.1 --port 8000

# Start frontend
cd tpl-frontend && pnpm dev

# Run integration tests via curl/requests
python3 << 'PYEOF'
import urllib.request, json
BASE = "http://127.0.0.1:8000/api"
# ... see full test script in tpl-backend/README.md
PYEOF
```

**Important**: The system has a squid proxy (`http_proxy=http://192.168.1.10:3128`). Unset it for local testing:
```bash
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
```

---

## State Management (Frontend)

Svelte 5 runes + writable stores in `tpl-frontend/src/stores/`:

| Store | Purpose |
|-------|---------|
| `offline.ts` | Online/offline state, pending sync queue, config from LocalStorage |
| `risks.ts` | Risk CRUD with local-first (IndexedDB) fallback |
| `solutions.ts` | Solution CRUD with step management |
| `projects.ts` | Project CRUD with risk/solution association and coverage |
| `plan.ts` | Plan tree (groups + steps), plan initialization from solutions |
| `logging.ts` | Current step, execution actions, incident tracking, stats |

---

## Offline Strategy

- **Data**: IndexedDB via `src/lib/db/index.ts` (`put`, `get`, `getAll`, `delete`, `exportAll`, `importAll`)
- **Config**: LocalStorage
- **Sync**: Last-write-wins via timestamps on `POST /sync`
- **Fetch wrapper**: `src/lib/api/client.ts` — proxies through Vite dev server, detects offline and queues requests

---

## Current Status: Feature Complete

- ✅ Backend: All 6 routers, all services, SQL schema, 40+ endpoints
- ✅ Frontend: All 12 pages, 6 stores, API client, IndexedDB layer
- ✅ All 13 integration tests passing (risk → solution → project → plan → execution → incident → stats → recommendations)
- 🔜 Future: Gantt chart, statistics visualization, UI polish
