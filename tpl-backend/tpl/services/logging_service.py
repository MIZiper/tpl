from datetime import datetime, timezone

from asyncpg import Connection

from tpl.models import (
    StepExecution,
    ExecutionStats,
)


async def list_executions(db: Connection, project_id: str) -> list[StepExecution]:
    rows = await db.fetch(
        """SELECT e.*, ps.title as step_title FROM step_executions e
           LEFT JOIN plan_steps ps ON e.plan_step_id = ps.id
           WHERE e.project_id = $1
           ORDER BY e.created_at DESC""",
        project_id,
    )
    return [_execution_from_row(r) for r in rows]


async def get_current_execution(db: Connection, project_id: str) -> StepExecution | None:
    row = await db.fetchrow(
        """SELECT e.*, ps.title as step_title FROM step_executions e
           LEFT JOIN plan_steps ps ON e.plan_step_id = ps.id
           WHERE e.project_id = $1 AND e.status = 'in_progress'
           ORDER BY e.created_at DESC LIMIT 1""",
        project_id,
    )
    if row is None:
        return None
    return _execution_from_row(row)


async def start_execution(
    db: Connection,
    project_id: str,
    plan_step_id: str,
    execution_number: int = 1,
    input_params: list[dict] | None = None,
) -> StepExecution:
    import json
    row = await db.fetchrow(
        """INSERT INTO step_executions
           (project_id, plan_step_id, type, execution_number, status, input_params)
           VALUES ($1, $2, 'planned', $3, 'in_progress', $4) RETURNING *""",
        project_id, plan_step_id, execution_number, json.dumps(input_params) if input_params else None,
    )
    step_title = await db.fetchval("SELECT title FROM plan_steps WHERE id = $1", plan_step_id)
    exec_model = StepExecution.model_validate(dict(row))
    exec_model.step_title = step_title
    return exec_model


async def complete_execution(
    db: Connection,
    project_id: str,
    execution_id: str,
    completion_check: str | None = None,
    notes: str | None = None,
) -> StepExecution:
    now = datetime.now(timezone.utc)
    row = await db.fetchrow(
        """UPDATE step_executions SET status='completed', completed_at=$1,
           completion_check=$2, notes=$3, updated_at=$4
           WHERE id=$5 AND project_id=$6 RETURNING *""",
        now, completion_check, notes, now, execution_id, project_id,
    )
    exec_model = StepExecution.model_validate(dict(row))

    next_exec = await _auto_start_next(db, project_id, row)
    if next_exec:
        exec_model.step_title = next_exec

    return exec_model


async def skip_execution(
    db: Connection,
    project_id: str,
    execution_id: str,
    notes: str | None = None,
) -> StepExecution:
    now = datetime.now(timezone.utc)
    row = await db.fetchrow(
        """UPDATE step_executions SET status='skipped', completed_at=$1,
           notes=$2, updated_at=$3
           WHERE id=$4 AND project_id=$5 RETURNING *""",
        now, notes, now, execution_id, project_id,
    )
    exec_model = StepExecution.model_validate(dict(row))

    next_exec = await _auto_start_next(db, project_id, row)
    if next_exec:
        exec_model.step_title = next_exec

    return exec_model


async def _auto_start_next(db: Connection, project_id: str, completed_row) -> str | None:
    plan_step_id = completed_row["plan_step_id"]
    if not plan_step_id:
        return None

    plan_step = await db.fetchrow(
        "SELECT required_executions, group_id, order_index FROM plan_steps WHERE id = $1",
        plan_step_id,
    )
    if not plan_step:
        return None

    required = plan_step["required_executions"] or 1
    completed_count = await db.fetchval(
        "SELECT COUNT(*) FROM step_executions WHERE plan_step_id = $1 AND status = 'completed'",
        plan_step_id,
    )

    if completed_count < required:
        return await db.fetchval(
            """INSERT INTO step_executions
               (project_id, plan_step_id, type, execution_number, status)
               VALUES ($1, $2, 'planned', $3, 'in_progress') RETURNING id""",
            project_id, plan_step_id, completed_count + 1,
        )

    group_id = plan_step["group_id"]
    order_index = plan_step["order_index"]

    if group_id is not None:
        next_step = await db.fetchrow(
            """SELECT id, title FROM plan_steps
               WHERE project_id = $1 AND group_id = $2 AND order_index > $3
               ORDER BY order_index LIMIT 1""",
            project_id, group_id, order_index,
        )
    else:
        next_step = await db.fetchrow(
            """SELECT id, title FROM plan_steps
               WHERE project_id = $1 AND group_id IS NULL AND order_index > $2
               ORDER BY order_index LIMIT 1""",
            project_id, order_index,
        )
    if not plan_step:
        return None

    required = plan_step["required_executions"] or 1
    completed_count = await db.fetchval(
        "SELECT COUNT(*) FROM step_executions WHERE plan_step_id = $1 AND status = 'completed'",
        plan_step_id,
    )

    if completed_count < required:
        return await db.fetchval(
            """INSERT INTO step_executions
               (project_id, plan_step_id, type, execution_number, status)
               VALUES ($1, $2, 'planned', $3, 'in_progress') RETURNING id""",
            project_id, plan_step_id, completed_count + 1,
        )

    next_step = await db.fetchrow(
        """SELECT id, title FROM plan_steps
           WHERE project_id = $1 AND group_id = $2 AND order_index > $3
           ORDER BY order_index LIMIT 1""",
        project_id, plan_step["group_id"], plan_step["order_index"],
    )
    if not next_step:
        next_step = await db.fetchrow(
            """SELECT id, title FROM plan_steps
               WHERE project_id = $1 AND group_id IS NULL AND order_index > $2
               ORDER BY order_index LIMIT 1""",
            project_id, plan_step["order_index"],
        )

    if next_step:
        await db.execute(
            """INSERT INTO step_executions
               (project_id, plan_step_id, type, execution_number, status)
               VALUES ($1, $2, 'planned', 1, 'in_progress')""",
            project_id, next_step["id"],
        )
        return next_step["title"]

    return None


