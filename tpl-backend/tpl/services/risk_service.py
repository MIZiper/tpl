from asyncpg import Connection

from tpl.models import Risk, RiskCreate, RiskUpdate


def _row_to_dict(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
        elif isinstance(v, (bytes, bytearray)):
            d[k] = v.hex() if hasattr(v, "hex") else str(v)
    return d


async def list_risks(db: Connection, search: str | None = None) -> list[Risk]:
    if search:
        rows = await db.fetch(
            "SELECT * FROM risks WHERE title ILIKE $1 OR description ILIKE $1 ORDER BY created_at DESC",
            f"%{search}%",
        )
    else:
        rows = await db.fetch("SELECT * FROM risks ORDER BY created_at DESC")
    return [Risk.model_validate(_row_to_dict(r)) for r in rows]


async def get_risk(db: Connection, risk_id: str) -> Risk | None:
    row = await db.fetchrow("SELECT * FROM risks WHERE id = $1", risk_id)
    if row is None:
        return None
    return Risk.model_validate(_row_to_dict(row))


async def create_risk(db: Connection, data: RiskCreate) -> Risk:
    row = await db.fetchrow(
        "INSERT INTO risks (title, description, scope) VALUES ($1, $2, $3) RETURNING *",
        data.title,
        data.description,
        data.scope,
    )
    return Risk.model_validate(_row_to_dict(row))


async def update_risk(db: Connection, risk_id: str, data: RiskUpdate) -> Risk | None:
    existing = await get_risk(db, risk_id)
    if existing is None:
        return None

    title = data.title if data.title is not None else existing.title
    description = data.description if data.description is not None else existing.description
    scope = data.scope if data.scope is not None else existing.scope

    row = await db.fetchrow(
        "UPDATE risks SET title=$1, description=$2, scope=$3, updated_at=NOW() WHERE id=$4 RETURNING *",
        title,
        description,
        scope,
        risk_id,
    )
    return Risk.model_validate(_row_to_dict(row))


async def delete_risk(db: Connection, risk_id: str) -> bool:
    result = await db.execute("DELETE FROM risks WHERE id = $1", risk_id)
    return result != "DELETE 0"
