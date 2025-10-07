import { MessageSquare, TrendingUp, AlertCircle, Users } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { AnalyticsChart } from "@/components/AnalyticsChart";
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
        <AnalyticsChart title="Queries Over Time" data={mockWeeklyData} type="line" />
        <AnalyticsChart title="Top Query Topics" data={mockTopQueries} type="bar" />
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
                  <TableCell className="text-right" data-testid={`count-${index}`}>
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
                      {issue.trend === "up" ? "↑" : issue.trend === "down" ? "↓" : "→"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