async def create_incident(
    db: Connection,
    project_id: str,
    plan_step_id: str | None = None,
    notes: str | None = None,
) -> StepExecution:
    row = await db.fetchrow(
        """INSERT INTO step_executions
           (project_id, plan_step_id, type, status, notes)
           VALUES ($1, $2, 'incident', 'in_progress', $3) RETURNING *""",
        project_id, plan_step_id, notes,
    )
    return StepExecution.model_validate(dict(row))


async def resolve_incident(
    db: Connection,
    project_id: str,
    incident_id: str,
    reason: str,
    category: str | None = None,
    notes: str | None = None,
) -> StepExecution:
    now = datetime.now(timezone.utc)
    row = await db.fetchrow(
        """UPDATE step_executions SET status='completed', completed_at=$1,
           incident_reason=$2, incident_category=$3, notes=$4, updated_at=$5
           WHERE id=$6 AND project_id=$7 RETURNING *""",
        now, reason, category, notes, now, incident_id, project_id,
    )
    return StepExecution.model_validate(dict(row))


async def create_adhoc(
    db: Connection,
    project_id: str,
    title: str,
    description: str | None = None,
    notes: str | None = None,
) -> StepExecution:
    row = await db.fetchrow(
        """INSERT INTO step_executions
           (project_id, type, status, notes)
           VALUES ($1, 'adhoc', 'completed', $2) RETURNING *""",
        project_id, notes or description or title,
    )
    exec_model = StepExecution.model_validate(dict(row))
    exec_model.step_title = title
    return exec_model


async def get_execution_stats(db: Connection, project_id: str) -> ExecutionStats:
    rows = await db.fetch(
        """SELECT ps.id as step_id, ps.title, COUNT(e.id) as execution_count,
                  COALESCE(SUM(EXTRACT(EPOCH FROM (e.completed_at - e.started_at)) / 60), 0) as total_duration
           FROM step_executions e
           JOIN plan_steps ps ON e.plan_step_id = ps.id
           WHERE e.project_id = $1 AND e.type = 'planned' AND e.completed_at IS NOT NULL
           GROUP BY ps.id, ps.title""",
        project_id,
    )

    total = sum(float(r["total_duration"]) for r in rows)
    breakdown: list[dict] = []
    for r in rows:
        count = int(r["execution_count"])
        dur = float(r["total_duration"])
        breakdown.append({
            "step_id": str(r["step_id"]),
            "title": str(r["title"]),
            "execution_count": count,
            "total_duration": dur,
            "avg_duration": dur / count if count > 0 else 0.0,
        })

    adhoc_rows = await db.fetch(
        """SELECT COUNT(*) as cnt,
                  COALESCE(SUM(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60), 0) as total_duration
           FROM step_executions
           WHERE project_id = $1 AND type IN ('adhoc', 'incident') AND completed_at IS NOT NULL""",
        project_id,
    )
    for ar in adhoc_rows:
        if ar["cnt"] > 0:
            total += float(ar["total_duration"])

    return ExecutionStats(
        total_duration_minutes=total,
        step_breakdown=breakdown,
    )


def _execution_from_row(row) -> StepExecution:
    exec_model = StepExecution.model_validate(dict(row))
    if hasattr(row, "step_title") or "step_title" in dict(row):
        exec_model.step_title = dict(row).get("step_title")
    return exec_model
