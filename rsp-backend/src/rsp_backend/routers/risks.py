from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from rsp_backend.db import get_connection
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
from rsp_backend.services import risk_service

router = APIRouter(tags=["risks"])


@router.get("/risk-categories", response_model=list[RiskCategory])
async def list_categories(db: Connection = Depends(get_connection)):
    return await risk_service.list_categories(db)


@router.post("/risk-categories", response_model=RiskCategory, status_code=201)
async def create_category(body: RiskCategoryCreate, db: Connection = Depends(get_connection)):
    return await risk_service.create_category(db, body)


@router.get("/risks", response_model=list[Risk])
async def list_risks(
    search: str | None = None,
    category_id: str | None = None,
    db: Connection = Depends(get_connection),
):
    return await risk_service.list_risks(db, search, category_id)


@router.post("/risks", response_model=Risk, status_code=201)
async def create_risk(body: RiskCreate, db: Connection = Depends(get_connection)):
    return await risk_service.create_risk(db, body)


@router.get("/risks/{risk_id}", response_model=RiskWithDetails)
async def get_risk(risk_id: str, db: Connection = Depends(get_connection)):
    risk = await risk_service.get_risk(db, risk_id)
    if risk is None:
        raise HTTPException(status_code=404, detail="Risk not found")
    return risk


@router.put("/risks/{risk_id}", response_model=Risk)
async def update_risk(risk_id: str, body: RiskUpdate, db: Connection = Depends(get_connection)):
    risk = await risk_service.update_risk(db, risk_id, body)
    if risk is None:
        raise HTTPException(status_code=404, detail="Risk not found")
    return risk


@router.delete("/risks/{risk_id}", status_code=204)
async def delete_risk(risk_id: str, db: Connection = Depends(get_connection)):
    deleted = await risk_service.delete_risk(db, risk_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Risk not found")
    return None


# --- Causes ---
@router.get("/risks/{risk_id}/causes", response_model=list[RiskCause])
async def list_causes(risk_id: str, db: Connection = Depends(get_connection)):
    return await risk_service.list_causes(db, risk_id)


@router.post("/risks/{risk_id}/causes", response_model=RiskCause, status_code=201)
async def create_cause(risk_id: str, body: RiskCauseCreate, db: Connection = Depends(get_connection)):
    return await risk_service.create_cause(db, risk_id, body)


@router.delete("/risks/{risk_id}/causes/{cause_id}", status_code=204)
async def delete_cause(risk_id: str, cause_id: str, db: Connection = Depends(get_connection)):
    ok = await risk_service.delete_cause(db, risk_id, cause_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Cause not found")
    return None


# --- Tags ---
@router.get("/risk-tags", response_model=list[RiskTag])
async def list_tags(db: Connection = Depends(get_connection)):
    return await risk_service.list_tags(db)


@router.post("/risk-tags", response_model=RiskTag, status_code=201)
async def create_tag(body: RiskTagCreate, db: Connection = Depends(get_connection)):
    return await risk_service.create_tag(db, body)


@router.post("/risks/{risk_id}/tags", status_code=201)
async def add_risk_tag(risk_id: str, body: dict, db: Connection = Depends(get_connection)):
    tag_id = body.get("tag_id")
    if not tag_id:
        raise HTTPException(status_code=400, detail="tag_id is required")
    ok = await risk_service.add_risk_tag(db, risk_id, tag_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Failed to add tag")
    return {"status": "added"}


@router.delete("/risks/{risk_id}/tags/{tag_id}", status_code=204)
async def remove_risk_tag(risk_id: str, tag_id: str, db: Connection = Depends(get_connection)):
    ok = await risk_service.remove_risk_tag(db, risk_id, tag_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Tag link not found")
    return None
