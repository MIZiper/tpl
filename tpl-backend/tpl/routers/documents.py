from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from tpl.db import get_connection
from tpl.models import (
    Document,
    DocumentCreate,
    DocumentUpdate,
    PlanDocument,
    PlanDocumentUpdate,
    ExecutionDoc,
    ExecutionDocUpdate,
)
from tpl.services import documents_service, plan_service, execution_service

router = APIRouter(tags=["documents"])


@router.get("/documents", response_model=list[Document])
async def list_documents(db: Connection = Depends(get_connection)):
    return await documents_service.list_documents(db)


@router.post("/documents", response_model=Document, status_code=201)
async def create_document(body: DocumentCreate, db: Connection = Depends(get_connection)):
    return await documents_service.create_document(db, body)


@router.get("/documents/{document_id}", response_model=Document)
async def get_document(document_id: str, db: Connection = Depends(get_connection)):
    document = await documents_service.get_document(db, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.put("/documents/{document_id}", response_model=Document)
async def update_document(document_id: str, body: DocumentUpdate, db: Connection = Depends(get_connection)):
    document = await documents_service.update_document(db, document_id, body)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(document_id: str, db: Connection = Depends(get_connection)):
    deleted = await documents_service.delete_document(db, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    return None


@router.get("/documents/{document_id}/plan-document", response_model=PlanDocument)
async def get_plan_document(document_id: str, db: Connection = Depends(get_connection)):
    return await plan_service.get_plan_document(db, document_id)


@router.put("/documents/{document_id}/plan-document", status_code=204)
async def save_plan_document(
    document_id: str, body: PlanDocumentUpdate, db: Connection = Depends(get_connection),
):
    await plan_service.save_plan_document(db, document_id, body.document)
    return None


@router.get("/documents/{document_id}/execution-document", response_model=ExecutionDoc)
async def get_execution_doc(document_id: str, db: Connection = Depends(get_connection)):
    return await execution_service.get_execution_doc(db, document_id)


@router.put("/documents/{document_id}/execution-document", status_code=204)
async def save_execution_doc(
    document_id: str, body: ExecutionDocUpdate, db: Connection = Depends(get_connection),
):
    await execution_service.save_execution_doc(db, document_id, body.document)
    return None


@router.post("/documents/{document_id}/execution-document/initialize", response_model=ExecutionDoc)
async def init_execution_doc(document_id: str, db: Connection = Depends(get_connection)):
    return await execution_service.init_execution_doc(db, document_id)


@router.post("/documents/{document_id}/execution-document/adhoc", response_model=ExecutionDoc)
async def add_adhoc(document_id: str, body: dict = {}, db: Connection = Depends(get_connection)):
    return await execution_service.add_adhoc_entry(db, document_id, body.get("title", ""), body.get("notes"))
