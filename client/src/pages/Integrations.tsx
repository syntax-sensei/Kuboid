import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const INTEGRATIONS = [
  {
    id: "zendesk",
    label: "Zendesk",
    description: "Sync support tickets and leverage your help center articles.",
    placeholder: {
      instance: "support.acme",
      apiKey: "znd-***",
    },
  },
  {
    id: "zoho",
    label: "Zoho Desk",
    description: "Bring in tickets and knowledge base content from Zoho.",
    placeholder: {
      instance: "your-zoho-org",
      apiKey: "zoh-***",
    },
  },
] as const;

type IntegrationId = (typeof INTEGRATIONS)[number]["id"];

type ConnectionState = {
  [K in IntegrationId]: {
    connected: boolean;
    instance: string;
    apiKey: string;
  };
};

const initialState = INTEGRATIONS.reduce((acc, integration) => {
  acc[integration.id] = {
    connected: false,
    instance: "",
    apiKey: "",
  };
  return acc;
}, {} as ConnectionState);

export default function Integrations() {
  const [activeTab, setActiveTab] = useState<IntegrationId>("zendesk");
  const [connections, setConnections] = useState<ConnectionState>(initialState);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ingestionProgress, setIngestionProgress] = useState<number>(0);
  const [faqStatus, setFaqStatus] = useState<"idle" | "processing" | "ready">(
    "idle"
  );

  const activeConnection = connections[activeTab];

  const handleConnect = () => {
    setConnections((prev) => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        connected: !prev[activeTab].connected,
      },
    }));
  };

  const handleCredentialChange = (
    field: "instance" | "apiKey",
    value: string
  ) => {
    setConnections((prev) => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        [field]: value,
      },
    }));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSelectedFile(file ?? null);
    if (file) {
      setFaqStatus("processing");
      setIngestionProgress(35);
      window.setTimeout(() => {
        setIngestionProgress(100);
        setFaqStatus("ready");
      }, 1200);
    } else {
      setFaqStatus("idle");
      setIngestionProgress(0);
    }
  };

  const renderConnectionBadge = (
    integration: (typeof INTEGRATIONS)[number]
  ) => {
    const { connected } = connections[integration.id];
    return (
      <Badge variant={connected ? "default" : "outline"}>
        {connected ? "Connected" : "Not connected"}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Knowledge Sources</h1>
        <p className="text-muted-foreground mt-1">
          Connect support platforms or upload FAQ content to train your agent.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Helpdesk Integrations</CardTitle>
          <CardDescription>
            Choose between Zendesk or Zoho Desk to stream tickets and articles
            into your chatbot&apos;s brain. Toggle off to disconnect at any
            time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as IntegrationId)}
          >
            <TabsList className="grid w-full grid-cols-2">
              {INTEGRATIONS.map((integration) => (
                <TabsTrigger
                  key={integration.id}
                  value={integration.id}
                  className="flex items-center justify-between"
                >
                  <span>{integration.label}</span>
                  {renderConnectionBadge(integration)}
                </TabsTrigger>
              ))}
            </TabsList>
            {INTEGRATIONS.map((integration) => {
              const connection = connections[integration.id];
              const isActive = activeTab === integration.id;

              return (
                <TabsContent
                  key={integration.id}
                  value={integration.id}
                  className="space-y-4"
                >
                  <p className="text-sm text-muted-foreground">
                    {integration.description}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`${integration.id}-instance`}>
                        Account / Subdomain
                      </Label>
                      <Input
                        id={`${integration.id}-instance`}
                        placeholder={integration.placeholder.instance}
                        value={connection.instance}
                        onChange={(event) =>
                          handleCredentialChange("instance", event.target.value)
                        }
                        disabled={!isActive}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${integration.id}-apiKey`}>
                        API Token
                      </Label>
                      <Input
                        id={`${integration.id}-apiKey`}
                        placeholder={integration.placeholder.apiKey}
                        value={connection.apiKey}
                        onChange={(event) =>
                          handleCredentialChange("apiKey", event.target.value)
                        }
                        type="password"
                        disabled={!isActive}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm text-muted-foreground">
                      {connection.connected
                        ? "Your account is linked. We'll automatically sync new tickets and articles."
                        : "Add your credentials and click connect to sync content."}
                    </div>
                    <Button
                      onClick={handleConnect}
                      variant={connection.connected ? "secondary" : "default"}
                    >
                      {connection.connected ? "Disconnect" : "Connect"}
                    </Button>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload FAQs</CardTitle>
          <CardDescription>
            Drop in a spreadsheet of questions and answers to expand your
            chatbot&apos;s knowledge while we finalize integrations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="faq-upload">Excel or CSV file</Label>
            <Input
              id="faq-upload"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
            />
          </div>
          {selectedFile ? (
            <div className="rounded-lg border border-dashed border-primary/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {faqStatus === "ready"
                      ? "Processing complete"
                      : "Parsing FAQ entries"}
                  </p>
                </div>
                <Badge variant={faqStatus === "ready" ? "default" : "outline"}>
                  {faqStatus === "ready" ? "Ready" : "Processing"}
                </Badge>
              </div>
              <Progress value={ingestionProgress} className="mt-3" />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-muted-foreground/20 p-6 text-center text-sm text-muted-foreground">
              No file selected yet. Export your FAQs from Zendesk, Zoho, or
              spreadsheets and drop them here.
            </div>
          )}
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>Need a template? Download the sample format below.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm">
                Download sample sheet
              </Button>
              <Button variant="ghost" size="sm">
                View recently ingested files
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Next steps</CardTitle>
          <CardDescription>
            Track what happens after your knowledge sources are connected.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="font-medium">Training Queue</h3>
            <p className="text-sm text-muted-foreground">
              As soon as your data is imported we schedule a training job for
              the assistant. You'll receive an email when it's ready.
            </p>
          </div>
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="font-medium">Sync cadence</h3>
            <p className="text-sm text-muted-foreground">
              New content from Zendesk or Zoho will sync automatically every
              hour. Manual refresh is available from the Integrations list.
            </p>
          </div>
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="font-medium">Support</h3>
            <p className="text-sm text-muted-foreground">
              Need help? Our onboarding team can walk you through credential
              setup and FAQ import best practices.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
