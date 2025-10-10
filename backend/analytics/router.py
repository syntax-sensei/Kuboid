from __future__ import annotations

from fastapi import APIRouter, HTTPException
from uuid import uuid4

from .models import FeedbackPayload, KnowledgeGapUpdate
from .service import AnalyticsService
from .dao import AnalyticsDAO

router = APIRouter(prefix="/analytics", tags=["analytics"])
service = AnalyticsService()
dao = AnalyticsDAO()


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
    # TODO: update knowledge gaps table, trigger notifications
    return {"status": "accepted"}

