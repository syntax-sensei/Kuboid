from __future__ import annotations

from fastapi import APIRouter, HTTPException, Body, Header
from typing import Optional
from uuid import uuid4
from datetime import datetime, timezone
import json

from .models import FeedbackPayload, KnowledgeGapUpdate
import logging
from .service import AnalyticsService
from .dao import AnalyticsDAO
from .agent import AnalyticsAgent, RefreshOptions

router = APIRouter(prefix="/analytics", tags=["analytics"])
service = AnalyticsService()
dao = AnalyticsDAO()
logger = logging.getLogger(__name__)
agent = AnalyticsAgent()


@router.get("/overview")
async def get_analytics_overview(user_id: str | None = None, widget_id: str | None = None, authorization: Optional[str] = Header(None)):
    """Return analytics overview. If `user_id` is provided as a query parameter,
    results will be scoped to that user.
    """
    try:
        # Use the user_id passed in the query. The frontend is responsible for
        # sending the current user's id so the server can filter analytics rows
        # by owner. Do not derive from Authorization here per frontend contract.
        return service.fetch_overview(user_id=user_id, widget_id=widget_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/knowledge-gaps")
async def get_knowledge_gaps(user_id: str | None = None, widget_id: str | None = None, authorization: Optional[str] = Header(None)):
    try:
        # Use user_id passed in query parameters (no server-side auth derivation)
        return service.fetch_knowledge_gaps(user_id=user_id, widget_id=widget_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/run")
async def run_analytics(payload: dict | None = Body(None), site_id: str | None = None, widget_id: str | None = None, lookback_days: int | None = None, user_id: str | None = None, authorization: Optional[str] = Header(None)):
    """Run the analytics agent synchronously. Accepts optional site_id, lookback_days, and user_id to scope the run.

    Note: this runs synchronously and will block until complete. For long-running workloads consider converting
    this to an asynchronous background job or queue.
    """
    try:
        # Accept parameters from JSON body (preferred when POSTed by the frontend)
        if payload:
            site_id = payload.get("site_id", site_id)
            widget_id = payload.get("widget_id", payload.get("widgetId", widget_id))
            lookback_days = payload.get("lookback_days", lookback_days)
            # accept either 'user_id' or 'userId'
            user_id = payload.get("user_id", payload.get("userId", user_id))

        # Accept explicit user_id passed in body/query and pass through to the agent.
        # Frontend must supply the current user's id to scope the run.
        options = RefreshOptions(site_id=site_id, widget_id=widget_id, lookback_days=lookback_days, user_id=user_id)
        # Run agent (synchronous)
        agent.refresh_most_asked_questions(options)

        # Return refreshed overview and gaps so the client can update immediately
        overview = service.fetch_overview(user_id=user_id, widget_id=widget_id)
        gaps = service.fetch_knowledge_gaps(user_id=user_id, widget_id=widget_id)
        return {"status": "completed", "overview": overview, "gaps": gaps}
    except Exception as exc:
        logger.exception("Failed to run analytics agent")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/feedback")
async def post_feedback(payload: FeedbackPayload, authorization: Optional[str] = Header(None)):
    try:
        # Determine the site_id: prefer explicit payload.site_id, otherwise try to
        # resolve it from a provided widget_id (either top-level or inside metadata).
        site_id = getattr(payload, "site_id", None)
        if not site_id:
            widget_id = getattr(payload, "widget_id", None)
            if not widget_id and isinstance(payload.metadata, dict):
                widget_id = payload.metadata.get("widget_id") or payload.metadata.get("widgetId")
            if widget_id:
                try:
                    resp = dao.supabase.table("widgets").select("site_id").eq("id", widget_id).limit(1).execute()
                    widget_row = (resp.data or [None])[0] if resp is not None else None
                    if widget_row and widget_row.get("site_id"):
                        site_id = widget_row.get("site_id")
                except Exception:
                    logger.exception("Failed to lookup widget for feedback: %s", widget_id)

        if not site_id:
            # Match FastAPI/Pydantic behaviour: missing required field -> 422 for the client.
            raise HTTPException(status_code=422, detail="Missing required field: site_id (or provide widget_id that maps to a site)")

        record = {
            "id": str(uuid4()),
            "site_id": site_id,
            "conversation_id": payload.conversation_id,
            "turn_id": payload.turn_id,
            "sentiment": payload.sentiment,
            "notes": payload.notes,
            "metadata": payload.metadata,
        }
        # Attach user_id: prefer payload value, otherwise derive from Authorization
        if getattr(payload, "user_id", None):
            record["user_id"] = payload.user_id
        else:
            # lazy import to avoid circular import at module import time
            from RAG.docs import _extract_user_id_from_auth as _extract_user_id_from_auth_local
            derived = _extract_user_id_from_auth_local(authorization)
            if derived and derived != "anonymous":
                record["user_id"] = derived

        dao.record_feedback(record)
        return {"status": "accepted"}
    except Exception as exc:  # pragma: no cover - supabase errors
        raise HTTPException(status_code=500, detail="Failed to record feedback") from exc


@router.post("/knowledge-gaps/actions")
async def update_knowledge_gap(payload: KnowledgeGapUpdate):
    try:
        now = datetime.now(timezone.utc).isoformat()

        # Try to extract a user_id from the payload metadata if caller provided one.
        user_id = None
        try:
            user_id = (payload.metadata or {}).get("user_id")
            if user_id is None:
                # allow alternative key casing
                user_id = (payload.metadata or {}).get("userId")
        except Exception:
            user_id = None

        # Simple handlers for common actions
        if payload.action == "mark_resolved":
            up = {
                "topic": payload.gap_topic,
                "status": "resolved",
                "resolved_at": now,
                "metadata": payload.metadata or {},
            }
            if user_id:
                up["user_id"] = user_id
            logger.info("Upserting gap: %s", up)
            # Prefer update if a row exists, otherwise insert. Some schemas may require certain columns.
            tbl = dao.supabase.table('knowledge_gaps')
            existing = tbl.select('*').eq('topic', payload.gap_topic)
            if user_id:
                existing = existing.eq('user_id', user_id)
            existing = existing.limit(1).execute()
            existing_row = (existing.data or [None])[0] if existing is not None else None
            if existing_row:
                update_payload = {k: v for k, v in up.items() if k != "topic"}
                logger.info("Updating existing gap (topic=%s) with: %s", payload.gap_topic, update_payload)
                q = tbl.update(update_payload).eq('topic', payload.gap_topic)
                if user_id:
                    q = q.eq('user_id', user_id)
                resp = q.execute()
            else:
                resp = tbl.insert(up).execute()
            logger.info("Supabase response status: %s, error: %s", getattr(resp, 'status_code', None), getattr(resp, 'error', None))
            if getattr(resp, 'status_code', 200) >= 400 or (hasattr(resp, 'error') and resp.error):
                logger.error("Supabase error inserting/updating gap: %s", getattr(resp, 'error', None))
                raise HTTPException(status_code=400, detail=str(getattr(resp, 'error', None)))
            return {"status": "accepted", "action": "marked_resolved"}

        if payload.action == "ignore":
            up = {
                "topic": payload.gap_topic,
                "status": "ignored",
                "updated_at": now,
                "metadata": payload.metadata or {},
            }
            if user_id:
                up["user_id"] = user_id
            logger.info("Upserting gap (ignore): %s", up)
            tbl = dao.supabase.table('knowledge_gaps')
            existing = tbl.select('*').eq('topic', payload.gap_topic)
            if user_id:
                existing = existing.eq('user_id', user_id)
            existing = existing.limit(1).execute()
            existing_row = (existing.data or [None])[0] if existing is not None else None
            if existing_row:
                update_payload = {k: v for k, v in up.items() if k != "topic"}
                logger.info("Updating existing gap (topic=%s) with: %s", payload.gap_topic, update_payload)
                q = tbl.update(update_payload).eq('topic', payload.gap_topic)
                if user_id:
                    q = q.eq('user_id', user_id)
                resp = q.execute()
            else:
                resp = tbl.insert(up).execute()
            logger.info("Supabase response status: %s, error: %s", getattr(resp, 'status_code', None), getattr(resp, 'error', None))
            if getattr(resp, 'status_code', 200) >= 400 or (hasattr(resp, 'error') and resp.error):
                logger.error("Supabase error inserting/updating gap: %s", getattr(resp, 'error', None))
                raise HTTPException(status_code=400, detail=str(getattr(resp, 'error', None)))
            return {"status": "accepted", "action": "ignored"}

        if payload.action == "link_source":
            # Merge linked sources into metadata for the gap
            table = "knowledge_gaps"
            existing = dao.supabase.table(table).select("*").eq("topic", payload.gap_topic)
            if user_id:
                existing = existing.eq('user_id', user_id)
            existing = existing.limit(1).execute()
            existing_row = (existing.data or [None])[0] if existing is not None else None

            existing_meta = {}
            if existing_row and existing_row.get("metadata"):
                existing_meta = existing_row.get("metadata") or {}
                if isinstance(existing_meta, str):
                    try:
                        existing_meta = json.loads(existing_meta)
                    except Exception:
                        existing_meta = {}

            # Build linked_sources list
            linked = existing_meta.get("linked_sources", []) if isinstance(existing_meta, dict) else []
            # Accept documents and urls from payload.metadata
            docs = payload.metadata.get("documents") if payload.metadata else None
            urls = payload.metadata.get("urls") if payload.metadata else None
            if docs:
                if isinstance(docs, list):
                    linked.extend(docs)
                else:
                    linked.append(docs)
            if urls:
                if isinstance(urls, list):
                    linked.extend(urls)
                else:
                    linked.append(urls)

            # Deduplicate
            try:
                seen = set()
                deduped = []
                for item in linked:
                    if item not in seen:
                        seen.add(item)
                        deduped.append(item)
            except Exception:
                deduped = linked

            new_meta = dict(existing_meta if isinstance(existing_meta, dict) else {})
            new_meta["linked_sources"] = deduped
            new_meta.update(payload.metadata or {})

            # The DB allows statuses: open, in_progress, resolved, ignored.
            # Use 'in_progress' to represent a gap that now has linked sources
            # (avoids violating the DB CHECK constraint for status).
            up = {
                "topic": payload.gap_topic,
                "status": "in_progress",
                "updated_at": now,
                "metadata": new_meta,
            }
            if user_id:
                up["user_id"] = user_id
            logger.info("Upserting gap (link_source): %s", up)
            tbl = dao.supabase.table('knowledge_gaps')
            existing_q = tbl.select('*').eq('topic', payload.gap_topic)
            if user_id:
                existing_q = existing_q.eq('user_id', user_id)
            existing = existing_q.limit(1).execute()
            existing_row = (existing.data or [None])[0] if existing is not None else None
            if existing_row:
                update_payload = {k: v for k, v in up.items() if k != "topic"}
                logger.info("Updating existing gap (topic=%s) with: %s", payload.gap_topic, update_payload)
                q = tbl.update(update_payload).eq('topic', payload.gap_topic)
                if user_id:
                    q = q.eq('user_id', user_id)
                resp = q.execute()
            else:
                resp = tbl.insert(up).execute()
            logger.info("Supabase response status: %s, error: %s", getattr(resp, 'status_code', None), getattr(resp, 'error', None))
            if getattr(resp, 'status_code', 200) >= 400 or (hasattr(resp, 'error') and resp.error):
                logger.error("Supabase error inserting/updating gap: %s", getattr(resp, 'error', None))
                raise HTTPException(status_code=400, detail=str(getattr(resp, 'error', None)))

            return {"status": "accepted", "action": "linked", "linked_count": len(deduped)}

        # Unknown action
        raise HTTPException(status_code=400, detail=f"Unknown action: {payload.action}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

