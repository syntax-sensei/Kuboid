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
import math
from difflib import SequenceMatcher

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
    widget_id: Optional[str] = None
    lookback_days: Optional[int] = None
    limit: Optional[int] = 20
    min_count: int = 1
    user_id: Optional[str] = None


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

        logger.info("Loaded %d chat_turn rows for processing", len(rows))

        # Group analytics by owner (user_id) as the primary key for identification
        counts: DefaultDict[str, DefaultDict[str, int]] = defaultdict(lambda: defaultdict(int))
        latency_totals: Dict[str, Tuple[float, int]] = defaultdict(lambda: (0.0, 0))
        total_queries: Dict[str, int] = defaultdict(int)
        satisfaction_scores: Dict[str, Optional[float]] = {}
        gap_counts: DefaultDict[str, DefaultDict[str, int]] = defaultdict(lambda: defaultdict(int))
        last_seen: Dict[str, Dict[str, str]] = defaultdict(dict)
        owner_rows: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        owner_to_site: Dict[str, Optional[str]] = {}
        # cache site->owner lookups to avoid repeated DB calls
        _site_owner_cache: Dict[str, Optional[str]] = {}

        def _owner_for_row(r: Dict[str, Any]) -> Optional[str]:
            # Prefer explicit user_id on the chat_turn row
            uid = r.get("user_id")
            if uid:
                return uid
            # Otherwise try to derive from site_id via cached lookup
            sid = r.get("site_id")
            if not sid:
                return None
            if sid in _site_owner_cache:
                return _site_owner_cache[sid]
            try:
                resp = self.supabase.table("sites").select("user_id").eq("id", sid).limit(1).execute()
                row = (resp.data or [None])[0] if resp is not None else None
                owner = row.get("user_id") if row else None
                _site_owner_cache[sid] = owner
                return owner
            except Exception:
                _site_owner_cache[sid] = None
                return None

        for row in rows:
            site_id = row.get("site_id")
            user_message = (row.get("user_message") or "").strip()
            if not user_message:
                continue

            owner_id = _owner_for_row(row)
            # If we can't determine an owner for this row, skip it — the analytics
            # are owner-scoped per your request. This keeps results tied to widget/site owners.
            if not owner_id:
                continue

            # record a representative site for this owner (first seen)
            if owner_id not in owner_to_site:
                owner_to_site[owner_id] = site_id

            # If the run was explicitly scoped to a specific user, skip other owners
            if options.user_id and owner_id != options.user_id:
                continue

            owner_rows[owner_id].append(row)
            counts[owner_id][user_message] += 1
            total_queries[owner_id] = total_queries.get(owner_id, 0) + 1

            occurred_at = row.get("occurred_at")
            if occurred_at:
                last_seen[owner_id][user_message] = occurred_at

            status = (row.get("status") or "").lower()
            assistant_message = row.get("assistant_message")
            considered_gap = False
            if status == "gap":
                considered_gap = True
            elif not assistant_message:
                considered_gap = True
            elif isinstance(assistant_message, str):
                txt = assistant_message.strip()
                if len(txt) < 40:
                    considered_gap = True
                else:
                    low_conf_phrases = ["i don't know", "i am not sure", "i'm not sure", "i cannot", "unable to", "no information", "can't find"]
                    low_conf = txt.lower()
                    for ph in low_conf_phrases:
                        if ph in low_conf:
                            considered_gap = True
                            break

            if considered_gap:
                gap_counts[owner_id][user_message] += 1

            metadata = row.get("metadata") or {}
            latency = metadata.get("latency_ms")
            if isinstance(latency, (int, float)):
                current_sum, current_count = latency_totals[owner_id]
                latency_totals[owner_id] = (current_sum + float(latency), current_count + 1)

        logger.info("Found %d owners with activity", len(counts))

        for owner_id, owner_counts in counts.items():
            logger.info("Owner %s: total_queries=%d, distinct_messages=%d", owner_id, total_queries.get(owner_id, 0), len(owner_counts))

            rep_site = owner_to_site.get(owner_id)
            if owner_id not in satisfaction_scores:
                satisfaction_scores[owner_id] = self.dao.average_feedback_sentiment(rep_site or "", lookback_days=options.lookback_days, user_id=owner_id)

            filtered = {m: c for m, c in owner_counts.items() if c >= options.min_count}

            # Cluster using owner_id as the grouping key
            clusters = self._cluster_questions_with_llm(owner_id, filtered, options.limit)

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

            logger.info("Persisting common issues", extra={"owner_id": owner_id, "site_id": rep_site, "items": len(issues_payload)})
            # Persist common issues scoped to owner/user_id so frontend can filter.
            # Always use the owner_id (the authoritative owner for these counts) as
            # the user_id parameter when persisting records.
            self.dao.replace_common_issues(site_id=rep_site or "", issues=issues_payload, user_id=owner_id, widget_id=options.widget_id)

            # Compute knowledge gaps per owner
            gap_items: List[Dict[str, Any]] = []
            owner_total = total_queries.get(owner_id, 0)
            owner_gap_counts = gap_counts.get(owner_id, {})

            for message, gcount in owner_gap_counts.items():
                if gcount < options.min_count:
                    continue
                gap_rate = round((gcount / owner_total) * 100, 2) if owner_total else 0.0
                gi = {
                    "site_id": rep_site,
                    "topic": message,
                    "gap_rate": gap_rate,
                    "why": f"High unanswered rate ({gcount}/{owner_total} attempts, {gap_rate}%)",
                    "missing": [],
                    "recent_attempts": gcount,
                    "last_seen": last_seen.get(owner_id, {}).get(message),
                    "status": "open",
                    "metadata": {"sample_question": message},
                }

                try:
                    variants = [m for m in owner_counts.keys() if m != message][:3]
                except Exception:
                    variants = []
                gi["metadata"]["variants"] = [message] + variants if variants else [message]

                # sample interactions
                samples: List[Dict[str, Any]] = []
                try:
                    for r in reversed(owner_rows.get(owner_id, [])):
                        if (r.get("user_message") or "").strip() == message and len(samples) < 3:
                            samples.append({
                                "user_message": r.get("user_message"),
                                "assistant_message": r.get("assistant_message"),
                                "occurred_at": r.get("occurred_at"),
                            })
                except Exception:
                    samples = []
                if samples:
                    gi["metadata"]["sample_interactions"] = samples

                # Enrich gap using LLM (same logic as before)
                lm_output = None
                try:
                    system = (
                        "You are an analytics assistant. Given a user question, a set of recent attempts"
                        " (user messages + assistant replies), and counts, analyze whether this represents a real knowledge gap."
                        " Return a JSON object with keys: severity_percent (0-100), why (short string), missing (array of strings describing missing knowledge),"
                        " recommended_action (short string), canonical_question (a single canonical phrasing)."
                    )
                    user_payload = json.dumps({
                        "question": message,
                        "count": gcount,
                        "total": owner_total,
                        "samples": samples,
                    }, default=str)
                    lm_text = self._call_llm_flexible(system, user_payload)
                    if lm_text:
                        try:
                            lm_out = json.loads(lm_text)
                        except Exception:
                            import re

                            m = re.search(r"\{[\s\S]*\}", lm_text)
                            if m:
                                try:
                                    lm_out = json.loads(m.group(0))
                                except Exception:
                                    lm_out = {}
                            else:
                                lm_out = {}

                        if isinstance(lm_out, dict):
                            lm_output = lm_out
                except Exception:
                    lm_output = None

                if lm_output:
                    sev = lm_output.get("severity_percent")
                    if isinstance(sev, (int, float)):
                        gi["gap_rate"] = round(float(sev), 2)
                    if lm_output.get("why"):
                        gi["why"] = lm_output.get("why")
                    missing = lm_output.get("missing")
                    if isinstance(missing, list):
                        gi["missing"] = missing
                    if lm_output.get("recommended_action"):
                        gi.setdefault("metadata", {})["recommended_action"] = lm_output.get("recommended_action")
                    if lm_output.get("canonical_question"):
                        gi.setdefault("metadata", {})["canonical_question"] = lm_output.get("canonical_question")

                if options.widget_id:
                    gi["widget_id"] = options.widget_id
                gi["user_id"] = owner_id

                gap_items.append(gi)

            logger.info("Owner %s: computed %d gap items", owner_id, len(gap_items))
            if gap_items:
                try:
                    sample_topics = [g.get("topic") for g in gap_items[:5]]
                except Exception:
                    sample_topics = []
                logger.info("Owner %s: sample gap topics=%s", owner_id, sample_topics)

            for g in gap_items:
                try:
                    self.dao.upsert_gap(g)
                except Exception:
                    logger.exception("Failed to upsert gap: %s", g.get("topic"))

            summary_updates: Dict[str, Any] = {
                "site_id": rep_site,
                "user_id": owner_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            if issues_payload:
                summary_updates["top_issue"] = issues_payload[0]["query"]

            latency_sum, latency_count = latency_totals.get(owner_id, (0.0, 0))
            if latency_count:
                summary_updates["avg_response_time_ms"] = round(latency_sum / latency_count, 2)

            if owner_total := total_queries.get(owner_id):
                summary_updates["total_queries"] = owner_total

            satisfaction = satisfaction_scores.get(owner_id)
            if satisfaction is not None:
                summary_updates["avg_satisfaction"] = round(satisfaction * 100, 2)

            if options.widget_id:
                summary_updates["widget_id"] = options.widget_id

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
                .select("site_id,user_message,metadata,occurred_at,status,user_id,assistant_message")
                .order("occurred_at", desc=True)
                .range(start, end)
            )
            # Prefer filtering by widget_id when provided, otherwise fall back to site_id.
            if options.widget_id:
                query = query.eq("widget_id", options.widget_id)
            elif options.site_id:
                query = query.eq("site_id", options.site_id)

            if options.user_id:
                query = query.eq("user_id", options.user_id)
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

        # Try embeddings-based clustering first (strong similarity). If that
        # fails or the client is unavailable, fall back to LLM clustering. If
        # that also fails, use a simple fuzzy-match grouping.
        if self._openai_client:
            try:
                clusters = self._cluster_using_embeddings([q for q, _ in top_items], [c for _, c in top_items])
                if clusters:
                    return clusters[:limit] if limit and limit > 0 else clusters
            except Exception:
                logger.exception("Embeddings clustering failed, falling back to LLM/fuzzy")

        # Build LLM prompt payload
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

        if self._openai_client:
            try:
                response = self._openai_client.responses.create(
                    model="gpt-4o-mini",
                    input=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": json.dumps({"questions": prompt_payload})},
                    ],
                    max_output_tokens=800,
                )

                text = getattr(response, "output_text", None)
                if not text and hasattr(response, "output"):
                    try:
                        parts: List[str] = []
                        for item in response.output:
                            if isinstance(item, dict):
                                cont = item.get("content") or []
                                for c in cont:
                                    if isinstance(c, dict) and c.get("type") == "output_text":
                                        parts.append(c.get("text", ""))
                                    elif isinstance(c, str):
                                        parts.append(c)
                        text = "".join(parts)
                    except Exception:
                        text = None

                payload = {}
                if text:
                    try:
                        payload = json.loads(text)
                    except Exception:
                        payload = {}

                clusters = payload.get("clusters", []) if isinstance(payload, dict) else []
                if not isinstance(clusters, list):
                    raise ValueError("Invalid cluster payload")

                clusters.sort(key=lambda c: c.get("total_count", 0), reverse=True)
                return clusters[:limit] if limit and limit > 0 else clusters
            except Exception as exc:
                logger.warning(
                    "LLM clustering failed for site %s (%s). Falling back to fuzzy.",
                    site_id,
                    exc,
                )

        # final fallback: fuzzy matching
        return self._cluster_using_fuzzy(top_items, limit)
    def _cluster_using_fuzzy(self, items: List[Tuple[str, int]], limit: Optional[int]) -> List[Dict[str, Any]]:
        """Cluster by simple fuzzy string similarity (SequenceMatcher).

        This is a lightweight fallback when embeddings/LLM are unavailable.
        """
        clusters: List[Dict[str, Any]] = []
        threshold = 0.72

        for question, count in items:
            placed = False
            for c in clusters:
                # compare to canonical question
                score = SequenceMatcher(None, question.lower(), c["canonical_question"].lower()).ratio()
                if score >= threshold:
                    c["variants"].append(question)
                    c["total_count"] += count
                    placed = True
                    break
            if not placed:
                clusters.append({
                    "canonical_question": question,
                    "total_count": count,
                    "trend": "neutral",
                    "variants": [question],
                    "tags": [],
                })

        clusters.sort(key=lambda x: x.get("total_count", 0), reverse=True)
        if limit is not None and limit > 0:
            clusters = clusters[:limit]
        return clusters

    def _cluster_using_embeddings(self, questions: List[str], counts: List[int]) -> List[Dict[str, Any]]:
        """Compute embeddings and do a greedy clustering by cosine similarity.

        Returns cluster dicts compatible with the existing LLM cluster format.
        """
        # Compute embeddings via the client if available
        try:
            vecs = []
            # Try the new client embeddings API then fallback to legacy
            try:
                resp = self._openai_client.embeddings.create(model="text-embedding-3-small", input=questions)
                for item in getattr(resp, "data", []) or []:
                    emb = item.get("embedding") if isinstance(item, dict) else None
                    if emb is None:
                        emb = getattr(item, "embedding", None)
                    vecs.append(emb)
            except Exception:
                import openai as legacy_openai

                legacy_openai.api_key = Config.OPENAI_API_KEY
                resp = legacy_openai.Embedding.create(model="text-embedding-3-small", input=questions)
                for item in resp.data:
                    vecs.append(item.embedding)

            # validate vectors
            if not vecs or len(vecs) != len(questions):
                raise ValueError("Invalid embedding response")

            # Greedy clustering: iterate items by count desc
            q_items = list(zip(questions, counts, vecs))
            q_items.sort(key=lambda t: t[1], reverse=True)

            clusters: List[Dict[str, Any]] = []

            def cos(a: List[float], b: List[float]) -> float:
                denom_a = math.sqrt(sum(x * x for x in a))
                denom_b = math.sqrt(sum(x * x for x in b))
                if denom_a == 0 or denom_b == 0:
                    return 0.0
                dot = sum(x * y for x, y in zip(a, b))
                return dot / (denom_a * denom_b)

            similarity_threshold = 0.78

            for q, count, vec in q_items:
                placed = False
                for c in clusters:
                    centroid = c.get("__centroid")
                    if centroid is None:
                        centroid = c.get("__centroid", vec)
                    sim = cos(vec, centroid)
                    if sim >= similarity_threshold:
                        c["variants"].append(q)
                        c["total_count"] += count
                        prev_count = c.get("__vec_count", 1)
                        prev_centroid = c.get("__centroid", centroid)
                        new_centroid = [
                            (prev_centroid[i] * prev_count + vec[i] * count) / (prev_count + count)
                            for i in range(len(vec))
                        ]
                        c["__centroid"] = new_centroid
                        c["__vec_count"] = prev_count + count
                        placed = True
                        break
                if not placed:
                    clusters.append({
                        "canonical_question": q,
                        "total_count": count,
                        "trend": "neutral",
                        "variants": [q],
                        "tags": [],
                        "__centroid": vec,
                        "__vec_count": count,
                    })

            for c in clusters:
                if "__centroid" in c:
                    c.pop("__centroid")
                if "__vec_count" in c:
                    c.pop("__vec_count")

            clusters.sort(key=lambda x: x.get("total_count", 0), reverse=True)
            return clusters
        except Exception:
            logger.exception("Embeddings clustering failed")
            return []


    def _call_llm_flexible(self, system: str, user: str) -> str | None:
        """Call the configured LLM with multiple fallbacks and return raw text output.

        Returns None when no LLM client is configured or calls fail.
        """
        if not self._openai_client:
            return None
        try:
            # Try the new client 'responses' API
            resp = self._openai_client.responses.create(
                model="gpt-4o-mini",
                input=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                max_output_tokens=800,
            )
            text = getattr(resp, "output_text", None)
            if text:
                return text
            # attempt to reconstruct
            if hasattr(resp, "output"):
                parts = []
                for item in resp.output:
                    if isinstance(item, dict):
                        cont = item.get("content") or []
                        for c in cont:
                            if isinstance(c, dict) and c.get("type") == "output_text":
                                parts.append(c.get("text", ""))
                            elif isinstance(c, str):
                                parts.append(c)
                if parts:
                    return "".join(parts)
        except TypeError:
            # Signature mismatch; try legacy openai library if available
            try:
                import openai as legacy_openai  # type: ignore

                legacy_openai.api_key = Config.OPENAI_API_KEY
                res = legacy_openai.ChatCompletion.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                    max_tokens=800,
                )
                return res.choices[0].message.content
            except Exception:
                return None
        except Exception:
            return None



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
    parser.add_argument(
        "--user-id",
        help="If provided, scope analytics to a specific user id",
    )
    parser.add_argument(
        "--widget-id",
        help="If provided, scope analytics to a specific widget id",
    )

    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    agent = AnalyticsAgent()
    agent.refresh_most_asked_questions(
        RefreshOptions(
            site_id=args.site_id,
            widget_id=args.widget_id,
            lookback_days=args.lookback_days,
            limit=args.limit,
            min_count=args.min_count,
            user_id=args.user_id,
        )
    )


if __name__ == "__main__":
    main()


