import { useState, useEffect } from "react";
import { API_BASE } from "@/lib/api";
import { WidgetCustomizer, type WidgetConfig } from "@/components/WidgetCustomizer";
import { supabase } from "@/lib/supabaseClient";
import { WidgetPreview } from "@/components/WidgetPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Copy, Check, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
// (supabase and API_BASE already imported above)

export default function Widget() {
  const [config, setConfig] = useState<WidgetConfig>({
    primaryColor: "#3B82F6",
    backgroundColor: "#FFFFFF",
    position: "bottom-right",
    welcomeMessage: "Hello! How can I help you today?",
    placeholder: "Type your message...",
    showBranding: true,
    topK: 5,
    temperature: 0.2,
  apiBase: API_BASE,
  });

  const [createdWidgetId, setCreatedWidgetId] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);
  // show the plaintext secret returned once by the server when creating a widget
  const [createdWidgetSecret, setCreatedWidgetSecret] = useState<string | null>(null);
  const [secretPersisted, setSecretPersisted] = useState<boolean | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const { toast } = useToast();

  // Management UI state
  const [widgets, setWidgets] = useState<Array<any>>([]);
  const [loadingWidgets, setLoadingWidgets] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const embedCode = `<!-- SupportBot Widget -->
<script>
  (function() {
    window.supportBotConfig = ${JSON.stringify({ ...config, widgetId: createdWidgetId || undefined }, null, 2)};
    var script = document.createElement('script');
    script.src = '${config.apiBase.replace(/\/$/, "")}/widget.js';
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

  // Management UI functions (fetch, save origins, delete)
  async function fetchWidgets() {
    setLoadingWidgets(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/widgets`, { headers });
      if (!res.ok) throw new Error("Failed to fetch widgets");
      const json = await res.json();
      setWidgets(json.widgets || []);
    } catch (err) {
      console.error(err);
      setWidgets([]);
    } finally {
      setLoadingWidgets(false);
    }
  }

  useEffect(() => {
    fetchWidgets();
  }, []);

  function makeEmbedCode(widgetId: string) {
    const cfg = {
      widgetId,
      apiBase: API_BASE,
    };
    return `<!-- SupportBot Widget -->\n<script>\n(function(){\n  window.supportBotConfig = ${JSON.stringify(cfg)};\n  var s = document.createElement('script'); s.src='${API_BASE.replace(/\/$/, "")}/widget.js'; document.head.appendChild(s);\n})();\n</script>`;
  }

  async function saveOrigins(widgetId: string) {
    const val = editing[widgetId] ?? "";
    const origins = val.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string,string> = { "Content-Type":"application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/widgets/${widgetId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ allowed_origins: origins })
      });
      if (!res.ok) throw new Error("Failed to update widget");
      await fetchWidgets();
      toast({ title: "Saved", description: "Widget updated" });
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to save", variant: "destructive" });
    }
  }

  async function deleteWidget(widgetId: string) {
    if (!confirm("Delete this widget?")) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string,string> = { "Content-Type":"application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/widgets/${widgetId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to delete");
      await fetchWidgets();
      toast({ title: "Deleted", description: "Widget removed" });
    } catch (err) {
      console.error(err);
      toast({ title: "Delete failed", variant: "destructive" });
    }
  }

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
                  <div className="mt-4">
                    <Button
                      onClick={async () => {
                        try {
                            // include Authorization header with Supabase access token when available
                            const {
                              data: { session },
                            } = await supabase.auth.getSession();
                            const token = session?.access_token;

                            const headers: Record<string, string> = { "Content-Type": "application/json" };
                            if (token) headers["Authorization"] = `Bearer ${token}`;

                            const resp = await fetch(`${config.apiBase.replace(/\/$/, "")}/widgets`, {
                              method: "POST",
                              headers,
                              body: JSON.stringify({ site_id: config.siteId, name: "Auto widget" }),
                            });
                          if (!resp.ok) throw new Error("Failed to create widget");
                          const data = await resp.json();

                          // extract widget id (handle a few possible response shapes)
                          const widgetId = data?.widget?.id || data?.id || data?.widget?.ID || null;
                          setCreatedWidgetId(widgetId);

                          // extract plaintext secret (returned once by server) and persisted flag
                          const plaintext = data?.widget?.secret || data?.secret || null;
                          const persisted = data?.widget?.secret_persisted ?? data?.secret_persisted ?? null;
                          if (plaintext) {
                            setCreatedWidgetSecret(plaintext);
                            setSecretPersisted(Boolean(persisted));
                          } else {
                            // clear any previous secret if none returned
                            setCreatedWidgetSecret(null);
                            setSecretPersisted(null);
                          }

                          toast({ title: "Widget created", description: `Widget id: ${widgetId}` });
                        } catch (err) {
                          console.error(err);
                          toast({ title: "Create failed", description: "Could not create widget. Ensure you are authenticated." });
                        }
                      }}
                    >
                      Create Widget (auto id)
                    </Button>
                    {/* Show secret returned once by server */}
                    {createdWidgetSecret && (
                      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium">Widget secret (shown once)</div>
                            <div className="mt-1 font-mono text-xs break-words">{createdWidgetSecret}</div>
                            <div className="text-xs text-muted-foreground mt-2">
                              Save this secret now — it will not be shown again. Use it for server-to-server token issuance via the <code>x-widget-secret</code> header.
                            </div>
                            {secretPersisted === false && (
                              <div className="text-xs text-red-600 mt-1">Warning: secret was not persisted in the DB. Copy it now.</div>
                            )}
                          </div>
                            <div className="ml-4 flex-shrink-0">
                            <Button size="sm" variant="secondary" onClick={() => {
                              navigator.clipboard.writeText(createdWidgetSecret);
                              setCopiedSecret(true);
                              // hide the secret immediately after copying so it is not left on-screen
                              setCreatedWidgetSecret(null);
                              setSecretPersisted(null);
                              toast({ title: 'Secret copied' });
                              setTimeout(() => setCopiedSecret(false), 2000);
                            }}>
                              {copiedSecret ? <><Check className="h-4 w-4 mr-1"/>Copied</> : <><Copy className="h-4 w-4 mr-1"/>Copy</>}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Manage Widgets card removed from column to render full-width below */}
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Live Preview</CardTitle>
              <CardDescription>See how your widget will look</CardDescription>
            </CardHeader>
            <CardContent>
              <WidgetPreview {...config} widgetId={createdWidgetId || undefined} siteId={config.siteId} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Full-width Manage Widgets section */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Manage Widgets</CardTitle>
            <CardDescription>View and manage your created widget instances</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto">
              {loadingWidgets && <div>Loading widgets…</div>}

              {!loadingWidgets && widgets.length === 0 && (
                <div className="text-sm text-muted-foreground">No widgets found. Create one using the button above.</div>
              )}

              {!loadingWidgets && widgets.length > 0 && (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Id</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Allowed origins</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {widgets.map((w) => (
                      <tr key={w.id}>
                        <td className="px-4 py-3 align-top" style={{ maxWidth: 360 }}>
                          <div className="text-sm text-gray-900 break-words">{w.id}</div>
                          <div className="text-xs text-muted-foreground mt-1">Created: {new Date(w.created_at).toLocaleString()}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="text-sm">{w.name || '-'}</div>
                          <div className="text-xs text-muted-foreground">Owner: {w.owner_id}</div>
                        </td>
                        <td className="px-4 py-3 align-top w-1/3">
                          <input
                            className="w-full rounded border px-2 py-1 text-sm"
                            value={editing[w.id] ?? (w.allowed_origins || []).join(', ')}
                            onChange={(e) => setEditing((prev) => ({ ...prev, [w.id]: e.target.value }))}
                            placeholder="https://example.com, https://app.example.com"
                          />
                          <div className="text-xs text-muted-foreground mt-1">Comma-separated list of allowed origins</div>
                        </td>
                        <td className="px-4 py-3 text-right align-top space-x-2">
                          <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(makeEmbedCode(w.id)); toast({ title: 'Embed copied' }); }}>
                            <Copy className="mr-2 h-4 w-4" /> Copy
                          </Button>
                          <Button size="sm" onClick={() => saveOrigins(w.id)}>
                            Save
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteWidget(w.id)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
