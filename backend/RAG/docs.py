import os
import io
import sys
import logging
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path
import asyncio
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
from uuid import uuid4

# Document processing
import PyPDF2
from docx import Document
import openpyxl
from pptx import Presentation
import pandas as pd
import trafilatura

# LangChain imports
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document as LangChainDocument

# Qdrant imports
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

# Supabase imports
from supabase import create_client, Client

# FastAPI imports
from fastapi import FastAPI, HTTPException, BackgroundTasks, Header

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.append(str(BASE_DIR))

try:
    from analytics import router as analytics_router
except ImportError as analytics_import_error:
    logging.warning(f"Failed to import analytics router: {analytics_import_error}")
    analytics_router = None

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

# Import config (try relative/package/absolute imports to be robust whether run as module or script)
try:
    # Preferred: relative import when running as a package (uvicorn backend.RAG.docs:app)
    from .config import Config
except Exception:
    try:
        # Try package-style import
        from RAG.config import Config
    except Exception:
        # Fallback: add current directory to sys.path and import by module name
        current_dir = Path(__file__).resolve().parent
        if str(current_dir) not in sys.path:
            sys.path.insert(0, str(current_dir))
        from config import Config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Initialize clients using config
supabase: Client = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)
# Initialize Qdrant client with optional API key (for Qdrant Cloud or secured instances)
try:
    qdrant_client = QdrantClient(url=Config.QDRANT_URL, api_key=getattr(Config, "QDRANT_API_KEY", None))
except Exception:
    # Fallback to basic initialization if something unexpected happens
    qdrant_client = QdrantClient(url=Config.QDRANT_URL)
embeddings = OpenAIEmbeddings(
    openai_api_key=Config.OPENAI_API_KEY, model="text-embedding-3-large"
)

# Collection name for Qdrant
COLLECTION_NAME = Config.COLLECTION_NAME
URL_ACTIVITY_TABLE = "url_ingestion_activity"

WIDGET_SCRIPT_BASE_URL = os.getenv("WIDGET_SCRIPT_BASE_URL", "http://localhost:8000")
FRONTEND_WIDGET_SCRIPT = os.getenv("FRONTEND_WIDGET_SCRIPT", "/widget.js")


class DocumentProcessor:
    """Handles document processing pipeline"""

    def __init__(self):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=Config.CHUNK_SIZE,
            chunk_overlap=Config.CHUNK_OVERLAP,
            length_function=len,
        )

    def extract_text_from_file(self, file_content: bytes, file_name: str) -> str:
        """Extract text from various file formats"""
        file_extension = Path(file_name).suffix.lower()

        try:
            if file_extension == ".pdf":
                return self._extract_from_pdf(file_content)
            elif file_extension == ".docx":
                return self._extract_from_docx(file_content)
            elif file_extension == ".xlsx":
                return self._extract_from_xlsx(file_content)
            elif file_extension == ".txt":
                return file_content.decode("utf-8")

            else:
                logger.warning(f"Unsupported file format: {file_extension}")
                return ""
        except Exception as e:
            logger.error(f"Error extracting text from {file_name}: {str(e)}")
            return ""

    def _extract_from_pdf(self, file_content: bytes) -> str:
        """Extract text from PDF"""
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"
        return text

    def _extract_from_docx(self, file_content: bytes) -> str:
        """Extract text from DOCX"""
        doc = Document(io.BytesIO(file_content))
        text = ""
        for paragraph in doc.paragraphs:
            text += paragraph.text + "\n"
        return text

    def _extract_from_xlsx(self, file_content: bytes) -> str:
        """Extract text from XLSX"""
        workbook = openpyxl.load_workbook(io.BytesIO(file_content))
        text = ""
        for sheet_name in workbook.sheetnames:
            sheet = workbook[sheet_name]
            for row in sheet.iter_rows(values_only=True):
                text += " ".join(str(cell) for cell in row if cell) + "\n"
        return text

    def _extract_from_url(self, url: str) -> str:
        """Extract text from URL"""
        downloaded = trafilatura.fetch_url(url)
        extracted_text = trafilatura.extract(downloaded)
        return extracted_text

    def chunk_text(
        self, text: str, metadata: Dict[str, Any]
    ) -> List[LangChainDocument]:
        """Split text into chunks"""
        if not text.strip():
            return []

        # Create LangChain document
        doc = LangChainDocument(page_content=text, metadata=metadata)

        # Split into chunks
        chunks = self.text_splitter.split_documents([doc])
        return chunks

    async def generate_embeddings(
        self, chunks: List[LangChainDocument]
    ) -> List[List[float]]:
        """Generate embeddings for text chunks"""
        if not chunks:
            return []

        texts = [chunk.page_content for chunk in chunks]
        embeddings_list = await embeddings.aembed_documents(texts)
        return embeddings_list

    async def store_in_qdrant(
        self,
        chunks: List[LangChainDocument],
        embeddings_list: List[List[float]],
        document_id: str,
    ):
        """Store chunks and embeddings in Qdrant"""
        if not chunks or not embeddings_list:
            return

        # Ensure collection exists
        try:
            qdrant_client.get_collection(COLLECTION_NAME)
        except:
            qdrant_client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
            )

        # Generate valid UUIDs for point IDs
        import uuid

        # Prepare points for Qdrant
        points = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings_list)):
            # Generate a valid UUID for each point
            point_id = str(uuid.uuid4())

            point = PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "text": chunk.page_content,
                    "metadata": chunk.metadata,
                    "document_id": document_id,
                    "chunk_index": i,
                    "created_at": datetime.now().isoformat(),
                },
            )
            points.append(point)

        # Insert points into Qdrant
        qdrant_client.upsert(collection_name=COLLECTION_NAME, points=points)

        logger.info(f"Stored {len(points)} chunks for document {document_id}")


