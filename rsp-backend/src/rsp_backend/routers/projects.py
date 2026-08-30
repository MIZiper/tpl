from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from rsp_backend.db import get_connection
from rsp_backend.models import (
    DesignPhase,
    DesignPhaseCreate,
    ProductModel,
    ProductModelCreate,
    ProductModelUpdate,
    Project,
    ProjectCreate,
    ProjectRisk,
    ProjectRiskCreate,
    ProjectRiskUpdate,
    ProjectUpdate,
    ProjectWithDetails,
    Solution,
)
from rsp_backend.services import project_service

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


# --- Project risks ---
@router.post("/projects/{project_id}/risks", response_model=ProjectRisk, status_code=201)
async def add_project_risk(
    project_id: str, body: ProjectRiskCreate, db: Connection = Depends(get_connection),
):
    return await project_service.add_project_risk(db, project_id, body)


@router.put("/projects/{project_id}/risks/{project_risk_id}", response_model=ProjectRisk)
async def update_project_risk(
    project_id: str, project_risk_id: str, body: ProjectRiskUpdate,
    db: Connection = Depends(get_connection),
):
    pr = await project_service.update_project_risk(db, project_risk_id, body)
    if pr is None:
        raise HTTPException(status_code=404, detail="Project risk not found")
    return pr


@router.delete("/projects/{project_id}/risks/{risk_id}", status_code=204)
async def remove_project_risk(
    project_id: str, risk_id: str, db: Connection = Depends(get_connection),
):
    ok = await project_service.remove_project_risk(db, project_id, risk_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Risk not found in project")
    return None


# --- Project solutions ---
@router.get("/projects/{project_id}/solutions", response_model=list[Solution])
async def list_project_solutions(project_id: str, db: Connection = Depends(get_connection)):
    return await project_service.list_solutions_for_project(db, project_id)


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
async def remove_project_solution(
    project_id: str, solution_id: str, db: Connection = Depends(get_connection),
):
    ok = await project_service.remove_project_solution(db, project_id, solution_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Solution not found in project")
    return None


@router.get("/recommendations", response_model=list[Solution])
async def get_recommendations(risk_ids: str, db: Connection = Depends(get_connection)):
    ids = [rid.strip() for rid in risk_ids.split(",") if rid.strip()]
    return await project_service.get_recommendations(db, ids)


# --- Product models ---
@router.get("/projects/{project_id}/models", response_model=list[ProductModel])
async def list_product_models(project_id: str, db: Connection = Depends(get_connection)):
    return await project_service.list_product_models(db, project_id)


@router.post("/projects/{project_id}/models", response_model=ProductModel, status_code=201)
async def create_product_model(
    project_id: str, body: ProductModelCreate, db: Connection = Depends(get_connection),
):
    return await project_service.create_product_model(db, project_id, body)


@router.put("/projects/{project_id}/models/{model_id}", response_model=ProductModel)
async def update_product_model(
    project_id: str, model_id: str, body: ProductModelUpdate,
    db: Connection = Depends(get_connection),
):
    model = await project_service.update_product_model(db, model_id, body)
    if model is None:
        raise HTTPException(status_code=404, detail="Product model not found")
    return model


@router.delete("/projects/{project_id}/models/{model_id}", status_code=204)
async def delete_product_model(
    project_id: str, model_id: str, db: Connection = Depends(get_connection),
):
    ok = await project_service.delete_product_model(db, model_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Product model not found")
    return None


# --- Design phases ---
@router.get("/design-phases", response_model=list[DesignPhase])
async def list_design_phases(db: Connection = Depends(get_connection)):
    return await project_service.list_design_phases(db)


@router.post("/design-phases", response_model=DesignPhase, status_code=201)
async def create_design_phase(body: DesignPhaseCreate, db: Connection = Depends(get_connection)):
    return await project_service.create_design_phase(db, body)
