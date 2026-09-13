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


async def create_document(db: Connection, data: DocumentCreate) -> Document:
    row = await db.fetchrow(
        "INSERT INTO documents (name, description) VALUES ($1, $2) RETURNING *",
        data.name, data.description,
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