class IngestionPipeline:
    """Main ingestion pipeline"""

    def __init__(self):
        self.processor = DocumentProcessor()

    async def _record_url_activity(self, payload: Dict[str, Any]) -> None:
        logger.info("Persisting URL activity %s", payload.get("id"))
        if not payload.get("url"):
            raise ValueError("URL is required for activity records")
        try:
            supabase.table(URL_ACTIVITY_TABLE).upsert(
                payload, on_conflict="id"
            ).execute()
        except Exception as exc:
            logger.error("Failed to persist URL activity: %s", exc)
            raise

    async def _record_url_activity_start(
        self,
        request_id: str,
        url: str,
        site_id: str | None = None,
        user_id: str | None = None,
        metadata: Dict[str, Any] | None = None,
    ):
        payload = {
            "id": request_id,
            "url": url,
            "status": "processing",
            "started_at": datetime.now(timezone.utc).isoformat(),
        }

        if site_id is not None:
            payload["site_id"] = site_id
        if user_id is not None:
            payload["user_id"] = user_id

        if metadata is not None:
            payload["metadata"] = metadata
        await self._record_url_activity(payload)

    async def _record_url_activity_result(
        self,
        request_id: str,
        status: str,
        *,
        url: str,
        chunks_created: int | None = None,
        error: str | None = None,
        metadata: Dict[str, Any] | None = None,
        site_id: str | None = None,
        user_id: str | None = None,
    ):
        payload = {
            "id": request_id,
            "url": url,
            "status": status,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
        if chunks_created is not None:
            payload["chunks_created"] = chunks_created

        if error is not None:
            payload["error"] = error[:500]

        if metadata is not None:
            payload["metadata"] = metadata

        if site_id is not None:
            payload["site_id"] = site_id

        if user_id is not None:
            payload["user_id"] = user_id

        await self._record_url_activity(payload)

    async def process_document_from_url(
        self, url: str, user_id: str | None = None, site_id: str | None = None
    ) -> Dict[str, Any]:
        """Process content fetched directly from a URL"""
        try:
            logger.info(f"🌐 Processing URL: {url}")

            text = self.processor._extract_from_url(url)
            if not text or not text.strip():
                raise Exception("No text extracted from URL")

            metadata = {
                "source": "url",
                "url": url,
                "processed_at": datetime.now().isoformat(),
                "text_length": len(text),
            }

            if user_id is not None:
                metadata["user_id"] = user_id
            if site_id is not None:
                metadata["site_id"] = site_id

            chunks = self.processor.chunk_text(text, metadata)
            logger.info(f"📦 Created {len(chunks)} chunks from URL")

            for chunk in chunks:
                chunk.metadata["chunk_count"] = len(chunks)

            embeddings_list = await self.processor.generate_embeddings(chunks)
            logger.info(f"✅ Generated {len(embeddings_list)} embeddings")

            parsed_url = urlparse(url)
            path_part = parsed_url.path.replace("/", "_") or "root"
            document_id = f"url_{parsed_url.netloc}_{path_part}"

            await self.processor.store_in_qdrant(chunks, embeddings_list, document_id)

            logger.info(f"🎉 Successfully processed URL: {url}")
            return {
                "status": "success",
                "document_id": document_id,
                "chunks_created": len(chunks),
                "text_length": len(text),
                "url": url,
            }

        except Exception as e:
            logger.error(f"❌ Error processing URL {url}: {str(e)}")
            return {"status": "error", "error": str(e)}

    async def process_document_by_path(self, file_path: str) -> Dict[str, Any]:
        """Process a document by its exact path in Supabase storage"""
        try:
            logger.info(f"🚀 Processing document: {file_path}")

            # Download file from Supabase
            response = supabase.storage.from_("Docs").download(file_path)
            if not response:
                raise Exception(f"Failed to download file: {file_path}")

            # Extract filename from path
            file_name = file_path.split("/")[-1] if "/" in file_path else file_path
            logger.info(f"📁 Processing file: {file_name}")

            # Extract text
            text = self.processor.extract_text_from_file(response, file_name)
            if not text.strip():
                raise Exception("No text extracted from document")

            logger.info(f"📄 Extracted {len(text)} characters")

            # Create metadata
            metadata = {
                "source": "file",
                "file_name": file_name,
                "file_path": file_path,
                "processed_at": datetime.now().isoformat(),
                "text_length": len(text),
            }

            # Chunk text
            chunks = self.processor.chunk_text(text, metadata)
            logger.info(f"📦 Created {len(chunks)} chunks")

            for chunk in chunks:
                chunk.metadata["chunk_count"] = len(chunks)

            # Generate embeddings
            logger.info(f"🧠 Generating embeddings...")
            embeddings_list = await self.processor.generate_embeddings(chunks)
            logger.info(f"✅ Generated {len(embeddings_list)} embeddings")

            # Store in Qdrant
            document_id = file_path.replace("/", "_").replace("-", "_")
            logger.info(f"💾 Storing in Qdrant...")
            await self.processor.store_in_qdrant(chunks, embeddings_list, document_id)

            logger.info(f"🎉 Successfully processed {file_name}")
            return {
                "status": "success",
                "document_id": document_id,
                "chunks_created": len(chunks),
                "text_length": len(text),
                "file_name": file_name,
            }

        except Exception as e:
            logger.error(f"❌ Error processing {file_path}: {str(e)}")
            return {"status": "error", "error": str(e)}

    async def is_document_processed(self, file_path: str) -> bool:
        """Check if a document has already been processed"""
        try:
            # Check if any chunks exist for this document in Qdrant
            document_id = file_path.replace("/", "_").replace("-", "_")

            # Search for existing chunks with this document_id
            search_result = qdrant_client.scroll(
                collection_name=COLLECTION_NAME,
                scroll_filter={
                    "must": [{"key": "document_id", "match": {"value": document_id}}]
                },
                limit=1,
            )

            return len(search_result[0]) > 0

        except Exception as e:
            logger.warning(f"Could not check if document is processed: {e}")
            return False

    async def process_all_documents(
        self, force_reprocess: bool = False, user_id: str | None = None
    ) -> Dict[str, Any]:
        """Process documents in the bucket. If user_id is provided, only process files in that user's folder.
        Skips already processed ones when force_reprocess is False.
        """
        try:
            logger.info("🔄 Starting batch processing of all documents")

            # Determine the path to list. If user_id is provided, list inside that user's folder.
            list_path = user_id or ""

            # Get all files from Supabase under list_path
            all_files = supabase.storage.from_("Docs").list(list_path)

            # Supabase may return folder entries (directories) as list items without an 'id'.
            # Also Supabase may include a placeholder file named '.emptyFolderPlaceholder' when a folder
            # is empty — skip those as they are not real documents.
            file_items = [
                f
                for f in (all_files or [])
                if f.get("id") and not (f.get("name") or "").endswith(".emptyFolderPlaceholder")
            ]
            logger.info(
                f"📋 Found {len(all_files or [])} items at '{list_path}', {len(file_items)} files to process (placeholders skipped)"
            )

            results = []
            skipped = 0

            for file_info in file_items:
                # file_info['name'] may be returned as a basename when listing a folder.
                # Ensure we construct the full path relative to the bucket. If we listed a user folder
                # (list_path != ""), prefix the filename with the folder name when needed.
                raw_name = file_info.get("name") or ""
                if list_path:
                    if raw_name.startswith(list_path + "/") or raw_name == list_path:
                        file_path = raw_name
                    else:
                        file_path = f"{list_path.rstrip('/')}/{raw_name.lstrip('/')}"
                else:
                    file_path = raw_name

                # Check if already processed (unless force reprocess)
                if not force_reprocess and await self.is_document_processed(file_path):
                    logger.info(f"⏭️ Skipping already processed: {file_path}")
                    skipped += 1
                    results.append(
                        {
                            "file_path": file_path,
                            "result": {
                                "status": "skipped",
                                "message": "Already processed",
                            },
                        }
                    )
                    continue

                logger.info(f"🔄 Processing: {file_path}")
                result = await self.process_document_by_path(file_path)
                results.append({"file_path": file_path, "result": result})

                # Small delay to avoid overwhelming the system
                await asyncio.sleep(1)

            successful = sum(1 for r in results if r["result"]["status"] == "success")
            failed = sum(1 for r in results if r["result"]["status"] == "error")

            logger.info(
                f"✅ Batch processing complete: {successful} successful, {failed} failed, {skipped} skipped"
            )

            return {
                "status": "completed",
                "total_files": len(results),
                "successful": successful,
                "failed": failed,
                "skipped": skipped,
                "results": results,
            }

        except Exception as e:
            logger.error(f"❌ Batch processing error: {str(e)}")
            return {"status": "error", "error": str(e)}

    def _update_processing_status(
        self, file_path: str, status: str, chunks_count: int = 0, error: str = None
    ):
        """Update processing status in Supabase"""
        try:
            # You can create a table to track processing status
            # For now, we'll just log it
            logger.info(f"Processing status for {file_path}: {status}")
            if error:
                logger.error(f"Error details: {error}")
        except Exception as e:
            logger.error(f"Failed to update processing status: {str(e)}")

    async def retrieve(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        if not query.strip():
            return []

        query_embedding = await embeddings.aembed_query(query)
        search_results = qdrant_client.search(
            collection_name=COLLECTION_NAME,
            query_vector=query_embedding,
            limit=top_k,
        )

        documents = []
        for result in search_results:
            payload = result.payload or {}
            documents.append(
                {
                    "text": payload.get("text", ""),
                    "metadata": payload.get("metadata", {}),
                    "score": result.score,
                }
            )
        return documents

    async def generate_answer(
        self,
        query: str,
        context_docs: List[Dict[str, Any]],
        temperature: float = 0.2,
    ) -> str:
        if not context_docs:
            return "I couldn't find relevant information in the knowledge base."

        context_text = "\n\n".join(doc.get("text", "") for doc in context_docs)

        prompt = (
            "You are a helpful assistant that answers questions using the provided context. "
            "If the context does not contain the answer, say that you don't have enough information.\n\n"
            "Context:\n"
            f"{context_text}\n\n"
            "Question:\n"
            f"{query}\n\n"
            "Answer:"
        )

        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=Config.OPENAI_API_KEY)
        completion = await client.responses.create(
            model="gpt-4o-mini",
            input=prompt,
            temperature=temperature,
        )

        answer = completion.output_text.strip()
        return answer


# Initialize pipeline
pipeline = IngestionPipeline()

# FastAPI app
app = FastAPI(title="Document Ingestion Pipeline")

if analytics_router:
    logger.info("Analytics routes enabled")
    app.include_router(analytics_router)
else:
    logger.warning("Analytics routes disabled (module not available)")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5500",
    ],  # Add your frontend URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IngestionSource(BaseModel):
    type: str
    file_path: str | None = None
    file_name: str | None = None
    url: str | None = None


