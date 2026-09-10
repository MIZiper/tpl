# AGENTS.md

## Project

Monorepo with two independent web apps:

- **TPL — Test Planner & Logger** (`tpl-backend/` + `tpl-frontend/`): stores `plan_document` and `execution_document` as JSONB documents on a lightweight `documents` table.
- **RSP — Risk/Solution/Project management** (`rsp-backend/` + `rsp-frontend/`): FMEA-based risk management (categories, causes, tags, RPN, applied solutions, effectiveness, lessons learned).

- **Backend**: Python 3.12 + FastAPI + asyncpg + PostgreSQL, managed with **uv**
- **Frontend**: TypeScript + Svelte 5 + Vite + sv-router + Sveltestrap (Bootstrap 5), managed with **pnpm**
- **Database**: one PostgreSQL instance, two separate databases (`tpl`, `rsp`)

---

## Architecture

```
tpl/
├── tpl-backend/              # FastAPI document app
│   └── tpl/
│       ├── main.py           # app entry, CORS
│       ├── config.py         # DATABASE_URL default .../tpl
│       ├── db.py             # asyncpg pool + UUID/JSONB codecs
│       ├── models.py         # Document + PlanDocument + ExecutionDoc
│       ├── routers/documents.py
│       ├── services/         # documents / plan / execution
│       └── sql/001_initial.sql
├── tpl-frontend/             # Svelte 5 document UI
│   └── src/
│       ├── router.ts         # /documents, /documents/:id/plan, /documents/:id/logging
│       ├── pages/            # Home, documents/, plan/, logging/
│       ├── stores/           # documents, plan, execution
│       ├── lib/              # api/, plan-utils, dynamic/struct/transform registries
│       └── types/            # document, plan, execution
├── rsp-backend/              # FastAPI risk management app
│   └── src/rsp_backend/
│       ├── main.py
│       ├── config.py         # DATABASE_URL default .../rsp
│       ├── db.py
│       ├── models.py
│       ├── routers/          # risks, solutions, projects, fmea, sync
│       ├── services/         # risk / solution / project / fmea
│       └── sql/              # 001_initial.sql, 002_indexes.sql
├── rsp-frontend/             # Svelte 5 risk management UI
│   └── src/
│       ├── router.ts         # /blocks/risks, /blocks/solutions, /projects
│       ├── pages/            # Home, risks/, solutions/, projects/
│       ├── stores/           # risks, solutions, projects (online only)
│       ├── lib/api/          # risksApi, solutionsApi, projectsApi, fmeaApi
│       └── types/index.ts
├── scripts/                  # setup-db.sh, test-integration.py
├── backend/                  # legacy Python GUI app (untouched)
├── frontend/                 # legacy node app (untouched)
└── doc/                      # design docs
```

Ports: tpl-backend `8000`, rsp-backend `8001`, tpl-frontend dev `5173`, rsp-frontend dev `5174`.

---

## TPL document model

- `documents` table: `id (UUID)`, `name`, `description`, `plan_document JSONB`, `execution_document JSONB`, timestamps.
- **Behavior lives in frontend code classes; the JSONB stores only instance data referencing registered classes by id.** Backend pydantic for the plan document is fully generic (pass-through).
- Registered class families (`tpl-frontend/src/lib/`): `fieldtypes.ts` (definition kinds number/text/select/bool/struct — each with `paramsSchema` + `describe(params)`), `values.ts` (binding value classes: plain/ramp/tolerance/percentage/sinusoidal/struct — expose `values()` = characteristic set with per-channel `transformable` flag, plus `describe()`/`display()` custom summaries, `scalar()`), `structs.ts` (`GearboxStruct{ratio}`, `ProductStruct{ratio, model, nominal_output_speed, nominal_input_torque, efficiency}`), `transforms.ts` (typed methods: formula/linear/lookup/`gearbox.trans`/`product.trans`/`product.back2back`; static `inputs()` + `apply(inputs, params) → Value`). `product.trans` params: `ratio_mode` (none/multiply/divide), `reference` (none/speed/torque — which product nominal a percentage resolves against), `efficiency` (none/multiply/divide); combined as a factor, percentage resolved via nominal unless reference=none. `product.back2back`: inputs `value`+`unit_a`+`unit_b` (struct products) +`run_on` (select whose option encodes primary unit + mode, e.g. `A:motor`/`A:generator`/`B:motor`/`B:generator`, `:`/`-`, case-insensitive; empty/unparsable ⇒ no output), param `reference` (speed/torque); LSS-LSS coupled, output/factor per reference×runmode.
- **No clock.** A value is a *characteristic set* (e.g. ramp = `{start_value, end_value, ramp_rate}`). Transforms map characteristic values **element-wise**: transformable channels are mapped (e.g. ramp `{0→10}` through gearbox ratio 10 → `{0→100}`), non-transformable channels (frequency, struct fields) pass through unchanged. Reactivity comes from editing inputs: `$derived` recomputes the transform graph.
- **Transform outputs are composable**: `Transform.apply` returns a `DerivedValue` that lazily recomputes from its input `Value`s, so chaining works (e.g. gearbox-converted features → linear ×2).
- Persisted shapes (`tpl-frontend/src/types/plan.ts`):
  - `PlanDocument`: `{ version, definitions{input_conditions, collection_items, completion_criteria, custom}, root, templates, transforms }`.
  - `PlanFieldDef`: `{ id, typeId, name, params }` — `params.unit` (number); `params.options` (select); `params.criteria` (bool, single string); `params.structTypeId` + struct fields (struct).
  - `FieldBinding`: `{ definition_id, value?, valueTypeId?, params? }` — `value` for plain scalars; `valueTypeId`+`params` for ramp/tolerance/percentage/sinusoidal.
  - `TransformDef`: `{ id, name, typeId, inputs:[{role, definitionId}], derivedDefId, params }` — output field name/unit are read from the target def (`derivedDefId`), not duplicated.
  - `PlanNode`: `{ id, type(group|step), title, children[], duration_minutes, changeover_minutes, input_conditions[]/collection_items[]/completion_criteria[] (FieldBinding[]), required_executions, step_template_id, solution_step_id }`.
