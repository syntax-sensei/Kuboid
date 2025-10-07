import { useCallback, useEffect, useMemo, useState } from "react";
import type { FileObject } from "@supabase/storage-js";
import { DocumentUpload } from "@/components/DocumentUpload";
import { DocumentCard } from "@/components/DocumentCard";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { FileText } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type StoredDocument = {
  id: string;
  name: string;
  type: "file";
  fileType?: string;
  uploadedAt: Date;
  path: string;
};

const DOCS_BUCKET = "Docs";

export default function Documents() {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StoredDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<StoredDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const { toast } = useToast();

  const parseFileName = useCallback((storedName: string) => {
    const separatorIndex = storedName.indexOf("-");
    if (separatorIndex === -1) return storedName;
    return storedName.slice(separatorIndex + 1);
  }, []);

  const toStoredDocument = useCallback(
    (item: FileObject) => {
      const displayName = parseFileName(item.name);
      const fileType = displayName.includes(".")
        ? displayName.split(".").pop()?.toLowerCase()
        : undefined;

      return {
        id: item.id ?? item.name,
        name: displayName,
        type: "file" as const,
        fileType,
        uploadedAt: item.created_at ? new Date(item.created_at) : new Date(),
        path: item.name,
      } satisfies StoredDocument;
    },
    [parseFileName]
  );

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase.storage.from(DOCS_BUCKET).list("", {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });

    if (error) {
      toast({
        title: "Failed to load documents",
        description: error.message,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    const files = (data ?? [])
      .filter((item) => item.id)
      .map(toStoredDocument)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

    setDocuments(files);
    setIsLoading(false);
  }, [toast, toStoredDocument]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const getUniqueFilePath = useCallback((fileName: string) => {
    const safeName = fileName.replace(/\s+/g, "-");
    const uniquePrefix =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10);
    return `${uniquePrefix}-${safeName}`;
  }, []);

  const createSignedUrl = useCallback(async (doc: StoredDocument) => {
    const { data, error } = await supabase.storage
      .from(DOCS_BUCKET)
      .createSignedUrl(doc.path, 60);

    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? "Could not generate access URL.");
    }

    return data.signedUrl;
  }, []);

  const handleFileUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setIsUploading(true);
      try {
        const uploadResults = await Promise.allSettled(
          files.map(async (file) => {
            const filePath = getUniqueFilePath(file.name);
            const { error } = await supabase.storage
              .from(DOCS_BUCKET)
              .upload(filePath, file, { upsert: false });

            if (error) {
              throw new Error(`${file.name}: ${error.message}`);
            }

            return filePath;
          })
        );

        const rejected = uploadResults.filter(
          (result) => result.status === "rejected"
        ) as PromiseRejectedResult[];

        if (rejected.length > 0) {
          toast({
            title: "Some files failed to upload",
            description: rejected
              .map((r) => r.reason.message ?? String(r.reason))
              .join("\n"),
            variant: "destructive",
          });
        } else {
          toast({
            title: "Upload complete",
            description: `Successfully uploaded ${files.length} file${
              files.length > 1 ? "s" : ""
            }.`,
          });
        }

        await fetchDocuments();
      } finally {
        setIsUploading(false);
      }
    },
    [fetchDocuments, getUniqueFilePath, toast]
  );

  const handleUrlSubmit = useCallback(
    (url: string) => {
      toast({
        title: "URL submitted",
        description: "Content is being scraped and processed",
      });
      console.log("URL to scrape:", url);
    },
    [toast]
  );

  const handleViewDocument = useCallback(
    async (doc: StoredDocument) => {
      setPreviewDoc(doc);
      setPreviewUrl(null);
      setIsPreviewOpen(true);
      setIsPreviewLoading(true);

      try {
        const signedUrl = await createSignedUrl(doc);
        setPreviewUrl(signedUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast({
          title: "Unable to open document",
          description: message,
          variant: "destructive",
        });
        setIsPreviewOpen(false);
        setPreviewDoc(null);
      } finally {
        setIsPreviewLoading(false);
      }
    },
    [createSignedUrl, toast]
  );

  const handleDownloadDocument = useCallback(
    async (doc: StoredDocument) => {
      try {
        const signedUrl = await createSignedUrl(doc);
        const newTab = window.open(signedUrl, "_blank", "noopener,noreferrer");

        if (!newTab) {
          toast({
            title: "Pop-up blocked",
            description:
              "Please allow pop-ups for this site to download the document.",
            variant: "destructive",
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast({
          title: "Download failed",
          description: message,
          variant: "destructive",
        });
      }
    },
    [createSignedUrl, toast]
  );

  const handlePreviewOpenChange = useCallback((open: boolean) => {
    setIsPreviewOpen(open);
    if (!open) {
      setPreviewDoc(null);
      setPreviewUrl(null);
      setIsPreviewLoading(false);
    }
  }, []);

  const handleOpenPreviewInNewTab = useCallback(() => {
    if (!previewUrl) return;

    const newTab = window.open(previewUrl, "_blank", "noopener,noreferrer");
    if (!newTab) {
      toast({
        title: "Pop-up blocked",
        description:
          "Please allow pop-ups for this site to open the document in a new tab.",
        variant: "destructive",
      });
    }
  }, [previewUrl, toast]);

  const deleteDocument = useCallback(
    async (doc: StoredDocument) => {
      const { error } = await supabase.storage
        .from(DOCS_BUCKET)
        .remove([doc.path]);

      if (error) {
        toast({
          title: "Failed to delete",
          description: error.message,
          variant: "destructive",
        });
        return false;
      }

      toast({
        title: "Document deleted",
        description: `${doc.name} has been removed.`,
      });

      await fetchDocuments();
      return true;
    },
    [fetchDocuments, toast]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    const success = await deleteDocument(deleteTarget);
    setIsDeleting(false);

    if (success) {
      setDeleteTarget(null);
    }
  }, [deleteDocument, deleteTarget]);

  const handleDeleteDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !isDeleting) {
        setDeleteTarget(null);
      }
    },
    [isDeleting]
  );

  const isEmpty = useMemo(
    () => !isLoading && documents.length === 0,
    [documents.length, isLoading]
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Documents</h1>
        <p className="text-muted-foreground mt-1">
          Manage your knowledge base documents and sources
        </p>
      </div>

      <DocumentUpload
        onFileUpload={handleFileUpload}
        onUrlSubmit={handleUrlSubmit}
      />

      {isUploading && (
        <p
          className="text-sm text-muted-foreground"
          data-testid="text-uploading"
        >
          Uploading files to Supabase…
        </p>
      )}

      <div>
        <h2 className="text-xl font-semibold mb-4">Your Documents</h2>
        {isLoading ? (
          <div className="text-muted-foreground">Loading documents…</div>
        ) : isEmpty ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No documents uploaded yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                {...doc}
                onView={() => handleViewDocument(doc)}
                onDownload={() => handleDownloadDocument(doc)}
                onDelete={() => setDeleteTarget(doc)}
              />
            ))}
          </div>
        )}
      </div>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={handleDeleteDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This action will permanently remove “${deleteTarget.name}”.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isPreviewOpen} onOpenChange={handlePreviewOpenChange}>
        <DialogContent className="w-full max-w-4xl">
          <DialogHeader>
            <DialogTitle>{previewDoc?.name ?? "Document preview"}</DialogTitle>
            <DialogDescription>
              {previewDoc?.fileType
                ? `${previewDoc.fileType.toUpperCase()} file preview`
                : "Preview the selected document."}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 aspect-[3/2] w-full overflow-hidden rounded-md border bg-muted">
            {isPreviewLoading ? (
              <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                Loading preview…
              </div>
            ) : previewUrl ? (
              <iframe
                src={previewUrl}
                className="h-full w-full"
                title={previewDoc?.name ?? "Document preview"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                Preview unavailable.
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="secondary"
              type="button"
              onClick={handleOpenPreviewInNewTab}
              disabled={!previewUrl}
            >
              Open in new tab
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
