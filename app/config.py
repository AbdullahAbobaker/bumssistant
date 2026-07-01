"""Central config, loaded from environment / .env. Single source of truth."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://bumssistant:devpassword@localhost:5432/bumssistant"

    # Entra ID
    entra_tenant_id: str = ""
    entra_client_id: str = ""
    entra_client_secret: str = ""
    dev_auth_bypass: bool = True
    dev_user_email: str = "dev@bumg.de"
    dev_user_name: str = "Dev User"

    # Langdock
    langdock_api_key: str = ""
    langdock_base_url: str = "https://api.langdock.com"
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536

    # Warm start + environment
    warm_start_scan_mode: str = "mock"     # subjects_only | mock | off
    environment: str = "development"       # development | production

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def effective_scan_mode(self) -> str:
        """HARD DSGVO RULE: real employee data is only ever scanned in production.
        Anywhere else (e.g. a private laptop) the scan is forced to synthetic 'mock'."""
        if not self.is_production and self.warm_start_scan_mode == "subjects_only":
            return "mock"
        return self.warm_start_scan_mode


@lru_cache
def get_settings() -> Settings:
    return Settings()
