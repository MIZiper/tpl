"""Document permissions for TPL.

Role names follow the TC conventions so the same Keycloak realm roles can be
reused across applications. When Keycloak is not configured TPL remains a
local/offline tool and anonymous users have full access.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException, status

from tpl.auth import is_configured

ROLE_CREATE = "nodes:create"
ROLE_EDIT_ANY = "nodes:edit_any"
ROLE_ADMIN = "tap:admin"


def _roles(user: Optional[dict]) -> set[str]:
    return set(user.get("roles", [])) if user else set()


def can_create(user: Optional[dict]) -> bool:
    if not is_configured():
        return True
    if not user or not user.get("sub"):
        return False
    roles = _roles(user)
    return ROLE_CREATE in roles or ROLE_ADMIN in roles


def can_edit(document: Any, user: Optional[dict]) -> bool:
    if not is_configured():
        return True
    if not user or not user.get("sub"):
        return False
    roles = _roles(user)
    if ROLE_ADMIN in roles or ROLE_EDIT_ANY in roles:
        return True
    if not document.creator_sub:
        return True
    return document.creator_sub == user["sub"]


def can_delete(document: Any, user: Optional[dict]) -> bool:
    if not is_configured():
        return True
    if not user or not user.get("sub"):
        return False
    roles = _roles(user)
    if ROLE_ADMIN in roles:
        return True
    if not document.creator_sub:
        return False
    if ROLE_EDIT_ANY in roles:
        return True
    return document.creator_sub == user["sub"]


def ensure_can_create(user: Optional[dict]) -> None:
    if not can_create(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{ROLE_CREATE}' or '{ROLE_ADMIN}' is required to create documents",
        )


def ensure_can_edit(document: Any, user: Optional[dict]) -> None:
    if not can_edit(document, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to edit this document",
        )


def ensure_can_delete(document: Any, user: Optional[dict]) -> None:
    if not can_delete(document, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to delete this document",
        )
