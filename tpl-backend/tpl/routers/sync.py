import json

from fastapi import APIRouter, Depends
from asyncpg import Connection

from tpl.db import get_connection
from tpl.models import SyncPayload, ProjectWithDetails
from tpl.services import project_service

router = APIRouter(tags=["sync"])


@router.post("/sync")
async def sync_data(body: SyncPayload, db: Connection = Depends(get_connection)):
    stats = {"created": 0, "updated": 0, "skipped": 0}

    for table_name, items in [
        ("risks", body.risks),
        ("solutions", body.solutions),
        ("solution_steps", body.solution_steps),
        ("solution_risks", body.solution_risks),
        ("projects", body.projects),
        ("project_risks", body.project_risks),
        ("project_solutions", body.project_solutions),
        ("plan_groups", body.plan_groups),
        ("plan_steps", body.plan_steps),
        ("step_executions", body.step_executions),
    ]:
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
                    columns = [k for k in item.keys() if k not in ("id",)]
                    placeholders = [f"${i + 1}" for i in range(len(columns) + 1)]
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
                columns = list(item.keys())
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


@router.get("/export/projects/{project_id}")
async def export_project(project_id: str, db: Connection = Depends(get_connection)):
    project = await project_service.get_project(db, project_id)
    if project is None:
        return None

    plan = await db.fetch("SELECT * FROM plan_groups WHERE project_id = $1", project_id)
    steps = await db.fetch("SELECT * FROM plan_steps WHERE project_id = $1", project_id)
    executions = await db.fetch("SELECT * FROM step_executions WHERE project_id = $1", project_id)

    return {
        "project": project.model_dump(),
        "plan_groups": [dict(r) for r in plan],
        "plan_steps": [dict(r) for r in steps],
        "step_executions": [dict(r) for r in executions],
    }


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
