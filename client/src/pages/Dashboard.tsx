import { MessageSquare, Clock, AlertCircle, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { AnalyticsChart } from "@/components/AnalyticsChart";

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

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your support chatbot performance
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
          title="Avg Response Time"
          value="1.2s"
          icon={Clock}
          trend={{ value: 8, isPositive: false }}
        />
        <StatCard
          title="Top Issue"
          value="Login Help"
          icon={AlertCircle}
        />
        <StatCard
          title="Satisfaction"
          value="94%"
          icon={TrendingUp}
          trend={{ value: 3, isPositive: true }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalyticsChart title="Queries This Week" data={mockWeeklyData} type="line" />
        <AnalyticsChart title="Top Query Topics" data={mockTopQueries} type="bar" />
      </div>
    </div>
  );
}
