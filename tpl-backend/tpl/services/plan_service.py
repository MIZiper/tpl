import json
from asyncpg import Connection

from tpl.models import (
    PlanTree,
    PlanGroup,
    PlanGroupCreate,
    PlanGroupUpdate,
    PlanGroupWithChildren,
    PlanStep,
    PlanStepCreate,
    PlanStepUpdate,
)


async def get_plan(db: Connection, project_id: str) -> PlanTree:
    group_rows = await db.fetch(
        "SELECT * FROM plan_groups WHERE project_id = $1 ORDER BY order_index",
        project_id,
    )
    groups = [PlanGroup.model_validate(dict(r)) for r in group_rows]

    step_rows = await db.fetch(
        "SELECT * FROM plan_steps WHERE project_id = $1 ORDER BY group_id NULLS FIRST, order_index",
        project_id,
    )

    grouped_steps: dict[str | None, list[PlanStep]] = {}
    for s_row in step_rows:
        step = PlanStep.model_validate(dict(s_row))
        gid = step.group_id or None
        grouped_steps.setdefault(gid, []).append(step)

    group_tree = _build_group_tree(groups, grouped_steps, None)

    return PlanTree(
        groups=group_tree,
        ungrouped_steps=grouped_steps.get(None, []),
    )


def _build_group_tree(
    groups: list[PlanGroup],
    grouped_steps: dict[str | None, list[PlanStep]],
    parent_id: str | None,
) -> list[PlanGroupWithChildren]:
    result: list[PlanGroupWithChildren] = []
    for g in groups:
        if g.parent_group_id == parent_id:
            children = _build_group_tree(groups, grouped_steps, g.id)
            steps = grouped_steps.get(g.id, [])
            result.append(PlanGroupWithChildren(
                **g.model_dump(),
                children=children,
                steps=steps,
            ))
    return result


async def initialize_plan(db: Connection, project_id: str) -> PlanTree:
    solution_rows = await db.fetch(
        """SELECT s.id FROM solutions s
           JOIN project_solutions ps ON s.id = ps.solution_id
           WHERE ps.project_id = $1""",
        project_id,
    )

    for sol_row in solution_rows:
        sol_id = sol_row["id"]
        step_rows = await db.fetch(
            "SELECT * FROM solution_steps WHERE solution_id = $1 ORDER BY order_index",
            sol_id,
        )
        for s_row in step_rows:
            s = dict(s_row)
            await db.execute(
                """INSERT INTO plan_steps
                   (project_id, solution_id, solution_step_id, order_index, title, description,
                    input_params, duration_estimate_minutes, data_to_collect, completion_criteria)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                   ON CONFLICT DO NOTHING""",
                project_id, sol_id, s["id"], s["order_index"], s["title"], s["description"],
                s["input_params_template"], s["duration_estimate_minutes"],
                s["data_to_collect"], s["completion_criteria"],
            )

    return await get_plan(db, project_id)


async def create_group(db: Connection, project_id: str, data: PlanGroupCreate) -> PlanGroup:
    row = await db.fetchrow(
        "INSERT INTO plan_groups (project_id, parent_group_id, title, order_index) VALUES ($1, $2, $3, $4) RETURNING *",
        project_id, data.parent_group_id, data.title, data.order_index,
    )
    return PlanGroup.model_validate(dict(row))


async def update_group(db: Connection, group_id: str, data: PlanGroupUpdate) -> PlanGroup | None:
    existing_row = await db.fetchrow("SELECT * FROM plan_groups WHERE id = $1", group_id)
    if existing_row is None:
        return None
    existing = PlanGroup.model_validate(dict(existing_row))

    title = data.title if data.title is not None else existing.title
    parent_group_id = data.parent_group_id if data.parent_group_id is not None else existing.parent_group_id
    order_index = data.order_index if data.order_index is not None else existing.order_index

    row = await db.fetchrow(
        "UPDATE plan_groups SET title=$1, parent_group_id=$2, order_index=$3, updated_at=NOW() WHERE id=$4 RETURNING *",
        title, parent_group_id, order_index, group_id,
    )
    return PlanGroup.model_validate(dict(row))


async def delete_group(db: Connection, group_id: str) -> bool:
    result = await db.execute("DELETE FROM plan_groups WHERE id = $1", group_id)
    return result != "DELETE 0"


async def create_step(db: Connection, project_id: str, data: PlanStepCreate) -> PlanStep:
    row = await db.fetchrow(
        """INSERT INTO plan_steps
           (project_id, group_id, order_index, title, description, input_params,
            duration_estimate_minutes, data_to_collect, completion_criteria, required_executions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *""",
        project_id, data.group_id, data.order_index, data.title, data.description,
        json.dumps(data.input_params), data.duration_estimate_minutes,
        json.dumps(data.data_to_collect), data.completion_criteria,
        data.required_executions,
    )
    return PlanStep.model_validate(dict(row))


async def update_step(db: Connection, step_id: str, data: PlanStepUpdate) -> PlanStep | None:
    existing_row = await db.fetchrow("SELECT * FROM plan_steps WHERE id = $1", step_id)
    if existing_row is None:
        return None
    existing = PlanStep.model_validate(dict(existing_row))

    title = data.title if data.title is not None else existing.title
    description = data.description if data.description is not None else existing.description
    group_id = data.group_id if data.group_id is not None else existing.group_id
    order_index = data.order_index if data.order_index is not None else existing.order_index
    input_params = json.dumps(data.input_params) if data.input_params is not None else json.dumps(existing.input_params)
    duration_estimate_minutes = data.duration_estimate_minutes if data.duration_estimate_minutes is not None else existing.duration_estimate_minutes
    data_to_collect = json.dumps(data.data_to_collect) if data.data_to_collect is not None else json.dumps(existing.data_to_collect)
    completion_criteria = data.completion_criteria if data.completion_criteria is not None else existing.completion_criteria
    required_executions = data.required_executions if data.required_executions is not None else existing.required_executions

    row = await db.fetchrow(
        """UPDATE plan_steps SET title=$1, description=$2, group_id=$3, order_index=$4,
           input_params=$5, duration_estimate_minutes=$6, data_to_collect=$7,
           completion_criteria=$8, required_executions=$9, updated_at=NOW()
           WHERE id=$10 RETURNING *""",
        title, description, group_id, order_index, input_params, duration_estimate_minutes,
        data_to_collect, completion_criteria, required_executions, step_id,
    )
    return PlanStep.model_validate(dict(row))


async def delete_step(db: Connection, step_id: str) -> bool:
    result = await db.execute("DELETE FROM plan_steps WHERE id = $1", step_id)
    return result != "DELETE 0"


async def reorder_plan(db: Connection, project_id: str, items: list[dict]) -> None:
    for item in items:
        item_id = item["id"]
        if "group_id" in item:
            await db.execute(
                "UPDATE plan_steps SET group_id=$1, order_index=$2, updated_at=NOW() WHERE id=$3 AND project_id=$4",
                item.get("group_id"), item.get("order_index", 0), item_id, project_id,
            )
        else:
            await db.execute(
                "UPDATE plan_groups SET parent_group_id=$1, order_index=$2, updated_at=NOW() WHERE id=$3 AND project_id=$4",
                item.get("parent_group_id"), item.get("order_index", 0), item_id, project_id,
            )
