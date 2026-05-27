import os
from dataclasses import dataclass


@dataclass
class Config:
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://tpl:tpl@localhost:5432/tpl",
    )
    database_min_connections: int = 2
    database_max_connections: int = 10


config = Config()
