from asyncpg import Connection

from rsp_backend.models import (
    AppliedSolution,
    AppliedSolutionCreate,
    AppliedSolutionUpdate,
    AppliedSolutionWithDetails,
    Effectiveness,
    EffectivenessCreate,
    LessonsLearned,
    LessonsLearnedCreate,
    LessonsLearnedUpdate,
    Solution,
)
from rsp_backend.services.project_service import _load_applied_solutions


# ---------------------------------------------------------------------------
# Applied solutions
# ---------------------------------------------------------------------------
async def create_applied_solution(
    db: Connection,
    project_risk_id: str,
    data: AppliedSolutionCreate,
) -> AppliedSolution:
    row = await db.fetchrow(
        """INSERT INTO applied_solutions
           (project_risk_id, solution_id, implementation_date, responsible_engineer, status)
           VALUES ($1, $2, $3, $4, $5) RETURNING *""",
        project_risk_id, data.solution_id, data.implementation_date,
        data.responsible_engineer, data.status,
    )
    return AppliedSolution.model_validate(dict(row))


async def update_applied_solution(
    db: Connection,
    applied_id: str,
    data: AppliedSolutionUpdate,
) -> AppliedSolution | None:
    existing_row = await db.fetchrow("SELECT * FROM applied_solutions WHERE id = $1", applied_id)
    if existing_row is None:
        return None
    existing = AppliedSolution.model_validate(dict(existing_row))

    implementation_date = data.implementation_date if data.implementation_date is not None else existing.implementation_date
    responsible_engineer = data.responsible_engineer if data.responsible_engineer is not None else existing.responsible_engineer
    status = data.status if data.status is not None else existing.status

    row = await db.fetchrow(
        """UPDATE applied_solutions SET implementation_date=$1, responsible_engineer=$2,
           status=$3, updated_at=NOW() WHERE id=$4 RETURNING *""",
        implementation_date, responsible_engineer, status, applied_id,
    )
    return AppliedSolution.model_validate(dict(row))


async def delete_applied_solution(db: Connection, applied_id: str) -> bool:
    result = await db.execute("DELETE FROM applied_solutions WHERE id = $1", applied_id)
    return result != "DELETE 0"


# ---------------------------------------------------------------------------
# Effectiveness
# ---------------------------------------------------------------------------
async def create_effectiveness(
    db: Connection,
    applied_id: str,
    data: EffectivenessCreate,
) -> Effectiveness:
    row = await db.fetchrow(
        """INSERT INTO solution_effectiveness
           (applied_id, result_summary, risk_reduction_percent, actual_cost, comments)
           VALUES ($1, $2, $3, $4, $5) RETURNING *""",
        applied_id, data.result_summary, data.risk_reduction_percent,
        data.actual_cost, data.comments,
    )
    return Effectiveness.model_validate(dict(row))


# ---------------------------------------------------------------------------
# Lessons learned
# ---------------------------------------------------------------------------
async def list_lessons(db: Connection, project_risk_id: str) -> list[LessonsLearned]:
    rows = await db.fetch(
        "SELECT * FROM lessons_learned WHERE project_risk_id = $1 ORDER BY created_at DESC",
        project_risk_id,
    )
    return [LessonsLearned.model_validate(dict(r)) for r in rows]


async def create_lesson(
    db: Connection,
    project_risk_id: str,
    data: LessonsLearnedCreate,
) -> LessonsLearned:
    row = await db.fetchrow(
        """INSERT INTO lessons_learned
           (project_risk_id, what_happened, root_cause, what_worked, what_failed, recommendation)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *""",
        project_risk_id, data.what_happened, data.root_cause, data.what_worked,
        data.what_failed, data.recommendation,
    )
    return LessonsLearned.model_validate(dict(row))


async def update_lesson(
    db: Connection,
    lesson_id: str,
    data: LessonsLearnedUpdate,
) -> LessonsLearned | None:
    existing_row = await db.fetchrow("SELECT * FROM lessons_learned WHERE id = $1", lesson_id)
    if existing_row is None:
        return None
    existing = LessonsLearned.model_validate(dict(existing_row))

    what_happened = data.what_happened if data.what_happened is not None else existing.what_happened
    root_cause = data.root_cause if data.root_cause is not None else existing.root_cause
    what_worked = data.what_worked if data.what_worked is not None else existing.what_worked
    what_failed = data.what_failed if data.what_failed is not None else existing.what_failed
    recommendation = data.recommendation if data.recommendation is not None else existing.recommendation

    row = await db.fetchrow(
        """UPDATE lessons_learned SET what_happened=$1, root_cause=$2, what_worked=$3,
           what_failed=$4, recommendation=$5 WHERE id=$6 RETURNING *""",
        what_happened, root_cause, what_worked, what_failed, recommendation, lesson_id,
    )
    return LessonsLearned.model_validate(dict(row))


async def delete_lesson(db: Connection, lesson_id: str) -> bool:
    result = await db.execute("DELETE FROM lessons_learned WHERE id = $1", lesson_id)
    return result != "DELETE 0"
