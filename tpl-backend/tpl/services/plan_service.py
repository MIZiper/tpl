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
    PlanDocument,
    PlanDefinitions,
    PlanFieldDef,
    PlanNode,
    FieldBinding,
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


async def get_plan_document(db: Connection, project_id: str) -> PlanDocument:
    row = await db.fetchrow("SELECT plan_document FROM projects WHERE id = $1", project_id)
    if row and row["plan_document"] is not None:
        return PlanDocument.model_validate(row["plan_document"])
    return PlanDocument()


async def save_plan_document(db: Connection, project_id: str, doc: PlanDocument) -> None:
    await db.execute(
        "UPDATE projects SET plan_document = $1, updated_at = NOW() WHERE id = $2",
        json.dumps(doc.model_dump()),
        project_id,
    )


async def initialize_plan(db: Connection, project_id: str) -> PlanDocument:
    existing = await db.fetchval("SELECT plan_document FROM projects WHERE id = $1", project_id)
    if existing is not None:
        return PlanDocument.model_validate(existing)

    solution_rows = await db.fetch(
        """SELECT s.id, s.title FROM solutions s
           JOIN project_solutions ps ON s.id = ps.solution_id
           WHERE ps.project_id = $1""",
        project_id,
    )

    defs = PlanDefinitions()
    root: list[PlanNode] = []

    for sol_row in solution_rows:
        sol_id = sol_row["id"]
        sol_name = sol_row["title"]

        step_rows = await db.fetch(
            "SELECT * FROM solution_steps WHERE solution_id = $1 ORDER BY order_index",
            sol_id,
        )

        step_nodes: list[PlanNode] = []
        for s_row in step_rows:
            s = dict(s_row)

            input_conditions: list[FieldBinding] = []
            for p in (s["input_params_template"] or []):
                fid = _ensure_def(defs, "input_conditions", p)
                input_conditions.append(FieldBinding(definition_id=fid, value=p.get("default_value")))

            collection_items: list[FieldBinding] = []
            for d in (s["data_to_collect"] or []):
                fid = _ensure_def(defs, "collection_items", d)
                collection_items.append(FieldBinding(definition_id=fid))

            criteria: list[FieldBinding] = []
            if s["completion_criteria"]:
                fid = _ensure_def(defs, "completion_criteria", {"name": s["completion_criteria"], "field_type": "text"})
                criteria.append(FieldBinding(definition_id=fid))

            node = PlanNode(
                id=_new_id(),
                type="step",
                title=s["title"],
                description=s.get("description"),
                duration_minutes=s.get("duration_estimate_minutes", 60),
                input_conditions=input_conditions,
                collection_items=collection_items,
                completion_criteria=criteria,
                required_executions=1,
                solution_step_id=s["id"],
            )
            step_nodes.append(node)

        if step_nodes:
            group_node = PlanNode(
                id=_new_id(),
                type="group",
                title=sol_name,
                children=step_nodes,
            )
            root.append(group_node)

    from uuid import uuid4 as _uuid4
    return PlanDocument(definitions=defs, root=root)


def _ensure_def(defs: PlanDefinitions, category: str, item: dict) -> str:
    attr = getattr(defs, category)
    name = item.get("name", "")
    for existing in attr:
        if existing.name == name:
            return existing.id
    from uuid import uuid4
    fid = str(uuid4())
    field_def = PlanFieldDef(
        id=fid,
        name=name or "Unnamed",
        field_type=item.get("field_type", item.get("type", "text")),
        unit=item.get("unit", item.get("unit", None)),
        default_value=item.get("default_value"),
    )
    setattr(defs, category, [*attr, field_def])
    return fid


def _new_id() -> str:
    from uuid import uuid4
    return str(uuid4())


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
