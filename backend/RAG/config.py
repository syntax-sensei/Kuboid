# config.py
import os
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = BASE_DIR / "client" / ".env"
load_dotenv(ENV_PATH)

class Config:
    # Supabase
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    # Qdrant
    QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
    
    # OpenAI
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

    # Widget
    EMBED_SECRET = os.getenv("EMBED_SECRET")

    # Frontend
    WIDGET_SCRIPT_BASE_URL = os.getenv("WIDGET_SCRIPT_BASE_URL", "http://localhost:8000")
    
    # Processing
    CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1000"))
    CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "200"))
    
    # Collection name
    COLLECTION_NAME = os.getenv("COLLECTION_NAME", "kuboid")
    
    @classmethod
    def validate(cls):
        """Validate that required environment variables are set"""
        required_vars = [
            "SUPABASE_URL",
            "SUPABASE_SERVICE_ROLE_KEY", 
            "OPENAI_API_KEY"
        ]

        if not cls.EMBED_SECRET:
            logger_message = (
                "Warning: EMBED_SECRET not set. Falling back to SUPABASE_SERVICE_ROLE_KEY for widget token signing."
            )
            print(logger_message)
            cls.EMBED_SECRET = cls.SUPABASE_SERVICE_ROLE_KEY
        
        missing_vars = []
        for var in required_vars:
            if not getattr(cls, var):
                missing_vars.append(var)
        
        if missing_vars:
            raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")
        
        return True