from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from tpl.db import get_connection
from tpl.models import Risk, RiskCreate, RiskUpdate
from tpl.services import risk_service

router = APIRouter(tags=["risks"])


@router.get("/risks", response_model=list[Risk])
async def list_risks(search: str | None = None, db: Connection = Depends(get_connection)):
    return await risk_service.list_risks(db, search)


@router.post("/risks", response_model=Risk, status_code=201)
async def create_risk(body: RiskCreate, db: Connection = Depends(get_connection)):
    return await risk_service.create_risk(db, body)


@router.get("/risks/{risk_id}", response_model=Risk)
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
