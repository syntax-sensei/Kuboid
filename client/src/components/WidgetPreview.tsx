import { useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type WidgetPreviewProps = {
  primaryColor: string;
  backgroundColor: string;
  position: "bottom-right" | "bottom-left";
  welcomeMessage: string;
  placeholder: string;
  showBranding: boolean;
};

export function WidgetPreview({
  primaryColor,
  backgroundColor,
  position,
  welcomeMessage,
  placeholder,
  showBranding,
}: WidgetPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");

  const positionClasses = position === "bottom-right" ? "right-6" : "left-6";

  return (
    <div className="relative w-full h-96 bg-muted/30 rounded-lg border border-border overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
        Widget Preview
      </div>

      {/* Chat bubble */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`absolute bottom-6 ${positionClasses} w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform`}
          style={{ backgroundColor: primaryColor }}
          data-testid="button-widget-bubble"
        >
          <MessageCircle className="h-6 w-6" style={{ color: backgroundColor }} />
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div
          className={`absolute bottom-6 ${positionClasses} w-80 h-[500px] rounded-lg shadow-2xl flex flex-col`}
          style={{ backgroundColor }}
        >
          {/* Header */}
          <div
            className="p-4 rounded-t-lg flex items-center justify-between"
            style={{ backgroundColor: primaryColor }}
          >
            <h3 className="font-semibold" style={{ color: backgroundColor }}>
              Chat Support
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="hover:opacity-80"
              style={{ color: backgroundColor }}
              data-testid="button-widget-close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              <div className="flex gap-2">
                <div
                  className="rounded-lg p-3 max-w-[80%]"
                  style={{ backgroundColor: `${primaryColor}20` }}
                >
                  <p className="text-sm" style={{ color: primaryColor }}>
                    {welcomeMessage}
                  </p>
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={placeholder}
                className="flex-1"
                data-testid="input-widget-message"
              />
              <Button
                size="icon"
                style={{ backgroundColor: primaryColor, color: backgroundColor }}
                data-testid="button-widget-send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            {showBranding && (
              <p className="text-xs text-center mt-2 text-muted-foreground">
                Powered by SupportBot
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
