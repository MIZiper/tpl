"""Client for the external catalog/process system (TC in this release)."""

from __future__ import annotations

from typing import Any, Optional

import httpx

from tpl.config import config


class ExternalError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _headers(token: Optional[str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"} if token else {}


async def _request(method: str, path: str, token: Optional[str], **kwargs: Any) -> Any:
    if config.external_system != "tc":
        raise ExternalError(501, f"Unsupported external system: {config.external_system}")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.request(
                method,
                f"{config.external_system_url.rstrip('/')}{path}",
                headers=_headers(token),
                **kwargs,
            )
    except httpx.HTTPError as exc:
        raise ExternalError(503, f"External system unavailable: {exc}") from exc

    if resp.status_code == 404:
        raise ExternalError(404, "External resource not found")
    if resp.status_code in (401, 403):
        raise ExternalError(resp.status_code, "External system rejected the request")
    if resp.status_code >= 400:
        try:
            detail = resp.json().get("detail", resp.text)
        except ValueError:
            detail = resp.text
        raise ExternalError(502, f"External system error: {detail}")
    if resp.status_code == 204:
        return None
    return resp.json()


def frozen_statuses() -> set[str]:
    return {
        item.strip()
        for item in config.external_frozen_statuses.split(",")
        if item.strip()
    }


def is_frozen(status: str | None) -> bool:
    return bool(status and status in frozen_statuses())


def external_url(external_id: str) -> str:
    return f"{config.external_system_ui_url.rstrip('/')}/items/{external_id}"


def source_url(document_id: str, part: str) -> str:
    suffix = "logging" if part == "log" else "plan"
    return f"{config.public_base_url.rstrip('/')}/documents/{document_id}/{suffix}"


async def get_state(token: Optional[str], external_id: str) -> dict:
    return await _request("GET", f"/api/nodes/{external_id}/state", token)


async def attach_source(
    token: Optional[str], external_id: str, document_id: str, part: str
) -> dict:
    return await _request(
        "PUT",
        f"/api/nodes/{external_id}/source",
        token,
        json={
            "source_system": "tpl",
            "source_id": document_id,
            "source_part": part,
            "source_url": source_url(document_id, part),
            "data_type": "tpl.log" if part == "log" else "tpl.plan",
        },
    )


async def detach_source(token: Optional[str], external_id: str) -> dict:
    return await _request("DELETE", f"/api/nodes/{external_id}/source", token)


async def query_candidates(
    token: Optional[str], part: str, text: str = "", page_size: int = 20
) -> list[dict]:
    content_type = "tpl.log" if part == "log" else "tpl.plan"
    data = await _request(
        "GET",
        "/api/nodes/source-candidates",
        token,
        params={
            "source_system": "tpl",
            "q": text or "",
            "page_size": page_size,
        },
    )
    items = data.get("items", []) if isinstance(data, dict) else []
    # A plan picker must not offer an unlinked log node (and vice versa).
    return [
        item
        for item in items
        if item.get("source_item") or item.get("data_type") == content_type
    ]