class ProcessDocumentRequest(BaseModel):
    file_path: str


class UrlIngestionRequest(BaseModel):
    url: str
    request_id: str
    metadata: Dict[str, Any] | None = None


class WidgetTokenRequest(BaseModel):
    site_id: str
    expires_in: int | None = 3600


class WidgetChatRequest(BaseModel):
    query: str
    history: List[Dict[str, Any]] | None = None
    top_k: int | None = 5
    temperature: float | None = 0.2
    conversation_id: str | None = None


from typing import Optional


def _extract_user_id_from_auth(authorization: str | None) -> str:
    try:
        if not authorization or not authorization.startswith("Bearer "):
            return "anonymous"
        token = authorization.split(" ", 1)[1]
        import jwt  # type: ignore

        decoded = jwt.decode(token, options={"verify_signature": False})
        user_id = decoded.get("sub") or decoded.get("user_id") or decoded.get("id")
        return str(user_id) if user_id else "anonymous"
    except Exception as exc:
        logger.warning(f"Failed to extract user id from auth: {exc}")
        return "anonymous"


def _record_chat_turn(
    *,
    site_id: str,
    conversation_id: str,
    user_message: str,
    assistant_message: str | None,
    status: str,
    metadata: Dict[str, Any] | None = None,
) -> Optional[str]:
    try:
        payload = {
            "conversation_id": conversation_id,
            "site_id": site_id,
            "user_message": user_message,
            "assistant_message": assistant_message,
            "status": status,
            "metadata": metadata or {},
        }
        response = supabase.table("chat_turns").insert(payload).execute()
        if response.data:
            return response.data[0].get("id")
        return None
    except Exception as exc:
        logger.warning("Failed to record chat turn: %s", exc, exc_info=True)
        return None


