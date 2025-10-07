import { useState } from "react";
import { DocumentUpload } from "@/components/DocumentUpload";
import { DocumentCard } from "@/components/DocumentCard";
import { useToast } from "@/hooks/use-toast";
import { FileText } from "lucide-react";

//todo: remove mock functionality
const mockDocuments = [
  {
    id: "1",
    name: "Product Documentation.pdf",
    type: "file" as const,
    fileType: "pdf",
    uploadedAt: new Date(Date.now() - 1000 * 60 * 30),
  },
  {
    id: "2",
    name: "API Reference Guide.txt",
    type: "file" as const,
    fileType: "txt",
    uploadedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
  },
  {
    id: "3",
    name: "https://docs.example.com/getting-started",
    type: "url" as const,
    uploadedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
  },
];

export default function Documents() {
  const [documents] = useState(mockDocuments); //todo: remove mock functionality
  const { toast } = useToast();

  const handleFileUpload = (files: File[]) => {
    console.log("Files to upload:", files);
    toast({
      title: "Files uploaded",
      description: `Successfully uploaded ${files.length} file(s)`,
    });
  };

  const handleUrlSubmit = (url: string) => {
    console.log("URL to scrape:", url);
    toast({
      title: "URL submitted",
      description: "Content is being scraped and processed",
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Documents</h1>
        <p className="text-muted-foreground mt-1">
          Manage your knowledge base documents and sources
        </p>
      </div>

      <DocumentUpload onFileUpload={handleFileUpload} onUrlSubmit={handleUrlSubmit} />

      <div>
        <h2 className="text-xl font-semibold mb-4">Your Documents</h2>
        {documents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                {...doc}
                onView={() => console.log("View:", doc.id)}
                onDownload={() => console.log("Download:", doc.id)}
                onDelete={() => console.log("Delete:", doc.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No documents uploaded yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
