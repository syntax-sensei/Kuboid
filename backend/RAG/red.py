from qdrant_client import QdrantClient
from qdrant_client.models import Filter

try:
    # Prefer Config-driven initialization so cloud Qdrant + api key work
    from config import Config
    client = QdrantClient(url=Config.QDRANT_URL, api_key=getattr(Config, "QDRANT_API_KEY", None))
except Exception:
    # Fallback to local default
    client = QdrantClient(host="localhost", port=6333)

client.delete(
    collection_name="kbk",
    points_selector=Filter(must=[]),  # Empty filter = delete all points
)