@app.post("/process-document")
async def process_document_endpoint(
    request: ProcessDocumentRequest, background_tasks: BackgroundTasks
):
    """Endpoint to process a document"""
    background_tasks.add_task(
        pipeline.process_document_by_path,
        request.file_path,
    )
    return {"message": "Document processing started"}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.post("/process-all")
async def process_all_documents(force_reprocess: bool = False):
    """Process all documents in the bucket - Simple and reliable"""
    try:
        result = await pipeline.process_all_documents(force_reprocess=force_reprocess)
        return result
    except Exception as e:
        logger.error(f"Batch processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process-new-only")
async def process_new_documents(authorization: str = Header(None)):
    """Process only new documents for the authenticated user (skip already processed ones)"""
    try:
        # Require authorization to ensure we only process files for the requesting user
        user_id = _extract_user_id_from_auth(authorization)
        if not authorization or not user_id or user_id == "anonymous":
            raise HTTPException(status_code=401, detail="Missing or invalid authorization token")

        result = await pipeline.process_all_documents(force_reprocess=False, user_id=user_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"New documents processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process-specific")
async def process_specific_document(request: ProcessDocumentRequest):
    """Process a specific document by its exact path"""
    try:
        result = await pipeline.process_document_by_path(request.file_path)
        return result
    except Exception as e:
        logger.error(f"Specific processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process-url")
