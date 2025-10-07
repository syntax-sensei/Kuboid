import { useState } from "react";
import { WidgetCustomizer } from "@/components/WidgetCustomizer";
import { WidgetPreview } from "@/components/WidgetPreview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Widget() {
  const [config, setConfig] = useState<{
    primaryColor: string;
    backgroundColor: string;
    position: "bottom-right" | "bottom-left";
    welcomeMessage: string;
    placeholder: string;
    showBranding: boolean;
  }>({
    primaryColor: "#3B82F6",
    backgroundColor: "#FFFFFF",
    position: "bottom-right",
    welcomeMessage: "Hello! How can I help you today?",
    placeholder: "Type your message...",
    showBranding: true,
  });

  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const embedCode = `<!-- SupportBot Widget -->
<script>
  (function() {
    window.supportBotConfig = ${JSON.stringify(config, null, 2)};
    var script = document.createElement('script');
    script.src = 'https://cdn.supportbot.com/widget.js';
    document.head.appendChild(script);
  })();
</script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    toast({
      title: "Code copied!",
      description: "Paste it into your website's HTML",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Widget Generator</h1>
        <p className="text-muted-foreground mt-1">
          Customize and embed your chatbot widget
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customization</CardTitle>
              <CardDescription>Adjust the widget appearance and behavior</CardDescription>
            </CardHeader>
            <CardContent>
              <WidgetCustomizer config={config} onChange={setConfig} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Embed Code</CardTitle>
              <CardDescription>Copy and paste this into your website</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="relative">
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs font-mono">
                    <code>{embedCode}</code>
                  </pre>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute top-2 right-2"
                    onClick={handleCopy}
                    data-testid="button-copy-code"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Live Preview</CardTitle>
              <CardDescription>See how your widget will look</CardDescription>
            </CardHeader>
            <CardContent>
              <WidgetPreview {...config} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
