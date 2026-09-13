# RSP Backend (risk management)

Risk / Solution / Project management backend with a full FMEA model: risk categories, causes, tags, default S/O/D ratings, project-level risk instances with computed RPN, applied solutions, solution effectiveness, and lessons learned.

## Stack

- Python 3.12+ / FastAPI / asyncpg / Pydantic v2 / Uvicorn
- Manual SQL, no ORM; UUID primary keys; JSONB for flexible fields
- Managed with **uv**

## Run

```bash
uv run uvicorn rsp_backend.main:app --host 127.0.0.1 --port 8001
```

Config via env: `DATABASE_URL` (default `postgresql://postgres:password@localhost:5432/rsp`).

## Structure

```
rsp-backend/
├── pyproject.toml
├── uv.lock
└── src/rsp_backend/
    ├── main.py
    ├── config.py
    ├── db.py
    ├── models.py               # Pydantic schemas
    ├── routers/                # risks, solutions, projects, fmea, sync
    ├── services/               # risk / solution / project / fmea services
    └── sql/
        ├── 001_initial.sql     # unified schema
        └── 002_indexes.sql
```

## Schema (16 tables)

| Table | Purpose |
|-------|---------|
| `risk_categories` | risk category (name, description) |
| `risks` | risk item + FMEA defaults (code, category_id, default severity/occurrence/detection) |
| `risk_causes` | causes per risk |
| `solutions` | solution item + FMEA assessment (code, cost/weight impact, complexity, verified) |
| `solution_risks` | many-to-many solutions↔risks + recommendation_level |
| `solution_steps` | recommended steps within a solution |
| `projects` | project entity (code, customer, platform, dates, PM, status) |
| `product_models` | product models per project |
| `design_phases` | design phases (EVT/DVT/PVT...) |
| `project_risks` | risk instance in a project (RPN computed: S×O×D, phase, model, owner, coverage flags) |
| `project_solutions` | project-level adopted solutions |
| `applied_solutions` | solution applied to a specific project risk |
| `solution_effectiveness` | result summary, risk reduction %, actual cost |
| `lessons_learned` | what happened / root cause / what worked / what failed / recommendation |
| `risk_tags` / `risk_tag_mapping` | tag system |

## Key endpoints

```
risks:        GET/POST /api/risks, GET/PUT/DELETE /api/risks/{id}, /causes, /tags
              GET/POST /api/risk-categories, /api/risk-tags
solutions:    GET/POST /api/solutions, GET/PUT/DELETE /api/solutions/{id},
              /steps, /risks
projects:     GET/POST /api/projects, GET/PUT/DELETE /api/projects/{id},
              /risks, /solutions, /models, /design-phases
fmea:         applied-solutions, effectiveness, lessons endpoints
recommend:    GET /api/recommendations?risk_ids=...
sync/export:  POST /api/sync (last-write-wins), /api/export/...
```

## Coverage

`coverage_rate` = covered project_risks / total, where covered means `covered_by_previous = true` OR a `covering_solution_id` is set.
