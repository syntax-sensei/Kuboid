from __future__ import annotations

from fastapi import APIRouter, HTTPException
from uuid import uuid4
from datetime import datetime, timezone
import json

from .models import FeedbackPayload, KnowledgeGapUpdate
import logging
from .service import AnalyticsService
from .dao import AnalyticsDAO

router = APIRouter(prefix="/analytics", tags=["analytics"])
service = AnalyticsService()
dao = AnalyticsDAO()
logger = logging.getLogger(__name__)


@router.get("/overview")
async def get_analytics_overview():
    try:
        return service.fetch_overview()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/knowledge-gaps")
async def get_knowledge_gaps():
    try:
        return service.fetch_knowledge_gaps()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/feedback")
async def post_feedback(payload: FeedbackPayload):
    try:
        dao.record_feedback(
            {
                "id": str(uuid4()),
                "site_id": payload.site_id,
                "conversation_id": payload.conversation_id,
                "turn_id": payload.turn_id,
                "sentiment": payload.sentiment,
                "notes": payload.notes,
                "metadata": payload.metadata,
            }
        )
        return {"status": "accepted"}
    except Exception as exc:  # pragma: no cover - supabase errors
        raise HTTPException(status_code=500, detail="Failed to record feedback") from exc


@router.post("/knowledge-gaps/actions")
async def update_knowledge_gap(payload: KnowledgeGapUpdate):
    try:
        now = datetime.now(timezone.utc).isoformat()

        # Simple handlers for common actions
        if payload.action == "mark_resolved":
            up = {
                "topic": payload.gap_topic,
                "status": "resolved",
                "resolved_at": now,
                "metadata": payload.metadata or {},
            }
            logger.info("Upserting gap: %s", up)
            # Prefer update if a row exists, otherwise insert. Some schemas may require certain columns.
            tbl = dao.supabase.table('knowledge_gaps')
            existing = tbl.select('*').eq('topic', payload.gap_topic).limit(1).execute()
            existing_row = (existing.data or [None])[0] if existing is not None else None
            if existing_row:
                update_payload = {k: v for k, v in up.items() if k != "topic"}
                logger.info("Updating existing gap (topic=%s) with: %s", payload.gap_topic, update_payload)
                resp = tbl.update(update_payload).eq('topic', payload.gap_topic).execute()
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
            logger.info("Upserting gap (ignore): %s", up)
            tbl = dao.supabase.table('knowledge_gaps')
            existing = tbl.select('*').eq('topic', payload.gap_topic).limit(1).execute()
            existing_row = (existing.data or [None])[0] if existing is not None else None
            if existing_row:
                update_payload = {k: v for k, v in up.items() if k != "topic"}
                logger.info("Updating existing gap (topic=%s) with: %s", payload.gap_topic, update_payload)
                resp = tbl.update(update_payload).eq('topic', payload.gap_topic).execute()
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
            existing = dao.supabase.table(table).select("*").eq("topic", payload.gap_topic).limit(1).execute()
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

            up = {
                "topic": payload.gap_topic,
                "status": "linked",
                "updated_at": now,
                "metadata": new_meta,
            }
            logger.info("Upserting gap (link_source): %s", up)
            tbl = dao.supabase.table('knowledge_gaps')
            existing = tbl.select('*').eq('topic', payload.gap_topic).limit(1).execute()
            existing_row = (existing.data or [None])[0] if existing is not None else None
            if existing_row:
                update_payload = {k: v for k, v in up.items() if k != "topic"}
                logger.info("Updating existing gap (topic=%s) with: %s", payload.gap_topic, update_payload)
                resp = tbl.update(update_payload).eq('topic', payload.gap_topic).execute()
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

