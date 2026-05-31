from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from tpl.db import get_connection
from tpl.models import (
    Project,
    ProjectCreate,
    ProjectUpdate,
    ProjectWithDetails,
    ProjectRisk,
    ProjectRiskCreate,
    Solution,
    LinkRiskRequest,
    PlanDocument,
    PlanDocumentUpdate,
    ExecutionDoc,
    ExecutionDocUpdate,
)
from tpl.services import project_service, plan_service, execution_service

router = APIRouter(tags=["projects"])


@router.get("/projects", response_model=list[Project])
async def list_projects(db: Connection = Depends(get_connection)):
    return await project_service.list_projects(db)


@router.post("/projects", response_model=Project, status_code=201)
async def create_project(body: ProjectCreate, db: Connection = Depends(get_connection)):
    return await project_service.create_project(db, body)


@router.get("/projects/{project_id}", response_model=ProjectWithDetails)
async def get_project(project_id: str, db: Connection = Depends(get_connection)):
    project = await project_service.get_project(db, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/projects/{project_id}", response_model=Project)
async def update_project(project_id: str, body: ProjectUpdate, db: Connection = Depends(get_connection)):
    project = await project_service.update_project(db, project_id, body)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: str, db: Connection = Depends(get_connection)):
    deleted = await project_service.delete_project(db, project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return None


@router.get("/projects/{project_id}/risks", response_model=list[ProjectRisk])
async def list_project_risks(project_id: str, db: Connection = Depends(get_connection)):
    return await project_service.list_project_risks(db, project_id)


@router.post("/projects/{project_id}/risks", response_model=ProjectRisk, status_code=201)
async def add_project_risk(project_id: str, body: ProjectRiskCreate, db: Connection = Depends(get_connection)):
    return await project_service.add_project_risk(db, project_id, body)


@router.delete("/projects/{project_id}/risks/{risk_id}", status_code=204)
async def remove_project_risk(project_id: str, risk_id: str, db: Connection = Depends(get_connection)):
    ok = await project_service.remove_project_risk(db, project_id, risk_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Risk not found in project")
    return None


@router.get("/projects/{project_id}/solutions", response_model=list[Solution])
async def list_project_solutions(project_id: str, db: Connection = Depends(get_connection)):
    return await project_service.list_project_solutions(db, project_id)


@router.post("/projects/{project_id}/solutions", status_code=201)
async def add_project_solution(project_id: str, body: dict, db: Connection = Depends(get_connection)):
    solution_id = body.get("solution_id")
    if not solution_id:
        raise HTTPException(status_code=400, detail="solution_id is required")
    ok = await project_service.add_project_solution(db, project_id, solution_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Failed to add solution")
    return {"status": "added"}


@router.delete("/projects/{project_id}/solutions/{solution_id}", status_code=204)
async def remove_project_solution(project_id: str, solution_id: str, db: Connection = Depends(get_connection)):
    ok = await project_service.remove_project_solution(db, project_id, solution_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Solution not found in project")
    return None


@router.get("/recommendations", response_model=list[Solution])
async def get_recommendations(risk_ids: str, db: Connection = Depends(get_connection)):
    ids = [rid.strip() for rid in risk_ids.split(",") if rid.strip()]
    return await project_service.get_recommendations(db, ids)


@router.get("/projects/{project_id}/plan-document", response_model=PlanDocument)
async def get_plan_document(project_id: str, db: Connection = Depends(get_connection)):
    return await plan_service.get_plan_document(db, project_id)


@router.put("/projects/{project_id}/plan-document", status_code=204)
async def save_plan_document(project_id: str, body: PlanDocumentUpdate, db: Connection = Depends(get_connection)):
    await plan_service.save_plan_document(db, project_id, body.document)
    return None


@router.post("/projects/{project_id}/plan/initialize", response_model=PlanDocument)
async def initialize_plan(project_id: str, db: Connection = Depends(get_connection)):
    return await plan_service.initialize_plan(db, project_id)


@router.get("/projects/{project_id}/execution-document", response_model=ExecutionDoc)
async def get_execution_doc(project_id: str, db: Connection = Depends(get_connection)):
    return await execution_service.get_execution_doc(db, project_id)


@router.put("/projects/{project_id}/execution-document", status_code=204)
async def save_execution_doc(project_id: str, body: ExecutionDocUpdate, db: Connection = Depends(get_connection)):
    await execution_service.save_execution_doc(db, project_id, body.document)
    return None


@router.post("/projects/{project_id}/execution-document/initialize", response_model=ExecutionDoc)
async def init_execution_doc(project_id: str, db: Connection = Depends(get_connection)):
    return await execution_service.init_execution_doc(db, project_id)


@router.post("/projects/{project_id}/execution-document/adhoc", response_model=ExecutionDoc)
async def add_adhoc(project_id: str, body: dict = {}, db: Connection = Depends(get_connection)):
    return await execution_service.add_adhoc_entry(db, project_id, body.get("title", ""), body.get("notes"))
