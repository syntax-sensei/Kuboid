from __future__ import annotations

"""Background analytics agent for aggregating chat activity."""

import argparse
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
from pathlib import Path
import sys
from typing import Any, DefaultDict, Dict, Iterable, List, Optional, Tuple

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.append(str(BACKEND_ROOT))

from supabase import Client

from RAG.config import Config
from core.supabase import get_supabase_client

from analytics.dao import AnalyticsDAO

try:
    from openai import OpenAI
except ImportError:  
    OpenAI = None  # type: ignore


logger = logging.getLogger(__name__)


CHAT_TURNS_TABLE = "chat_turns"


@dataclass
class RefreshOptions:
    site_id: Optional[str] = None
    lookback_days: Optional[int] = None
    limit: Optional[int] = 20
    min_count: int = 1


class AnalyticsAgent:
    """Orchestrates analytics refresh tasks pulling from chat history."""

    def __init__(
        self,
        supabase_client: Client | None = None,
        dao: AnalyticsDAO | None = None,
        page_size: int = 1000,
    ) -> None:
        self.supabase = supabase_client or get_supabase_client()
        self.dao = dao or AnalyticsDAO(self.supabase)
        self.page_size = page_size
        self._openai_client = None
        if OpenAI and Config.OPENAI_API_KEY:
            self._openai_client = OpenAI(api_key=Config.OPENAI_API_KEY)

    def refresh_most_asked_questions(self, options: RefreshOptions | None = None) -> None:
        options = options or RefreshOptions()

        logger.info("Starting common issues refresh", extra={"options": options.__dict__})

        rows = list(self._iter_chat_turns(options))
        if not rows:
            logger.info("No chat turns found - skipping common issues refresh")
            return

        counts: DefaultDict[str, DefaultDict[str, int]] = defaultdict(lambda: defaultdict(int))
        latency_totals: Dict[str, Tuple[float, int]] = defaultdict(lambda: (0.0, 0))
        total_queries: Dict[str, int] = defaultdict(int)
        satisfaction_scores: Dict[str, Optional[float]] = {}

        for row in rows:
            site_id = row.get("site_id")
            user_message = (row.get("user_message") or "").strip()
            if not site_id or not user_message:
                continue
            counts[site_id][user_message] += 1
            total_queries[site_id] += 1

            metadata = row.get("metadata") or {}
            latency = metadata.get("latency_ms")
            if isinstance(latency, (int, float)):
                current_sum, current_count = latency_totals[site_id]
                latency_totals[site_id] = (current_sum + float(latency), current_count + 1)

        for site_id, site_counts in counts.items():
            if site_id not in satisfaction_scores:
                satisfaction_scores[site_id] = self.dao.average_feedback_sentiment(site_id)

            filtered = {
                message: count
                for message, count in site_counts.items()
                if count >= options.min_count
            }

            clusters = self._cluster_questions_with_llm(site_id, filtered, options.limit)

            issues_payload = [
                {
                    "query": cluster.get("canonical_question", ""),
                    "count": cluster.get("total_count", 0),
                    "trend": cluster.get("trend", "neutral"),
                    "metadata": {
                        "variants": cluster.get("variants", []),
                        "tags": cluster.get("tags", []),
                    },
                }
                for cluster in clusters
            ]

            logger.info(
                "Persisting common issues",
                extra={"site_id": site_id, "items": len(issues_payload)},
            )
            self.dao.replace_common_issues(site_id=site_id, issues=issues_payload)

            summary_updates: Dict[str, Any] = {
                "site_id": site_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

            if issues_payload:
                summary_updates["top_issue"] = issues_payload[0]["query"]

            latency_sum, latency_count = latency_totals.get(site_id, (0.0, 0))
            if latency_count:
                summary_updates["avg_response_time_ms"] = round(latency_sum / latency_count, 2)

            if site_total := total_queries.get(site_id):
                summary_updates["total_queries"] = site_total

            satisfaction = satisfaction_scores.get(site_id)
            if satisfaction is not None:
                summary_updates["avg_satisfaction"] = round(satisfaction * 100, 2)

            self.dao.upsert_summary(summary_updates)

        logger.info("Completed common issues refresh")

    def _iter_chat_turns(self, options: RefreshOptions) -> Iterable[Dict[str, Any]]:
        start = 0
        lookback_threshold = None

        if options.lookback_days is not None:
            lookback_threshold = datetime.now(timezone.utc) - timedelta(days=options.lookback_days)

        while True:
            end = start + self.page_size - 1
            query = (
                self.supabase.table(CHAT_TURNS_TABLE)
                .select("site_id,user_message,metadata,occurred_at")
                .order("occurred_at", desc=True)
                .range(start, end)
            )

            if options.site_id:
                query = query.eq("site_id", options.site_id)

            if lookback_threshold is not None:
                query = query.gte("occurred_at", lookback_threshold.isoformat())

            response = query.execute()
            data: List[Dict[str, str]] = response.data or []

            if not data:
                break

            for row in data:
                yield row

            if len(data) < self.page_size:
                break

            start += self.page_size

    def _cluster_questions_with_llm(
        self,
        site_id: str,
        question_counts: Dict[str, int],
        limit: int,
    ) -> List[Dict[str, Any]]:
        if not question_counts:
            return []

        sorted_items = sorted(
            question_counts.items(), key=lambda item: item[1], reverse=True
        )

        slice_size = None
        if limit is not None and limit > 0:
            slice_size = max(limit * 2, limit)

        top_items = sorted_items[:slice_size] if slice_size else sorted_items

        if not self._openai_client:
            return [
                {
                    "canonical_question": question,
                    "total_count": count,
                    "trend": "neutral",
                    # Provide a sensible fallback so metadata isn't empty: include the
                    # original question as a single variant. This ensures frontend
                    # shows something useful even when LLM clustering isn't available.
                    "variants": [question],
                    "tags": [],
                }
                for question, count in (top_items if limit is None else top_items[:limit])
            ]

        prompt_payload = [{"question": q, "count": c} for q, c in top_items]

        system_prompt = (
            "You are an analytics assistant that clusters similar user questions. "
            "Group paraphrased or closely related questions together. "
            "Return JSON with a `clusters` array; each cluster object must include:\n"
            "- canonical_question (string)\n"
            "- total_count (int)\n"
            "- variants (array of strings)\n"
            "- tags (array of short topical labels)\n"
            "- trend (one of 'up','down','neutral')\n"
            "Ensure counts sum the grouped variants."
        )

        try:
            response = self._openai_client.responses.create(
                model="gpt-4o-mini",
                input=[
                    {
                        "role": "system",
                        "content": system_prompt,
                    },
                    {
                        "role": "user",
                        "content": json.dumps({"questions": prompt_payload}),
                    },
                ],
                response_format={"type": "json_object"},
                max_output_tokens=800,
            )

            payload = json.loads(response.output_text)
            clusters = payload.get("clusters", [])
            if not isinstance(clusters, list):
                raise ValueError("Invalid cluster payload")

            clusters.sort(key=lambda c: c.get("total_count", 0), reverse=True)
            if limit is not None and limit > 0:
                clusters = clusters[:limit]
            return clusters
        except Exception as exc:  # pragma: no cover - network failure fallback
            logger.warning(
                "LLM clustering failed for site %s (%s). Falling back to frequency.",
                site_id,
                exc,
            )
            return [
                {
                    "canonical_question": question,
                    "total_count": count,
                    "trend": "neutral",
                    # Use the original question as a fallback variant so metadata
                    # contains useful information even without LLM output.
                    "variants": [question],
                    "tags": [],
                }
                for question, count in (
                    top_items if limit is None else top_items[:limit]
                )
            ]


def main() -> None:
    parser = argparse.ArgumentParser(description="Analytics agent utility")
    parser.add_argument(
        "--site-id",
        help="Restrict to a specific site",
    )
    parser.add_argument(
        "--lookback-days",
        type=int,
        help="Limit to chat turns within the last N days",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of items per site to persist (omit for all)",
    )
    parser.add_argument(
        "--min-count",
        type=int,
        default=1,
        help="Minimum number of occurrences to include a question",
    )

    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    agent = AnalyticsAgent()
    agent.refresh_most_asked_questions(
        RefreshOptions(
            site_id=args.site_id,
            lookback_days=args.lookback_days,
            limit=args.limit,
            min_count=args.min_count,
        )
    )


if __name__ == "__main__":
    main()


