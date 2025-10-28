from qdrant_client import QdrantClient
from qdrant_client.models import Filter

try:
    # Try relative/package imports first
    try:
        from .config import Config
    except Exception:
        try:
            from RAG.config import Config
        except Exception:
            # fallback: import by module name after adding current dir to sys.path
            from pathlib import Path
            import sys as _sys
            curr = Path(__file__).resolve().parent
            if str(curr) not in _sys.path:
                _sys.path.insert(0, str(curr))
            from config import Config

    client = QdrantClient(url=Config.QDRANT_URL, api_key=getattr(Config, "QDRANT_API_KEY", None))
except Exception:
    # Fallback to local default
    client = QdrantClient(host="localhost", port=6333)

client.delete(
    collection_name="kbk",
    points_selector=Filter(must=[]),  # Empty filter = delete all points
)
