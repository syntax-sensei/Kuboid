import { useCallback, useMemo, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { MessageCircle, X, Send, Loader2, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  turnId?: string;
  feedback?: "positive" | "negative";
};

type WidgetPreviewProps = {
  primaryColor: string;
  backgroundColor: string;
  position: "bottom-right" | "bottom-left";
  welcomeMessage: string;
  placeholder: string;
  showBranding: boolean;
    widgetId?: string;
    siteId?: string;
  apiBase?: string;
  topK?: number;
  temperature?: number;
};

export function WidgetPreview({
  primaryColor,
  backgroundColor,
  position,
  welcomeMessage,
  placeholder,
  showBranding,
  widgetId,
  siteId,
  apiBase = API_BASE,
  topK = 5,
  temperature = 0.2,
}: WidgetPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: "welcome",
    role: "assistant",
    content: welcomeMessage,
  }]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const alignedMessages = useMemo(() => messages, [messages]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const handleToggle = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open) {
        setTimeout(scrollToBottom, 50);
      }
    },
    [scrollToBottom]
  );

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    const loadingMessage: ChatMessage = {
      id: `loading-${Date.now()}`,
      role: "system",
      content: "Thinking…",
    };

    setMessages((prev) => [...prev.filter((msg) => msg.id !== "welcome" || prev.length === 1), userMessage, loadingMessage]);
    setInput("");
    setIsLoading(true);
    setTimeout(scrollToBottom, 20);

    try {
  const tokenBody = widgetId ? { widget_id: widgetId } : (siteId ? { site_id: siteId } : {});
        const tokenResponse = await fetch(`${apiBase}/widget/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tokenBody),
        });

      if (!tokenResponse.ok) {
        throw new Error("Failed to fetch widget token");
      }

      const { token } = await tokenResponse.json();

      const chatResponse = await fetch(`${apiBase}/widget/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: trimmed,
          history: [...messages.filter((msg) => msg.id !== "welcome"), userMessage],
          top_k: topK,
          temperature,
          conversation_id: conversationId,
        }),
      });

      if (!chatResponse.ok) {
        throw new Error("Chat request failed");
      }

      const data = await chatResponse.json();

      setMessages((prev) => [
        ...prev.filter((msg) => msg.id !== loadingMessage.id),
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.answer || "I couldn't find the answer to that.",
          turnId: data.turn_id,
          feedback: undefined,
        },
      ]);
      if (data.conversation_id) {
        setConversationId(data.conversation_id);
      }
    } catch (error) {
      console.error("Widget preview error:", error);
      setMessages((prev) => [
        ...prev.filter((msg) => msg.id !== loadingMessage.id),
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "We ran into an issue fetching the answer. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(scrollToBottom, 20);
    }
  }, [apiBase, input, isLoading, messages, scrollToBottom, widgetId, temperature, topK]);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      sendMessage();
    },
    [sendMessage]
  );

  const containerAlignment =
    position === "bottom-right" ? "justify-end" : "justify-start";

  const handleFeedback = useCallback(
    async (turnId: string, sentiment: "positive" | "negative") => {
      setMessages((prev) =>
        prev.map((message) =>
          message.turnId === turnId
            ? {
                ...message,
                feedback: sentiment,
              }
            : message
        )
      );

      try {
          const tokenBody = widgetId ? { widget_id: widgetId } : (siteId ? { site_id: siteId } : {});
          const tokenResponse = await fetch(`${apiBase}/widget/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tokenBody),
          });

        if (!tokenResponse.ok) {
          throw new Error("Failed to fetch widget token for feedback");
        }

        const { token } = await tokenResponse.json();

        await fetch(`${apiBase}/analytics/feedback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            // analytics expects site_id; include widgetId so server can authorize
            widget_id: widgetId,
            conversation_id: conversationId,
            turn_id: turnId,
            sentiment,
            metadata: { source: "widget" },
          }),
        });
      } catch (error) {
        console.error("Failed to submit feedback", error);
      }
    },
  [apiBase, widgetId, conversationId]
  );

  return (
    <div
      className={cn(
        "relative flex min-h-[32rem] w-full rounded-lg border border-border bg-muted/30 p-6 items-end gap-4",
        containerAlignment
      )}
    >
      {!isOpen && (
        <div className="pointer-events-none absolute inset-6 flex items-center justify-center text-sm text-muted-foreground">
          Widget Preview
        </div>
      )}

      {/* Chat bubble */}
      {!isOpen && (
        <button
          onClick={() => handleToggle(true)}
          className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
          style={{ backgroundColor: primaryColor }}
          data-testid="button-widget-bubble"
        >
          <MessageCircle
            className="h-6 w-6"
            style={{ color: backgroundColor }}
          />
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div
          className="w-full max-w-sm h-[500px] rounded-lg shadow-2xl flex flex-col"
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
              onClick={() => handleToggle(false)}
              className="hover:opacity-80"
              style={{ color: backgroundColor }}
              data-testid="button-widget-close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-3">
              {alignedMessages.map((msg) => {
                const isAssistant = msg.role === "assistant";
                const isSystem = msg.role === "system";
                const alignment = isAssistant || isSystem ? "justify-start" : "justify-end";
                const bubbleColor = isAssistant
                  ? `${primaryColor}20`
                  : msg.role === "user"
                  ? primaryColor
                  : "transparent";
                const textColor = isAssistant
                  ? primaryColor
                  : msg.role === "user"
                  ? backgroundColor
                  : "#64748b";

                return (
                  <div key={msg.id} className={cn("flex", alignment)}>
                    <div
                      className="rounded-lg p-3 max-w-[80%]"
                      style={{
                        backgroundColor: bubbleColor,
                        color: textColor,
                        border: isSystem ? "1px dashed #cbd5f5" : undefined,
                        fontStyle: isSystem ? "italic" : "normal",
                      }}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      {isAssistant && msg.turnId && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <button
                            type="button"
                            className={cn(
                              "flex items-center gap-1 transition-colors",
                              msg.feedback === "positive" ? "text-primary" : "hover:text-primary"
                            )}
                            onClick={() => handleFeedback(msg.turnId!, "positive")}
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                            Helpful
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "flex items-center gap-1 transition-colors",
                              msg.feedback === "negative" ? "text-destructive" : "hover:text-destructive"
                            )}
                            onClick={() => handleFeedback(msg.turnId!, "negative")}
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                            Not helpful
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t">
            <form className="flex gap-2" onSubmit={handleSubmit}>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={placeholder}
                className="flex-1"
                data-testid="input-widget-message"
                disabled={isLoading}
              />
              <Button
                size="icon"
                type="submit"
                disabled={isLoading}
                style={{
                  backgroundColor: primaryColor,
                  color: backgroundColor,
                }}
                data-testid="button-widget-send"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
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
