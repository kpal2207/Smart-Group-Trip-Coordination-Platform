from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """
    Application settings loaded from environment variables or .env file.
    Using pydantic-settings for validation and type safety.
    """
    DATABASE_URL: str = "postgresql://tripuser:trippass@localhost:5432/tripmanager"
    SECRET_KEY: str = "supersecretkey" # Replace in production!
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    FRONTEND_URL: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
