from typing import Optional

from supabase import Client, create_client

from RAG.config import Config

_supabase: Optional[Client] = None


def get_supabase_client() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)
    return _supabase

