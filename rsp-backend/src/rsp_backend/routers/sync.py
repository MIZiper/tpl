from fastapi import APIRouter, Depends
from asyncpg import Connection

from rsp_backend.db import get_connection
from rsp_backend.models import SyncPayload
from rsp_backend.services import project_service

router = APIRouter(tags=["sync"])

# Columns that are GENERATED ALWAYS AS STORED — never insert/update them directly
_GENERATED_COLUMNS = {"rpn"}

# Columns that are always managed by the database itself (defaults / NOW())
_RESERVED_COLUMNS = {"updated_at", "created_at"}

_TABLES = [
    ("risks", "risks"),
    ("solutions", "solutions"),
    ("solution_steps", "solution_steps"),
    ("solution_risks", "solution_risks"),
    ("projects", "projects"),
    ("project_risks", "project_risks"),
    ("project_solutions", "project_solutions"),
    ("applied_solutions", "applied_solutions"),
    ("solution_effectiveness", "solution_effectiveness"),
    ("lessons_learned", "lessons_learned"),
]


@router.post("/sync")
async def sync_data(body: SyncPayload, db: Connection = Depends(get_connection)):
    stats = {"created": 0, "updated": 0, "skipped": 0}

    for attr_name, table_name in _TABLES:
        items = getattr(body, attr_name, [])
        for item in items:
            item_id = item.get("id")
            if not item_id:
                continue

            existing = await db.fetchrow(
                f"SELECT id, updated_at FROM {table_name} WHERE id = $1",
                item_id,
            )

            if existing:
                existing_updated = existing["updated_at"]
                item_updated = item.get("updated_at")
                if item_updated and existing_updated and item_updated > str(existing_updated):
                    columns = [k for k in item.keys() if k not in ("id",) and k not in _GENERATED_COLUMNS and k not in _RESERVED_COLUMNS]
                    set_clause = ", ".join(f"{col}=${i + 1}" for i, col in enumerate(columns))
                    values = [item[col] for col in columns] + [item_id]
                    await db.execute(
                        f"UPDATE {table_name} SET {set_clause}, updated_at=NOW() WHERE id=${len(values)}",
                        *values,
                    )
                    stats["updated"] += 1
                else:
                    stats["skipped"] += 1
            else:
                columns = [k for k in item.keys() if k not in _GENERATED_COLUMNS and k not in _RESERVED_COLUMNS]
                values = [item[col] for col in columns]
                placeholders = [f"${i + 1}" for i in range(len(columns))]
                cols_str = ", ".join(columns)
                vals_str = ", ".join(placeholders)
                await db.execute(
                    f"INSERT INTO {table_name} ({cols_str}) VALUES ({vals_str})",
                    *values,
                )
                stats["created"] += 1

    return stats


@router.get("/export/risks/{risk_id}")
async def export_risk(risk_id: str, db: Connection = Depends(get_connection)):
    risk = await db.fetchrow("SELECT * FROM risks WHERE id = $1", risk_id)
    return dict(risk) if risk else None


@router.get("/export/solutions/{solution_id}")
async def export_solution(solution_id: str, db: Connection = Depends(get_connection)):
    sol = await db.fetchrow("SELECT * FROM solutions WHERE id = $1", solution_id)
    if not sol:
        return None
    steps = await db.fetch(
        "SELECT * FROM solution_steps WHERE solution_id = $1 ORDER BY order_index",
        solution_id,
    )
    risks = await db.fetch(
        "SELECT r.* FROM risks r JOIN solution_risks sr ON r.id = sr.risk_id WHERE sr.solution_id = $1",
        solution_id,
    )
    return {
        "solution": dict(sol),
        "steps": [dict(s) for s in steps],
        "risks": [dict(r) for r in risks],
    }


@router.get("/export/projects/{project_id}")
async def export_project(project_id: str, db: Connection = Depends(get_connection)):
    project = await project_service.get_project(db, project_id)
    if project is None:
        return None
    return project.model_dump()
