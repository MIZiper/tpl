from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from asyncpg import Connection

from tpl.auth import get_auth_config, get_current_user
from tpl.db import get_connection
from tpl import external
from tpl.config import config
from tpl.permissions import ensure_can_create, ensure_can_delete, ensure_can_edit
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

VALID_PARTS = {"plan", "log"}


def _token(request: Request) -> str | None:
    value = request.headers.get("Authorization", "")
    if value.lower().startswith("bearer "):
        return value[7:].strip()
    return None


def _parse_part(part: str) -> str:
    if part not in VALID_PARTS:
        raise HTTPException(status_code=404, detail="Part must be 'plan' or 'log'")
    return part


def _link_from_state(state: dict) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "provider": config.external_system,
        "external_id": str(state["id"]),
        "external_url": external.external_url(str(state["id"])),
        "status": state.get("status") or "draft",
        "status_updated_at": state.get("updated_at"),
        "checked_at": now,
        "frozen": (
            bool(state.get("frozen"))
            if "frozen" in state
            else external.is_frozen(state.get("status"))
        ),
    }


def _raise_external(exc: external.ExternalError) -> None:
    if exc.status_code in (401, 403, 404):
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    raise HTTPException(status_code=503, detail=exc.detail)


async def _get_document_or_404(db: Connection, document_id: str) -> Document:
    document = await documents_service.get_document(db, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


async def _assert_part_editable(
    db: Connection, document_id: str, part: str, token: str | None
) -> None:
    link = await documents_service.get_external_link(db, document_id, part)
    if not link:
        return
    try:
        state = await external.get_state(token, link["external_id"])
    except external.ExternalError as exc:
        if exc.status_code == 404:
            raise HTTPException(status_code=409, detail="Linked external node no longer exists")
        raise HTTPException(status_code=503, detail="Cannot verify external resource status")
    if external.is_frozen(state.get("status")):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=(
                f"{part} is read-only while external status is "
                f"'{state.get('status')}'"
            ),
        )


@router.get("/config")
async def auth_config():
    return get_auth_config()


@router.get("/documents", response_model=list[Document])
async def list_documents(db: Connection = Depends(get_connection)):
    return await documents_service.list_documents(db)


@router.post("/documents", response_model=Document, status_code=201)
async def create_document(
    body: DocumentCreate,
    db: Connection = Depends(get_connection),
    user: dict = Depends(get_current_user),
):
    ensure_can_create(user)
    creator_sub = user.get("sub") or None
    return await documents_service.create_document(
        db, body, creator_sub, user.get("name") or None
    )


@router.get("/documents/{document_id}", response_model=Document)
async def get_document(document_id: str, db: Connection = Depends(get_connection)):
    return await _get_document_or_404(db, document_id)


