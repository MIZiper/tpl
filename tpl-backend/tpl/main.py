from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from tpl.db import close_pool, get_pool
from tpl.routers import projects, risks, solutions, plan, logging, sync


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    yield
    await close_pool()


app = FastAPI(title="TPL", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex="http://localhost:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(risks.router, prefix="/api")
app.include_router(solutions.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(plan.router, prefix="/api")
app.include_router(logging.router, prefix="/api")
app.include_router(sync.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
