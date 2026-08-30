from asyncpg import Connection

from rsp_backend.models import (
    Risk,
    RiskCategory,
    RiskCategoryCreate,
    RiskCause,
    RiskCauseCreate,
    RiskCreate,
    RiskTag,
    RiskTagCreate,
    RiskUpdate,
    RiskWithDetails,
)
from rsp_backend.services.utils import row_to_dict


# ---------------------------------------------------------------------------
# Risk categories
# ---------------------------------------------------------------------------
async def list_categories(db: Connection) -> list[RiskCategory]:
    rows = await db.fetch("SELECT * FROM risk_categories ORDER BY name")
    return [RiskCategory.model_validate(dict(r)) for r in rows]


async def create_category(db: Connection, data: RiskCategoryCreate) -> RiskCategory:
    row = await db.fetchrow(
        "INSERT INTO risk_categories (name, description) VALUES ($1, $2) RETURNING *",
        data.name, data.description,
    )
    return RiskCategory.model_validate(dict(row))


# ---------------------------------------------------------------------------
# Risks
# ---------------------------------------------------------------------------
async def list_risks(
    db: Connection,
    search: str | None = None,
    category_id: str | None = None,
) -> list[Risk]:
    conditions: list[str] = []
    params: list = []
    if search:
        params.append(f"%{search}%")
        conditions.append("(title ILIKE $1 OR description ILIKE $1 OR code ILIKE $1)")
    if category_id:
        params.append(category_id)
        conditions.append(f"category_id = ${len(params)}")
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = await db.fetch(
        f"SELECT * FROM risks {where} ORDER BY created_at DESC",
        *params,
    )
    return [Risk.model_validate(dict(r)) for r in rows]


async def get_risk(db: Connection, risk_id: str) -> RiskWithDetails | None:
    row = await db.fetchrow("SELECT * FROM risks WHERE id = $1", risk_id)
    if row is None:
        return None
    risk = Risk.model_validate(dict(row))

    category = None
    if risk.category_id:
        cat_row = await db.fetchrow(
            "SELECT * FROM risk_categories WHERE id = $1", risk.category_id,
        )
        if cat_row:
            category = RiskCategory.model_validate(dict(cat_row))

    cause_rows = await db.fetch(
        "SELECT * FROM risk_causes WHERE risk_id = $1 ORDER BY created_at",
        risk_id,
    )
    causes = [RiskCause.model_validate(dict(r)) for r in cause_rows]

    tag_rows = await db.fetch(
        """SELECT t.* FROM risk_tags t
           JOIN risk_tag_mapping m ON t.id = m.tag_id
           WHERE m.risk_id = $1 ORDER BY t.name""",
        risk_id,
    )
    tags = [RiskTag.model_validate(dict(r)) for r in tag_rows]

    return RiskWithDetails(
        **risk.model_dump(),
        category=category,
        causes=causes,
        tags=tags,
    )


async def create_risk(db: Connection, data: RiskCreate) -> Risk:
    row = await db.fetchrow(
        """INSERT INTO risks
           (category_id, code, title, description, scope,
            default_severity, default_occurrence, default_detection)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *""",
        data.category_id, data.code, data.title, data.description, data.scope,
        data.default_severity, data.default_occurrence, data.default_detection,
    )
    return Risk.model_validate(dict(row))


async def update_risk(db: Connection, risk_id: str, data: RiskUpdate) -> Risk | None:
    existing_row = await db.fetchrow("SELECT * FROM risks WHERE id = $1", risk_id)
    if existing_row is None:
        return None
    existing = Risk.model_validate(dict(existing_row))

    category_id = data.category_id if data.category_id is not None else existing.category_id
    code = data.code if data.code is not None else existing.code
    title = data.title if data.title is not None else existing.title
    description = data.description if data.description is not None else existing.description
    scope = data.scope if data.scope is not None else existing.scope
    default_severity = data.default_severity if data.default_severity is not None else existing.default_severity
    default_occurrence = data.default_occurrence if data.default_occurrence is not None else existing.default_occurrence
    default_detection = data.default_detection if data.default_detection is not None else existing.default_detection

    row = await db.fetchrow(
        """UPDATE risks SET category_id=$1, code=$2, title=$3, description=$4, scope=$5,
           default_severity=$6, default_occurrence=$7, default_detection=$8, updated_at=NOW()
           WHERE id=$9 RETURNING *""",
        category_id, code, title, description, scope,
        default_severity, default_occurrence, default_detection, risk_id,
    )
    return Risk.model_validate(dict(row))


async def delete_risk(db: Connection, risk_id: str) -> bool:
    result = await db.execute("DELETE FROM risks WHERE id = $1", risk_id)
    return result != "DELETE 0"


# ---------------------------------------------------------------------------
# Risk causes
# ---------------------------------------------------------------------------
async def list_causes(db: Connection, risk_id: str) -> list[RiskCause]:
    rows = await db.fetch(
        "SELECT * FROM risk_causes WHERE risk_id = $1 ORDER BY created_at", risk_id,
    )
    return [RiskCause.model_validate(dict(r)) for r in rows]


async def create_cause(db: Connection, risk_id: str, data: RiskCauseCreate) -> RiskCause:
    row = await db.fetchrow(
        "INSERT INTO risk_causes (risk_id, description) VALUES ($1, $2) RETURNING *",
        risk_id, data.description,
    )
    return RiskCause.model_validate(dict(row))


async def delete_cause(db: Connection, risk_id: str, cause_id: str) -> bool:
    result = await db.execute(
        "DELETE FROM risk_causes WHERE id = $1 AND risk_id = $2", cause_id, risk_id,
    )
    return result != "DELETE 0"


# ---------------------------------------------------------------------------
# Risk tags
# ---------------------------------------------------------------------------
async def list_tags(db: Connection) -> list[RiskTag]:
    rows = await db.fetch("SELECT * FROM risk_tags ORDER BY name")
    return [RiskTag.model_validate(dict(r)) for r in rows]


async def create_tag(db: Connection, data: RiskTagCreate) -> RiskTag:
    row = await db.fetchrow(
        "INSERT INTO risk_tags (name) VALUES ($1) RETURNING *", data.name,
    )
    return RiskTag.model_validate(dict(row))


async def add_risk_tag(db: Connection, risk_id: str, tag_id: str) -> bool:
    try:
        await db.execute(
            "INSERT INTO risk_tag_mapping (risk_id, tag_id) VALUES ($1, $2)",
            risk_id, tag_id,
        )
        return True
    except Exception:
        return False


async def remove_risk_tag(db: Connection, risk_id: str, tag_id: str) -> bool:
    result = await db.execute(
        "DELETE FROM risk_tag_mapping WHERE risk_id = $1 AND tag_id = $2",
        risk_id, tag_id,
    )
    return result != "DELETE 0"
