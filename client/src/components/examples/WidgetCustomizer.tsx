import { useState } from "react";
import { WidgetCustomizer, type WidgetConfig } from "../WidgetCustomizer";

export default function WidgetCustomizerExample() {
  const [config, setConfig] = useState<WidgetConfig>({
    primaryColor: "#3B82F6",
    backgroundColor: "#FFFFFF",
    position: "bottom-right",
    welcomeMessage: "Hello! How can I help you today?",
    placeholder: "Type your message...",
    showBranding: true,
    // Additional fields required by WidgetCustomizer
    topK: 5,
    temperature: 0.2,
    apiBase: "/api",
  });

  return (
    <div className="p-6 max-w-2xl">
      <WidgetCustomizer config={config} onChange={setConfig} />
    </div>
  );
}
