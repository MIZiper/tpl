from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from tpl.db import get_connection
from tpl.models import (
    Solution,
    SolutionCreate,
    SolutionUpdate,
    SolutionWithDetails,
    SolutionStep,
    SolutionStepCreate,
    SolutionStepUpdate,
    Risk,
    LinkRiskRequest,
    ReorderRequest,
)
from tpl.services import solution_service

router = APIRouter(tags=["solutions"])


@router.get("/solutions", response_model=list[Solution])
async def list_solutions(search: str | None = None, db: Connection = Depends(get_connection)):
    return await solution_service.list_solutions(db, search)


@router.post("/solutions", response_model=Solution, status_code=201)
async def create_solution(body: SolutionCreate, db: Connection = Depends(get_connection)):
    return await solution_service.create_solution(db, body)


@router.get("/solutions/{solution_id}", response_model=SolutionWithDetails)
async def get_solution(solution_id: str, db: Connection = Depends(get_connection)):
    sol = await solution_service.get_solution(db, solution_id)
    if sol is None:
        raise HTTPException(status_code=404, detail="Solution not found")
    return sol


@router.put("/solutions/{solution_id}", response_model=Solution)
async def update_solution(solution_id: str, body: SolutionUpdate, db: Connection = Depends(get_connection)):
    sol = await solution_service.update_solution(db, solution_id, body)
    if sol is None:
        raise HTTPException(status_code=404, detail="Solution not found")
    return sol


@router.delete("/solutions/{solution_id}", status_code=204)
async def delete_solution(solution_id: str, db: Connection = Depends(get_connection)):
    deleted = await solution_service.delete_solution(db, solution_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Solution not found")
    return None


@router.get("/solutions/{solution_id}/steps", response_model=list[SolutionStep])
async def list_solution_steps(solution_id: str, db: Connection = Depends(get_connection)):
    return await solution_service.list_solution_steps(db, solution_id)


@router.post("/solutions/{solution_id}/steps", response_model=SolutionStep, status_code=201)
async def create_solution_step(solution_id: str, body: SolutionStepCreate, db: Connection = Depends(get_connection)):
    return await solution_service.create_solution_step(db, solution_id, body)


@router.put("/solutions/{solution_id}/steps/{step_id}", response_model=SolutionStep)
async def update_solution_step(solution_id: str, step_id: str, body: SolutionStepUpdate, db: Connection = Depends(get_connection)):
    step = await solution_service.update_solution_step(db, step_id, body)
    if step is None:
        raise HTTPException(status_code=404, detail="Step not found")
    return step


@router.delete("/solutions/{solution_id}/steps/{step_id}", status_code=204)
async def delete_solution_step(solution_id: str, step_id: str, db: Connection = Depends(get_connection)):
    deleted = await solution_service.delete_solution_step(db, step_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Step not found")
    return None


@router.put("/solutions/{solution_id}/steps/reorder", status_code=204)
async def reorder_solution_steps(solution_id: str, body: ReorderRequest, db: Connection = Depends(get_connection)):
    step_ids = [item["id"] for item in body.items]
    await solution_service.reorder_solution_steps(db, solution_id, step_ids)
    return None


@router.get("/solutions/{solution_id}/risks", response_model=list[Risk])
async def list_solution_risks(solution_id: str, db: Connection = Depends(get_connection)):
    return await solution_service.list_solution_risks(db, solution_id)


@router.post("/solutions/{solution_id}/risks", status_code=201)
async def link_solution_risk(solution_id: str, body: LinkRiskRequest, db: Connection = Depends(get_connection)):
    ok = await solution_service.link_solution_risk(db, solution_id, body.risk_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Failed to link risk")
    return {"status": "linked"}


@router.delete("/solutions/{solution_id}/risks/{risk_id}", status_code=204)
async def unlink_solution_risk(solution_id: str, risk_id: str, db: Connection = Depends(get_connection)):
    ok = await solution_service.unlink_solution_risk(db, solution_id, risk_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Link not found")
    return None
