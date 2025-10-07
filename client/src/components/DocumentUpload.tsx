import { useCallback, useState } from "react";
import { Upload, File, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

type DocumentUploadProps = {
  onFileUpload: (files: File[]) => void;
  onUrlSubmit: (url: string) => void;
};

export function DocumentUpload({ onFileUpload, onUrlSubmit }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [url, setUrl] = useState("");

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onFileUpload(files);
      }
    },
    [onFileUpload]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFileUpload(files);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onUrlSubmit(url);
      setUrl("");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-lg font-semibold">Upload Documents</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Upload files or provide URLs to ingest content
        </p>
      </div>

      <Card
        className={`border-2 border-dashed transition-colors ${
          isDragging ? "border-primary bg-primary/5" : "border-border"
        }`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        <label
          htmlFor="file-upload"
          className="flex flex-col items-center justify-center py-12 cursor-pointer"
        >
          <Upload className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-base font-medium mb-1">
            Drag files here or click to browse
          </p>
          <p className="text-sm text-muted-foreground">
            Supports PDF, TXT, DOCX (up to 10MB)
          </p>
          <input
            id="file-upload"
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.txt,.docx"
            onChange={handleFileInput}
            data-testid="input-file-upload"
          />
        </label>
      </Card>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or</span>
        </div>
      </div>

      <form onSubmit={handleUrlSubmit} className="space-y-3">
        <Label htmlFor="url-input">Scrape from URL</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="url-input"
              type="url"
              placeholder="https://example.com/docs"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="pl-9"
              data-testid="input-url"
            />
          </div>
          <Button type="submit" data-testid="button-scrape-url">
            Scrape
          </Button>
        </div>
      </form>
    </div>
  );
}
