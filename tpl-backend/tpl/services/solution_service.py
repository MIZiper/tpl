import json

from asyncpg import Connection

from tpl.models import (
    Solution,
    SolutionCreate,
    SolutionUpdate,
    SolutionStep,
    SolutionStepCreate,
    SolutionStepUpdate,
    SolutionWithDetails,
    Risk,
)


async def list_solutions(db: Connection, search: str | None = None) -> list[Solution]:
    if search:
        rows = await db.fetch(
            "SELECT * FROM solutions WHERE title ILIKE $1 OR description ILIKE $1 ORDER BY created_at DESC",
            f"%{search}%",
        )
    else:
        rows = await db.fetch("SELECT * FROM solutions ORDER BY created_at DESC")
    return [Solution.model_validate(dict(r)) for r in rows]


async def get_solution(db: Connection, solution_id: str) -> SolutionWithDetails | None:
    row = await db.fetchrow("SELECT * FROM solutions WHERE id = $1", solution_id)
    if row is None:
        return None

    solution = Solution.model_validate(dict(row))

    step_rows = await db.fetch(
        "SELECT * FROM solution_steps WHERE solution_id = $1 ORDER BY order_index",
        solution_id,
    )
    steps = [SolutionStep.model_validate(dict(s)) for s in step_rows]

    risk_rows = await db.fetch(
        """SELECT r.* FROM risks r
           INNER JOIN solution_risks sr ON r.id = sr.risk_id
           WHERE sr.solution_id = $1""",
        solution_id,
    )
    risks = [Risk.model_validate(dict(r)) for r in risk_rows]

    return SolutionWithDetails(
        **solution.model_dump(),
        steps=steps,
        risks=risks,
    )


async def create_solution(db: Connection, data: SolutionCreate) -> Solution:
    row = await db.fetchrow(
        "INSERT INTO solutions (title, description, test_method, equipment) VALUES ($1, $2, $3, $4) RETURNING *",
        data.title,
        data.description,
        data.test_method,
        json.dumps(data.equipment),
    )
    return Solution.model_validate(dict(row))


async def update_solution(db: Connection, solution_id: str, data: SolutionUpdate) -> Solution | None:
    existing_row = await db.fetchrow("SELECT * FROM solutions WHERE id = $1", solution_id)
    if existing_row is None:
        return None
    existing = Solution.model_validate(dict(existing_row))

    title = data.title if data.title is not None else existing.title
    description = data.description if data.description is not None else existing.description
    test_method = data.test_method if data.test_method is not None else existing.test_method
    equipment = json.dumps(data.equipment) if data.equipment is not None else json.dumps(existing.equipment)

    row = await db.fetchrow(
        "UPDATE solutions SET title=$1, description=$2, test_method=$3, equipment=$4, updated_at=NOW() WHERE id=$5 RETURNING *",
        title, description, test_method, equipment, solution_id,
    )
    return Solution.model_validate(dict(row))


async def delete_solution(db: Connection, solution_id: str) -> bool:
    result = await db.execute("DELETE FROM solutions WHERE id = $1", solution_id)
    return result != "DELETE 0"


async def list_solution_steps(db: Connection, solution_id: str) -> list[SolutionStep]:
    rows = await db.fetch(
        "SELECT * FROM solution_steps WHERE solution_id = $1 ORDER BY order_index",
        solution_id,
    )
    return [SolutionStep.model_validate(dict(r)) for r in rows]


async def create_solution_step(db: Connection, solution_id: str, data: SolutionStepCreate) -> SolutionStep:
    row = await db.fetchrow(
        """INSERT INTO solution_steps
           (solution_id, order_index, title, description, input_params_template, duration_estimate_minutes,
            data_to_collect, completion_criteria, equipment_needed)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *""",
        solution_id,
        data.order_index,
        data.title,
        data.description,
        json.dumps(data.input_params_template),
        data.duration_estimate_minutes,
        json.dumps(data.data_to_collect),
        data.completion_criteria,
        json.dumps(data.equipment_needed),
    )
    return SolutionStep.model_validate(dict(row))


async def update_solution_step(db: Connection, step_id: str, data: SolutionStepUpdate) -> SolutionStep | None:
    existing_row = await db.fetchrow("SELECT * FROM solution_steps WHERE id = $1", step_id)
    if existing_row is None:
        return None
    existing = SolutionStep.model_validate(dict(existing_row))

    title = data.title if data.title is not None else existing.title
    description = data.description if data.description is not None else existing.description
    order_index = data.order_index if data.order_index is not None else existing.order_index
    input_params_template = json.dumps(data.input_params_template) if data.input_params_template is not None else json.dumps(existing.input_params_template)
    duration_estimate_minutes = data.duration_estimate_minutes if data.duration_estimate_minutes is not None else existing.duration_estimate_minutes
    data_to_collect = json.dumps(data.data_to_collect) if data.data_to_collect is not None else json.dumps(existing.data_to_collect)
    completion_criteria = data.completion_criteria if data.completion_criteria is not None else existing.completion_criteria
    equipment_needed = json.dumps(data.equipment_needed) if data.equipment_needed is not None else json.dumps(existing.equipment_needed)

    row = await db.fetchrow(
        """UPDATE solution_steps SET title=$1, description=$2, order_index=$3, input_params_template=$4,
           duration_estimate_minutes=$5, data_to_collect=$6, completion_criteria=$7, equipment_needed=$8,
           updated_at=NOW() WHERE id=$9 RETURNING *""",
        title, description, order_index, input_params_template, duration_estimate_minutes,
        data_to_collect, completion_criteria, equipment_needed, step_id,
    )
    return SolutionStep.model_validate(dict(row))


async def delete_solution_step(db: Connection, step_id: str) -> bool:
    result = await db.execute("DELETE FROM solution_steps WHERE id = $1", step_id)
    return result != "DELETE 0"


async def reorder_solution_steps(db: Connection, solution_id: str, step_ids: list[str]) -> None:
    for i, step_id in enumerate(step_ids):
        await db.execute(
            "UPDATE solution_steps SET order_index = $1, updated_at = NOW() WHERE id = $2 AND solution_id = $3",
            i, step_id, solution_id,
        )


async def list_solution_risks(db: Connection, solution_id: str) -> list[Risk]:
    rows = await db.fetch(
        """SELECT r.* FROM risks r
           INNER JOIN solution_risks sr ON r.id = sr.risk_id
           WHERE sr.solution_id = $1""",
        solution_id,
    )
    return [Risk.model_validate(dict(r)) for r in rows]


async def link_solution_risk(db: Connection, solution_id: str, risk_id: str) -> bool:
    try:
        await db.execute(
            "INSERT INTO solution_risks (solution_id, risk_id) VALUES ($1, $2)",
            solution_id, risk_id,
        )
        return True
    except Exception:
        return False


async def unlink_solution_risk(db: Connection, solution_id: str, risk_id: str) -> bool:
    result = await db.execute(
        "DELETE FROM solution_risks WHERE solution_id = $1 AND risk_id = $2",
        solution_id, risk_id,
    )
    return result != "DELETE 0"
