from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from tpl.db import get_connection
from tpl.models import (
    PlanTree,
    PlanGroup,
    PlanGroupCreate,
    PlanGroupUpdate,
    PlanStep,
    PlanStepCreate,
    PlanStepUpdate,
    ReorderRequest,
)
from tpl.services import plan_service

router = APIRouter(tags=["plan"])


@router.get("/projects/{project_id}/plan", response_model=PlanTree)
async def get_plan(project_id: str, db: Connection = Depends(get_connection)):
    return await plan_service.get_plan(db, project_id)


@router.post("/projects/{project_id}/plan/groups", response_model=PlanGroup, status_code=201)
async def create_group(project_id: str, body: PlanGroupCreate, db: Connection = Depends(get_connection)):
    return await plan_service.create_group(db, project_id, body)


@router.put("/projects/{project_id}/plan/groups/{group_id}", response_model=PlanGroup)
async def update_group(project_id: str, group_id: str, body: PlanGroupUpdate, db: Connection = Depends(get_connection)):
    group = await plan_service.update_group(db, group_id, body)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


@router.delete("/projects/{project_id}/plan/groups/{group_id}", status_code=204)
async def delete_group(project_id: str, group_id: str, db: Connection = Depends(get_connection)):
    deleted = await plan_service.delete_group(db, group_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Group not found")
    return None


@router.post("/projects/{project_id}/plan/steps", response_model=PlanStep, status_code=201)
async def create_step(project_id: str, body: PlanStepCreate, db: Connection = Depends(get_connection)):
    return await plan_service.create_step(db, project_id, body)


@router.put("/projects/{project_id}/plan/steps/{step_id}", response_model=PlanStep)
async def update_step(project_id: str, step_id: str, body: PlanStepUpdate, db: Connection = Depends(get_connection)):
    step = await plan_service.update_step(db, step_id, body)
    if step is None:
        raise HTTPException(status_code=404, detail="Step not found")
    return step


@router.delete("/projects/{project_id}/plan/steps/{step_id}", status_code=204)
async def delete_step(project_id: str, step_id: str, db: Connection = Depends(get_connection)):
    deleted = await plan_service.delete_step(db, step_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Step not found")
    return None


@router.put("/projects/{project_id}/plan/reorder", status_code=204)
async def reorder_plan(project_id: str, body: ReorderRequest, db: Connection = Depends(get_connection)):
    await plan_service.reorder_plan(db, project_id, body.items)
    return None