async def process_url_endpoint(
    request: UrlIngestionRequest, authorization: str = Header(None)
):
    """Process content scraped from a URL and record activity"""
    # Extract user_id from Supabase JWT token
    user_id = _extract_user_id_from_auth(authorization)

    await pipeline._record_url_activity_start(
        request.request_id,
        request.url,
        site_id=user_id,
        user_id=user_id,
        metadata=request.metadata,
    )
    result = await pipeline.process_document_from_url(request.url, user_id)
    if result.get("status") == "error":
        await pipeline._record_url_activity_result(
            request.request_id,
            "error",
            url=request.url,
            site_id=user_id,
            user_id=user_id,
            error=result.get("error"),
            metadata=request.metadata,
        )
        raise HTTPException(status_code=400, detail=result.get("error"))

    await pipeline._record_url_activity_result(
        request.request_id,
        "success",
        url=request.url,
        site_id=user_id,
        user_id=user_id,
        chunks_created=result.get("chunks_created"),
        metadata=request.metadata,
    )
    return result


@app.post("/widget/token")
async def create_widget_token(request: WidgetTokenRequest):
    try:
        import jwt

        expires_in = request.expires_in or 3600
        issued_at = datetime.now(timezone.utc)
        expiry = issued_at + timedelta(seconds=expires_in)

        payload = {
            "site_id": request.site_id,
            "iat": int(issued_at.timestamp()),
            "exp": int(expiry.timestamp()),
        }

        token = jwt.encode(payload, Config.EMBED_SECRET, algorithm="HS256")
        return {"token": token, "expires_at": expiry.isoformat()}
    except Exception as e:
        logger.error(f"Failed to create widget token: {e}")
        raise HTTPException(status_code=500, detail="Could not generate widget token")


