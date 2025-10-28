from qdrant_client import QdrantClient
from qdrant_client.models import Filter

client = QdrantClient(host="localhost", port=6333)

client.delete(
    collection_name="kbk",
    points_selector=Filter(must=[]),  # Empty filter = delete all points
)
