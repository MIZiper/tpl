import json
from asyncpg import Connection

from tpl.models import PlanDocument


async def get_plan_document(db: Connection, document_id: str) -> PlanDocument:
    row = await db.fetchrow("SELECT plan_document FROM documents WHERE id = $1", document_id)
    if row and row["plan_document"] is not None:
        return PlanDocument.model_validate(row["plan_document"])
    return PlanDocument()


async def save_plan_document(db: Connection, document_id: str, doc: PlanDocument) -> None:
    await db.execute(
        "UPDATE documents SET plan_document = $1, updated_at = NOW() WHERE id = $2",
        json.dumps(doc.model_dump()),
        document_id,
    )
