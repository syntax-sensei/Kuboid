import { AnalyticsChart } from "../AnalyticsChart";

//todo: remove mock functionality
const mockData = [
  { name: "Mon", value: 45 },
  { name: "Tue", value: 67 },
  { name: "Wed", value: 52 },
  { name: "Thu", value: 89 },
  { name: "Fri", value: 73 },
  { name: "Sat", value: 34 },
  { name: "Sun", value: 41 },
];

export default function AnalyticsChartExample() {
  return (
    <div className="p-6 space-y-4">
      <AnalyticsChart title="Queries This Week" data={mockData} type="line" />
      <AnalyticsChart title="Top Topics" data={mockData.slice(0, 5)} type="bar" />
    </div>
  );
}
