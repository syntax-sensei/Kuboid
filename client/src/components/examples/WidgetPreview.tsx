import { WidgetPreview } from "../WidgetPreview";

export default function WidgetPreviewExample() {
  return (
    <div className="p-6">
      <WidgetPreview
        primaryColor="#3B82F6"
        backgroundColor="#FFFFFF"
        position="bottom-right"
        welcomeMessage="Hello! How can I help you today?"
        placeholder="Type your message..."
        showBranding={true}
      />
    </div>
  );
}
