import { useCallback, useEffect, useMemo, useState } from "react";
import type { FileObject } from "@supabase/storage-js";
import { DocumentUpload } from "@/components/DocumentUpload";
import { DocumentCard } from "@/components/DocumentCard";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { FileText, Link as LinkIcon } from "lucide-react";
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
  fileType?: string;
  uploadedAt: Date;
  path: string;
};

type UrlActivityStatus = "processing" | "success" | "error";

type UrlActivity = {
  id: string;
  url: string;
  status: UrlActivityStatus;
  startedAt: Date;
  processedAt?: Date;
  chunksCreated?: number;
  error?: string;
};

const DOCS_BUCKET = "Docs";
const urlActivityStatusStyles: Record<
  "processing" | "success" | "error",
  string
> = {
  processing: "text-muted-foreground",
  success: "text-emerald-600",
  error: "text-destructive",
};

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
  const [urlActivities, setUrlActivities] = useState<UrlActivity[]>([]);
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
    [parseFileName],
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
  useEffect(() => {
    const loadActivities = async () => {
      try {
        const response = await fetch("http://localhost:8000/url-activities");
        if (!response.ok) {
          throw new Error("Failed to load URL activity history");
        }
        const data = await response.json();
        const parsed: UrlActivity[] = (data.activities ?? []).map(
          (item: any) => ({
            id: item.id,
            url: item.url,
            status: item.status as UrlActivityStatus,
            startedAt: item.started_at ? new Date(item.started_at) : new Date(),
            processedAt: item.completed_at
              ? new Date(item.completed_at)
              : undefined,
            chunksCreated: item.chunks_created ?? undefined,
            error: item.error ?? undefined,
          }),
        );
        setUrlActivities(parsed);
      } catch (error) {
        console.error("Failed to fetch URL activities", error);
      }
    };

    loadActivities();
  }, [documents.length]);

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
          }),
        );

        const rejected = uploadResults.filter(
          (result) => result.status === "rejected",
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

        // Trigger processing of only new documents (no duplicates)
        try {
          const response = await fetch(
            "http://localhost:8000/process-new-only",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
          const result = await response.json();
          console.log("Document processing result:", result);

          if (result.status === "completed") {
            toast({
              title: "Processing Complete",
              description: `Successfully processed ${result.successful} new documents. ${result.failed} failed. ${result.skipped} already processed.`,
            });
          }
        } catch (error) {
          console.error("Failed to trigger document processing:", error);
          toast({
            title: "Processing Error",
            description:
              "Failed to trigger document processing. Please try again.",
            variant: "destructive",
          });
        }
      } finally {
        setIsUploading(false);
      }
    },
    [fetchDocuments, getUniqueFilePath, toast],
  );

  const handleUrlSubmit = useCallback(
    async (url: string) => {
      const trimmed = url.trim();
      if (!trimmed) return;

      // Get auth token from Supabase session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        toast({
          title: "Not signed in",
          description: "Please sign in to submit URLs.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Scraping started",
        description: "We\'ll notify you once it\'s processed.",
      });

      const activityId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2, 10);
      const startedAt = new Date();

      setUrlActivities((prev) => [
        {
          id: activityId,
          url: trimmed,
          status: "processing",
          startedAt,
        },
        ...prev,
      ]);

      try {
        const response = await fetch("http://localhost:8000/process-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            url: trimmed,
            request_id: activityId,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.detail ?? "Failed to process URL");
        }

        toast({
          title: "URL processed",
          description: `Stored ${result.chunks_created} chunks from the URL.`,
        });

        setUrlActivities((prev) =>
          prev.map((activity) =>
            activity.id === activityId
              ? {
                  ...activity,
                  status: "success",
                  processedAt: new Date(),
                  chunksCreated: result.chunks_created,
                }
              : activity,
          ),
        );

        await fetchDocuments();
      } catch (error) {
        toast({
          title: "Processing failed",
          description:
            error instanceof Error
              ? error.message
              : "Unexpected error occurred",
          variant: "destructive",
        });

        setUrlActivities((prev) =>
          prev.map((activity) =>
            activity.id === activityId
              ? {
                  ...activity,
                  status: "error",
                  processedAt: new Date(),
                  error: error instanceof Error ? error.message : String(error),
                }
              : activity,
          ),
        );

        await fetchDocuments();
      }

      try {
        const refresh = await fetch("http://localhost:8000/url-activities");
        if (refresh.ok) {
          const data = await refresh.json();
          const parsed: UrlActivity[] = (data.activities ?? []).map(
            (item: any) => ({
              id: item.id,
              url: item.url,
              status: item.status as UrlActivityStatus,
              startedAt: item.started_at
                ? new Date(item.started_at)
                : new Date(),
              processedAt: item.completed_at
                ? new Date(item.completed_at)
                : undefined,
              chunksCreated: item.chunks_created ?? undefined,
              error: item.error ?? undefined,
            }),
          );
          setUrlActivities(parsed);
        }
      } catch (refreshError) {
        console.error("Failed to refresh URL activities", refreshError);
      }
    },
    [fetchDocuments, toast],
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
    [createSignedUrl, toast],
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
    [createSignedUrl, toast],
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
      try {
        console.log("Attempting to delete document:", doc);
        console.log("Document path:", doc.path);

        const { data, error } = await supabase.storage
          .from(DOCS_BUCKET)
          .remove([doc.path]);

        console.log("Delete response:", { data, error });

        if (error) {
          console.error("Delete error:", error);
          toast({
            title: "Failed to delete",
            description: `Error: ${error.message}. Please check your Supabase configuration and permissions.`,
            variant: "destructive",
          });
          return false;
        }

        // Verify the file was actually deleted by trying to get a signed URL
        // If the file exists, this will succeed; if deleted, it will fail
        try {
          const { data: urlData, error: urlError } = await supabase.storage
            .from(DOCS_BUCKET)
            .createSignedUrl(doc.path, 1); // Very short expiry since we just want to check existence

          console.log("Verification check:", { urlData, urlError });

          if (!urlError && urlData?.signedUrl) {
            console.error(
              "File still exists after deletion attempt - signed URL created successfully",
            );
            toast({
              title: "Delete failed",
              description:
                "The file could not be deleted. Please check your Supabase storage permissions.",
              variant: "destructive",
            });
            return false;
          } else {
            console.log(
              "File successfully deleted - signed URL creation failed as expected",
            );
          }
        } catch (verifyError) {
          console.log(
            "Verification error (expected if file is deleted):",
            verifyError,
          );
          // This is expected if the file was actually deleted
        }

        // Refresh the document list to verify deletion
        const { data: freshData, error: freshError } = await supabase.storage
          .from(DOCS_BUCKET)
          .list("", {
            limit: 100,
            sortBy: { column: "created_at", order: "desc" },
          });

        if (freshError) {
          console.error("Could not verify deletion:", freshError);
          toast({
            title: "Delete may have failed",
            description:
              "Could not verify if the file was deleted. Please refresh the page to check.",
            variant: "destructive",
          });
          return false;
        }

        // Check if the file still exists in the fresh list
        const stillExists = freshData?.some((item) => item.name === doc.path);
        if (stillExists) {
          console.error("File still exists after deletion attempt");
          toast({
            title: "Delete failed",
            description:
              "The file could not be deleted. Please check your Supabase storage permissions.",
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
      } catch (err) {
        console.error("Unexpected error during deletion:", err);
        toast({
          title: "Failed to delete",
          description: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
          variant: "destructive",
        });
        return false;
      }
    },
    [fetchDocuments, toast],
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
    [isDeleting],
  );

  const isEmpty = useMemo(
    () => !isLoading && documents.length === 0,
    [documents.length, isLoading],
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

      {urlActivities.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Recent URL ingests</h2>
          <div className="space-y-2">
            {urlActivities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start justify-between rounded-md border bg-muted/40 px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <LinkIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium break-all">{activity.url}</p>
                    <p
                      className={`text-sm ${urlActivityStatusStyles[activity.status]}`}
                    >
                      {activity.status === "processing" && "Processing…"}
                      {activity.status === "success" &&
                        `Processed • ${activity.chunksCreated ?? 0} chunks`}
                      {activity.status === "error" &&
                        `Failed • ${activity.error ?? "Unknown error"}`}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {activity.status === "processing"
                    ? `Started ${activity.startedAt.toLocaleTimeString()}`
                    : `Updated ${(activity.processedAt ?? new Date()).toLocaleTimeString()}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