@app.post("/widget/chat")
async def widget_chat(request: WidgetChatRequest, authorization: str = Header(None)):
    try:
        import jwt

        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing authorization token")

        token = authorization.split(" ", 1)[1]
        try:
            decoded = jwt.decode(token, Config.EMBED_SECRET, algorithms=["HS256"])
        except jwt.PyJWTError as exc:  # type: ignore
            logger.error(f"Invalid widget token: {exc}")
            raise HTTPException(status_code=401, detail="Invalid authorization token")

        site_id = decoded.get("site_id")
        if not site_id:
            raise HTTPException(status_code=400, detail="Token missing site id")

        conversation_id = request.conversation_id or decoded.get("conversation_id")
        new_conversation = False
        if not conversation_id:
            conversation_id = str(uuid4())
            new_conversation = True

        started_at = datetime.now(timezone.utc)

        documents = await pipeline.retrieve(request.query, top_k=request.top_k or 5)
        answer = await pipeline.generate_answer(
            request.query,
            documents,
            temperature=request.temperature or 0.2,
        )

        elapsed_ms = int(
            (datetime.now(timezone.utc) - started_at).total_seconds() * 1000
        )

        document_refs = [
            {
                "metadata": doc.get("metadata", {}),
                "score": doc.get("score"),
            }
            for doc in documents
        ]

        status = "resolved" if answer else "gap"

        turn_id = None
        if conversation_id:
            turn_id = _record_chat_turn(
                site_id=site_id,
                conversation_id=conversation_id,
                user_message=request.query,
                assistant_message=answer,
                status=status,
                metadata={
                    "documents": document_refs,
                    "latency_ms": elapsed_ms,
                    "model": "gpt-4o-mini",
                },
            )

        return {
            "answer": answer,
            "documents": documents,
            "conversation_id": conversation_id,
            "new_conversation": new_conversation,
            "turn_id": turn_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Widget chat error: {e}")
        raise HTTPException(status_code=500, detail="Chat service unavailable")


@app.get("/list-documents")
async def list_documents():
    """List all documents in the Docs bucket"""
    try:
        response = supabase.storage.from_("Docs").list("")
        logger.info(f"📋 Listed {len(response)} documents")
        return {"documents": response}
    except Exception as e:
        logger.error(f"Error listing documents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/url-activities")
async def list_url_activities(limit: int = 20, authorization: str = Header(None)):
    """Fetch recent URL ingestion activity logs"""
    try:
        # Extract user id from Authorization header and only return that user's activities
        user_id = _extract_user_id_from_auth(authorization)

        # Diagnostic logging to help debug why users may see no activities
        logger.info("/url-activities requested by user_id=%s", user_id)

        # Fetch recent activities and filter in Python to avoid DB JSON filtering quirks
        response = (
            supabase.table(URL_ACTIVITY_TABLE)
            .select("*")
            .order("started_at", desc=True)
            .limit(limit)
            .execute()
        )

        activities = response.data if response and hasattr(response, "data") else []
        logger.info("/url-activities fetched %d activities (before filtering)", len(activities))
        try:
            logger.info("/url-activities sample metadata: %s", [a.get("metadata") for a in activities[:3]])
        except Exception:
            pass

        def _belongs_to_user(activity: dict, uid: str) -> bool:
            # Check top-level fields first
            if not activity:
                return False
            if activity.get("user_id") == uid or activity.get("site_id") == uid:
                return True

            # Check metadata (may be None or json)
            meta = activity.get("metadata") or {}
            try:
                if isinstance(meta, str):
                    import json

                    meta = json.loads(meta)
            except Exception:
                meta = {}

            if isinstance(meta, dict):
                if str(meta.get("user_id")) == str(uid) or str(meta.get("site_id")) == str(uid):
                    return True

            return False

        filtered = [a for a in activities if _belongs_to_user(a, user_id)]
        return {"activities": filtered}
    except Exception as e:
        logger.error(f"Error fetching URL activities: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/widget.js")
async def widget_script():
    script = f"""
    (function() {{
      const config = window.supportBotConfig || {{}};
      const SITE_ID = config.siteId || 'default';
      const API_BASE = config.apiBase || '{WIDGET_SCRIPT_BASE_URL}';
      const WIDGET_ID = 'supportbot-widget-container';

      if (document.getElementById(WIDGET_ID)) {{
        return;
      }}

      const styles = document.createElement('style');
      styles.textContent = `
        .supportbot-widget-bubble {{
          position: fixed;
          bottom: 24px;
          z-index: 9998;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 40px rgba(15,23,42,0.18);
          cursor: pointer;
          transition: transform 0.2s ease;
        }}

        .supportbot-widget-bubble:hover {{
          transform: translateY(-3px);
        }}

        .supportbot-chat-window {{
          position: fixed;
          bottom: 90px;
          width: 360px;
          height: 520px;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(15,23,42,0.25);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          z-index: 9999;
        }}
      `;
      document.head.appendChild(styles);

      const container = document.createElement('div');
      container.id = WIDGET_ID;
      document.body.appendChild(container);

      const state = {{
        open: false,
        messages: [],
        loading: false,
        conversationId: null,
        feedbackByTurn: {{}},
      }};

      function render() {{
        const primaryColor = config.primaryColor || '#3B82F6';
        const backgroundColor = config.backgroundColor || '#FFFFFF';
        const position = config.position === 'bottom-left' ? 'left' : 'right';
        const welcomeMessage = config.welcomeMessage || 'Hi there! How can I help you?';
        const placeholder = config.placeholder || 'Type your message...';
        const showBranding = config.showBranding !== false;

        const bubble = document.createElement('div');
        bubble.className = 'supportbot-widget-bubble';
        bubble.style.background = primaryColor;
        bubble.style[position] = '24px';
        bubble.textContent = '💬';
        bubble.onclick = () => toggle(true);

        const windowEl = document.createElement('div');
        windowEl.className = 'supportbot-chat-window';
        windowEl.style[position] = '24px';
        windowEl.style.display = state.open ? 'flex' : 'none';

        windowEl.innerHTML = `
          <div style="background:${{config.primaryColor || '#3B82F6'}};color:${{config.backgroundColor || '#FFFFFF'}};padding:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong>Support</strong>
              <button aria-label="Close chat" style="background:none;border:none;color:${{config.backgroundColor || '#FFFFFF'}};font-size:20px;cursor:pointer;">×</button>
            </div>
            <p style="margin-top:8px;font-size:13px;opacity:0.8;">We're here to help</p>
          </div>
          <div class="supportbot-messages" style="flex:1;padding:16px;overflow-y:auto;background:${{config.backgroundColor || '#FFFFFF'}};"></div>
          <div class="supportbot-input" style="padding:16px;border-top:1px solid #e2e8f0;background:${{config.backgroundColor || '#FFFFFF'}};">
            <form style="display:flex;gap:8px;">
              <input type="text" placeholder="${{config.placeholder || 'Type your message...'}}" style="flex:1;padding:10px 12px;border:1px solid #cbd5f5;border-radius:8px;" />
              <button type="submit" style="background:${{config.primaryColor || '#3B82F6'}};color:${{config.backgroundColor || '#FFFFFF'}};border:none;border-radius:8px;padding:0 14px;cursor:pointer;">Send</button>
            </form>
          </div>
        `;
        if (showBranding) {{
          const inputSection = windowEl.querySelector('.supportbot-input');
          if (inputSection) {{
            inputSection.insertAdjacentHTML(
              'beforeend',
              '<p style="margin-top:8px;text-align:center;font-size:11px;color:#94a3b8;">Powered by SupportBot</p>'
            );
          }}
        }}

        const closeButton = windowEl.querySelector('button');
        if (closeButton) {{
          closeButton.addEventListener('click', () => toggle(false));
        }}

        const form = windowEl.querySelector('form');
        const input = windowEl.querySelector('input');
        const messagesContainer = windowEl.querySelector('.supportbot-messages');

        if (state.messages.length === 0) {{
          state.messages.push({{ id: 'welcome', role: 'assistant', content: welcomeMessage }});
        }}

        if (messagesContainer) {{
          messagesContainer.innerHTML = '';
          state.messages.forEach((msg) => {{
            const bubble = document.createElement('div');
            bubble.style.marginBottom = '12px';
            bubble.style.display = 'flex';
            bubble.style.justifyContent = msg.role === 'assistant' ? 'flex-start' : 'flex-end';

            const bubbleInner = document.createElement('div');
            bubbleInner.style.maxWidth = '80%';
            bubbleInner.style.padding = '12px';
            bubbleInner.style.borderRadius = '14px';
            bubbleInner.style.background = msg.role === 'assistant' ? primaryColor + '15' : primaryColor;
            bubbleInner.style.color = msg.role === 'assistant' ? '#0f172a' : backgroundColor;
            bubbleInner.style.fontSize = '14px';
            bubbleInner.textContent = msg.content;

            if (msg.role === 'assistant' && msg.turnId) {{
              const feedbackRow = document.createElement('div');
              feedbackRow.style.marginTop = '8px';
              feedbackRow.style.display = 'flex';
              feedbackRow.style.gap = '8px';

              const makeButton = (label, sentiment, activeColor) => {{
                const button = document.createElement('button');
                button.type = 'button';
                button.style.display = 'inline-flex';
                button.style.alignItems = 'center';
                button.style.gap = '4px';
                button.style.fontSize = '12px';
                button.style.border = 'none';
                button.style.background = 'transparent';
                button.style.cursor = 'pointer';
                button.style.color = state.feedbackByTurn[msg.turnId] === sentiment ? activeColor : '#64748b';
                button.textContent = label;
                button.onclick = () => submitFeedback(msg.turnId, sentiment);
                return button;
              }};

              feedbackRow.appendChild(makeButton('👍 Helpful', 'positive', primaryColor));
              feedbackRow.appendChild(makeButton('👎 Not helpful', 'negative', '#ef4444'));
              bubbleInner.appendChild(feedbackRow);
            }}

            bubble.appendChild(bubbleInner);
            messagesContainer.appendChild(bubble);
          }});

          if (state.loading) {{
            const thinking = document.createElement('div');
            thinking.style.fontSize = '12px';
            thinking.style.color = '#64748b';
            thinking.textContent = 'Thinking…';
            messagesContainer.appendChild(thinking);
          }}

          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }}

        if (form && input) {{
          form.onsubmit = async (event) => {{
            event.preventDefault();
            const userMessage = input.value.trim();
            if (!userMessage || state.loading) {{
              return;
            }}

            state.messages.push({{ id: 'user-' + Date.now(), role: 'user', content: userMessage }});
            input.value = '';
            state.loading = true;
            rerender();

            try {{
              const tokenResponse = await fetch(API_BASE + '/widget/token', {{
                method: 'POST',
                headers: {{ 'Content-Type': 'application/json' }},
                body: JSON.stringify({{ site_id: SITE_ID }}),
              }});

              if (!tokenResponse.ok) {{
                throw new Error('Token request failed');
              }}

              const {{ token }} = await tokenResponse.json();

              const chatResponse = await fetch(API_BASE + '/widget/chat', {{
                method: 'POST',
                headers: {{
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + token,
                }},
                body: JSON.stringify({{
                  query: userMessage,
                  history: state.messages,
                  top_k: config.topK || 5,
                  temperature: config.temperature || 0.2,
                  conversation_id: state.conversationId,
                }}),
              }});

              if (!chatResponse.ok) {{
                throw new Error('Chat request failed');
              }}

              const data = await chatResponse.json();

              if (data.conversation_id) {{
                state.conversationId = data.conversation_id;
              }}

              const turnId = data.turn_id || 'assistant-' + Date.now();
              state.messages.push({{
                id: turnId,
                role: 'assistant',
                content: data.answer || "I'm sorry, I could not come up with an answer.",
                turnId,
              }});
            }} catch (error) {{
              console.error('Widget error:', error);
              state.messages.push({{
                id: 'error-' + Date.now(),
                role: 'assistant',
                content: 'Something went wrong while fetching the answer. Please try again later.',
              }});
            }} finally {{
              state.loading = false;
              rerender();
            }}
          }};
        }}

        container.innerHTML = '';
        container.appendChild(bubble);
        container.appendChild(windowEl);
      }}

      function rerender() {{
        render();
      }}

      function toggle(open) {{
        state.open = open;
        rerender();
      }}

      async function submitFeedback(turnId, sentiment) {{
        state.feedbackByTurn[turnId] = sentiment;
        rerender();

        try {{
          const tokenResponse = await fetch(API_BASE + '/widget/token', {{
            method: 'POST',
            headers: {{ 'Content-Type': 'application/json' }},
            body: JSON.stringify({{ site_id: SITE_ID }}),
          }});

          if (!tokenResponse.ok) {{
            throw new Error('Feedback token request failed');
          }}

          const {{ token }} = await tokenResponse.json();

          await fetch(API_BASE + '/analytics/feedback', {{
            method: 'POST',
            headers: {{
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token,
            }},
            body: JSON.stringify({{
              site_id: SITE_ID,
              conversation_id: state.conversationId,
              turn_id: turnId,
              sentiment,
              metadata: {{ source: 'widget' }},
            }}),
          }});
        }} catch (error) {{
          console.error('Feedback submission failed:', error);
        }}
      }}

      render();
    }})(); """

    return Response(content=script, media_type="application/javascript")


@app.get("/debug-file/{file_path:path}")
async def debug_file(file_path: str):
    """Debug endpoint to test file download"""
    try:
        logger.info(f"🔍 Debugging file: {file_path}")

        # List all files first
        all_files = supabase.storage.from_("Docs").list("")
        logger.info(f"Available files: {[f['name'] for f in all_files]}")

        # Try to download
        try:
            response = supabase.storage.from_("Docs").download(file_path)
            if response:
                logger.info(f"✅ Successfully downloaded: {file_path}")
                return {
                    "status": "success",
                    "message": f"File {file_path} downloaded successfully",
                    "size": len(response),
                }
            else:
                logger.error(f"❌ Download returned None for: {file_path}")
                return {"status": "error", "message": "Download returned None"}
        except Exception as e:
            logger.error(f"❌ Download failed: {e}")
            return {
                "status": "error",
                "message": str(e),
                "available_files": [f["name"] for f in all_files],
            }

    except Exception as e:
        logger.error(f"Debug error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Webhook handler for Supabase storage events
@app.post("/webhook/storage")
async def storage_webhook(request: dict):
    """Handle Supabase storage webhook events"""
    try:
        logger.info(f"Webhook received: {request}")
        event_type = request.get("type")

        if event_type == "INSERT":
            # New file uploaded
            record = request.get("record", {})
            file_path = record.get("name")
            file_name = record.get("name", "").split("/")[-1]

            if file_path and file_name:
                logger.info(f"🚀 New file uploaded: {file_name}")
                logger.info(f"📁 File path: {file_path}")
                # Process document in background
                asyncio.create_task(pipeline.process_document_by_path(file_path))
            else:
                logger.warning(f"Invalid webhook data: {request}")
        else:
            logger.info(f"Webhook event type: {event_type} (not processing)")

        return {"status": "success"}

    except Exception as e:
        logger.error(f"Webhook error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