- `ExecutionDoc`: `{ version, status(idle|in_progress|paused|completed), entries: ExecutionEntry[], pause_history[] }`.
  - `ExecutionEntry`: `{ id, plan_step_id, step_title, type(planned|adhoc), required_executions, executions: ExecutionRun[], selected_bindings }`.
  - `ExecutionRun`: `{ id, status(pending|in_progress|completed|skipped), started_at, completed_at, input_readings[], collection_results[], criteria_results[], notes }`.

Endpoints (all under `/api`): documents CRUD, `GET/PUT .../plan-document`, `GET/PUT .../execution-document`, `POST .../execution-document/initialize`, `POST .../execution-document/adhoc`.

There is **no** initialize-from-solutions: plan documents are authored by hand in the plan editor. Offline = JSON export/import only.

---

## RSP unified schema (16 tables)

| Table | Notes |
|-------|-------|
| `risk_categories` | name unique, description |
| `risks` | code, category_id FK, title, description, scope, default_severity/occurrence/detection |
| `risk_causes` | risk_id FK CASCADE, description |
| `solutions` | code, title, description, test_method, equipment JSONB, cost_impact, weight_impact, complexity_level, verified |
| `solution_risks` | PK(solution_id, risk_id), recommendation_level |
| `solution_steps` | order_index, title, input_params_template JSONB, duration_estimate_minutes, data_to_collect JSONB, completion_criteria, equipment_needed JSONB |
| `projects` | code, name, description, customer_name, platform, start/end_date, project_manager, status |
| `product_models` | project_id FK CASCADE, code, name, revision, product_family |
| `design_phases` | name unique, sequence_no |
| `project_risks` | project_id+risk_id unique, model_id, phase_id, discovery_date, status, owner_name, severity/occurrence/detection, **rpn GENERATED ALWAYS AS (severity*occurrence*detection) STORED**, description, covered_by_previous, covering_solution_id |
| `project_solutions` | project-level adopted solutions |
| `applied_solutions` | project_risk_id FK CASCADE, solution_id, implementation_date, responsible_engineer, status |
| `solution_effectiveness` | applied_id FK CASCADE, result_summary, risk_reduction_percent NUMERIC(5,2), actual_cost NUMERIC(18,2), comments |
| `lessons_learned` | project_risk_id FK CASCADE, what_happened, root_cause, what_worked, what_failed, recommendation |
| `risk_tags` / `risk_tag_mapping` | tag system |

Coverage: `coverage_rate` = covered / total project_risks, where covered = `covered_by_previous` OR `covering_solution_id IS NOT NULL`.

---

## Key conventions / gotchas

1. **UUID/JSONB codecs**: asyncpg pool must use `init=_init_connection` so every pooled connection registers `uuid`→str and `jsonb`→json.loads codecs (`db.py`).
2. **Generated column `rpn`**: never insert/update directly — exclude it in sync/import paths.
3. **Sync timestamps**: `created_at`/`updated_at` are DB-managed; generic `/sync` excludes them from INSERT/UPDATE columns.
4. **Postgres**: local test instance can be started with rootless podman, e.g. `podman run -e POSTGRES_PASSWORD=password -e POSTGRES_USER=postgres -d -p 5432:5432 postgres:16-alpine`, then `./scripts/setup-db.sh`.
5. **Proxy**: the machine has a squid proxy (`http_proxy=http://192.168.1.10:3128`). Unset it for local dev/testing:
   `unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY`

---

## Testing

```bash
# 1. Start both backends
cd tpl-backend && uv run uvicorn tpl.main:app --port 8000
cd rsp-backend && uv run uvicorn rsp_backend.main:app --port 8001

# 2. Optionally start frontends
cd tpl-frontend && pnpm dev
cd rsp-frontend && pnpm dev

# 3. Run integration tests
python3 scripts/test-integration.py
```

## Development commands

```bash
# Backends
cd tpl-backend && uv run python -c "from tpl.main import app"
cd rsp-backend && uv run python -c "from rsp_backend.main import app"

# Frontends (type check + build)
cd tpl-frontend && pnpm check && pnpm build
cd rsp-frontend && pnpm check && pnpm build
```
