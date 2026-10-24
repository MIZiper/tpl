"""Keycloak JWT authentication for TPL.

Mirrors the shared conventions used by dac_web and TC: one realm/client,
JWKS-based RS256 validation, and roles merged from realm and client roles.
When Keycloak is not configured the API remains usable for local/offline use;
link endpoints will then operate without an identity.
"""

from __future__ import annotations

import time
from typing import Any, Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from tpl.config import config

_CERTS_TTL = 3600.0
_certs_cache: list[dict] = []
_certs_expiry: float = 0.0
security = HTTPBearer(auto_error=False)


def is_configured() -> bool:
    return bool(config.keycloak_url and config.keycloak_realm and config.keycloak_client_id)


def get_auth_config() -> dict:
    return {
        "keycloak_enabled": is_configured(),
        "keycloak_url": config.keycloak_url_public or config.keycloak_url,
        "keycloak_realm": config.keycloak_realm,
        "keycloak_client_id": config.keycloak_client_id,
    }


def _issuer() -> str:
    base = (config.keycloak_url_public or config.keycloak_url).rstrip("/")
    return f"{base}/realms/{config.keycloak_realm}"


async def _fetch_jwks() -> list[dict]:
    global _certs_cache, _certs_expiry
    now = time.time()
    if _certs_cache and now < _certs_expiry:
        return _certs_cache
    url = (
        f"{config.keycloak_url.rstrip('/')}/realms/{config.keycloak_realm}"
        "/protocol/openid-connect/certs"
    )
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()
    _certs_cache = data.get("keys", [])
    _certs_expiry = now + _CERTS_TTL
    return _certs_cache


async def _decode_token(token: str) -> dict[str, Any]:
    if not is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Keycloak is not configured",
        )
    try:
        header = jwt.get_unverified_header(token)
        jwks = await _fetch_jwks()
    except (JWTError, httpx.HTTPError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to verify token",
        ) from exc

    key = next((k for k in jwks if k.get("kid") == header.get("kid")), None)
    if key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Signing key not found",
        )
    try:
        return jwt.decode(
            token,
            key,
            algorithms=[header.get("alg", "RS256")],
            issuer=_issuer(),
            options={"verify_exp": True, "verify_aud": False, "verify_iss": True},
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if not is_configured():
        return {"sub": "", "name": "Anonymous", "roles": []}
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    payload = await _decode_token(credentials.credentials)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing sub claim"
        )

    client_roles = (
        payload.get("resource_access", {})
        .get(config.keycloak_client_id, {})
        .get("roles", [])
    )
    realm_roles = payload.get("realm_access", {}).get("roles", [])
    return {
        "sub": sub,
        "name": payload.get("name") or payload.get("preferred_username") or sub,
        "roles": list({*client_roles, *realm_roles}),
    }


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[dict]:
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
