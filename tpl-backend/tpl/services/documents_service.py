import json
from asyncpg import Connection

from tpl.models import Document, DocumentCreate, DocumentUpdate


async def list_documents(db: Connection) -> list[Document]:
    rows = await db.fetch("SELECT * FROM documents ORDER BY created_at DESC")
    return [Document.model_validate(dict(r)) for r in rows]


async def get_document(db: Connection, document_id: str) -> Document | None:
    row = await db.fetchrow("SELECT * FROM documents WHERE id = $1", document_id)
    if row is None:
        return None
    return Document.model_validate(dict(row))


async def get_raw_documents(db: Connection, document_id: str) -> dict | None:
    """Return the stored JSONB documents verbatim, without pydantic validation.

    Used by the admin page so it can display (and repair) whatever is actually
    in the database, even if it no longer matches the PlanDocument/ExecutionDoc
    models. Saving still goes through the validated plan/execution endpoints.
    """
    row = await db.fetchrow(
        "SELECT id, name, description, plan_document, execution_document, updated_at "
        "FROM documents WHERE id = $1",
        document_id,
    )
    if row is None:
        return None
    return dict(row)


async def create_document(
    db: Connection,
    data: DocumentCreate,
    creator_sub: str | None = None,
    creator_name: str | None = None,
) -> Document:
    row = await db.fetchrow(
        "INSERT INTO documents (name, description, creator_sub, creator_name) "
        "VALUES ($1, $2, $3, $4) RETURNING *",
        data.name, data.description, creator_sub, creator_name,
    )
    return Document.model_validate(dict(row))


async def update_document(db: Connection, document_id: str, data: DocumentUpdate) -> Document | None:
    existing_row = await db.fetchrow("SELECT * FROM documents WHERE id = $1", document_id)
    if existing_row is None:
        return None
    existing = Document.model_validate(dict(existing_row))

    name = data.name if data.name is not None else existing.name
    description = data.description if data.description is not None else existing.description

    row = await db.fetchrow(
        "UPDATE documents SET name=$1, description=$2, updated_at=NOW() WHERE id=$3 RETURNING *",
        name, description, document_id,
    )
    return Document.model_validate(dict(row))


async def delete_document(db: Connection, document_id: str) -> bool:
    result = await db.execute("DELETE FROM documents WHERE id = $1", document_id)
    return result != "DELETE 0"


def link_column(part: str) -> str:
    if part == "plan":
        return "plan_external_link"
    if part == "log":
        return "log_external_link"
    raise ValueError("part must be plan or log")


async def get_external_link(
    db: Connection, document_id: str, part: str
) -> dict | None:
    col = link_column(part)
    row = await db.fetchrow(
        f"SELECT {col} AS link FROM documents WHERE id = $1", document_id
    )
    return row["link"] if row else None


async def set_external_link(
    db: Connection, document_id: str, part: str, link: dict | None
) -> None:
    col = link_column(part)
    await db.execute(
        f"UPDATE documents SET {col} = $1, updated_at = NOW() WHERE id = $2",
        json.dumps(link) if link is not None else None,
        document_id,
    )
