from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from tpl.db import get_connection
from tpl.models import (
    StepExecution,
    ExecutionCreate,
    ExecutionComplete,
    ExecutionUpdate,
    IncidentCreate,
    IncidentResolve,
    AdhocCreate,
    ExecutionStats,
)
from tpl.services import logging_service

router = APIRouter(tags=["logging"])


@router.get("/projects/{project_id}/executions", response_model=list[StepExecution])
async def list_executions(project_id: str, db: Connection = Depends(get_connection)):
    return await logging_service.list_executions(db, project_id)


@router.get("/projects/{project_id}/executions/current", response_model=StepExecution | None)
async def get_current_execution(project_id: str, db: Connection = Depends(get_connection)):
    return await logging_service.get_current_execution(db, project_id)


@router.post("/projects/{project_id}/executions/start", response_model=StepExecution, status_code=201)
async def start_execution(project_id: str, body: ExecutionCreate, db: Connection = Depends(get_connection)):
    if not body.plan_step_id:
        raise HTTPException(status_code=400, detail="plan_step_id is required")
    return await logging_service.start_execution(
        db, project_id, body.plan_step_id, body.execution_number,
    )


@router.post("/projects/{project_id}/executions/{execution_id}/complete", response_model=StepExecution)
async def complete_execution(
    project_id: str,
    execution_id: str,
    body: ExecutionComplete,
    db: Connection = Depends(get_connection),
):
    return await logging_service.complete_execution(
        db, project_id, execution_id, body.completion_check, body.notes,
    )


@router.post("/projects/{project_id}/executions/{execution_id}/skip", response_model=StepExecution)
async def skip_execution(
    project_id: str,
    execution_id: str,
    body: ExecutionComplete,
    db: Connection = Depends(get_connection),
):
    return await logging_service.skip_execution(db, project_id, execution_id, body.notes)


@router.post("/projects/{project_id}/executions/incident", response_model=StepExecution, status_code=201)
async def create_incident(project_id: str, body: IncidentCreate, db: Connection = Depends(get_connection)):
    return await logging_service.create_incident(db, project_id, body.plan_step_id, body.notes)


@router.post("/projects/{project_id}/executions/incident/{incident_id}/resolve", response_model=StepExecution)
async def resolve_incident(
    project_id: str,
    incident_id: str,
    body: IncidentResolve,
    db: Connection = Depends(get_connection),
):
    return await logging_service.resolve_incident(
        db, project_id, incident_id, body.reason, body.category, body.notes,
    )


@router.post("/projects/{project_id}/executions/adhoc", response_model=StepExecution, status_code=201)
async def create_adhoc(project_id: str, body: AdhocCreate, db: Connection = Depends(get_connection)):
    return await logging_service.create_adhoc(db, project_id, body.title, body.description, body.notes)


@router.get("/projects/{project_id}/executions/stats", response_model=ExecutionStats)
async def get_execution_stats(project_id: str, db: Connection = Depends(get_connection)):
    return await logging_service.get_execution_stats(db, project_id)
