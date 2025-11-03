from datetime import datetime
from typing import Dict, List, Literal, Optional, Any

from pydantic import BaseModel, Field


class ChatTurn(BaseModel):
    id: str
    conversation_id: str
    timestamp: datetime
    user_message: str
    assistant_message: Optional[str]
    status: Literal["resolved", "escalated", "gap"]
    metadata: dict = Field(default_factory=dict)


class GapInsight(BaseModel):
    topic: str
    gap_rate: float
    why: str
    missing: List[str]
    recent_attempts: int
    last_seen: datetime
    status: Optional[str] = None
    metadata: Dict[str, Any] | None = None


class AnalyticsSummary(BaseModel):
    total_queries: int
    unique_users: int
    avg_satisfaction: float
    knowledge_gaps: int
    avg_response_time_ms: Optional[float] = None
    top_issue: Optional[str] = None
    updated_at: Optional[datetime] = None


class CommonIssue(BaseModel):
    query: str
    count: int
    trend: Literal["up", "down", "neutral"]
    metadata: Dict[str, List[str]] | None = None


class AnalyticsOverviewResponse(BaseModel):
    summary: AnalyticsSummary
    weekly_trend: List[dict]
    top_queries: List[dict]
    common_issues: List[CommonIssue]


class KnowledgeGapsResponse(BaseModel):
    gaps: List[GapInsight]


class FeedbackPayload(BaseModel):
    # Accept either a site identifier or a widget identifier so callers
    # (e.g. widgets) can send widget_id only and the server will resolve
    # the corresponding site. site_id remains the canonical stored value.
    site_id: Optional[str] = None
    widget_id: Optional[str] = None
    conversation_id: str
    turn_id: str
    sentiment: Literal["positive", "neutral", "negative"]
    notes: Optional[str] = None
    metadata: dict = Field(default_factory=dict)
    user_id: Optional[str] = None


class KnowledgeGapUpdate(BaseModel):
    gap_topic: str
    action: Literal["link_source", "mark_resolved", "ignore"]
    metadata: dict = Field(default_factory=dict)

