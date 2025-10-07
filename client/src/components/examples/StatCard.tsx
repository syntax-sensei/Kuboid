import { StatCard } from "../StatCard";
import { MessageSquare, Clock, AlertCircle, TrendingUp } from "lucide-react";

export default function StatCardExample() {
  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
  );
}
