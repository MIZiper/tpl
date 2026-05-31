import json
from datetime import datetime, timezone

from asyncpg import Connection

from tpl.models import ExecutionDoc, ExecutionEntry, ExecutionRun


async def get_execution_doc(db: Connection, project_id: str) -> ExecutionDoc:
    row = await db.fetchrow("SELECT execution_document FROM projects WHERE id = $1", project_id)
    if row and row["execution_document"] is not None:
        return ExecutionDoc.model_validate(row["execution_document"])
    return ExecutionDoc()


async def save_execution_doc(db: Connection, project_id: str, doc: ExecutionDoc) -> None:
    await db.execute(
        "UPDATE projects SET execution_document = $1, updated_at = NOW() WHERE id = $2",
        json.dumps(doc.model_dump()),
        project_id,
    )


def _new_id() -> str:
    from uuid import uuid4
    return str(uuid4())


async def init_execution_doc(db: Connection, project_id: str) -> ExecutionDoc:
    plan_row = await db.fetchrow("SELECT plan_document FROM projects WHERE id = $1", project_id)
    if plan_row and plan_row["plan_document"]:
        plan = plan_row["plan_document"]
        entries: list[ExecutionEntry] = []

        def walk(nodes: list[dict], group_path: list[str]):
            for node in nodes:
                if node.get("type") == "step":
                    entries.append(ExecutionEntry(
                        id=_new_id(),
                        plan_step_id=node["id"],
                        step_title=node.get("title", "New Step"),
                        required_executions=node.get("required_executions", 1),
                    ))
                elif node.get("type") == "group":
                    walk(node.get("children", []), [*group_path, node.get("title", "")])

        walk(plan.get("root", []), [])
        doc = ExecutionDoc(entries=entries)
        await save_execution_doc(db, project_id, doc)
        return doc
    return ExecutionDoc()


async def add_adhoc_entry(
    db: Connection,
    project_id: str,
    title: str,
    notes: str | None = None,
) -> ExecutionDoc:
    doc = await get_execution_doc(db, project_id)
    now = datetime.now(timezone.utc).isoformat()
    entry = ExecutionEntry(
        id=_new_id(),
        step_title=title,
        type="adhoc",
        executions=[ExecutionRun(
            id=_new_id(),
            status="completed",
            started_at=now,
            completed_at=now,
            notes=notes,
        )],
    )
    doc.entries.append(entry)
    await save_execution_doc(db, project_id, doc)
    return doc