@router.put("/documents/{document_id}", response_model=Document)
async def update_document(
    document_id: str,
    body: DocumentUpdate,
    request: Request,
    db: Connection = Depends(get_connection),
    user: dict = Depends(get_current_user),
):
    document = await _get_document_or_404(db, document_id)
    ensure_can_edit(document, user)
    token = _token(request)
    await _assert_part_editable(db, document_id, "plan", token)
    await _assert_part_editable(db, document_id, "log", token)
    updated = await documents_service.update_document(db, document_id, body)
    if updated is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return updated


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    request: Request,
    db: Connection = Depends(get_connection),
    user: dict = Depends(get_current_user),
):
    document = await _get_document_or_404(db, document_id)
    ensure_can_delete(document, user)
    token = _token(request)
    await _assert_part_editable(db, document_id, "plan", token)
    await _assert_part_editable(db, document_id, "log", token)
    deleted = await documents_service.delete_document(db, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    return None


@router.get("/documents/{document_id}/raw")
async def get_raw_documents(
    document_id: str,
    db: Connection = Depends(get_connection),
    user: dict = Depends(get_current_user),
):
    """Raw (unvalidated) plan_document + execution_document for the admin page."""
    document = await _get_document_or_404(db, document_id)
    ensure_can_edit(document, user)
    data = await documents_service.get_raw_documents(db, document_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return data


@router.get("/documents/{document_id}/plan-document", response_model=PlanDocument)
async def get_plan_document(document_id: str, db: Connection = Depends(get_connection)):
    await _get_document_or_404(db, document_id)
    return await plan_service.get_plan_document(db, document_id)


@router.put("/documents/{document_id}/plan-document", status_code=204)
async def save_plan_document(
    document_id: str,
    body: PlanDocumentUpdate,
    request: Request,
    db: Connection = Depends(get_connection),
    user: dict = Depends(get_current_user),
):
    document = await _get_document_or_404(db, document_id)
    ensure_can_edit(document, user)
    await _assert_part_editable(db, document_id, "plan", _token(request))
    await plan_service.save_plan_document(db, document_id, body.document)
    return None


@router.get("/documents/{document_id}/execution-document", response_model=ExecutionDoc)
async def get_execution_doc(document_id: str, db: Connection = Depends(get_connection)):
    await _get_document_or_404(db, document_id)
    return await execution_service.get_execution_doc(db, document_id)


@router.put("/documents/{document_id}/execution-document", status_code=204)
async def save_execution_doc(
    document_id: str,
    body: ExecutionDocUpdate,
    request: Request,
    db: Connection = Depends(get_connection),
    user: dict = Depends(get_current_user),
):
    document = await _get_document_or_404(db, document_id)
    ensure_can_edit(document, user)
    await _assert_part_editable(db, document_id, "log", _token(request))
    await execution_service.save_execution_doc(db, document_id, body.document)
    return None


@router.post("/documents/{document_id}/execution-document/initialize", response_model=ExecutionDoc)
async def init_execution_doc(
    document_id: str,
    request: Request,
    db: Connection = Depends(get_connection),
    user: dict = Depends(get_current_user),
):
    document = await _get_document_or_404(db, document_id)
    ensure_can_edit(document, user)
    await _assert_part_editable(db, document_id, "log", _token(request))
    return await execution_service.init_execution_doc(db, document_id)


@router.post("/documents/{document_id}/execution-document/adhoc", response_model=ExecutionDoc)
async def add_adhoc(
    document_id: str,
    request: Request,
    body: dict = {},
    db: Connection = Depends(get_connection),
    user: dict = Depends(get_current_user),
):
    document = await _get_document_or_404(db, document_id)
    ensure_can_edit(document, user)
    await _assert_part_editable(db, document_id, "log", _token(request))
    return await execution_service.add_adhoc_entry(
        db, document_id, body.get("title", ""), body.get("notes")
    )


@router.get("/documents/{document_id}/parts/{part}/external-link")
async def get_external_link(
    document_id: str,
    part: str,
    request: Request,
    db: Connection = Depends(get_connection),
):
    part = _parse_part(part)
    await _get_document_or_404(db, document_id)
    link = await documents_service.get_external_link(db, document_id, part)
    if link is None:
        return {"linked": False, "link": None, "reachable": True}
    try:
        state = await external.get_state(_token(request), link["external_id"])
    except external.ExternalError:
        return {"linked": True, "link": link, "reachable": False}
    refreshed = _link_from_state(state)
    return {"linked": True, "link": refreshed, "reachable": True}


@router.get("/documents/{document_id}/parts/{part}/external-link/candidates")
async def external_candidates(
    document_id: str,
    part: str,
    request: Request,
    q: str = Query(""),
    page_size: int = Query(20, ge=1, le=100),
    db: Connection = Depends(get_connection),
    user: dict = Depends(get_current_user),
):
    part = _parse_part(part)
    document = await _get_document_or_404(db, document_id)
    ensure_can_edit(document, user)
    try:
        items = await external.query_candidates(
            _token(request), part, q, page_size
        )
    except external.ExternalError as exc:
        _raise_external(exc)
    return {"items": items}


@router.put("/documents/{document_id}/parts/{part}/external-link")
async def link_external(
    document_id: str,
    part: str,
    body: dict,
    request: Request,
    db: Connection = Depends(get_connection),
    user: dict = Depends(get_current_user),
):
    part = _parse_part(part)
    document = await _get_document_or_404(db, document_id)
    ensure_can_edit(document, user)
    external_id = str(body.get("external_id", "")).strip()
    if not external_id:
        raise HTTPException(status_code=400, detail="external_id is required")

    existing = await documents_service.get_external_link(db, document_id, part)
    if existing and existing.get("external_id") != external_id:
        raise HTTPException(status_code=409, detail="This part is already linked")

    expected_type = "tpl.log" if part == "log" else "tpl.plan"
    token = _token(request)
    try:
        state = await external.get_state(token, external_id)
        if (
            bool(state.get("frozen"))
            if "frozen" in state
            else external.is_frozen(state.get("status"))
        ):
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="External node is frozen and cannot be linked",
            )
        if not (
            state.get("source_item")
            or state.get("data_type") == expected_type
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "External node must be an unlinked Source Item or "
                    f"of type {expected_type}"
                ),
            )
        if state.get("source_system") and not (
            state.get("source_system") == "tpl"
            and state.get("source_id") == document_id
            and state.get("source_part") == part
        ):
            raise HTTPException(
                status_code=409,
                detail="External node is already linked to another resource",
            )
        state = await external.attach_source(token, external_id, document_id, part)
    except external.ExternalError as exc:
        _raise_external(exc)

    link = _link_from_state(state)
    try:
        await documents_service.set_external_link(db, document_id, part, link)
    except Exception:
        try:
            await external.detach_source(token, external_id)
        except external.ExternalError:
            pass
        raise
    return {"linked": True, "link": link}


@router.delete("/documents/{document_id}/parts/{part}/external-link")
async def unlink_external(
    document_id: str,
    part: str,
    request: Request,
    db: Connection = Depends(get_connection),
    user: dict = Depends(get_current_user),
):
    part = _parse_part(part)
    document = await _get_document_or_404(db, document_id)
    ensure_can_edit(document, user)
    link = await documents_service.get_external_link(db, document_id, part)
    if link is None:
        raise HTTPException(status_code=404, detail="This part is not linked")

    token = _token(request)
    try:
        state = await external.get_state(token, link["external_id"])
        if external.is_frozen(state.get("status")):
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=(
                    f"Cannot unlink while external status is "
                    f"'{state.get('status')}'"
                ),
            )
        await external.detach_source(token, link["external_id"])
    except external.ExternalError as exc:
        if exc.status_code != 404:
            _raise_external(exc)

    await documents_service.set_external_link(db, document_id, part, None)
    return {"linked": False, "link": None}
