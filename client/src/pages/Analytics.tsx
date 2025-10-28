import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MessageSquare,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Users,
  Info,
  TimerReset,
  Flame,
  Tag,
  Minus,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { AnalyticsChart } from "@/components/AnalyticsChart";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

 type SummaryState = {
  total_queries: number;
  unique_users: number;
  avg_satisfaction: number;
  knowledge_gaps: number;
  avg_response_time_ms?: number | null;
  top_issue?: string | null;
  updated_at?: string;
};

 type CommonIssue = {
  query: string;
  count: number;
  trend: "up" | "down" | "neutral";
  metadata?: {
    tags?: string[];
    variants?: string[];
  };
};

 type OverViewData = {
  summary: SummaryState;
  weekly_trend: { day?: string; name?: string; value: number }[];
  top_queries: { topic?: string; name?: string; value: number }[];
  common_issues: CommonIssue[];
};

 type GapItem = {
  topic: string;
  gap_rate: number;
  why?: string;
  missing: string[];
  recent_attempts: number;
  last_seen?: string;
  status?: string;
};

export default function Analytics() {
  const [overview, setOverview] = useState<OverViewData | null>(null);
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/analytics/overview`);
      if (!response.ok) {
        throw new Error("Failed to load analytics overview");
      }
      const data = await response.json();
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics overview");
    }
  }, []);

  const fetchGaps = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/analytics/knowledge-gaps`);
      if (!response.ok) {
        throw new Error("Failed to load knowledge gaps");
      }
      const data = await response.json();
      setGaps(data.gaps ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load knowledge gaps");
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await Promise.all([fetchOverview(), fetchGaps()]);
      setIsLoading(false);
    };

    load();

    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [fetchOverview, fetchGaps]);

  const summary = overview?.summary;
  const summaryTiles = useMemo(
    () => [
      {
        title: "Total Queries",
        value: summary ? summary.total_queries.toLocaleString() : "--",
        icon: MessageSquare,
        trend: undefined,
      },
      {
        title: "Unique Users",
        value: summary ? summary.unique_users.toLocaleString() : "--",
        icon: Users,
        trend: undefined,
      },
      {
        title: "Avg Satisfaction",
        value: summary ? `${summary.avg_satisfaction.toFixed(0)}%` : "--",
        icon: TrendingUp,
        trend: undefined,
      },
      {
        title: "Knowledge Gaps",
        value: summary ? summary.knowledge_gaps.toString() : "--",
        icon: AlertCircle,
      },
      {
        title: "Avg Response Time",
        value:
          summary?.avg_response_time_ms != null
            ? `${Math.round(summary.avg_response_time_ms)} ms`
            : "--",
        icon: TimerReset,
      },
      {
        title: "Top Issue",
        value: summary?.top_issue ?? "--",
        icon: Flame,
      },
    ],
    [summary]
  );

  const weeklyData = useMemo(
    () =>
      (overview?.weekly_trend ?? []).map((item) => ({
        name: item.day ?? item.name ?? "",
        value: item.value,
      })),
    [overview]
  );

  const topQueries = useMemo(
    () =>
      (overview?.top_queries ?? []).map((item) => ({
        name: item.topic ?? item.name ?? "",
        value: item.value,
      })),
    [overview]
  );

  const filteredCommonIssues = useMemo(
    () => (overview?.common_issues ?? []).filter((issue) => issue.count > 3),
    [overview]
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Insights into customer queries and support patterns
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {summaryTiles.map((tile) => (
          <StatCard key={tile.title} {...tile} />
        ))}
      </div>

      {/* Only render charts when there is data to show; otherwise hide to avoid empty placeholders */}
      {(weeklyData.length > 0 || topQueries.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {weeklyData.length > 0 && (
            <AnalyticsChart
              title="Queries Over Time"
              data={weeklyData}
              type="line"
            />
          )}
          {topQueries.length > 0 && (
            <AnalyticsChart
              title="Top Query Topics"
              data={topQueries}
              type="bar"
            />
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Most Asked Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Query</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Trend</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Variants</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCommonIssues.length === 0 && !isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No questions asked more than 3 times yet.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCommonIssues.map((issue, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{issue.query}</TableCell>
                    <TableCell className="text-right" data-testid={`count-${index}`}>
                      {issue.count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {issue.trend === "up" && (
                          <>
                            <TrendingUp className="h-4 w-4 text-chart-2" aria-hidden />
                            <span className="text-xs font-medium text-chart-2">Upward trend</span>
                          </>
                        )}
                        {issue.trend === "down" && (
                          <>
                            <TrendingDown className="h-4 w-4 text-destructive" aria-hidden />
                            <span className="text-xs font-medium text-destructive">Downward trend</span>
                          </>
                        )}
                        {issue.trend === "neutral" && (
                          <>
                            <Minus className="h-4 w-4 text-muted-foreground" aria-hidden />
                            <span className="text-xs text-muted-foreground">Stable trend</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {(issue.metadata?.tags ?? []).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/30 px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            <Tag className="h-3 w-3" />
                            {tag}
                          </span>
                        ))}
                        {issue.metadata?.tags?.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {(issue.metadata?.variants ?? []).map((variant) => (
                          <li key={variant}>• {variant}</li>
                        ))}
                        {issue.metadata?.variants?.length === 0 && <li>—</li>}
                      </ul>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Knowledge Gaps</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Review where the assistant struggled and surface the missing context to prioritize fixes.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-4 w-4" />
              <span>Gap rate = unanswered sessions / total attempts</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {gaps.length === 0 && !isLoading ? (
              <div className="text-muted-foreground text-sm">No knowledge gaps identified yet.</div>
            ) : (
              gaps.map((gap) => (
                <div key={gap.topic} className="rounded-lg border border-border/60 bg-background p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">{gap.topic}</h3>
                        <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                          {gap.gap_rate}% gap rate
                        </span>
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                          {gap.recent_attempts} recent attempts
                        </span>
                      </div>
                      {gap.why && <p className="mt-2 text-sm text-muted-foreground">{gap.why}</p>}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-dashed border-destructive/40 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Missing knowledge</p>
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {(gap.missing ?? []).map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-md border border-dashed border-primary/30 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">Recommended next step</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Add the missing details to the knowledge base or upload supporting documents via the Integrations tab.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => console.log("link", gap.topic)}>
                          Link source
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => console.log("resolve", gap.topic)}>
                          Mark as resolved
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
