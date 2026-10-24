import os
from dataclasses import dataclass


@dataclass
class Config:
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:password@localhost:5432/tpl",
    )
    database_min_connections: int = 2
    database_max_connections: int = 10

    keycloak_url: str = os.getenv("KEYCLOAK_URL", "")
    keycloak_url_public: str = os.getenv("KEYCLOAK_URL_PUBLIC", "")
    keycloak_realm: str = os.getenv("KEYCLOAK_REALM", "")
    keycloak_client_id: str = os.getenv("KEYCLOAK_CLIENT_ID", "")

    external_system: str = os.getenv("EXTERNAL_SYSTEM", "tc")
    external_system_url: str = os.getenv("EXTERNAL_SYSTEM_URL", "http://localhost:8030")
    external_system_ui_url: str = os.getenv("EXTERNAL_SYSTEM_UI_URL", "http://localhost:5130")
    external_frozen_statuses: str = os.getenv(
        "EXTERNAL_FROZEN_STATUSES", "pending_review,published,archived"
    )
    public_base_url: str = os.getenv("PUBLIC_BASE_URL", "http://localhost:5137")


config = Config()
