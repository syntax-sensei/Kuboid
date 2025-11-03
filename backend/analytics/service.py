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

    def fetch_overview(self, user_id: str | None = None, widget_id: str | None = None) -> AnalyticsOverviewResponse:
        """Fetch analytics overview. If user_id is provided, scope all queries to that user.

        This allows the frontend to request per-user analytics.
        """
        # Build summary query and apply optional widget/user filter after selecting
        summary_query = self.supabase.table(ANALYTICS_SUMMARY_TABLE).select("*")
        if widget_id:
            summary_query = summary_query.eq("widget_id", widget_id)
        if user_id:
            summary_query = summary_query.eq("user_id", user_id)

        summary_resp = (
            summary_query.order("updated_at", desc=True).limit(1).execute()
        )
        summary_data = (summary_resp.data or [])[0] if summary_resp.data else None

        # weekly, top queries and common issues: select first, then apply user filter
        weekly_query = self.supabase.table("analytics_weekly_trend").select("day,value")
        top_queries_query = self.supabase.table("analytics_top_queries").select("topic,value")
        common_issues_query = self.supabase.table("analytics_common_issues").select("query,count,trend,metadata")

        if widget_id:
            weekly_query = weekly_query.eq("widget_id", widget_id)
            top_queries_query = top_queries_query.eq("widget_id", widget_id)
            common_issues_query = common_issues_query.eq("widget_id", widget_id)
        if user_id:
            weekly_query = weekly_query.eq("user_id", user_id)
            top_queries_query = top_queries_query.eq("user_id", user_id)
            common_issues_query = common_issues_query.eq("user_id", user_id)

        weekly_resp = weekly_query.order("day").execute()
        top_queries_resp = top_queries_query.order("value", desc=True).limit(10).execute()
        # Include metadata so frontend can display tags and variants when available
        common_issues_resp = common_issues_query.order("count", desc=True).limit(20).execute()

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
            gaps_query = self.supabase.table(KNOWLEDGE_GAPS_TABLE).select("id")
            if widget_id:
                gaps_query = gaps_query.eq("widget_id", widget_id)
            if user_id:
                gaps_query = gaps_query.eq("user_id", user_id)
            gaps_count_resp = gaps_query.select("id", count="exact").execute()
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

    def fetch_knowledge_gaps(self, user_id: str | None = None, widget_id: str | None = None) -> KnowledgeGapsResponse:
        query = self.supabase.table(KNOWLEDGE_GAPS_TABLE).select("*").order("gap_rate", desc=True).limit(50)
        if widget_id:
            query = query.eq("widget_id", widget_id)
        if user_id:
            query = query.eq("user_id", user_id)
        response = query.execute()
        gaps: List[GapInsight] = [GapInsight(**row) for row in response.data or []]
        return KnowledgeGapsResponse(gaps=gaps)
