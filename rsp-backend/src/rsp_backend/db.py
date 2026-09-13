import json
from typing import AsyncIterator

import asyncpg

from rsp_backend.config import config

_pool: asyncpg.Pool | None = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    await conn.set_type_codec(
        "uuid",
        encoder=str,
        decoder=str,
        schema="pg_catalog",
    )
    await conn.set_type_codec(
        "jsonb",
        encoder=str,
        decoder=json.loads,
        schema="pg_catalog",
    )


async def _init_pool() -> asyncpg.Pool:
    return await asyncpg.create_pool(
        dsn=config.database_url,
        min_size=config.database_min_connections,
        max_size=config.database_max_connections,
        init=_init_connection,
    )


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await _init_pool()
    return _pool


async def get_connection() -> AsyncIterator[asyncpg.Connection]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
