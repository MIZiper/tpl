from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from rsp_backend.db import get_connection
from rsp_backend.models import (
    AppliedSolution,
    AppliedSolutionCreate,
    AppliedSolutionUpdate,
    AppliedSolutionWithDetails,
    Effectiveness,
    EffectivenessCreate,
    LessonsLearned,
    LessonsLearnedCreate,
    LessonsLearnedUpdate,
)
from rsp_backend.services import fmea_service, project_service

router = APIRouter(tags=["fmea"])


# --- Applied solutions ---
@router.get(
    "/projects/{project_id}/risks/{project_risk_id}/applied-solutions",
    response_model=list[AppliedSolutionWithDetails],
)
async def list_applied_solutions(
    project_id: str, project_risk_id: str, db: Connection = Depends(get_connection),
):
    return await project_service._load_applied_solutions(db, project_risk_id)


@router.post(
    "/projects/{project_id}/risks/{project_risk_id}/applied-solutions",
    response_model=AppliedSolution,
    status_code=201,
)
async def create_applied_solution(
    project_id: str, project_risk_id: str, body: AppliedSolutionCreate,
    db: Connection = Depends(get_connection),
):
    return await fmea_service.create_applied_solution(db, project_risk_id, body)


@router.put("/applied-solutions/{applied_id}", response_model=AppliedSolution)
async def update_applied_solution(
    applied_id: str, body: AppliedSolutionUpdate, db: Connection = Depends(get_connection),
):
    applied = await fmea_service.update_applied_solution(db, applied_id, body)
    if applied is None:
        raise HTTPException(status_code=404, detail="Applied solution not found")
    return applied


@router.delete("/applied-solutions/{applied_id}", status_code=204)
async def delete_applied_solution(applied_id: str, db: Connection = Depends(get_connection)):
    ok = await fmea_service.delete_applied_solution(db, applied_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Applied solution not found")
    return None


# --- Effectiveness ---
@router.post("/applied-solutions/{applied_id}/effectiveness", response_model=Effectiveness, status_code=201)
async def create_effectiveness(
    applied_id: str, body: EffectivenessCreate, db: Connection = Depends(get_connection),
):
    return await fmea_service.create_effectiveness(db, applied_id, body)


# --- Lessons learned ---
@router.get(
    "/projects/{project_id}/risks/{project_risk_id}/lessons",
    response_model=list[LessonsLearned],
)
async def list_lessons(project_id: str, project_risk_id: str, db: Connection = Depends(get_connection)):
    return await fmea_service.list_lessons(db, project_risk_id)


@router.post(
    "/projects/{project_id}/risks/{project_risk_id}/lessons",
    response_model=LessonsLearned,
    status_code=201,
)
async def create_lesson(
    project_id: str, project_risk_id: str, body: LessonsLearnedCreate,
    db: Connection = Depends(get_connection),
):
    return await fmea_service.create_lesson(db, project_risk_id, body)


@router.put("/lessons/{lesson_id}", response_model=LessonsLearned)
async def update_lesson(lesson_id: str, body: LessonsLearnedUpdate, db: Connection = Depends(get_connection)):
    lesson = await fmea_service.update_lesson(db, lesson_id, body)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


@router.delete("/lessons/{lesson_id}", status_code=204)
async def delete_lesson(lesson_id: str, db: Connection = Depends(get_connection)):
    ok = await fmea_service.delete_lesson(db, lesson_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return None
