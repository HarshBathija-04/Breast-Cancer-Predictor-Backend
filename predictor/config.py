import os
import re


class Config:
    def __init__(self, env=os.environ):
        self.database_url = env.get("DATABASE_URL", "")
        self.db_schema = env.get("DB_SCHEMA", "breast_cancer")
        # Interpolated into SQL (schema names cannot be bound parameters).
        if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", self.db_schema):
            raise ValueError("DB_SCHEMA must be a lowercase SQL identifier")
        self.frontend_urls = [
            u.strip().rstrip("/")
            for u in env.get("FRONTEND_URL", "http://localhost:5204").split(",")
            if u.strip()
        ]
        self.groq_api_key = env.get("GROQ_API_KEY", "")
        self.groq_model = env.get("GROQ_MODEL", "openai/gpt-oss-120b")
        self.production = env.get("FLASK_ENV", env.get("ENV", "")) == "production"
        self.rate_limit_storage = env.get("RATE_LIMIT_STORAGE_URI", "memory://")
