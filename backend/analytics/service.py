from __future__ import annotations

from typing import List

from supabase import Client

from core.supabase import get_supabase_client

from .models import (
    AnalyticsOverviewResponse,
    AnalyticsSummary,
    GapInsight,
    KnowledgeGapsResponse,
)

ANALYTICS_SUMMARY_TABLE = "analytics_summary"
WEEKLY_TREND_TABLE = "analytics_weekly_trend"
TOP_QUERIES_TABLE = "analytics_top_queries"
COMMON_ISSUES_TABLE = "analytics_common_issues"
KNOWLEDGE_GAPS_TABLE = "knowledge_gaps"


class AnalyticsService:
    def __init__(self, supabase_client: Client | None = None) -> None:
        self.supabase = supabase_client or get_supabase_client()

    def fetch_overview(self) -> AnalyticsOverviewResponse:
        summary_resp = (
            self.supabase.table(ANALYTICS_SUMMARY_TABLE)
            .select("*")
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        summary_data = (summary_resp.data or [])[0] if summary_resp.data else None

        weekly_resp = (
            self.supabase.table("analytics_weekly_trend")
            .select("day,value")
            .order("day")
            .execute()
        )
        top_queries_resp = (
            self.supabase.table("analytics_top_queries")
            .select("topic,value")
            .order("value", desc=True)
            .limit(10)
            .execute()
        )
        # Include metadata so frontend can display tags and variants when available
        common_issues_resp = (
            self.supabase.table("analytics_common_issues")
            .select("query,count,trend,metadata")
            .order("count", desc=True)
            .limit(20)
            .execute()
        )

        if summary_data:
            summary = AnalyticsSummary(**summary_data)
        else:
            summary = AnalyticsSummary(
                total_queries=0,
                unique_users=0,
                avg_satisfaction=0.0,
                knowledge_gaps=0,
                avg_response_time_ms=None,
                top_issue=None,
                updated_at=None,
            )

        # Compute live knowledge_gaps count from the knowledge_gaps table to avoid stale summary values
        try:
            gaps_count_resp = self.supabase.table(KNOWLEDGE_GAPS_TABLE).select("id", count="exact").execute()
            gaps_count = int(gaps_count_resp.count or 0)
            # Override summary value with live count
            summary.knowledge_gaps = gaps_count
        except Exception:
            # If counting fails, leave whatever summary value we have
            pass

        return AnalyticsOverviewResponse(
            summary=summary,
            weekly_trend=weekly_resp.data or [],
            top_queries=top_queries_resp.data or [],
            common_issues=common_issues_resp.data or [],
        )

    def fetch_knowledge_gaps(self) -> KnowledgeGapsResponse:
        response = (
            self.supabase.table(KNOWLEDGE_GAPS_TABLE)
            .select("*")
            .order("gap_rate", desc=True)
            .limit(50)
            .execute()
        )
        gaps: List[GapInsight] = [GapInsight(**row) for row in response.data or []]
        return KnowledgeGapsResponse(gaps=gaps)
