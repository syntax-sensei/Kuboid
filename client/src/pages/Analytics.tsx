import {
  MessageSquare,
  TrendingUp,
  AlertCircle,
  Users,
  Info,
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

//todo: remove mock functionality
const mockWeeklyData = [
  { name: "Mon", value: 45 },
  { name: "Tue", value: 67 },
  { name: "Wed", value: 52 },
  { name: "Thu", value: 89 },
  { name: "Fri", value: 73 },
  { name: "Sat", value: 34 },
  { name: "Sun", value: 41 },
];

//todo: remove mock functionality
const mockTopQueries = [
  { name: "Login Help", value: 234 },
  { name: "Password Reset", value: 189 },
  { name: "Account Setup", value: 156 },
  { name: "Billing", value: 123 },
  { name: "Features", value: 98 },
];

//todo: remove mock functionality
const mockCommonIssues = [
  { query: "How do I reset my password?", count: 234, trend: "up" },
  { query: "Can't log in to my account", count: 189, trend: "up" },
  { query: "How to upgrade my plan?", count: 156, trend: "down" },
  { query: "Billing questions", count: 123, trend: "up" },
  { query: "Feature requests", count: 98, trend: "neutral" },
];

const mockKnowledgeGaps = [
  {
    topic: "Refund timeline",
    gapRate: 36,
    why: "Refund SLA isn't documented for digital purchases.",
    missing: ["Expected refund processing time", "Email notification flow"],
    recentAttempts: 42,
  },
  {
    topic: "Multi-language support",
    gapRate: 24,
    why: "No available answer for translations request.",
    missing: ["Supported languages list", "Localization roadmap"],
    recentAttempts: 31,
  },
  {
    topic: "Enterprise onboarding",
    gapRate: 18,
    why: "Assistant cannot locate onboarding checklist.",
    missing: ["Step-by-step onboarding guide"],
    recentAttempts: 28,
  },
];

export default function Analytics() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Insights into customer queries and support patterns
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Queries"
          value="1,247"
          icon={MessageSquare}
          trend={{ value: 12, isPositive: true }}
        />
        <StatCard
          title="Unique Users"
          value="834"
          icon={Users}
          trend={{ value: 8, isPositive: true }}
        />
        <StatCard
          title="Avg Satisfaction"
          value="94%"
          icon={TrendingUp}
          trend={{ value: 3, isPositive: true }}
        />
        <StatCard title="Knowledge Gaps" value="12" icon={AlertCircle} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalyticsChart
          title="Queries Over Time"
          data={mockWeeklyData}
          type="line"
        />
        <AnalyticsChart
          title="Top Query Topics"
          data={mockTopQueries}
          type="bar"
        />
      </div>

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockCommonIssues.map((issue, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{issue.query}</TableCell>
                  <TableCell
                    className="text-right"
                    data-testid={`count-${index}`}
                  >
                    {issue.count}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        issue.trend === "up"
                          ? "text-chart-2"
                          : issue.trend === "down"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }
                    >
                      {issue.trend === "up"
                        ? "↑"
                        : issue.trend === "down"
                        ? "↓"
                        : "→"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
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
                Review where the assistant struggled and surface the missing
                context to prioritize fixes.
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
            {mockKnowledgeGaps.map((gap) => (
              <div
                key={gap.topic}
                className="rounded-lg border border-border/60 bg-background p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{gap.topic}</h3>
                      <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                        {gap.gapRate}% gap rate
                      </span>
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                        {gap.recentAttempts} recent attempts
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {gap.why}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-dashed border-destructive/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                      Missing knowledge
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {gap.missing.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span
                            className="mt-1 h-1.5 w-1.5 rounded-full bg-destructive"
                            aria-hidden
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-md border border-dashed border-primary/30 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      Recommended next step
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Add the missing details to the knowledge base or upload
                      supporting documents via the Integrations tab.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm">
                        Link source
                      </Button>
                      <Button variant="ghost" size="sm">
                        Mark as resolved
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
