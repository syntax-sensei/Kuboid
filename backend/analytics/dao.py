from __future__ import annotations

"""Data access helpers for analytics storage.

These functions map to Supabase tables but can be swapped out
for another persistence layer later.
"""

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from supabase import Client

from core.supabase import get_supabase_client

SUMMARY_TABLE = "analytics_summary"
WEEKLY_TABLE = "analytics_weekly_trend"
TOP_QUERIES_TABLE = "analytics_top_queries"
COMMON_ISSUES_TABLE = "analytics_common_issues"
GAPS_TABLE = "knowledge_gaps"
FEEDBACK_TABLE = "chat_feedback"


class AnalyticsDAO:
    def __init__(self, supabase_client: Client | None = None) -> None:
        self.supabase = supabase_client or get_supabase_client()

    def upsert_summary(self, payload: Dict[str, Any]) -> None:
        self.supabase.table(SUMMARY_TABLE).upsert(payload).execute()

    def insert_weekly_trend(self, items: List[Dict[str, Any]]) -> None:
        if items:
            self.supabase.table(WEEKLY_TABLE).insert(items).execute()

    def upsert_gap(self, payload: Dict[str, Any]) -> None:
        # Use explicit conflict target so Postgrest knows which unique key to
        # use for the upsert operation. The database enforces uniqueness on
        # (site_id, topic) so pass that as the on_conflict parameter. This
        # avoids HTTP 409 errors when attempting to insert an existing topic.
        try:
            self.supabase.table(GAPS_TABLE).upsert(payload, on_conflict="site_id,topic").execute()
        except Exception:
            # Fallback: some environments or older clients may not accept
            # on_conflict. Try a plain upsert as a best-effort fallback.
            self.supabase.table(GAPS_TABLE).upsert(payload).execute()

    def record_feedback(self, payload: Dict[str, Any]) -> None:
        self.supabase.table(FEEDBACK_TABLE).insert(payload).execute()

    def average_feedback_sentiment(self, site_id: str, lookback_days: int | None = None, user_id: str | None = None) -> float | None:
        """Compute average sentiment for a site. Optionally restrict to a specific user_id.

        This allows per-user analytics when the agent or API caller provides a user id.
        """
        # Allow filtering by site_id or user_id. If caller later passes widget_id, it can be applied by caller.
        query = self.supabase.table(FEEDBACK_TABLE).select("sentiment", "created_at").eq("site_id", site_id)
        if user_id:
            query = query.eq("user_id", user_id)
        if lookback_days is not None:
            threshold = datetime.now(timezone.utc) - timedelta(days=lookback_days)
            query = query.gte("created_at", threshold.isoformat())

        response = query.execute()
        data = response.data or []
        if not data:
            return None

        score_map = {"positive": 1.0, "neutral": 0.5, "negative": 0.0}
        scores = [score_map.get(item["sentiment"], 0.5) for item in data if item.get("sentiment")]
        if not scores:
            return None
        return sum(scores) / len(scores)

    def replace_common_issues(self, site_id: str, issues: List[Dict[str, Any]], user_id: Optional[str] = None, widget_id: Optional[str] = None) -> None:
        """Replace common issues for a site. If user_id is provided, restrict delete/insert to that user.

        This preserves other users' rows when operating in multi-user mode.
        """
        delete_query = self.supabase.table(COMMON_ISSUES_TABLE).delete()
        # If widget_id provided, delete only rows for that widget; otherwise fall back to site scope.
        if widget_id:
            delete_query = delete_query.eq("widget_id", widget_id)
        else:
            delete_query = delete_query.eq("site_id", site_id)
        if user_id:
            delete_query = delete_query.eq("user_id", user_id)
        delete_query.execute()

        if not issues:
            return

        timestamp = datetime.now(timezone.utc).isoformat()
        records: List[Dict[str, Any]] = []
        for issue in issues:
            record = {
                **issue,
                "site_id": site_id,
                "captured_at": issue.get("captured_at", timestamp),
            }
            # Persist widget_id when present so frontend can filter by widget
            if widget_id:
                record["widget_id"] = widget_id
            if user_id:
                record["user_id"] = user_id
            if "metadata" in record and record["metadata"] is None:
                record.pop("metadata")
            records.append(record)

        self.supabase.table(COMMON_ISSUES_TABLE).insert(records).execute()

