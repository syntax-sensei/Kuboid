import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type WidgetConfig = {
  primaryColor: string;
  backgroundColor: string;
  position: "bottom-right" | "bottom-left";
  welcomeMessage: string;
  placeholder: string;
  showBranding: boolean;
};

type WidgetCustomizerProps = {
  config: WidgetConfig;
  onChange: (config: WidgetConfig) => void;
};

export function WidgetCustomizer({ config, onChange }: WidgetCustomizerProps) {
  const updateConfig = (key: keyof WidgetConfig, value: any) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Widget Settings</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="primary-color">Primary Color</Label>
            <div className="flex gap-2">
              <Input
                id="primary-color"
                type="color"
                value={config.primaryColor}
                onChange={(e) => updateConfig("primaryColor", e.target.value)}
                className="w-20 h-10 cursor-pointer"
                data-testid="input-primary-color"
              />
              <Input
                type="text"
                value={config.primaryColor}
                onChange={(e) => updateConfig("primaryColor", e.target.value)}
                className="flex-1"
                data-testid="input-primary-color-text"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bg-color">Background Color</Label>
            <div className="flex gap-2">
              <Input
                id="bg-color"
                type="color"
                value={config.backgroundColor}
                onChange={(e) => updateConfig("backgroundColor", e.target.value)}
                className="w-20 h-10 cursor-pointer"
                data-testid="input-bg-color"
              />
              <Input
                type="text"
                value={config.backgroundColor}
                onChange={(e) => updateConfig("backgroundColor", e.target.value)}
                className="flex-1"
                data-testid="input-bg-color-text"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Position</Label>
            <RadioGroup
              value={config.position}
              onValueChange={(value) => updateConfig("position", value)}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bottom-right" id="bottom-right" data-testid="radio-bottom-right" />
                <Label htmlFor="bottom-right" className="font-normal cursor-pointer">
                  Bottom Right
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bottom-left" id="bottom-left" data-testid="radio-bottom-left" />
                <Label htmlFor="bottom-left" className="font-normal cursor-pointer">
                  Bottom Left
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="welcome-message">Welcome Message</Label>
            <Textarea
              id="welcome-message"
              value={config.welcomeMessage}
              onChange={(e) => updateConfig("welcomeMessage", e.target.value)}
              placeholder="Enter welcome message..."
              rows={3}
              data-testid="input-welcome-message"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="placeholder">Input Placeholder</Label>
            <Input
              id="placeholder"
              value={config.placeholder}
              onChange={(e) => updateConfig("placeholder", e.target.value)}
              data-testid="input-placeholder"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="show-branding" className="font-normal">
              Show SupportBot Branding
            </Label>
            <Switch
              id="show-branding"
              checked={config.showBranding}
              onCheckedChange={(checked) => updateConfig("showBranding", checked)}
              data-testid="switch-show-branding"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
